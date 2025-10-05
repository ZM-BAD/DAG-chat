import logging
from typing import Optional

from pydantic import BaseModel

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing requests models")


class ChatRequest(BaseModel):
    message: str
    user_id: str = "zm-bad"
    conversation_id: Optional[str] = None
    model: str = "deepseek-r1"
    parent_ids: list[str] | None = None
    title: Optional[str] = None


class CreateConversationRequest(BaseModel):
    user_id: str = "zm-bad"
    model: str = "deepseek-r1"
