"""
Model service module
Provides unified model service interface and factory management
"""

from .base_service import BaseModelService

# 导入所有模型服务类，确保装饰器能正常注册
from .deepseek_service import DeepSeekService
from .glm_service import GLMService
from .kimi_service import KimiService
from .minimax_service import MiniMaxService
from .model_factory import ModelFactory
from .ollama_service import OllamaService
from .orcarouter_service import OrcaRouterService
from .qwen_service import QwenService

# 导出主要接口
__all__ = [
    "BaseModelService",
    "DeepSeekService",
    "GLMService",
    "KimiService",
    "MiniMaxService",
    "ModelFactory",
    "OllamaService",
    "OrcaRouterService",
    "QwenService",
]
