import logging
from typing import ClassVar

from backend.api.utils import try_or

from .base_service import BaseModelService

# 获取日志记录器
logger = logging.getLogger(__name__)


class ModelFactory:
    """
    Model service factory class, used to create and manage different model service instances
    """

    # 存储模型服务类的注册表
    # key 为 service_name（如 "ollama", "deepseek"），由 get_service_name() 返回
    _registry: ClassVar[dict[str, type[BaseModelService]]] = {}

    # 服务实例缓存
    # key 为 normalized_model（如 "ollama/qwen3:8b", "deepseek"），即完整模型名的小写形式
    # 注意：对于 Ollama 等多模型服务，每种模型名都有独立的缓存实例
    _instances: ClassVar[dict[str, BaseModelService]] = {}

    @classmethod
    def register(cls, service_class: type[BaseModelService]) -> type[BaseModelService]:
        """
        Register a model service class

        Args:
            service_class: Model service class

        Returns:
            The registered service class
        """
        service_name = service_class.get_service_name()
        cls._registry[service_name] = service_class
        return service_class

    @classmethod
    def get_service(cls, model_name: str) -> BaseModelService | None:
        """
        Get service instance by model name

        Caching strategy:
        - Uses normalized_model (full model name lowercased) as cache key
        - Matches service class in registry via service_name in normalized_model
        - Supports optional model_name constructor parameter (e.g., OllamaService needs to know the specific model)

        Args:
            model_name: Model name

        Returns:
            Model service instance
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
            def _create():
                # 尝试传递model_name参数（支持Ollama等多模型服务）
                try:
                    instance = service_class(model_name=normalized_model)
                except TypeError:
                    instance = service_class()
                cls._instances[normalized_model] = instance
                return instance

            instance = try_or(_create, None, f"create_service_{service_name}")
            if instance:
                return instance
            return None

        logger.warning("No matching model service found: %s", model_name)
        return None

    @classmethod
    def get_available_services(cls) -> dict[str, type[BaseModelService]]:
        """
        Get all available model services

        Returns:
            Mapping of service names to service classes
        """
        return cls._registry.copy()
