import logging
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing schemas models")


# 对话类
class Conversation(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None
    model: str
    create_time: Optional[datetime] = Field(default_factory=datetime.now)
    update_time: Optional[datetime] = Field(default_factory=datetime.now)


# 消息节点类
class MessageNode(BaseModel):
    _id: Optional[str] = None
    conversation_id: str
    role: str  # 'user' or 'assistant'
    create_time: Optional[datetime] = Field(default_factory=datetime.now)
    update_time: Optional[datetime] = Field(default_factory=datetime.now)
    content: str
    reasoning: Optional[str] = None
    parent_ids: List[str] = []
    children: List[str] = []
    model: Optional[str] = None  # 记录消息使用的模型
