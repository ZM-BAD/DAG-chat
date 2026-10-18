import logging
from collections.abc import AsyncGenerator
from typing import ClassVar

from openai import APIError, AsyncOpenAI, OpenAI

from backend.api.utils import try_or
from backend.config import GLM_API_BASE_URL, GLM_API_KEY, GLM_MODEL

from .base_service import (
    BaseModelService,
    _build_title_prompt,
    truncate_fallback,
    truncate_title,
)
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class GLMService(BaseModelService):
    """
    GLM model service implementation - using OpenAI SDK
    """

    def __init__(self):
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(api_key=GLM_API_KEY, base_url=GLM_API_BASE_URL)
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(api_key=GLM_API_KEY, base_url=GLM_API_BASE_URL)

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name
        """
        return "glm"

    async def generate(
        self, messages: list[dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[dict[str, str], None]:
        """
        Call GLM API to generate streaming response

        Args:
            messages: List of message history
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            # 构建请求参数
            request_params = {
                "model": GLM_MODEL,
                "messages": messages,
                "stream": True,
                "max_tokens": 65536,
                "temperature": 1.0,
            }

            # GLM-5.3 always reasons and only accepts thinking.type=enabled.
            # Use low effort for the non-thinking UI mode and max for deep thinking.
            request_params["reasoning_effort"] = "max" if deep_thinking else "low"
            request_params["extra_body"] = {"thinking": {"type": "enabled"}}

            # 使用异步OpenAI SDK调用
            response = await self.async_client.chat.completions.create(**request_params)

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

        except APIError as e:
            logger.error("GLM API call failed: %s", str(e))
            yield {"error": "Model service temporarily unavailable", "details": str(e)}

    # GLM-5.3 cannot disable thinking. Generate titles with streaming so
    # reasoning_content does not consume the title token budget.
    _title_disable_thinking = False
    _title_extra_params: ClassVar[dict] = {"thinking": {"type": "enabled"}}
    _title_max_tokens: int = 200
    _title_temperature: ClassVar[float | None] = None

    def _get_title_model(self) -> str:
        return GLM_MODEL

    def generate_title(self, user_input: str, full_response: str) -> str:
        """Generate a title while keeping forced GLM-5.3 reasoning separate."""
        lang, _language_name, messages = _build_title_prompt(user_input, full_response)

        def _generate():
            with self.client.chat.completions.create(
                model=self._get_title_model(),
                messages=messages,
                max_tokens=self._title_max_tokens,
                stream=True,
                reasoning_effort="low",
                extra_body={"thinking": {"type": "enabled"}},
            ) as stream:
                content_parts = []
                for chunk in stream:
                    if not chunk.choices:
                        continue
                    content = chunk.choices[0].delta.content or ""
                    if content:
                        content_parts.append(content)

            if content_parts:
                title = truncate_title("".join(content_parts), lang)
                if title:
                    return title

            logger.warning(
                "glm title generation returned empty content, using fallback"
            )
            return None

        result = try_or(_generate, None, "glm_title")
        if result:
            return result
        return truncate_fallback(user_input)
