import logging.config

from fastapi import FastAPI

from backend.api.routes import router as api_router
from backend.logging_config import LOGGING_CONFIG

# 配置日志
logging.config.dictConfig(LOGGING_CONFIG)

description = """
UniformLLM API 为您的应用提供统一的大型语言模型接口。
"""

app = FastAPI(
    title="UniformLLM API",
    description=description,
    version="1.0.0"
)

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.info("Starting UniformLLM API")

# 包含API路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"message": "Welcome to UniformLLM API!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
