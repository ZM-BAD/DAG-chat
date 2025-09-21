import logging
from datetime import datetime

from fastapi import APIRouter

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/hello")
def read_hello():
    logger.info("Hello endpoint accessed")
    return {"message": "Hello World from UniformLLM!"}


@router.get("/info")
def get_info():
    logger.info("Info endpoint accessed")
    return {
        "app": "UniformLLM",
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
        "service": "UniformLLM"
    }
