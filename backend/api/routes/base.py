import json
import logging
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError

from fastapi import APIRouter

# 导入模型工厂以获取可用模型列表
from backend.api.services.model_factory import ModelFactory
from backend.config import OLLAMA_API_BASE_URL

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
    return {"app": "DAG-chat", "version": "1.0.0", "framework": "FastAPI"}


@router.get("/health")
def health_check():
    """健康检查接口"""
    logger.info("Health check endpoint accessed")
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "DAG-chat",
    }


@router.get("/models")
def get_available_models():
    """获取所有可用的模型列表

    返回当前系统支持的所有大语言模型，以便前端动态加载模型选择列表。
    对于Ollama，会动态检测本地可用的模型。
    """
    logger.info("Models endpoint accessed")

    # 使用ModelFactory获取所有已注册的服务
    available_models = ModelFactory.get_available_services()

    # 构建模型信息列表，包含模型名称和显示名称
    # Ollama模型始终排在最后
    models_info = []
    ollama_models = []
    for model_name in available_models:
        if model_name == "ollama":
            # Ollama模型需要动态获取本地已安装的模型列表，稍后追加到末尾
            ollama_models = _fetch_ollama_models()
        else:
            # 根据模型名称提供友好显示名称
            display_name_map = {
                "deepseek": "DeepSeek",
                "qwen": "Qwen",
                "kimi": "Kimi",
                "glm": "GLM",
                "minimax": "MiniMax",
            }

            display_name = display_name_map.get(model_name.lower(), model_name)
            models_info.append({"name": model_name, "display_name": display_name})

    # Ollama模型追加到列表末尾
    models_info.extend(ollama_models)

    return {"models": models_info, "count": len(models_info)}


def _fetch_ollama_models() -> list:
    """从本地Ollama服务获取可用模型列表

    Returns:
        模型信息列表，每个元素包含name和display_name
    """
    models = []
    try:
        # Ollama API地址（去掉末尾的/v1得到基础地址）
        ollama_base = OLLAMA_API_BASE_URL.removesuffix("/v1")
        tags_url = f"{ollama_base}/api/tags"

        response = urlopen(tags_url, timeout=3)
        data = json.loads(response.read())

        for model in data.get("models", []):
            model_name = model.get("name", "")
            if model_name:
                # 移除 :latest 后缀用于显示
                display_name = model_name.replace(":latest", "")
                models.append(
                    {
                        "name": f"ollama/{model_name}",
                        "display_name": f"Ollama - {display_name}",
                    }
                )

        if models:
            logger.info(
                "Detected %d Ollama models: %s",
                len(models),
                [m["name"] for m in models],
            )
        else:
            logger.info("Ollama is running but no models found")

    except URLError:
        logger.info("Ollama service not detected, skipping Ollama models")
    except Exception as e:
        logger.warning("Failed to fetch Ollama models: %s", str(e))

    return models
