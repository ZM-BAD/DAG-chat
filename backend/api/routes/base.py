import logging
from datetime import datetime

from fastapi import APIRouter

# 导入模型工厂以获取可用模型列表
from backend.api.services.model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/hello")
def read_hello():
    logger.info("Hello endpoint accessed")
    return {"message": "Hello World from DAG-chat!"}


@router.get("/info")
def get_info():
    logger.info("Info endpoint accessed")
    return {
        "app": "DAG-chat",
        "version": "1.0.0",
        "framework": "FastAPI"
    }


@router.get("/health")
def health_check():
    """健康检查接口"""
    logger.info("Health check endpoint accessed")
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "DAG-chat"
    }


@router.get("/models")
def get_available_models():
    """获取所有可用的模型列表

    返回当前系统支持的所有大语言模型，以便前端动态加载模型选择列表。
    """
    logger.info("Models endpoint accessed")
    
    # 使用ModelFactory获取所有已注册的服务
    available_models = ModelFactory.get_available_services()
    
    # 构建模型信息列表，包含模型名称和显示名称
    models_info = []
    for model_name in available_models:
        # 根据模型名称提供友好显示名称
        display_name_map = {
            "deepseek": "DeepSeek",
            "qwen": "Qwen",
            "kimi": "Kimi",
            "glm": "GLM"
        }
        
        display_name = display_name_map.get(model_name.lower(), model_name)
        models_info.append({
            "name": model_name,
            "display_name": display_name
        })
    
    return {
        "models": models_info,
        "count": len(models_info)
    }
