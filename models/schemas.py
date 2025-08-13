import logging
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing schemas models")


# 对话类
class Conversation(BaseModel):
    id: str
    user_id: str
    title: str
    model: str
    create_time: datetime
    update_time: datetime


# 消息节点类
class MessageNode(BaseModel):
    _id: Optional[str] = None
    conversation_id: str
    role: str  # 'user' or 'assistant'
    create_time: datetime
    update_time: datetime
    content: str
    parentIds: List[str] = []
    childrenIds: List[str] = []
