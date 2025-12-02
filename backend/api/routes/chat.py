import asyncio
import json
import logging
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


@router.post("/chat")
async def chat(request: ChatRequest):
    logger.info(f"Chat endpoint accessed with user_id: {request.user_id}, parent_ids: {request.parent_ids}, model: {request.model}")

    mysql_db = MySQLConnection()
    mongo_db = MongoDBConnection()
    try:
        # 构建消息历史
        chat_messages = []
        first_ask = True

        # 如果是已有对话，从MongoDB查询历史
        if mongo_db.connect():
            history = mongo_db.find('message_node', {'conversation_id': request.conversation_id},
                                    sort=[('create_time', pymongo.ASCENDING)])
            
            # 如果history不为空，那么说明不是第一次问，需要将历史消息添加到chat_messages中
            if history and len(history) > 0:
                first_ask = False
                chat_messages = [{"role": msg['role'], "content": msg['content']} for msg in history]

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

        # 最终保存完整响应并获取助手消息的MongoDB ID
        ai_message_id = await save_conversation_to_database(request, full_content, full_reasoning, mysql_db, mongo_db, first_ask)

        # 返回助手消息的MongoDB ID给前端
        if ai_message_id:
            yield f"data: {json.dumps({'message_id': str(ai_message_id), 'complete': True}, ensure_ascii=False)}\n\n"

    except (ConnectionError, asyncio.CancelledError, BrokenPipeError, OSError) as e:
        # 客户端正常中断连接，不记录为错误
        logger.info(f"客户端中断连接: {type(e).__name__}: {str(e)}")
        return  # 正常结束，不返回任何错误信息

    except Exception as e:
        # 真正的错误，需要记录日志并返回错误信息
        logger.error(f"流式处理错误: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'error': '流式响应失败'})}\n\n"


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
        助手消息的MongoDB ID
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
                parent_message_node['children'].append(str(user_message_id))
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
        user_message_dict['children'].append(str(ai_message_id))

        # 大模型回答的parent_ids添加用户提问的ObjectId
        ai_message_dict = ai_message.model_dump(exclude_none=True)
        ai_message_dict['parent_ids'].append(str(user_message_id))

        # 更新数据库中的文档
        mongo_db.update('message_node', {'_id': user_message_id}, user_message_dict)
        mongo_db.update('message_node', {'_id': ai_message_id}, ai_message_dict)

        # 返回助手消息的MongoDB ID
        return ai_message_id
