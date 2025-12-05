import asyncio
import logging
import json
import requests
from typing import List, Dict, Any, AsyncGenerator

from .base_service import BaseModelService
from .model_factory import ModelFactory

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from config import KIMI_API_KEY, KIMI_API_BASE_URL

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class KimiService(BaseModelService):
    """
    Kimi模型服务实现
    """

    def __init__(self):
        self.api_key = KIMI_API_KEY
        self.base_url = KIMI_API_BASE_URL

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
            logger.info(f"Sending request to Kimi API, deep_thinking: {deep_thinking}")
            logger.debug(f"API Base URL: {self.base_url}")
            logger.debug(f"Messages count: {len(messages)}")

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            }

            # 根据deep_thinking参数选择不同的模型
            if deep_thinking:
                model = "kimi-k2-thinking-turbo"  # 思考模型
                logger.info("使用思考模型: kimi-k2-thinking-turbo")
            else:
                model = "kimi-k2-turbo-preview"  # 非思考模型
                logger.info("使用非思考模型: kimi-k2-turbo-preview")

            data = {"model": model, "messages": messages, "stream": True}

            logger.debug(f"Request data: {json.dumps(data, ensure_ascii=False)}")

            # 使用requests库发起请求，并设置stream=True
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: requests.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=headers,
                    json=data,
                    stream=True,
                    timeout=30,  # 添加超时设置
                ),
            )

            # 检查响应状态码
            if response.status_code != 200:
                logger.error(f"Kimi API返回错误状态码: {response.status_code}")
                logger.error(f"响应内容: {response.text}")
                yield {
                    "error": f"API请求失败，状态码: {response.status_code}",
                    "details": response.text,
                }
                return

            # 处理流式响应
            for chunk in response.iter_lines():
                if chunk:
                    # 去除data:前缀和可能的换行符
                    chunk_str = chunk.decode("utf-8").strip()

                    # 跳过空行
                    if not chunk_str:
                        continue

                    # 处理SSE格式
                    if chunk_str.startswith("data: "):
                        chunk_str = chunk_str[6:]
                    elif chunk_str.startswith("data:"):
                        chunk_str = chunk_str[5:]

                    # 检查是否是结束标记
                    if chunk_str == "[DONE]":
                        break

                    # 跳过空数据
                    if not chunk_str:
                        continue

                    try:
                        chunk_data = json.loads(chunk_str)
                        # 提取内容和推理
                        content = ""
                        reasoning = ""

                        if (
                            chunk_data.get("choices")
                            and len(chunk_data["choices"]) > 0
                            and chunk_data["choices"][0].get("delta")
                        ):
                            delta = chunk_data["choices"][0]["delta"]
                            content = delta.get("content", "")
                            reasoning = delta.get("reasoning_content", "")

                        # 只有当content或reasoning不为空时才yield
                        if content or reasoning:
                            yield {"content": content, "reasoning": reasoning}
                    except json.JSONDecodeError as e:
                        logger.warning(
                            f"Failed to parse chunk: {chunk_str}, error: {e}"
                        )

            logger.info("Kimi API调用成功")

        except Exception as e:
            logger.error(f"Kimi API调用失败: {str(e)}")
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题
        使用moonshot-v1-8k模型专门用于生成标题
        """
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            }

            messages = [
                {
                    "role": "user",
                    "content": f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                }
            ]

            # 使用专门的标题生成模型
            data = {
                "model": "moonshot-v1-8k",
                "messages": messages,
                "max_tokens": 20,
                "temperature": 0.3,
            }

            response = requests.post(
                f"{self.base_url}/v1/chat/completions", headers=headers, json=data
            )

            response_data = response.json()
            if response_data.get("choices") and response_data["choices"][0].get(
                "message"
            ):
                title = (
                    response_data["choices"][0]["message"]
                    .get("content", "")
                    .strip("。\n")
                )
                return title[:20]

            # 如果API返回异常，使用默认方式生成标题
            return full_response[:20]
        except Exception as e:
            logger.error(f"标题生成失败: {str(e)}")
            return full_response[:20]
