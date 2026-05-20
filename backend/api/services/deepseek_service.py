import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_API_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_THINKING_EFFORT,
)

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class DeepSeekService(BaseModelService):
    """
    DeepSeek V4 model service implementation
    """

    def __init__(self):
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(
            api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_API_BASE_URL
        )
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_API_BASE_URL)

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name
        """
        return "deepseek"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        Call DeepSeek V4 API to generate streaming response

        V4 uses a single model with thinking mode controlled via parameter,
        not by switching model names.

        Args:
            messages: List of message history
            deep_thinking: Whether to enable thinking mode

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            # V4: thinking mode controlled via parameter, not model name
            # Only "thinking" belongs in extra_body; reasoning_effort is top-level
            if deep_thinking:
                extra_body = {"thinking": {"type": "enabled"}}
                kwargs = {
                    "model": DEEPSEEK_MODEL,
                    "messages": messages,
                    "stream": True,
                    "reasoning_effort": DEEPSEEK_THINKING_EFFORT,
                    "extra_body": extra_body,
                }
            else:
                extra_body = {"thinking": {"type": "disabled"}}
                kwargs = {
                    "model": DEEPSEEK_MODEL,
                    "messages": messages,
                    "stream": True,
                    "extra_body": extra_body,
                }

            response = await self.async_client.chat.completions.create(**kwargs)

            async for chunk in response:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                reasoning_chunk = ""
                content_chunk = ""

                if (
                    deep_thinking
                    and hasattr(delta, "reasoning_content")
                    and delta.reasoning_content
                ):
                    reasoning_chunk = delta.reasoning_content
                content_chunk = getattr(delta, "content", "") or ""

                yield {"content": content_chunk, "reasoning": reasoning_chunk}

        except Exception as e:
            logger.error("DeepSeek API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # Title generation must explicitly disable thinking (V4 defaults to enabled)
    _title_extra_params = {"thinking": {"type": "disabled"}}

    def _get_title_model(self) -> str:
        return DEEPSEEK_MODEL
