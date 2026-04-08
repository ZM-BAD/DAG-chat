import logging
from typing import List, Dict, AsyncGenerator

from openai import AsyncOpenAI, OpenAI
from openai.types.chat import ChatCompletionUserMessageParam

from backend.config import OLLAMA_API_BASE_URL, OLLAMA_MODEL
from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class OllamaService(BaseModelService):
    """
    Ollama本地模型服务实现

    通过Ollama的OpenAI兼容接口(/v1/chat/completions)与本地模型交互，
    无需API Key，支持用户在本地运行大模型。
    """

    def __init__(self, model_name: str = ""):
        # 从model_name中提取实际的Ollama模型名称
        # model_name格式: "ollama" 或 "ollama/qwen3:8b"
        if "/" in model_name:
            self.ollama_model = model_name.split("/", 1)[1]
        else:
            self.ollama_model = OLLAMA_MODEL

        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(api_key="ollama", base_url=OLLAMA_API_BASE_URL)
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key="ollama", base_url=OLLAMA_API_BASE_URL)
        logger.info("OllamaService initialized with model: %s", self.ollama_model)

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称
        """
        return "ollama"

    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用Ollama API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: Ollama本地模型暂不支持深度思考，此参数被忽略

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info("Sending request to Ollama API, model: %s", self.ollama_model)

            response = await self.async_client.chat.completions.create(
                model=self.ollama_model, messages=messages, stream=True
            )

            async for chunk in response:
                content_chunk = chunk.choices[0].delta.content or ""
                if content_chunk:
                    yield {"content": content_chunk, "reasoning": ""}

            logger.info("Ollama API call successful, model: %s", self.ollama_model)

        except Exception as e:
            error_msg = str(e)
            logger.error("Ollama API call failed: %s", error_msg)

            # 提供更友好的错误提示
            if "Connection" in error_msg or "connect" in error_msg.lower():
                yield {
                    "error": "Ollama服务未运行",
                    "details": "请确保已安装并启动Ollama (运行 `ollama serve`)",
                }
            else:
                yield {
                    "error": "Ollama模型服务暂不可用",
                    "details": error_msg,
                }

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题

        使用同一个Ollama模型生成标题
        """
        try:
            messages = [
                ChatCompletionUserMessageParam(
                    role="user",
                    content=f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}",
                )
            ]
            response = self.client.chat.completions.create(
                model=self.ollama_model,
                messages=messages,
                temperature=0.3,
                max_tokens=20,
            )

            title = response.choices[0].message.content.strip("。\n")
            if len(title) > 20:
                logger.warning(
                    "Ollama生成的标题超过20字被截断, 原始标题(%d字): %s",
                    len(title),
                    title,
                )
            else:
                logger.info("Ollama标题生成正常(%d字): %s", len(title), title)
            return title[:20]
        except Exception as e:
            logger.error("Title generation failed: %s", str(e))
            return full_response[:20]
