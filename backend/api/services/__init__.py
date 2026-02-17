"""
模型服务模块
提供统一的模型服务接口和工厂管理
"""

from .model_factory import ModelFactory
from .base_service import BaseModelService

# 导入所有模型服务类，确保装饰器能正常注册
from .deepseek_service import DeepSeekService
from .qwen_service import QwenService
from .kimi_service import KimiService
from .glm_service import GLMService

# 导出主要接口
__all__ = [
    "ModelFactory",
    "BaseModelService",
    "DeepSeekService",
    "QwenService",
    "KimiService",
    "GLMService",
]
