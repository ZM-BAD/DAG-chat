"""
MiniMax模型服务实现
MiniMax M2系列模型强制开启思考（reasoning），无法关闭
使用 reasoning_split=True 将思考内容分离到 reasoning_details 字段
"""

import logging
from typing import List, Dict, AsyncGenerator

from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam

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

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=True,
                extra_body={"reasoning_split": True},
            )

            for chunk in response:
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

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题

        使用MiniMax接口生成不超过20个字的简洁标题
        注意：MiniMax强制开启推理，reasoning_split分离思考内容后提取正文
        max_tokens需要留足空间给推理+正文
        """
        try:
            messages = [
                ChatCompletionUserMessageParam(
                    role="user",
                    content=f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                )
            ]
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=0.3,
                max_tokens=200,
                extra_body={"reasoning_split": True},
            )

            content = response.choices[0].message.content
            if content:
                title = content.strip("。\n")
                if len(title) > 20:
                    logger.warning(
                        "MiniMax生成的标题超过20字被截断, 原始标题(%d字): %s",
                        len(title),
                        title,
                    )
                else:
                    logger.info("MiniMax标题生成正常(%d字): %s", len(title), title)
                return title[:20]
            return full_response[:20]
        except Exception as e:
            logger.error("Title generation failed: %s", str(e))
            return full_response[:20]
