"""
MiniMax model service implementation
MiniMax M2 series models force-enable thinking (reasoning) and it cannot be disabled
Uses reasoning_split=True to separate thinking content into reasoning_details field
"""

import logging
from collections.abc import AsyncGenerator

from openai import APIError, AsyncOpenAI, OpenAI

from backend.api.utils import try_or
from backend.config import MINIMAX_API_BASE_URL, MINIMAX_API_KEY, MINIMAX_MODEL

from .base_service import (
    BaseModelService,
    _build_title_prompt,
    truncate_fallback,
    truncate_title,
)
from .model_factory import ModelFactory

logger = logging.getLogger(__name__)


@ModelFactory.register
class MiniMaxService(BaseModelService):
    """
    MiniMax model service implementation
    MiniMax M2 series forces reasoning on, all requests return thinking process
    """

    def __init__(self):
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(
            api_key=MINIMAX_API_KEY, base_url=MINIMAX_API_BASE_URL
        )
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key=MINIMAX_API_KEY, base_url=MINIMAX_API_BASE_URL)
        self.model_name = MINIMAX_MODEL

    @classmethod
    def get_service_name(cls) -> str:
        return "minimax"

    async def generate(
        self, messages: list[dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[dict[str, str], None]:
        """
        Call MiniMax API to generate streaming response

        MiniMax M2 series models force-enable reasoning, uses reasoning_split=True
        to separate thinking content into reasoning_details field, avoiding mixing into body

        Args:
            messages: List of message history
            deep_thinking: MiniMax ignores this parameter, reasoning is always enabled

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=True,
                extra_body={"reasoning_split": True},
            )

            async for chunk in response:
                reasoning_chunk = ""
                content_chunk = ""

                delta = chunk.choices[0].delta

                # 提取思考内容: reasoning_details 是 [{"text": "..."}] 格式
                reasoning_details = getattr(delta, "reasoning_details", None)
                if reasoning_details:
                    for detail in reasoning_details:
                        text = detail.get("text", "")
                        if text:
                            reasoning_chunk += text

                # 提取正文内容
                content_chunk = delta.content or ""

                yield {"content": content_chunk, "reasoning": reasoning_chunk}

        except APIError as e:
            logger.error("MiniMax API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # MiniMax M2 forces reasoning on all requests — cannot be disabled.
    _title_disable_thinking = (
        False  # Cannot disable; use streaming to separate reasoning
    )

    def _get_title_model(self) -> str:
        return self.model_name

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        Override: MiniMax M2 forces reasoning, and reasoning_split only works in streaming mode.
        The non-streaming base class method returns empty content because reasoning consumes
        the token budget. Use streaming to properly separate reasoning from title content.
        """
        lang, _language_name, messages = _build_title_prompt(user_input, full_response)

        def _generate():
            # Use streaming to leverage reasoning_split for content/reasoning separation.
            # `with` ensures the HTTP connection is released after iteration.
            with self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=0.3,
                max_tokens=200,
                stream=True,
                extra_body={"reasoning_split": True},
            ) as stream:
                content_parts = []
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    content = delta.content or ""
                    if content:
                        content_parts.append(content)

            if content_parts:
                title = truncate_title("".join(content_parts), lang)
                if title:
                    return title

            logger.warning(
                "minimax title generation returned empty content, using fallback"
            )
            return None

        result = try_or(_generate, None, "minimax_title")
        if result:
            return result
        return truncate_fallback(user_input)
