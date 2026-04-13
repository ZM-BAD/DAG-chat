"""
MiniMax模型服务实现
MiniMax M2系列模型强制开启思考（reasoning），无法关闭
使用 reasoning_split=True 将思考内容分离到 reasoning_details 字段
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
    MiniMax模型服务实现
    MiniMax M2系列强制开启推理，所有请求都会返回思考过程
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
        调用MiniMax API生成流式响应

        MiniMax M2系列模型强制开启推理，使用 reasoning_split=True
        将思考内容分离到 reasoning_details 字段，避免混入正文

        参数:
            messages: 消息历史列表
            deep_thinking: MiniMax忽略此参数，始终启用推理

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info("Sending request to MiniMax API (reasoning always enabled)")

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

            logger.info("MiniMax API call successful")

        except Exception as e:
            logger.error("MiniMax API call failed: %s", str(e))
            yield {"error": "模型服务暂不可用", "details": str(e)}

    # MiniMax 强制开启推理，max_tokens 需留足空间给推理+正文
    _title_max_tokens = 200
    _title_extra_params = {"reasoning_split": True}

    def _get_title_model(self) -> str:
        return self.model_name
