"""
Chat route module

Provides chat-related API endpoints, including:
- Building conversation DAG structure
- Topological sorting
- Streaming response generation
- Conversation history management
"""

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime
from bson.errors import InvalidId
from bson import ObjectId
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.database.mongodb_connection import MongoDBConnection
from backend.database.mysql_connection import MySQLConnection
from backend.models.requests import ChatRequest, PlaceholderRequest
from backend.models.schemas import MessageNode
from backend.api.services.base_service import truncate_fallback
from backend.api.services.model_factory import ModelFactory
from backend.models.error_codes import (
    DB_CONNECTION_FAILED,
    UNSUPPORTED_MODEL,
    STREAM_RESPONSE_FAILED,
    make_error_response,
    make_sse_error,
)

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


def build_dag_from_parents(
    mongo_db: MongoDBConnection, parent_ids: list[str]
) -> tuple[dict, dict]:
    """
    Trace upward from parent_ids to build a SubDAG

    This function only contains nodes reachable by tracing upward from parent_ids,
    not all history in the conversation.
    For example: if the conversation has branches, only trace ancestors of the
    currently selected branch, not other branches.

    Args:
        mongo_db: MongoDB connection instance
        parent_ids: List of starting parent node IDs

    Returns:
        node_map: Mapping from node ID to node data (i.e., the SubDAG)
        edges: Edge relationships {parent_id: [child_id, ...]}
    """
    if not parent_ids:
        return {}, {}

    # 验证和转换ObjectId
    try:
        start_ids = [ObjectId(pid) for pid in parent_ids if pid]
    except InvalidId as e:
        logger.error("Invalid parent_ids format: %s, error: %s", parent_ids, e)
        return {}, {}
    except Exception as e:
        logger.error(
            "Unexpected error when parsing parent_ids: %s, error: %s",
            parent_ids,
            e,
        )
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
        nodes = mongo_db.find("message_node", {"_id": {"$in": current_batch}})

        for node in nodes:
            node_id = str(node["_id"])
            if node_id not in visited:
                visited.add(node_id)
                node_map[node_id] = node

                # 向上追溯父节点
                for parent_id in node.get("parent_ids", []):
                    if parent_id and parent_id not in visited:
                        try:
                            queue.append(ObjectId(parent_id))
                        except InvalidId:
                            continue
                        except Exception:
                            continue

        current_depth += 1

    if current_depth >= max_depth and queue:
        logger.warning("DAG traversal stopped due to max_depth limit (%d)", max_depth)

    # 构建边关系（从父节点指向子节点，只包含SubDAG内的边）
    edges = defaultdict(list)
    for node_id, node in node_map.items():
        for parent_id in node.get("parent_ids", []):
            if parent_id in node_map:
                edges[parent_id].append(node_id)

    return node_map, dict(edges)


def topological_sort_subdag(node_map: dict, edges: dict) -> list[str]:
    """
    Perform topological sort on the SubDAG while preserving chains

    Note: node_map is already the SubDAG built by build_dag_from_parents

    Algorithm steps:
    1. Calculate in-degree and out-degree for each node within the SubDAG
    2. Use a modified Kahn's algorithm for topological sorting
    3. Chain-preserving strategy: if consecutive nodes form a chain
       (out-degree=1 and in-degree=1), keep them consecutive

    Args:
        node_map: Mapping from node ID to node data (already a SubDAG)
        edges: Edge relationships {parent_id: [child_id, ...]}

    Returns:
        List of node IDs in topological order
    """
    if not node_map:
        return []

    # node_map 本身已经是 SubDAG，直接使用
    subdag_nodes = set(node_map.keys())

    # 计算 SubDAG 内每个节点的入度和出度
    in_degree = defaultdict(int)
    out_degree = defaultdict(int)

    for node_id in subdag_nodes:
        # 入度：来自 SubDAG 内的父节点
        for parent_id in node_map.get(node_id, {}).get("parent_ids", []):
            if parent_id in subdag_nodes:
                in_degree[node_id] += 1
        # 出度：指向 SubDAG 内的子节点
        for child_id in edges.get(node_id, []):
            if child_id in subdag_nodes:
                out_degree[node_id] += 1

    # 调试日志
    logger.debug("Node in-degrees: %s", dict(in_degree))
    logger.debug("Node out-degrees: %s", dict(out_degree))

    # 拓扑排序，保持链不切割
    result = []
    available = {n for n in subdag_nodes if in_degree[n] == 0}
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


def build_history_from_parent_ids(
    mongo_db: MongoDBConnection, parent_ids: list[str]
) -> list[dict]:
    """
    Build message history from parent_ids

    Algorithm flow:
    1. Starting from parent_ids, build a SubDAG (only containing relevant branch history)
    2. Perform topological sort on the SubDAG
    3. Convert topologically sorted messages to standard format

    Args:
        mongo_db: MongoDB connection instance
        parent_ids: List of starting parent node IDs (hex strings of MongoDB ObjectIds)

    Returns:
        List of history messages in conversation order [{"role": str, "content": str}, ...]
    """
    if not parent_ids:
        return []

    # 步骤1：构建SubDAG
    node_map, edges = build_dag_from_parents(mongo_db, parent_ids)

    if not node_map:
        logger.warning("No valid message nodes found: %s", parent_ids)
        return []

    # 步骤2：对SubDAG进行拓扑排序
    sorted_node_ids = topological_sort_subdag(node_map, edges)

    # 步骤3：转换为标准格式
    ordered_messages = []
    for node_id in sorted_node_ids:
        node = node_map[node_id]
        ordered_messages.append({"role": node["role"], "content": node["content"]})

    return ordered_messages


def create_message_placeholders(
    mongo_db: MongoDBConnection,
    conversation_id: str,
    message: str,
    model: str,
    parent_ids: list[str] | None = None,
) -> tuple[str, str]:
    """
    Create placeholder message documents, returns (user_message_id, assistant_message_id)

    Placeholder mode: first create documents in MongoDB to get realId,
    then the chat endpoint updates content via update instead of insert.
    No MySQL operations, ensuring fast response.
    """
    # 保存用户消息
    user_message_kwargs = {
        "conversation_id": conversation_id,
        "role": "user",
        "content": message,
        "model": model,
    }
    if parent_ids:
        user_message_kwargs["parent_ids"] = parent_ids

    user_message = MessageNode(**user_message_kwargs)
    user_message_id = mongo_db.insert(
        "message_node", user_message.model_dump(exclude_none=True)
    )

    # 创建空的助手消息占位符
    ai_message_kwargs = {
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": "",
        "model": model,
        "parent_ids": [str(user_message_id)],
    }
    ai_message = MessageNode(**ai_message_kwargs)
    ai_message_id = mongo_db.insert(
        "message_node", ai_message.model_dump(exclude_none=True)
    )

    # 建立双向关联：user.children = [assistant_id]
    user_message_dict = user_message.model_dump(exclude_none=True)
    ai_message_id_str = str(ai_message_id)
    user_message_dict["children"] = [ai_message_id_str]
    mongo_db.update("message_node", {"_id": user_message_id}, user_message_dict)

    # 更新父节点的 children
    if parent_ids:
        parent_ids_object_ids = [ObjectId(pid) for pid in parent_ids]
        parent_message_nodes = mongo_db.find(
            "message_node", {"_id": {"$in": parent_ids_object_ids}}
        )
        for parent_message_node in parent_message_nodes:
            child_id_str = str(user_message_id)
            if child_id_str not in parent_message_node.get("children", []):
                parent_message_node["children"].append(child_id_str)
                mongo_db.update(
                    "message_node",
                    {"_id": parent_message_node["_id"]},
                    parent_message_node,
                )

    return str(user_message_id), str(ai_message_id)


@router.post("/create-message-placeholders")
async def create_placeholders(request: PlaceholderRequest):
    """
    Create message placeholders endpoint

    Called before sending a chat request, pre-creates user and assistant message
    documents in MongoDB, returns real MongoDB IDs. Frontend uses realId from
    this point, eliminating the tempId concept.
    """
    mongo_db = MongoDBConnection()
    try:
        if not mongo_db.connect():
            return make_error_response(500, DB_CONNECTION_FAILED)

        user_msg_id, assistant_msg_id = create_message_placeholders(
            mongo_db,
            request.conversation_id,
            request.message,
            request.model,
            request.parent_ids,
        )

        return {
            "user_message_id": user_msg_id,
            "assistant_message_id": assistant_msg_id,
        }
    finally:
        mongo_db.disconnect()


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Chat endpoint

    Required parameters:
        conversation_id: Conversation ID, must be created via /create-conversation before calling
        message: User message content

    Optional parameters:
        parent_ids: List of parent message IDs, for supporting branching and merging questions
        model: Model to use, default deepseek
        deep_thinking: Whether to enable deep thinking
        search_enabled: Whether to enable search
        user_message_id: User message MongoDB ID in placeholder mode
        assistant_message_id: Assistant message MongoDB ID in placeholder mode
    """
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
                history_messages = build_history_from_parent_ids(
                    mongo_db, request.parent_ids
                )
                if history_messages:
                    first_ask = False
                    chat_messages = history_messages
                else:
                    logger.warning(
                        "No history found for parent_ids: %s, this might be the first message in conversation",
                        request.parent_ids,
                    )

        # Append current user message to chat history
        chat_messages.append({"role": "user", "content": request.message})

        return StreamingResponse(
            generate(
                chat_messages,
                request,
                mysql_db,
                mongo_db,
                first_ask,
            ),
            media_type="text/event-stream; charset=utf-8",
        )

    finally:
        mysql_db.disconnect()
        mongo_db.disconnect()


async def generate(chat_messages, request, mysql_db, mongo_db, first_ask):
    """
    Generate streaming response and process conversation content

    Args:
        chat_messages: List of conversation history messages
        request: ChatRequest object
        mysql_db: MySQL database connection object
        mongo_db: MongoDB database connection object
        first_ask: Whether this is the first question

    Returns:
        Streaming response data generator
    """
    try:
        full_content = ""
        full_reasoning = ""

        # 通过模型工厂获取对应的模型服务
        model_service = ModelFactory.get_service(request.model)
        if not model_service:
            yield make_sse_error(UNSUPPORTED_MODEL, {"model": request.model})
            return

        # 流式处理每个数据块
        async for chunk in model_service.generate(chat_messages, request.deep_thinking):
            if chunk.get("error"):
                yield f"data: {json.dumps(chunk)}\n\n"
                return

            content = chunk.get("content", "")
            reasoning = chunk.get("reasoning", "")
            full_content += content
            full_reasoning += reasoning

            # 实时返回内容
            yield f"data: {json.dumps({'content': content, 'reasoning': reasoning}, ensure_ascii=False)}\n\n"

        # 保存完整响应并获取消息ID
        user_message_id, ai_message_id = await save_conversation_to_database(
            request, full_content, full_reasoning, mysql_db, mongo_db, first_ask
        )

        # 返回消息ID给前端（placeholder 模式下前端已有，保持兼容）
        if user_message_id and ai_message_id:
            final_data = {
                "user_message_id": str(user_message_id),
                "assistant_message_id": str(ai_message_id),
                "complete": True,
            }
            yield f"data: {json.dumps(final_data, ensure_ascii=False)}\n\n"

    except asyncio.CancelledError:
        try:
            # 自建连接，不依赖 chat() 中已被 finally 关闭的连接
            abort_mongo_db = MongoDBConnection()
            abort_mysql_db = MySQLConnection()
            try:
                await save_conversation_to_database(
                    request,
                    full_content,
                    full_reasoning,
                    abort_mysql_db,
                    abort_mongo_db,
                    first_ask,
                    skip_title_generation=True,
                )
            finally:
                abort_mysql_db.disconnect()
                abort_mongo_db.disconnect()
        except Exception as save_err:
            logger.error("Abort save failed: %s", save_err)
        raise

    except Exception as e:
        logger.error("Streaming processing error: %s", str(e), exc_info=True)
        yield make_sse_error(STREAM_RESPONSE_FAILED)


def update_conversation_models(
    mysql_db: MySQLConnection, conversation_id: str, new_model: str
):
    """
    Update the list of models used in a conversation, avoiding duplicates

    Args:
        mysql_db: MySQL database connection object
        conversation_id: Conversation ID
        new_model: Newly used model name

    Returns:
        bool: Whether the update was successful
    """
    try:
        # 查询当前model字段
        query = "SELECT model FROM t_conversations WHERE id = %s"
        result = mysql_db.fetch_data(query, (conversation_id,))

        if not result:
            logger.error("Conversation %s not found", conversation_id)
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
            current_models = [
                model.strip() for model in current_model_str.split(",") if model.strip()
            ]

            # 如果新模型不在当前模型列表中，添加进去
            if new_model not in current_models:
                current_models.append(new_model)

            # 重新组合成逗号分隔的字符串
            updated_model = ",".join(current_models)

        # 更新数据库
        update_query = (
            "UPDATE t_conversations SET model = %s, update_time = %s WHERE id = %s"
        )
        success = mysql_db.execute_query(
            update_query, (updated_model, datetime.now(), conversation_id)
        )

        if not success:
            logger.error("Failed to update conversation %s models", conversation_id)

        return success

    except Exception as e:
        logger.error("Error updating conversation models: %s", str(e), exc_info=True)
        return False


async def save_conversation_to_database(
    request: ChatRequest,
    full_content: str,
    full_reasoning: str,
    mysql_db,
    mongo_db,
    first_ask: bool,
    skip_title_generation: bool = False,
):
    """
    Save conversation content to MySQL and MongoDB databases

    Supports two modes:
    1. Placeholder mode (request has user_message_id and assistant_message_id):
       Directly update existing MongoDB documents, no new insert
    2. Legacy mode (no placeholder IDs):
       Insert new documents into MongoDB

    Args:
        request: ChatRequest object, containing conversation ID, user ID, etc.
        full_content: Complete AI response content
        full_reasoning: Complete AI reasoning content
        mysql_db: MySQL database connection object
        mongo_db: MongoDB database connection object
        first_ask: Whether this is the first question
        skip_title_generation: Whether to skip title generation (used in abort path)

    Returns:
        tuple: (user message MongoDB ID, assistant message MongoDB ID)
    """
    # MySQL 操作（两种模式都需要）
    if mysql_db.connect():
        try:
            # 新对话
            if first_ask:
                if skip_title_generation:
                    # abort path: skip LLM title generation, use language-aware fallback
                    generated_title = truncate_fallback(request.message)
                else:
                    # 正常路径：调用LLM生成标题
                    model_service = ModelFactory.get_service(request.model)
                    if model_service:
                        generated_title = model_service.generate_title(
                            request.message, full_content
                        )
                    else:
                        # 如果获取不到模型服务，使用 user_input 语言感知截断
                        generated_title = truncate_fallback(request.message)

                # 更新对话标题
                success = mysql_db.execute_query(
                    """
                    UPDATE t_conversations
                    SET title = %s, update_time = %s
                    WHERE id = %s
                    """,
                    (generated_title, datetime.now(), request.conversation_id),
                )
                if not success:
                    logger.error("MySQL title update failed")
            # 老对话，只更新时间
            else:
                success = mysql_db.execute_query(
                    """
                    UPDATE t_conversations
                    SET update_time = %s
                    WHERE id = %s
                    """,
                    (datetime.now(), request.conversation_id),
                )
                if not success:
                    logger.error("MySQL conversation update failed")

            # 无论是对话还是新对话，都需要更新模型记录
            if request.conversation_id:
                update_conversation_models(
                    mysql_db, request.conversation_id, request.model
                )

        except Exception as e:
            logger.error("MySQL operation failed: %s", str(e), exc_info=True)

    # MongoDB 操作
    if mongo_db.connect():
        # === Placeholder 模式：update 已有文档 ===
        if request.user_message_id and request.assistant_message_id:
            user_message_id = request.user_message_id
            ai_message_id = request.assistant_message_id

            # 更新助手消息的内容
            update_fields = {
                "content": full_content,
                "update_time": datetime.now(),
            }
            if full_reasoning:
                update_fields["reasoning"] = full_reasoning
            mongo_db.update(
                "message_node",
                {"_id": ObjectId(ai_message_id)},
                update_fields,
            )

            return user_message_id, ai_message_id

        # === 传统模式：insert 新文档 ===
        # 保存用户提问
        user_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "user",
            "content": request.message,
            "model": request.model,
        }
        if request.parent_ids:
            user_message_kwargs["parent_ids"] = request.parent_ids

        user_message = MessageNode(**user_message_kwargs)
        user_message_id = mongo_db.insert(
            "message_node", user_message.model_dump(exclude_none=True)
        )

        # 如果request.parent_ids存在, 将所有的父节点里面的孩子节点增加当前消息节点的ObjectId
        if request.parent_ids:
            # 将parent_ids中的字符串转换为ObjectId类型
            parent_ids_object_ids = [
                ObjectId(parent_id) for parent_id in request.parent_ids
            ]
            parent_message_nodes = mongo_db.find(
                "message_node", {"_id": {"$in": parent_ids_object_ids}}
            )
            for parent_message_node in parent_message_nodes:
                # 避免重复添加children
                child_id_str = str(user_message_id)
                if child_id_str not in parent_message_node.get("children", []):
                    parent_message_node["children"].append(child_id_str)
                    mongo_db.update(
                        "message_node",
                        {"_id": parent_message_node["_id"]},
                        parent_message_node,
                    )

        # 保存大模型回答
        ai_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "assistant",
            "content": full_content,
            "model": request.model,
        }
        if full_reasoning:
            ai_message_kwargs["reasoning"] = full_reasoning
        ai_message = MessageNode(**ai_message_kwargs)
        ai_message_id = mongo_db.insert(
            "message_node", ai_message.model_dump(exclude_none=True)
        )

        # 将用户的提问和大模型的回答关联起来
        # 直接使用插入时返回的ObjectId进行关联
        # 用户提问的children添加大模型回答的ObjectId
        user_message_dict = user_message.model_dump(exclude_none=True)
        ai_message_id_str = str(ai_message_id)
        if ai_message_id_str not in user_message_dict.get("children", []):
            user_message_dict["children"].append(ai_message_id_str)

        # 大模型回答的parent_ids添加用户提问的ObjectId
        ai_message_dict = ai_message.model_dump(exclude_none=True)
        user_message_id_str = str(user_message_id)
        if user_message_id_str not in ai_message_dict.get("parent_ids", []):
            ai_message_dict["parent_ids"].append(user_message_id_str)

        # 更新数据库中的文档
        mongo_db.update("message_node", {"_id": user_message_id}, user_message_dict)
        mongo_db.update("message_node", {"_id": ai_message_id}, ai_message_dict)

        # 返回用户消息和助手消息的MongoDB ID
        return user_message_id, ai_message_id
