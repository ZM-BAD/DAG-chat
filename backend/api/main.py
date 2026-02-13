import logging.config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.router import router as api_router
from backend.logging_config import LOGGING_CONFIG

# 配置日志
logging.config.dictConfig(LOGGING_CONFIG)

description = """
DAG-chat API 为您的应用提供统一的大型语言模型接口。
"""

app = FastAPI(
    title="DAG-chat API",
    description=description,
    version="1.0.0"
)

# 添加CORS中间件以允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 允许前端应用的源
    allow_credentials=True,  # 允许携带凭证（如cookie）
    allow_methods=["*"],  # 允许所有HTTP方法
    allow_headers=["*"],  # 允许所有HTTP头
    expose_headers=["*"],  # 暴露所有头给客户端
)

# 获取日志记录器
logger = logging.getLogger(__name__)
logger.info("Starting DAG-chat API")

# 包含API路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"message": "Welcome to DAG-chat API!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
