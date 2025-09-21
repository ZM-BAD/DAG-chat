import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Query

from backend.database.mysql_connection import MySQLConnection
from backend.models.requests import CreateConversationRequest

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/create-conversation")
def create_conversation(request: CreateConversationRequest):
    """
    创建新的对话
    """
    import uuid
    
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
    
    import pymongo
    from backend.database.mongodb_connection import MongoDBConnection
    
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
