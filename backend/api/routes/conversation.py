import logging
import uuid
import pymongo
from backend.database.mongodb_connection import MongoDBConnection
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Query

from backend.database.mysql_connection import MySQLConnection
from backend.models.requests import CreateConversationRequest

# 常量定义
MAX_TITLE_LENGTH = 64
DEFAULT_TITLE = '未命名对话'

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


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
            # 创建对话的时候, 标题默认为"未命名对话"
            title = DEFAULT_TITLE
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


@router.delete("/dialogue/delete")
def delete_conversation(
    conversation_id: str = Query(..., description="对话ID", min_length=1),
    user_id: str = Query(default="zm-bad", description="用户ID", min_length=1)
):
    """
    删除对话

    参数:
        conversation_id: 对话ID
        user_id: 用户ID

    返回:
        删除结果
    """
    # 参数验证
    if not conversation_id or not conversation_id.strip():
        return {
            "code": 400,
            "message": "对话ID不能为空",
            "data": {}
        }

    if not user_id or not user_id.strip():
        return {
            "code": 400,
            "message": "用户ID不能为空",
            "data": {}
        }

    logger.info(f"删除对话, conversation_id: {conversation_id}, user_id: {user_id}")

    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            # 先删除MongoDB中的消息记录
            import pymongo
            from backend.database.mongodb_connection import MongoDBConnection

            mongo_db = MongoDBConnection()
            try:
                if mongo_db.connect():
                    # 删除该对话的所有消息
                    mongo_db.delete_many('message_node', {'conversation_id': conversation_id})
                    logger.info(f"删除对话 {conversation_id} 的消息记录")
            except Exception as e:
                logger.error(f"删除MongoDB消息记录失败: {str(e)}")
            finally:
                mongo_db.disconnect()

            # 删除MySQL中的对话记录
            query = "DELETE FROM t_conversations WHERE id = %s AND user_id = %s"
            params = (conversation_id, user_id)

            if mysql_db.execute_query(query, params):
                logger.info(f"成功删除对话 {conversation_id}")
                return {
                    "code": 0,
                    "message": "对话删除成功",
                    "data": {}
                }
            else:
                logger.error("删除对话失败：数据库删除失败")
                return {
                    "code": 500,
                    "message": "删除对话失败：数据库删除失败",
                    "data": {}
                }
        else:
            logger.error("无法连接到MySQL数据库")
            return {
                "code": 500,
                "message": "数据库连接失败",
                "data": {}
            }
    except Exception as e:
        logger.error(f"删除对话失败: {str(e)}", exc_info=True)
        return {
            "code": 500,
            "message": f"删除对话失败: {str(e)}",
            "data": {}
        }
    finally:
        mysql_db.disconnect()


@router.put("/dialogue/rename")
def rename_conversation(
    conversation_id: str = Query(..., description="对话ID", min_length=1),
    user_id: str = Query(default="zm-bad", description="用户ID", min_length=1),
    new_title: str = Query(..., description="新标题", min_length=1)
):
    """
    重命名对话

    参数:
        conversation_id: 对话ID
        user_id: 用户ID
        new_title: 新标题

    返回:
        重命名结果
    """
    # 参数验证
    if not conversation_id or not conversation_id.strip():
        return {
            "code": 400,
            "message": "对话ID不能为空",
            "data": {}
        }

    if not user_id or not user_id.strip():
        return {
            "code": 400,
            "message": "用户ID不能为空",
            "data": {}
        }

    if not new_title or not new_title.strip():
        return {
            "code": 400,
            "message": "新标题不能为空",
            "data": {}
        }

    if len(new_title) > MAX_TITLE_LENGTH:
        return {
            "code": 400,
            "message": f"标题长度不能超过{MAX_TITLE_LENGTH}个字符",
            "data": {}
        }

    logger.info(f"重命名对话, conversation_id: {conversation_id}, user_id: {user_id}, new_title: {new_title}")

    mysql_db = MySQLConnection()
    try:
        if mysql_db.connect():
            # 更新对话标题
            query = "UPDATE t_conversations SET title = %s, update_time = %s WHERE id = %s AND user_id = %s"
            params = (new_title, datetime.now(), conversation_id, user_id)

            if mysql_db.execute_query(query, params):
                logger.info(f"成功重命名对话 {conversation_id} 为 {new_title}")
                return {
                    "code": 0,
                    "message": "对话重命名成功",
                    "data": {}
                }
            else:
                logger.error("重命名对话失败：数据库更新失败")
                return {
                    "code": 500,
                    "message": "重命名对话失败：数据库更新失败",
                    "data": {}
                }
        else:
            logger.error("无法连接到MySQL数据库")
            return {
                "code": 500,
                "message": "数据库连接失败",
                "data": {}
            }
    except Exception as e:
        logger.error(f"重命名对话失败: {str(e)}", exc_info=True)
        return {
            "code": 500,
            "message": f"重命名对话失败: {str(e)}",
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
                message_dict = {
                    "id": str(msg['_id']),
                    "content": msg['content'],
                    "role": msg['role'],
                    "parent_ids": msg.get('parent_ids', []),
                    "children": msg.get('children', []),
                    "model": msg.get('model', None)
                }

                # 添加reasoning字段（如果存在）
                if msg.get('reasoning'):
                    message_dict["thinkingContent"] = msg['reasoning']
                    # 对于历史对话，默认展开思考内容
                    message_dict["isThinkingExpanded"] = True
                    message_dict["isWaitingForFirstToken"] = False

                message_list.append(message_dict)
            
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
