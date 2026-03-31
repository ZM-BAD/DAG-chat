import logging
from typing import Dict, Type, Optional

from .base_service import BaseModelService

# 获取日志记录器
logger = logging.getLogger(__name__)


class ModelFactory:
    """
    模型服务工厂类，用于创建和管理不同的模型服务实例
    """

    # 存储模型服务类的注册表
    # key 为 service_name（如 "ollama", "deepseek"），由 get_service_name() 返回
    _registry: Dict[str, Type[BaseModelService]] = {}

    # 服务实例缓存
    # key 为 normalized_model（如 "ollama/qwen3:8b", "deepseek"），即完整模型名的小写形式
    # 注意：对于 Ollama 等多模型服务，每种模型名都有独立的缓存实例
    _instances: Dict[str, BaseModelService] = {}

    @classmethod
    def register(cls, service_class: Type[BaseModelService]) -> Type[BaseModelService]:
        """
        注册模型服务类

        参数:
            service_class: 模型服务类

        返回:
            注册的服务类
        """
        service_name = service_class.get_service_name()
        cls._registry[service_name] = service_class
        logger.info("注册模型服务: %s", service_name)
        return service_class

    @classmethod
    def get_service(cls, model_name: str) -> Optional[BaseModelService]:
        """
        根据模型名称获取服务实例

        缓存策略：
        - 使用 normalized_model（完整模型名小写）作为缓存 key
        - 通过 service_name in normalized_model 匹配注册表中的服务类
        - 支持可选的 model_name 构造参数（如 OllamaService 需要知道具体模型）

        参数:
            model_name: 模型名称

        返回:
            模型服务实例
        """
        # 模型名称标准化
        normalized_model = model_name.lower()

        # 检查服务实例缓存
        if normalized_model in cls._instances:
            return cls._instances[normalized_model]

        # 查找对应的服务类
        service_class = None
        for service_name, cls_type in cls._registry.items():
            if service_name in normalized_model:
                service_class = cls_type
                break

        if service_class:
            # 创建服务实例
            try:
                # 尝试传递model_name参数（支持Ollama等多模型服务）
                try:
                    instance = service_class(model_name=normalized_model)
                except TypeError:
                    instance = service_class()
                cls._instances[normalized_model] = instance
                logger.info("创建模型服务实例: %s", normalized_model)
                return instance
            except Exception as e:
                logger.error("创建模型服务实例失败: %s", e)
                return None

        logger.warning("未找到对应模型服务: %s", model_name)
        return None

    @classmethod
    def get_available_services(cls) -> Dict[str, Type[BaseModelService]]:
        """
        获取所有可用的模型服务

        返回:
            服务名称和服务类的映射
        """
        return cls._registry.copy()
