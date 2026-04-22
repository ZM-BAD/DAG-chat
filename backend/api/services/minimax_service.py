"""
MiniMax model service implementation
MiniMax M2 series models force-enable thinking (reasoning) and it cannot be disabled
Uses reasoning_split=True to separate thinking content into reasoning_details field
"""

import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import MINIMAX_API_KEY, MINIMAX_API_BASE_URL, MINIMAX_MODEL
from .base_service import BaseModelService
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
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
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

        except Exception as e:
            logger.error("MiniMax API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # MiniMax 强制开启推理，max_tokens 需留足空间给推理+正文
    _title_max_tokens = 200
    _title_extra_params = {"reasoning_split": True}

    def _get_title_model(self) -> str:
        return self.model_name
