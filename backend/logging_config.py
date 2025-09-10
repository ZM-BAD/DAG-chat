import logging
import logging.config
import os

# 获取当前文件的绝对路径
base_dir = os.path.dirname(os.path.abspath(__file__))

# 创建logs目录（如果不存在）
log_dir = os.path.join(base_dir, "logs")
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# 配置日志格式
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "level": "INFO"
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": os.path.join(log_dir, "app.log"),
            "formatter": "default",
            "level": "DEBUG"
        }
    },
    "root": {
        "handlers": ["console", "file"],
        "level": "INFO",
    }
}


def setup_logging():
    """设置日志配置"""
    logging.config.dictConfig(LOGGING_CONFIG)
