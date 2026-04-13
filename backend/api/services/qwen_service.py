import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from backend.config import (
    QWEN_API_KEY,
    QWEN_API_BASE_URL,
    QWEN_MODEL_THINKING,
    QWEN_MODEL,
)

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
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(
            api_key=QWEN_API_KEY, base_url=QWEN_API_BASE_URL
        )
        # 同步客户端用于 generate_title 等独立同步操作
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
            logger.info("Sending request to Qwen API, deep_thinking: %s", deep_thinking)

            # 根据deep_thinking参数选择模型
            if deep_thinking:
                model_name = QWEN_MODEL_THINKING
                logger.info("使用深度思考模型: %s", QWEN_MODEL_THINKING)
            else:
                model_name = QWEN_MODEL
                logger.info("使用非深度思考模型: %s", QWEN_MODEL)

            # 构建请求参数
            request_params = {"model": model_name, "messages": messages, "stream": True}

            # 对于深度思考模型，添加thinking参数
            if deep_thinking:
                request_params["extra_body"] = {"enable_thinking": True}

            response = await self.async_client.chat.completions.create(**request_params)

            async for chunk in response:
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

            logger.info("Qwen API call successful, model: %s", model_name)

        except Exception as e:
            logger.error("Qwen API call failed: %s", str(e))
            yield {"error": "模型服务暂不可用", "details": str(e)}

    def _get_title_model(self) -> str:
        return QWEN_MODEL
