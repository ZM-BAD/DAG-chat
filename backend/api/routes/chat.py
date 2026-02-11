import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime

import pymongo
from bson import ObjectId
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.database.mongodb_connection import MongoDBConnection
from backend.database.mysql_connection import MySQLConnection
from backend.models.requests import ChatRequest
from backend.models.schemas import MessageNode

# 导入模型工厂以支持多模型调用
from backend.api.services.model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


def build_dag_from_parents(mongo_db: MongoDBConnection, parent_ids: list[str]) -> tuple[dict, dict]:
    """
    从parent_ids开始向上追溯，构建SubDAG（子图）
    
    该函数只包含从 parent_ids 向上追溯能到达的节点，不包含对话中的所有历史。
    例如：如果对话有分支，只追溯当前选择分支的祖先，不追溯其他分支。
    
    Args:
        mongo_db: MongoDB连接实例
        parent_ids: 起始父节点ID列表
    
    Returns:
        node_map: 节点ID到节点数据的映射（即SubDAG）
        edges: 边关系 {parent_id: [child_id, ...]}
    """
    if not parent_ids:
        return {}, {}
    
    # 验证和转换ObjectId
    try:
        start_ids = [ObjectId(pid) for pid in parent_ids if pid]
    except Exception as e:
        # 区分ObjectId格式错误和其他异常
        from bson.errors import InvalidId
        if isinstance(e, InvalidId):
            logger.error(f"Invalid parent_ids format: {parent_ids}, error: {e}")
        else:
            logger.error(f"Unexpected error when parsing parent_ids: {parent_ids}, error: {e}")
        return {}, {}
    
    # BFS遍历收集所有相关节点（向上追溯父节点）
    queue = list(start_ids)
    visited = set()
    node_map = {}
    max_depth = 2000  # 防止无限循环
    current_depth = 0
    
    while queue and current_depth < max_depth:
        batch_size = min(len(queue), 100)
        current_batch = queue[:batch_size]
        queue = queue[batch_size:]
        
        # 批量查询
        nodes = mongo_db.find('message_node', {'_id': {'$in': current_batch}})
        
        for node in nodes:
            node_id = str(node['_id'])
            if node_id not in visited:
                visited.add(node_id)
                node_map[node_id] = node
                
                # 向上追溯父节点
                for parent_id in node.get('parent_ids', []):
                    if parent_id and parent_id not in visited:
                        try:
                            queue.append(ObjectId(parent_id))
                        except Exception:
                            continue
        
        current_depth += 1
    
    if current_depth >= max_depth and queue:
        logger.warning(f"DAG traversal stopped due to max_depth limit ({max_depth})")
    
    # 构建边关系（从父节点指向子节点，只包含SubDAG内的边）
    edges = defaultdict(list)
    for node_id, node in node_map.items():
        for parent_id in node.get('parent_ids', []):
            if parent_id in node_map:
                edges[parent_id].append(node_id)
    
    logger.info(f"SubDAG构建完成: {len(node_map)} 个节点, {sum(len(v) for v in edges.values())} 条边")
    
    # 检测合并点（多父节点）
    merge_points = [nid for nid, node in node_map.items() 
                   if len(node.get('parent_ids', [])) > 1]
    if merge_points:
        logger.info(f"检测到 {len(merge_points)} 个合并点: {merge_points[:5]}{'...' if len(merge_points) > 5 else ''}")
    
    return node_map, dict(edges)


def topological_sort_subdag(node_map: dict, edges: dict) -> list[str]:
    """
    对SubDAG进行拓扑排序，保持链不切割
    
    注意：node_map 本身已经是 build_dag_from_parents 构建的 SubDAG
    
    算法步骤：
    1. 计算 SubDAG 内每个节点的入度和出度
    2. 使用改进的 Kahn 算法进行拓扑排序
    3. 链不切割策略：如果连续节点能形成链（出度为1且入度为1），则保持连续
    
    Args:
        node_map: 节点ID到节点数据的映射（已经是SubDAG）
        edges: 边关系 {parent_id: [child_id, ...]}
    
    Returns:
        拓扑排序后的节点ID列表
    """
    if not node_map:
        return []
    
    # node_map 本身已经是 SubDAG，直接使用
    subdag_nodes = set(node_map.keys())
    logger.info(f"SubDAG包含 {len(subdag_nodes)} 个节点: {sorted(subdag_nodes)}")
    
    # 计算 SubDAG 内每个节点的入度和出度
    in_degree = defaultdict(int)
    out_degree = defaultdict(int)
    
    for node_id in subdag_nodes:
        # 入度：来自 SubDAG 内的父节点
        for parent_id in node_map.get(node_id, {}).get('parent_ids', []):
            if parent_id in subdag_nodes:
                in_degree[node_id] += 1
        # 出度：指向 SubDAG 内的子节点
        for child_id in edges.get(node_id, []):
            if child_id in subdag_nodes:
                out_degree[node_id] += 1
    
    # 调试日志
    logger.debug(f"节点入度: {dict(in_degree)}")
    logger.debug(f"节点出度: {dict(out_degree)}")
    
    # 拓扑排序，保持链不切割
    result = []
    available = set([n for n in subdag_nodes if in_degree[n] == 0])
    in_degree_copy = defaultdict(int, in_degree)
    
    while available:
        selected = None
        
        if result:
            last_node = result[-1]
            # 策略1：优先选择last_node的子节点（延续链）
            # 子节点此时入度应该为0（因为已经加入available）
            # 同时子节点的原始入度必须为1（确保是单一路径）
            for child_id in edges.get(last_node, []):
                if child_id in available and in_degree[child_id] == 1:
                    selected = child_id
                    break
            
            # 策略2：如果没有可延续的链，选择能开始新链的节点（原始入度为1且出度为1）
            if selected is None:
                for node_id in sorted(available):
                    if in_degree[node_id] == 1 and out_degree.get(node_id, 0) == 1:
                        selected = node_id
                        break
                
                # 策略3：选择任意可用节点（按ID排序保证确定性）
                if selected is None:
                    selected = sorted(available)[0]
        else:
            # 第一个节点：选择入度为0的节点（根节点）
            selected = sorted(available)[0]
        
        result.append(selected)
        available.remove(selected)
        
        # 更新子节点的入度
        for child_id in edges.get(selected, []):
            if child_id in subdag_nodes:
                in_degree_copy[child_id] -= 1
                if in_degree_copy[child_id] == 0:
                    available.add(child_id)
    
    return result


def build_history_from_parent_ids(mongo_db: MongoDBConnection, parent_ids: list[str]) -> list[dict]:
    """
    根据parent_ids构建历史消息
    
    算法流程：
    1. 从parent_ids开始，构建SubDAG（只包含相关分支的历史）
    2. 对SubDAG进行拓扑排序
    3. 将拓扑排序后的消息转换为标准格式
    
    Args:
        mongo_db: MongoDB连接实例
        parent_ids: 起始父节点ID列表 (MongoDB ObjectId的hex字符串)
    
    Returns:
        按对话顺序排列的历史消息列表 [{"role": str, "content": str}, ...]
    """
    if not parent_ids:
        return []
    
    logger.info(f"开始构建SubDAG历史，parent_ids: {parent_ids}")
    
    # 步骤1：构建SubDAG
    node_map, edges = build_dag_from_parents(mongo_db, parent_ids)
    
    if not node_map:
        logger.warning(f"未找到有效的消息节点: {parent_ids}")
        return []
    
    # 步骤2：对SubDAG进行拓扑排序
    sorted_node_ids = topological_sort_subdag(node_map, edges)
    
    logger.info(f"拓扑排序完成，共 {len(sorted_node_ids)} 个消息")
    
    # 步骤3：转换为标准格式
    ordered_messages = []
    for node_id in sorted_node_ids:
        node = node_map[node_id]
        ordered_messages.append({
            "role": node['role'],
            "content": node['content']
        })
    
    return ordered_messages


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    对话接口
    
    必需参数:
        conversation_id: 对话ID，必须在调用前通过 /create-conversation 创建
        message: 用户消息内容
    
    可选参数:
        parent_ids: 父消息ID列表，用于支持分支提问和合并提问
        model: 使用的模型，默认 deepseek
        deep_thinking: 是否开启深度思考
        search_enabled: 是否开启搜索
    """
    logger.info(f"Chat endpoint accessed with user_id: {request.user_id}, "
                f"conversation_id: {request.conversation_id}, "
                f"parent_ids: {request.parent_ids}, model: {request.model}")

    mysql_db = MySQLConnection()
    mongo_db = MongoDBConnection()
    try:
        # 构建消息历史
        chat_messages = []
        first_ask = True

        # 连接MongoDB
        if mongo_db.connect():
            if request.parent_ids:
                # 使用SubDAG拓扑排序构建历史（支持分支提问和合并提问）
                logger.info(f"Building history from parent_ids using SubDAG topology sort: {request.parent_ids}")
                history_messages = build_history_from_parent_ids(mongo_db, request.parent_ids)
                if history_messages:
                    first_ask = False
                    chat_messages = history_messages
                    logger.info(f"Built history with {len(history_messages)} messages from SubDAG")
                else:
                    logger.warning(f"No history found for parent_ids: {request.parent_ids}, "
                                   f"this might be the first message in conversation")
            else:
                # 首次提问，没有parent_ids，不需要构建历史
                logger.info(f"No parent_ids provided, this is the first message in conversation: {request.conversation_id}")

        # 将当前用户消息添加到历史消息中
        chat_messages.append({"role": "user", "content": request.message})

        return StreamingResponse(
            generate(chat_messages, request, mysql_db, mongo_db, first_ask),
            media_type="text/event-stream; charset=utf-8"
        )

    finally:
        mysql_db.disconnect()
        mongo_db.disconnect()


async def generate(chat_messages, request, mysql_db, mongo_db, first_ask):
    """
    生成流式响应并处理对话内容

    参数:
        chat_messages: 对话历史消息列表
        request: ChatRequest对象
        mysql_db: MySQL数据库连接对象
        mongo_db: MongoDB数据库连接对象
        first_ask: 是否是第一次问

    返回:
        流式响应数据生成器
    """
    try:
        full_content = ""
        full_reasoning = ""

        # 通过模型工厂获取对应的模型服务
        model_service = ModelFactory.get_service(request.model)
        if not model_service:
            yield f"data: {json.dumps({'error': f'不支持的模型: {request.model}'})}\n\n"
            return

        # 打印传给大模型的messages信息
        logger.info("=" * 80)
        logger.info(f"调用大模型API - 模型: {request.model}")
        logger.info(f"消息总数: {len(chat_messages)}")
        logger.info(f"深度思考模式: {request.deep_thinking}")
        logger.info("-" * 80)
        for i, msg in enumerate(chat_messages, 1):
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            # 截断过长的内容，避免日志过长
            display_content = content[:200] + "..." if len(content) > 200 else content
            logger.info(f"消息 {i}/{len(chat_messages)} [{role}]: {display_content}")
        logger.info("=" * 80)

        # 流式处理每个数据块
        async for chunk in model_service.generate(chat_messages, request.deep_thinking):
            if chunk.get('error'):
                yield f"data: {json.dumps(chunk)}\n\n"
                return

            content = chunk.get('content', '')
            reasoning = chunk.get('reasoning', '')
            full_content += content
            full_reasoning += reasoning

            # 实时返回内容
            yield f"data: {json.dumps({'content': content, 'reasoning': reasoning}, ensure_ascii=False)}\n\n"

        # 最终保存完整响应并获取用户消息和助手消息的MongoDB ID
        user_message_id, ai_message_id = await save_conversation_to_database(request, full_content, full_reasoning, mysql_db, mongo_db, first_ask)

        # 返回用户消息和助手消息的MongoDB ID给前端
        if user_message_id and ai_message_id:
            final_data = {
                'user_message_id': str(user_message_id),
                'assistant_message_id': str(ai_message_id),
                'complete': True
            }
            yield f"data: {json.dumps(final_data, ensure_ascii=False)}\n\n"

    except (ConnectionError, asyncio.CancelledError, BrokenPipeError, OSError) as e:
        # 客户端正常中断连接，不记录为错误
        logger.info(f"客户端中断连接: {type(e).__name__}: {str(e)}")
        return  # 正常结束，不返回任何错误信息

    except Exception as e:
        # 真正的错误，需要记录日志并返回错误信息
        logger.error(f"流式处理错误: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': '流式响应失败'})}\n\n"


def update_conversation_models(mysql_db: MySQLConnection, conversation_id: str, new_model: str):
    """
    更新对话中使用的模型列表，避免重复

    Args:
        mysql_db: MySQL数据库连接对象
        conversation_id: 对话ID
        new_model: 新使用的模型名

    Returns:
        bool: 更新是否成功
    """
    try:
        # 查询当前model字段
        query = "SELECT model FROM t_conversations WHERE id = %s"
        result = mysql_db.fetch_data(query, (conversation_id,))

        if not result:
            logger.error(f"Conversation {conversation_id} not found")
            return False

        # 安全地提取model字段
        first_row = result[0] if len(result) > 0 else None
        current_model = first_row[0] if first_row and len(first_row) > 0 else ""

        # 如果当前model为空，直接设置为new_model
        if not current_model:
            updated_model = new_model
        else:
            # 确保current_model是字符串类型
            current_model_str = str(current_model) if current_model else ""

            # 将当前模型字符串按逗号分割成列表，去除空格
            current_models = [model.strip() for model in current_model_str.split(',') if model.strip()]

            # 如果新模型不在当前模型列表中，添加进去
            if new_model not in current_models:
                current_models.append(new_model)

            # 重新组合成逗号分隔的字符串
            updated_model = ','.join(current_models)

        # 更新数据库
        update_query = "UPDATE t_conversations SET model = %s, update_time = %s WHERE id = %s"
        success = mysql_db.execute_query(update_query, (updated_model, datetime.now(), conversation_id))

        if success:
            logger.info(f"Updated conversation {conversation_id} models to: {updated_model}")
        else:
            logger.error(f"Failed to update conversation {conversation_id} models")

        return success

    except Exception as e:
        logger.error(f"Error updating conversation models: {str(e)}", exc_info=True)
        return False


async def save_conversation_to_database(request: ChatRequest, full_content: str, full_reasoning: str, mysql_db,
                                        mongo_db, first_ask: bool):
    """
    保存对话内容到MySQL和MongoDB数据库

    参数:
        request: ChatRequest对象, 包含对话ID、用户ID等信息
        full_content: 完整的AI响应内容
        full_reasoning: 完整的AI推理内容
        mysql_db: MySQL数据库连接对象
        mongo_db: MongoDB数据库连接对象
        first_ask: 是否是第一次问

    返回:
        tuple: (用户消息的MongoDB ID, 助手消息的MongoDB ID)
    """
    if mysql_db.connect():
        try:
            # 新对话
            if first_ask:
                # 获取当前请求的模型服务，并调用其generate_title方法
                model_service = ModelFactory.get_service(request.model)
                if model_service:
                    generated_title = model_service.generate_title(request.message, full_content)
                    logger.info(f"Generated title: {generated_title}")
                else:
                    # 如果获取不到模型服务，使用默认方式生成标题
                    generated_title = full_content[:20]

                # 更新对话标题
                success = mysql_db.execute_query(
                    """
                    UPDATE t_conversations
                    SET title = %s, update_time = %s
                    WHERE id = %s
                    """,
                    (generated_title, datetime.now(), request.conversation_id)
                )
                if success:
                    logger.info("MySQL title update successful")
                else:
                    logger.error("MySQL title update failed")
            # 老对话，只更新时间
            else:
                success = mysql_db.execute_query(
                    """
                    UPDATE t_conversations
                    SET update_time = %s
                    WHERE id = %s
                    """,
                    (datetime.now(), request.conversation_id)
                )
                if success:
                    logger.info("MySQL conversation update successful")
                else:
                    logger.error("MySQL conversation update failed")

            # 无论是对话还是新对话，都需要更新模型记录
            if request.conversation_id:
                update_conversation_models(mysql_db, request.conversation_id, request.model)

        except Exception as e:
            logger.error(f"MySQL operation failed: {str(e)}", exc_info=True)

    if mongo_db.connect():
        # 保存用户提问
        user_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "user",
            "content": request.message,
            "model": request.model
        }
        if request.parent_ids:
            user_message_kwargs["parent_ids"] = request.parent_ids

        user_message = MessageNode(**user_message_kwargs)
        user_message_id = mongo_db.insert('message_node', user_message.model_dump(exclude_none=True))

        # 如果request.parent_ids存在, 将所有的父节点里面的孩子节点增加当前消息节点的ObjectId
        if request.parent_ids:
            # 将parent_ids中的字符串转换为ObjectId类型
            parent_ids_object_ids = [ObjectId(parent_id) for parent_id in request.parent_ids]
            parent_message_nodes = mongo_db.find('message_node', {'_id': {'$in': parent_ids_object_ids}})
            for parent_message_node in parent_message_nodes:
                # 避免重复添加children
                child_id_str = str(user_message_id)
                if child_id_str not in parent_message_node.get('children', []):
                    parent_message_node['children'].append(child_id_str)
                    mongo_db.update('message_node', {'_id': parent_message_node['_id']}, parent_message_node)

        # 保存大模型回答
        ai_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "assistant",
            "content": full_content,
            "model": request.model
        }
        if full_reasoning:
            ai_message_kwargs["reasoning"] = full_reasoning
        ai_message = MessageNode(**ai_message_kwargs)
        ai_message_id = mongo_db.insert('message_node', ai_message.model_dump(exclude_none=True))

        # 将用户的提问和大模型的回答关联起来
        # 直接使用插入时返回的ObjectId进行关联
        # 用户提问的children添加大模型回答的ObjectId
        user_message_dict = user_message.model_dump(exclude_none=True)
        ai_message_id_str = str(ai_message_id)
        if ai_message_id_str not in user_message_dict.get('children', []):
            user_message_dict['children'].append(ai_message_id_str)

        # 大模型回答的parent_ids添加用户提问的ObjectId
        ai_message_dict = ai_message.model_dump(exclude_none=True)
        user_message_id_str = str(user_message_id)
        if user_message_id_str not in ai_message_dict.get('parent_ids', []):
            ai_message_dict['parent_ids'].append(user_message_id_str)

        # 更新数据库中的文档
        mongo_db.update('message_node', {'_id': user_message_id}, user_message_dict)
        mongo_db.update('message_node', {'_id': ai_message_id}, ai_message_dict)

        # 返回用户消息和助手消息的MongoDB ID
        return user_message_id, ai_message_id
