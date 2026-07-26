import logging
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import OLLAMA_API_BASE_URL, OLLAMA_MODEL

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class OllamaService(BaseModelService):
    """
    Ollama local model service implementation

    Interacts with local models through Ollama's OpenAI-compatible interface
    (/v1/chat/completions), no API Key required, supports running large models locally.
    """

    def __init__(self, model_name: str = ""):
        # 从model_name中提取实际的Ollama模型名称
        # model_name格式: "ollama" 或 "ollama/qwen3:8b"
        if "/" in model_name:
            self.ollama_model = model_name.split("/", 1)[1]
        else:
            self.ollama_model = OLLAMA_MODEL

        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(api_key="ollama", base_url=OLLAMA_API_BASE_URL)
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key="ollama", base_url=OLLAMA_API_BASE_URL)

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name
        """
        return "ollama"

    async def generate(
        self, messages: list[dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[dict[str, str], None]:
        """
        Call Ollama API to generate streaming response

        Args:
            messages: List of message history
            deep_thinking: Ollama local models do not support deep thinking yet, this parameter is ignored

        Returns:
            Async generator containing content and reasoning fields
        """
        response = await self.async_client.chat.completions.create(
            model=self.ollama_model, messages=messages, stream=True
        )

        async for chunk in response:
            content_chunk = chunk.choices[0].delta.content or ""
            if content_chunk:
                yield {"content": content_chunk, "reasoning": ""}

    def _get_title_model(self) -> str:
        return self.ollama_model
