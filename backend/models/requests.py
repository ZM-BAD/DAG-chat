import logging

from pydantic import BaseModel

from backend.config import DEFAULT_USER_ID

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.debug("Initializing requests models")


class ChatRequest(BaseModel):
    message: str
    user_id: str = DEFAULT_USER_ID
    conversation_id: str  # 必填字段，没有则请求不合法
    model: str = "deepseek"
    parent_ids: list[str] | None = None
    deep_thinking: bool = False
    search_enabled: bool = False
    # Placeholder 模式：前端先调用 /create-message-placeholders 拿到 realId
    user_message_id: str | None = None
    assistant_message_id: str | None = None


class CreateConversationRequest(BaseModel):
    user_id: str = DEFAULT_USER_ID
    model: str = "deepseek"
    deep_thinking: bool = False
    search_enabled: bool = False


class PlaceholderRequest(BaseModel):
    conversation_id: str
    message: str
    parent_ids: list[str] | None = None
    model: str = "deepseek"
