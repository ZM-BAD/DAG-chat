import logging
from collections.abc import AsyncGenerator
from typing import Any, ClassVar, cast

from openai import APIError, AsyncOpenAI, OpenAI

from backend.config import (
    KIMI_API_BASE_URL,
    KIMI_API_KEY,
    KIMI_MODEL,
    KIMI_TITLE_MODEL,
)

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class KimiService(BaseModelService):
    """
    Kimi model service implementation - using OpenAI SDK
    """

    def __init__(self):
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(
            api_key=KIMI_API_KEY, base_url=KIMI_API_BASE_URL
        )
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key=KIMI_API_KEY, base_url=KIMI_API_BASE_URL)

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name
        """
        return "kimi"

    async def generate(
        self, messages: list[dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[dict[str, str]]:
        """
        Call Kimi API to generate streaming response

        Args:
            messages: List of message history
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            # Kimi K-series uses one model with thinking toggled by a parameter.
            model_name = KIMI_MODEL

            # Make the provider's thinking toggle explicit in both modes.
            thinking_type = "enabled" if deep_thinking else "disabled"
            extra_body = {"thinking": {"type": thinking_type}}

            # 使用异步OpenAI SDK调用
            response = await self.async_client.chat.completions.create(
                model=model_name,
                messages=cast(Any, messages),
                stream=True,
                extra_body=extra_body,
            )

            # 处理流式响应
            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta

                    # 处理思考内容（仅在思考模式下返回）
                    reasoning_content = ""
                    if (
                        deep_thinking
                        and hasattr(delta, "reasoning_content")
                        and delta.reasoning_content
                    ):
                        reasoning_content = delta.reasoning_content
                        yield {"content": "", "reasoning": reasoning_content}
                        continue

                    # 处理常规内容
                    content = ""
                    if hasattr(delta, "content") and delta.content:
                        content = delta.content
                        yield {
                            "content": content,
                            "reasoning": "",
                        }

        except APIError as e:
            logger.error("Kimi API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # The unified Kimi model supports title generation with thinking disabled.
    # Kimi rejects the base class temperature, so omit it for title requests.
    _title_extra_params: ClassVar[dict] = {"thinking": {"type": "disabled"}}
    _title_temperature: ClassVar[float | None] = None

    def _get_title_model(self) -> str:
        return KIMI_TITLE_MODEL
