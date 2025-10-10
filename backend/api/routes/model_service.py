import logging

from fastapi import APIRouter

# 获取日志记录器
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get('/models')
def get_models():
    pass
