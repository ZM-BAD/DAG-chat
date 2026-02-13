import logging
from typing import List, Dict, AsyncGenerator

from openai import OpenAI

from .base_service import BaseModelService
from .model_factory import ModelFactory

from config import GLM_API_KEY, GLM_API_BASE_URL

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class GLMService(BaseModelService):
    """
    GLM模型服务实现 - 使用 OpenAI SDK
    """

    def __init__(self):
        # 初始化OpenAI客户端，使用智谱AI的base_url
        self.client = OpenAI(
            api_key=GLM_API_KEY,
            base_url=GLM_API_BASE_URL
        )

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称
        """
        return "glm"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用GLM API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info(
                f"Sending request to GLM API with deep_thinking={deep_thinking}"
            )

            # 构建请求参数
            request_params = {
                "model": "glm-5",
                "messages": messages,
                "stream": True,
                "max_tokens": 65536,
                "temperature": 1.0,
            }

            # 添加thinking参数（使用extra_body）
            if deep_thinking:
                request_params["extra_body"] = {"thinking": {"type": "enabled"}}
            else:
                request_params["extra_body"] = {"thinking": {"type": "disabled"}}

            # 使用OpenAI SDK调用
            response = self.client.chat.completions.create(**request_params)

            # 处理流式响应
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta

                    # 处理思考内容（仅在思考模式下返回）
                    reasoning_content = ""
                    if deep_thinking and hasattr(delta, "reasoning_content") and delta.reasoning_content:
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

            logger.info("GLM API调用成功")

        except Exception as e:
            logger.error(f"GLM API调用失败: {str(e)}")
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题
        """
        try:
            logger.info("Generating title using GLM API")

            messages = [
                {
                    "role": "user",
                    "content": f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                }
            ]

            response = self.client.chat.completions.create(
                model="glm-5",
                messages=messages,
                max_tokens=20,
                extra_body={"thinking": {"type": "disabled"}}
            )

            if (
                hasattr(response, "choices")
                and response.choices
                and len(response.choices) > 0
            ):
                message = response.choices[0].message
                if hasattr(message, "content") and message.content:
                    title = message.content.strip("。\n")
                    return title[:20]

            # 如果API返回异常，使用默认方式生成标题
            return full_response[:20]
        except Exception as e:
            logger.error(f"标题生成失败: {str(e)}")
            return full_response[:20]
