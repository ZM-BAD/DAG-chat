import logging
from fastapi import APIRouter

# 创建主路由器实例
router = APIRouter()
logger = logging.getLogger(__name__)

# 从各个子模块导入路由
from .routes.base import router as base_router
from .routes.conversation import router as conversation_router
from .routes.chat import router as chat_router

# 合并所有路由到主路由器
router.include_router(base_router, tags=["基础接口"])
router.include_router(conversation_router, tags=["对话管理"])
router.include_router(chat_router, tags=["聊天接口"])
