import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import (
    KIMI_API_KEY,
    KIMI_API_BASE_URL,
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
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        Call Kimi API to generate streaming response

        Args:
            messages: List of message history
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            # kimi-k2.6 统一使用同一模型，通过 thinking 参数切换思考模式
            model_name = KIMI_MODEL

            # 非思考模式需要显式禁用 thinking（kimi-k2.6 默认启用）
            extra_body = None
            if not deep_thinking:
                extra_body = {"thinking": {"type": "disabled"}}

            # 使用异步OpenAI SDK调用
            response = await self.async_client.chat.completions.create(
                model=model_name,
                messages=messages,
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

        except Exception as e:
            logger.error("Kimi API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # KIMI_TITLE_MODEL should be configured as a non-reasoning model (e.g. moonshot-v1-8k).
    # Verify via KIMI_TITLE_MODEL env var if title generation seems slow or wasteful.
    _title_extra_params = None

    def _get_title_model(self) -> str:
        return KIMI_TITLE_MODEL
