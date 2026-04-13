import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_API_BASE_URL,
    DEEPSEEK_MODEL_THINKING,
    DEEPSEEK_MODEL,
)

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class DeepSeekService(BaseModelService):
    """
    DeepSeek模型服务实现
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
        获取服务名称
        """
        return "deepseek"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用DeepSeek API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info(
                "Sending request to DeepSeek API, deep_thinking: %s", deep_thinking
            )

            # 根据deep_thinking参数选择模型
            model_name = DEEPSEEK_MODEL_THINKING if deep_thinking else DEEPSEEK_MODEL

            response = await self.async_client.chat.completions.create(
                model=model_name, messages=messages, stream=True
            )

            async for chunk in response:
                # 非思考模型没有reasoning_content字段，确保兼容性
                reasoning_chunk = ""
                content_chunk = ""

                if deep_thinking:
                    # 思考模型：处理reasoning_content和content
                    reasoning_chunk = chunk.choices[0].delta.reasoning_content or ""
                    content_chunk = chunk.choices[0].delta.content or ""
                else:
                    # 非思考模型：只处理content，reasoning保持为空
                    content_chunk = chunk.choices[0].delta.content or ""

                yield {"content": content_chunk, "reasoning": reasoning_chunk}

            logger.info("DeepSeek API call successful, model: %s", model_name)

        except Exception as e:
            logger.error("DeepSeek API call failed: %s", str(e))
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def _get_title_model(self) -> str:
        return DEEPSEEK_MODEL
