import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import (
    KIMI_API_KEY,
    KIMI_API_BASE_URL,
    KIMI_MODEL_THINKING,
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
    Kimi模型服务实现 - 使用 OpenAI SDK
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
        获取服务名称
        """
        return "kimi"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用Kimi API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info("Sending request to Kimi API, deep_thinking: %s", deep_thinking)

            # 根据deep_thinking参数选择不同的模型
            if deep_thinking:
                model_name = KIMI_MODEL_THINKING
                logger.info("使用思考模型: %s", KIMI_MODEL_THINKING)
            else:
                model_name = KIMI_MODEL
                logger.info("使用非思考模型: %s", KIMI_MODEL)

            # 使用异步OpenAI SDK调用
            response = await self.async_client.chat.completions.create(
                model=model_name, messages=messages, stream=True
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

            logger.info("Kimi API call successful")

        except Exception as e:
            logger.error("Kimi API call failed: %s", str(e))
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题
        使用KIMI_TITLE_MODEL模型专门用于生成标题
        """
        try:
            messages = [
                {
                    "role": "user",
                    "content": f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                }
            ]

            response = self.client.chat.completions.create(
                model=KIMI_TITLE_MODEL,
                messages=messages,
                temperature=0.3,
                max_tokens=20,
            )

            if (
                hasattr(response, "choices")
                and response.choices
                and len(response.choices) > 0
            ):
                message = response.choices[0].message
                if hasattr(message, "content") and message.content:
                    title = message.content.strip("。\n")
                    if len(title) > 20:
                        logger.warning(
                            "Kimi生成的标题超过20字被截断, 原始标题(%d字): %s",
                            len(title),
                            title,
                        )
                    else:
                        logger.info("Kimi标题生成正常(%d字): %s", len(title), title)
                    return title[:20]

            # 如果API返回异常，使用默认方式生成标题
            return full_response[:20]
        except Exception as e:
            logger.error("Title generation failed: %s", str(e))
            return full_response[:20]
