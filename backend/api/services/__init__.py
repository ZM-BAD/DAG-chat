"""
Model service module
Provides unified model service interface and factory management
"""

from .model_factory import ModelFactory
from .base_service import BaseModelService

# 导入所有模型服务类，确保装饰器能正常注册
from .deepseek_service import DeepSeekService
from .qwen_service import QwenService
from .kimi_service import KimiService
from .glm_service import GLMService
from .ollama_service import OllamaService
from .minimax_service import MiniMaxService

# 导出主要接口
__all__ = [
    "ModelFactory",
    "BaseModelService",
    "DeepSeekService",
    "QwenService",
    "KimiService",
    "GLMService",
    "OllamaService",
    "MiniMaxService",
]
