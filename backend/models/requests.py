import logging

from pydantic import BaseModel

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing requests models")


class ChatRequest(BaseModel):
    message: str
    user_id: str = "zm-bad"
    conversation_id: str  # 必填字段，没有则请求不合法
    model: str = "deepseek"
    parent_ids: list[str] | None = None
    deep_thinking: bool = False
    search_enabled: bool = False


class CreateConversationRequest(BaseModel):
    user_id: str = "zm-bad"
    model: str = "deepseek"
    deep_thinking: bool = False
    search_enabled: bool = False
