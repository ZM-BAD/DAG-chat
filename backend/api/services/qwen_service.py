import logging
from typing import List, Dict, AsyncGenerator

from backend.config import QWEN_API_KEY, QWEN_API_BASE_URL

from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class QwenService(BaseModelService):
    """
    Qwen模型服务实现
    """

    def __init__(self):
        # 初始化OpenAI客户端
        self.client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_API_BASE_URL)

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称
        """
        return "qwen"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用Qwen API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info(f"Sending request to Qwen API, deep_thinking: {deep_thinking}")

            # 根据deep_thinking参数选择模型
            if deep_thinking:
                model_name = "qwen-plus"  # 深度思考模型
                logger.info("使用深度思考模型: qwen-plus")
            else:
                model_name = "qwen3-max"  # 非深度思考模型
                logger.info("使用非深度思考模型: qwen3-max")

            # 构建请求参数
            request_params = {"model": model_name, "messages": messages, "stream": True}

            # 对于深度思考模型，添加thinking参数
            if deep_thinking:
                request_params["extra_body"] = {"enable_thinking": True}

            response = self.client.chat.completions.create(**request_params)

            for chunk in response:
                # 非思考模型没有reasoning_content字段，确保兼容性
                reasoning_chunk = ""
                content_chunk = ""

                if deep_thinking:
                    # 思考模型：处理reasoning_content和content
                    delta = chunk.choices[0].delta
                    reasoning_chunk = getattr(delta, "reasoning_content", "") or ""
                    content_chunk = delta.content or ""
                else:
                    # 非思考模型：只处理content，reasoning保持为空
                    content_chunk = chunk.choices[0].delta.content or ""

                yield {"content": content_chunk, "reasoning": reasoning_chunk}

            logger.info(f"Qwen API调用成功，模型: {model_name}")

        except Exception as e:
            logger.error(f"Qwen API调用失败: {str(e)}")
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题

        使用qwen3-max模型生成不超过20个字的简洁标题
        """
        try:
            messages = [
                ChatCompletionUserMessageParam(
                    role="user",
                    content=f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                )
            ]
            response = self.client.chat.completions.create(
                model="qwen3-max",
                messages=messages,
                temperature=0.3,
                max_tokens=20,
            )

            # 清理响应中的多余符号和空格
            content = response.choices[0].message.content
            if content:
                title = content.strip("。\n")
                return title[:20]
            else:
                return full_response[:20]
        except Exception as e:
            logger.error(f"标题生成失败: {str(e)}")
            return full_response[:20]
