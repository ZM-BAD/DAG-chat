import logging
from typing import List, Dict, AsyncGenerator

from config import DEEPSEEK_API_KEY, DEEPSEEK_API_BASE_URL
from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam

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
        # 初始化OpenAI客户端
        self.client = OpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url=DEEPSEEK_API_BASE_URL
        )

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称
        """
        return "deepseek"

    async def generate(self, messages: List[Dict[str, str]]) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用DeepSeek API生成流式响应

        参数:
            messages: 消息历史列表

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info("Sending request to DeepSeek API")

            # 直接调用同步API
            response = self.client.chat.completions.create(
                model="deepseek-reasoner",
                messages=messages,
                stream=True
            )

            for chunk in response:
                reasoning_chunk = chunk.choices[0].delta.reasoning_content or ""
                content_chunk = chunk.choices[0].delta.content or ""
                yield {
                    "content": content_chunk,
                    "reasoning": reasoning_chunk
                }

            logger.info("DeepSeek API调用成功")

        except Exception as e:
            logger.error(f"DeepSeek API调用失败: {str(e)}")
            yield {
                "error": "模型服务暂不可用",
                "details": str(e)
            }

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题

        使用DeepSeek V3接口生成不超过20个字的简洁标题
        """
        try:
            messages = [
                ChatCompletionUserMessageParam(
                    role="user",
                    content=f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}"
                )
            ]
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                temperature=0.3,
                max_tokens=20,
            )

            # 清理响应中的多余符号和空格
            title = response.choices[0].message.content.strip("。\n")
            return title[:20]
        except Exception as e:
            logger.error(f"标题生成失败: {str(e)}")
            return full_response[:20]
