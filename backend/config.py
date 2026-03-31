"""
Configuration file for DAG Chat project.
Non-secret configurations are defined here.
Secret values (API keys, passwords) are read from environment variables.

Copy .env.example to .env and fill in your values.
"""

import os
from pathlib import Path

# Load .env file if exists
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

# Database Configuration
MONGODB_CONFIG = {
    "uri": "mongodb://localhost:27017",
    "database": "dag_chat",
    "username": None,
    "password": None,
    "host": "localhost",
    "port": 27017,
}

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "dag_chat"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
}

# LLM API Base URLs
GLM_API_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/"
KIMI_API_BASE_URL = "https://api.moonshot.cn/v1"
QWEN_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEEPSEEK_API_BASE_URL = "https://api.deepseek.com/v1"
MINIMAX_API_BASE_URL = "https://api.minimaxi.com/v1"
OLLAMA_API_BASE_URL = os.getenv("OLLAMA_API_BASE_URL", "http://localhost:11434/v1")

# LLM API Keys (read from environment variables, configure in .env)
GLM_API_KEY = os.getenv("GLM_API_KEY", "")
KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")

# LLM Model Names (configurable via environment variables)
GLM_MODEL = os.getenv("GLM_MODEL", "glm-5")
KIMI_MODEL_THINKING = os.getenv("KIMI_MODEL_THINKING", "kimi-k2-thinking-turbo")
KIMI_MODEL = os.getenv("KIMI_MODEL", "kimi-k2-turbo-preview")
KIMI_TITLE_MODEL = os.getenv("KIMI_TITLE_MODEL", "moonshot-v1-8k")
QWEN_MODEL_THINKING = os.getenv("QWEN_MODEL_THINKING", "qwen-plus")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3-max")
DEEPSEEK_MODEL_THINKING = os.getenv("DEEPSEEK_MODEL_THINKING", "deepseek-reasoner")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMax-M2.7-highspeed")

# Ollama Configuration (local LLM, no API key needed)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
