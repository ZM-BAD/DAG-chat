import logging.config

import uvicorn

from logging_config import LOGGING_CONFIG

# 配置日志
logging.config.dictConfig(LOGGING_CONFIG)

# 获取日志记录器
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting UniformLLM API server")
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
