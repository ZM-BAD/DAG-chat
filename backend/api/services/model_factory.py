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
    _registry: Dict[str, Type[BaseModelService]] = {}
    
    # 服务实例缓存
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
        logger.info(f"注册模型服务: {service_name}")
        return service_class
    
    @classmethod
    def get_service(cls, model_name: str) -> Optional[BaseModelService]:
        """
        根据模型名称获取服务实例
        
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
                instance = service_class()
                cls._instances[normalized_model] = instance
                logger.info(f"创建模型服务实例: {normalized_model}")
                return instance
            except Exception as e:
                logger.error(f"创建模型服务实例失败: {e}")
                return None
        
        logger.warning(f"未找到对应模型服务: {model_name}")
        return None
    
    @classmethod
    def get_available_services(cls) -> Dict[str, Type[BaseModelService]]:
        """
        获取所有可用的模型服务
        
        返回:
            服务名称和服务类的映射
        """
        return cls._registry.copy()
