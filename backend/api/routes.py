import json
import logging
import uuid
from datetime import datetime
import json

import pymongo
from bson import ObjectId
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from backend.database.mongodb_connection import MongoDBConnection
from backend.database.mysql_connection import MySQLConnection
from backend.deepseek import generate_title
from backend.deepseek import call_deepseek_r1
from backend.models.requests import ChatRequest, CreateConversationRequest
from backend.models.schemas import MessageNode

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/hello")
def read_hello():
    logger.info("Hello endpoint accessed")
    return {"message": "Hello World from UniformLLM!"}


@router.get("/info")
def get_info():
    logger.info("Info endpoint accessed")
    return {
        "app": "UniformLLM",
        "version": "1.0.0",
        "framework": "FastAPI"
    }


@router.post("/create-conversation")
def create_conversation(request: CreateConversationRequest):
    """
    创建新的对话
    """
    conversation_id = str(uuid.uuid4())
    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            query = """
                INSERT INTO t_conversations (id, user_id, title, model, create_time, update_time)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            # 创建对话的时候, 标题默认为空
            title = ''
            params = (conversation_id, request.user_id, title, request.model, datetime.now(), datetime.now())
            
            if mysql_db.execute_query(query, params):
                logger.info(f"Create conversation with id: {conversation_id}")
                return {"conversation_id": conversation_id}
            else:
                logger.error("创建对话失败：数据库插入失败")
                return {"error": "创建对话失败：数据库插入失败"}
        else:
            logger.error("创建对话失败: 无法连接到MySQL数据库")
            return {"error": "创建对话失败: 无法连接到MySQL数据库"}
    except Exception as e:
        logger.error(f"创建对话失败: {str(e)}", exc_info=True)
        return {"error": f"创建对话失败: {str(e)}"}
    finally:
        mysql_db.disconnect()


@router.post("/chat")
async def chat(request: ChatRequest):
    logger.info(f"Chat endpoint accessed with user_id: {request.user_id}, parent_ids: {request.parent_ids}")

    mysql_db = MySQLConnection()
    mongo_db = MongoDBConnection()
    try:
        # 构建消息历史
        chat_messages = []

        # 如果是已有对话，从MongoDB查询历史
        if request.conversation_id and mongo_db.connect():
            history = mongo_db.find('message_node', {'conversation_id': request.conversation_id},
                                    sort=[('create_time', pymongo.ASCENDING)])
            chat_messages = [{"role": msg['role'], "content": msg['content']} for msg in history]

        # 将当前用户消息添加到历史消息中
        chat_messages.append({"role": "user", "content": request.message})

        return StreamingResponse(
            generate(chat_messages, request, mysql_db, mongo_db),
            media_type="text/event-stream; charset=utf-8"
        )

    finally:
        mysql_db.disconnect()
        mongo_db.disconnect()


async def generate(chat_messages, request, mysql_db, mongo_db):
    """
    生成流式响应并处理对话内容

    参数:
        chat_messages: 对话历史消息列表
        request: ChatRequest对象
        mysql_db: MySQL数据库连接对象
        mongo_db: MongoDB数据库连接对象

    返回:
        流式响应数据生成器
    """
    try:
        full_content = ""
        full_reasoning = ""

        # 流式处理每个数据块
        async for chunk in call_deepseek_r1(chat_messages):
            content = chunk.get('content', '')
            reasoning = chunk.get('reasoning', '')
            full_content += content
            full_reasoning += reasoning

            # 实时返回内容
            yield f"data: {json.dumps({'content': content, 'reasoning': reasoning}, ensure_ascii=False)}\n\n"

        # 最终保存完整响应
        await save_conversation_to_database(request, full_content, full_reasoning, mysql_db, mongo_db)

    except Exception as e:
        logger.error(f"流式处理错误: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': '流式响应失败'})}\n\n"


@router.get("/dialogue/list")
def get_dialogue_list(
    user_id: str = Query(default="zm-bad", description="用户ID"),
    page: int = Query(default=1, ge=1, description="页码"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页条数")
):
    """
    获取用户的对话列表
    
    参数:
        user_id: 用户ID
        page: 页码
        page_size: 每页条数
    
    返回:
        对话列表及分页信息
    """
    logger.info(f"获取对话列表, user_id: {user_id}, page: {page}, page_size: {page_size}")
    
    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            # 计算偏移量
            offset = (page - 1) * page_size
            
            # 查询对话列表
            query = """SELECT id, user_id, title, model, create_time, update_time 
                      FROM t_conversations 
                      WHERE user_id = %s 
                      ORDER BY update_time DESC 
                      LIMIT %s OFFSET %s"""
            params = (user_id, page_size, offset)
            
            conversations = mysql_db.fetch_data(query, params)
            
            # 查询总条数
            count_query = "SELECT COUNT(*) FROM t_conversations WHERE user_id = %s"
            total_count = mysql_db.fetch_data(count_query, (user_id,))[0][0]
            
            # 转换为Conversation对象列表
            conversation_list = []
            for conv in conversations:
                conversation_list.append({
                    "id": conv[0],
                    "user_id": conv[1],
                    "title": conv[2],
                    "model": conv[3],
                    "create_time": conv[4].isoformat() if conv[4] else None,
                    "update_time": conv[5].isoformat() if conv[5] else None
                })
            
            return {
                "code": 0,
                "message": "success",
                "data": {
                    "list": conversation_list,
                    "total": total_count,
                    "page": page,
                    "page_size": page_size
                }
            }
        else:
            logger.error("无法连接到MySQL数据库")
            return {
                "code": 500,
                "message": "数据库连接失败",
                "data": {}
            }
    except Exception as e:
        logger.error(f"获取对话列表失败: {str(e)}", exc_info=True)
        return {
            "code": 500,
            "message": f"获取对话列表失败: {str(e)}",
            "data": {}
        }
    finally:
        mysql_db.disconnect()


@router.get("/dialogue/history")
def get_dialogue_history(
    dialogue_id: str = Query(..., description="对话ID")
):
    """
    获取指定对话的历史消息
    
    参数:
        dialogue_id: 对话ID
    
    返回:
        对话历史消息列表
    """
    logger.info(f"获取对话历史, dialogue_id: {dialogue_id}")
    
    mongo_db = MongoDBConnection()
    try:
        if mongo_db.connect():
            # 从MongoDB查询指定对话ID的所有消息节点
            messages = mongo_db.find('message_node', 
                                    {'conversation_id': dialogue_id}, 
                                    sort=[('create_time', pymongo.ASCENDING)])
            
            # 转换为前端需要的消息格式
            message_list = []
            for msg in messages:
                message_list.append({
                    "id": str(msg['_id']),
                    "content": msg['content'],
                    "role": msg['role'],
                    "parent_ids": msg.get('parent_ids', None),
                    "children": msg.get('children', None)
                })
            
            return {
                "code": 0,
                "message": "success",
                "data": message_list
            }
        else:
            logger.error("无法连接到MongoDB数据库")
            return {
                "code": 500,
                "message": "数据库连接失败",
                "data": []
            }
    except Exception as e:
        logger.error(f"获取对话历史失败: {str(e)}", exc_info=True)
        return {
            "code": 500,
            "message": f"获取对话历史失败: {str(e)}",
            "data": []
        }
    finally:
        mongo_db.disconnect()


async def save_conversation_to_database(request: ChatRequest, full_content: str, full_reasoning: str, mysql_db,
                                        mongo_db):
    """
    保存对话内容到MySQL和MongoDB数据库

    参数:
        request: ChatRequest对象, 包含对话ID、用户ID等信息
        full_content: 完整的AI响应内容
        full_reasoning: 完整的AI推理内容
        mysql_db: MySQL数据库连接对象
        mongo_db: MongoDB数据库连接对象
    """

    if mysql_db.connect():
        # 新对话
        if not request.conversation_id:
            conversation_id = str(uuid.uuid4())
            request.conversation_id = conversation_id

            # 异步调用生成标题
            generated_title = generate_title(request.message, full_content)
            mysql_db.execute_query(
                """
                INSERT INTO t_conversations
                    (id, user_id, model, title)
                VALUES (%s, %s, %s, %s)
                """,
                (conversation_id, request.user_id,
                 request.model, generated_title)
            )
        # 老对话
        else:
            mysql_db.execute_query(
                """
                UPDATE t_conversations
                SET update_time = %s
                WHERE id = %s
                """,
                (datetime.now(), request.conversation_id)
            )

    if mongo_db.connect():
        # 保存用户提问
        user_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "user",
            "content": request.message
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
                parent_message_node['children'].append(str(user_message_id))
                mongo_db.update('message_node', {'_id': parent_message_node['_id']}, parent_message_node)

        # 保存大模型回答
        ai_message_kwargs = {
            "conversation_id": request.conversation_id,
            "role": "assistant",
            "content": full_content
        }
        if full_reasoning:
            ai_message_kwargs["reasoning"] = full_reasoning
        ai_message = MessageNode(**ai_message_kwargs)
        ai_message_id = mongo_db.insert('message_node', ai_message.model_dump(exclude_none=True))

        # 将用户的提问和大模型的回答关联起来
        # 直接使用插入时返回的ObjectId进行关联
        # 用户提问的children添加大模型回答的ObjectId
        user_message_dict = user_message.model_dump(exclude_none=True)
        user_message_dict['children'].append(str(ai_message_id))

        # 大模型回答的parent_ids添加用户提问的ObjectId
        ai_message_dict = ai_message.model_dump(exclude_none=True)
        ai_message_dict['parent_ids'].append(str(user_message_id))

        # 更新数据库中的文档
        mongo_db.update('message_node', {'_id': user_message_id}, user_message_dict)
        mongo_db.update('message_node', {'_id': ai_message_id}, ai_message_dict)
