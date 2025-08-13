import logging

from fastapi import APIRouter

from models.requests import ChatRequest

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


@router.post("/chat")
def chat(request: ChatRequest):
    logger.info(f"Chat endpoint accessed with user_id: {request.user_id}")

    return {
        "app": "UniformLLM",
        "version": "1.0.0",
        "framework": "FastAPI"
    }
