import logging
import uuid
from datetime import datetime

import pymongo
from fastapi import APIRouter, Query

from backend.database.mongodb_connection import MongoDBConnection
from backend.database.mysql_connection import MySQLConnection
from backend.config import DEFAULT_USER_ID
from backend.models.requests import CreateConversationRequest
from backend.models.error_codes import (
    make_error_response,
    EMPTY_CONVERSATION_ID,
    EMPTY_USER_ID,
    EMPTY_TITLE,
    TITLE_TOO_LONG,
    CREATE_CONVERSATION_FAILED,
    DELETE_CONVERSATION_FAILED,
    RENAME_CONVERSATION_FAILED,
    FETCH_HISTORY_FAILED,
    DB_CONNECTION_FAILED,
)

# 常量定义
MAX_TITLE_LENGTH = 64

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/create-conversation")
def create_conversation(request: CreateConversationRequest):
    """
    Create a new conversation
    """

    conversation_id = str(uuid.uuid4())
    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            query = """
                INSERT INTO t_conversations (id, user_id, title, model, create_time, update_time)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            # Convention: 新建对话 title 存为空字符串，前端通过
            # dialogue.title || t('dialogue.defaultTitle') 显示本地化默认标题。
            # 后端判断是否需要自动生成标题的逻辑依赖 title 是否为空。
            title = ""
            params = (
                conversation_id,
                request.user_id,
                title,
                request.model,
                datetime.now(),
                datetime.now(),
            )

            if mysql_db.execute_query(query, params):
                return {"conversation_id": conversation_id}

            logger.error("Failed to create conversation: database insert failed")
            return make_error_response(500, CREATE_CONVERSATION_FAILED)

        logger.error("Failed to create conversation: cannot connect to MySQL")
        return make_error_response(500, DB_CONNECTION_FAILED)
    except Exception as e:
        logger.error("Failed to create conversation: %s", str(e), exc_info=True)
        return make_error_response(500, CREATE_CONVERSATION_FAILED)
    finally:
        mysql_db.disconnect()


@router.get("/dialogue/list")
def get_dialogue_list(
    user_id: str = Query(default=DEFAULT_USER_ID, description="User ID"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
):
    """
    Get the user's dialogue list

    Args:
        user_id: User ID
        page: Page number
        page_size: Items per page

    Returns:
        Dialogue list with pagination info
    """
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
                conversation_list.append(
                    {
                        "id": conv[0],
                        "user_id": conv[1],
                        "title": conv[2],
                        "model": conv[3],
                        "create_time": conv[4].isoformat() if conv[4] else None,
                        "update_time": conv[5].isoformat() if conv[5] else None,
                    }
                )

            return {
                "code": 0,
                "message": "success",
                "data": {
                    "list": conversation_list,
                    "total": total_count,
                    "page": page,
                    "page_size": page_size,
                },
            }

        logger.error("Cannot connect to MySQL database")
        return make_error_response(500, DB_CONNECTION_FAILED)
    except Exception as e:
        logger.error("Failed to fetch dialogue list: %s", str(e), exc_info=True)
        return make_error_response(500, FETCH_HISTORY_FAILED)
    finally:
        mysql_db.disconnect()


@router.delete("/dialogue/delete")
def delete_conversation(
    conversation_id: str = Query(..., description="Conversation ID", min_length=1),
    user_id: str = Query(default=DEFAULT_USER_ID, description="User ID", min_length=1),
):
    """
    Delete a conversation

    Args:
        conversation_id: Conversation ID
        user_id: User ID

    Returns:
        Deletion result
    """
    # 参数验证
    if not conversation_id or not conversation_id.strip():
        return make_error_response(400, EMPTY_CONVERSATION_ID)

    if not user_id or not user_id.strip():
        return make_error_response(400, EMPTY_USER_ID)

    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            # 先删除MongoDB中的消息记录
            mongo_db = MongoDBConnection()
            try:
                if mongo_db.connect():
                    # 删除该对话的所有消息
                    mongo_db.delete_many(
                        "message_node", {"conversation_id": conversation_id}
                    )
            except Exception as e:
                logger.error("Failed to delete MongoDB messages: %s", str(e))
            finally:
                mongo_db.disconnect()

            # 删除MySQL中的对话记录
            query = "DELETE FROM t_conversations WHERE id = %s AND user_id = %s"
            params = (conversation_id, user_id)

            if mysql_db.execute_query(query, params):
                return {"code": 0, "message": "success", "data": {}}

            logger.error("Failed to delete dialogue: database delete failed")
            return make_error_response(500, DELETE_CONVERSATION_FAILED)

        logger.error("Cannot connect to MySQL database")
        return make_error_response(500, DB_CONNECTION_FAILED)
    except Exception as e:
        logger.error("Failed to delete dialogue: %s", str(e), exc_info=True)
        return make_error_response(500, DELETE_CONVERSATION_FAILED)
    finally:
        mysql_db.disconnect()


@router.put("/dialogue/rename")
def rename_conversation(
    conversation_id: str = Query(..., description="Conversation ID", min_length=1),
    user_id: str = Query(default=DEFAULT_USER_ID, description="User ID", min_length=1),
    new_title: str = Query(..., description="New title", min_length=1),
):
    """
    Rename a conversation

    Args:
        conversation_id: Conversation ID
        user_id: User ID
        new_title: New title

    Returns:
        Rename result
    """
    # 参数验证
    if not conversation_id or not conversation_id.strip():
        return make_error_response(400, EMPTY_CONVERSATION_ID)

    if not user_id or not user_id.strip():
        return make_error_response(400, EMPTY_USER_ID)

    if not new_title or not new_title.strip():
        return make_error_response(400, EMPTY_TITLE)

    if len(new_title) > MAX_TITLE_LENGTH:
        return make_error_response(
            400, TITLE_TOO_LONG, params={"maxLength": str(MAX_TITLE_LENGTH)}
        )

    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            # 更新对话标题
            query = "UPDATE t_conversations SET title = %s, update_time = %s WHERE id = %s AND user_id = %s"
            params = (new_title, datetime.now(), conversation_id, user_id)

            if mysql_db.execute_query(query, params):
                return {"code": 0, "message": "success", "data": {}}

            logger.error("Failed to rename dialogue: database update failed")
            return make_error_response(500, RENAME_CONVERSATION_FAILED)

        logger.error("Cannot connect to MySQL database")
        return make_error_response(500, DB_CONNECTION_FAILED)
    except Exception as e:
        logger.error("Failed to rename dialogue: %s", str(e), exc_info=True)
        return make_error_response(500, RENAME_CONVERSATION_FAILED)
    finally:
        mysql_db.disconnect()


@router.get("/dialogue/history")
def get_dialogue_history(dialogue_id: str = Query(..., description="Dialogue ID")):
    """
    Get history messages for a specified dialogue

    Args:
        dialogue_id: Dialogue ID

    Returns:
        List of dialogue history messages
    """
    mongo_db = MongoDBConnection()
    try:
        if mongo_db.connect():
            # 从MongoDB查询指定对话ID的所有消息节点
            messages = mongo_db.find(
                "message_node",
                {"conversation_id": dialogue_id},
                sort=[("create_time", pymongo.ASCENDING)],
            )

            # 转换为前端需要的消息格式
            message_list = []
            for msg in messages:
                message_dict = {
                    "id": str(msg["_id"]),
                    "content": msg["content"],
                    "role": msg["role"],
                    "parent_ids": msg.get("parent_ids", []),
                    "children": msg.get("children", []),
                    "model": msg.get("model", None),
                }

                # 添加reasoning字段（如果存在）
                if msg.get("reasoning"):
                    message_dict["thinkingContent"] = msg["reasoning"]
                    # 对于历史对话，默认展开思考内容
                    message_dict["isThinkingExpanded"] = True
                    message_dict["isWaitingForFirstToken"] = False

                message_list.append(message_dict)

            return {"code": 0, "message": "success", "data": message_list}
        else:
            logger.error("Cannot connect to MongoDB database")
            return make_error_response(500, DB_CONNECTION_FAILED, data=[])
    except Exception as e:
        logger.error("Failed to fetch dialogue history: %s", str(e), exc_info=True)
        return make_error_response(500, FETCH_HISTORY_FAILED, data=[])
    finally:
        mongo_db.disconnect()
