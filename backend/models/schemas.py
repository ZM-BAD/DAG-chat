import logging
from datetime import datetime

from pydantic import BaseModel, Field

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing schemas models")


# 对话类
class Conversation(BaseModel):
    id: str
    user_id: str
    title: str | None = None
    model: str
    create_time: datetime | None = Field(default_factory=datetime.now)
    update_time: datetime | None = Field(default_factory=datetime.now)


# 消息节点类
class MessageNode(BaseModel):
    _id: str | None = None
    conversation_id: str
    role: str  # 'user' or 'assistant'
    create_time: datetime | None = Field(default_factory=datetime.now)
    update_time: datetime | None = Field(default_factory=datetime.now)
    content: str
    reasoning: str | None = None
    parent_ids: list[str] = []
    children: list[str] = []
    model: str | None = None  # 记录消息使用的模型
