import logging.config

import uvicorn

from logging_config import setup_logging

# 配置日志
setup_logging()

# 获取日志记录器
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting UniformLLM API server")
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
