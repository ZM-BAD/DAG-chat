"""OrcaRouter model service (optional OpenAI-compatible LLM gateway)."""

import logging
from collections.abc import AsyncGenerator
from typing import ClassVar

from openai import APIError, AsyncOpenAI, OpenAI

from backend.config import (
    ORCAROUTER_API_BASE_URL,
    ORCAROUTER_API_KEY,
    ORCAROUTER_MODEL,
)

from .base_service import BaseModelService
from .model_factory import ModelFactory

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class OrcaRouterService(BaseModelService):
    """
    OrcaRouter model service implementation (OpenAI-compatible gateway)

    可选第三方网关：默认模型 orcarouter/free 按难度路由到工作空间的
    免费模型，官方承诺不产生任何费用。模型名可通过 ORCAROUTER_MODEL 覆盖。
    """

    def __init__(self):
        # 异步客户端用于流式生成（可被 CancelledError 中断）
        self.async_client = AsyncOpenAI(
            api_key=ORCAROUTER_API_KEY, base_url=ORCAROUTER_API_BASE_URL
        )
        # 同步客户端用于 generate_title 等独立同步操作
        self.client = OpenAI(
            api_key=ORCAROUTER_API_KEY, base_url=ORCAROUTER_API_BASE_URL
        )

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name
        """
        return "orcarouter"

    async def generate(
        self, messages: list[dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[dict[str, str], None]:
        """
        Call OrcaRouter API to generate streaming response

        Args:
            messages: List of message history
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """
        try:
            # orcarouter/free 路由到推理模型（deepseek-v4-flash）。
            # 实测：显式 thinking:enabled 会稳定 402 free_quota_exhausted
            # （免费档不支持开启推理），因此：
            # - 非思考模式：显式禁用，避免模型空转推理
            # - 思考模式：不传参（网关默认允许轻量推理）
            request_params = {
                "model": ORCAROUTER_MODEL,
                "messages": messages,
                "stream": True,
            }
            if not deep_thinking:
                request_params["extra_body"] = {"thinking": {"type": "disabled"}}

            # 使用异步OpenAI SDK调用
            response = await self.async_client.chat.completions.create(**request_params)

            # 处理流式响应
            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta

                    # 处理思考内容（仅当模型返回 reasoning_content 时）
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
            logger.error("OrcaRouter API call failed: %s", str(e))
            # 免费档对单次 prompt 长度有上限（code: free_rate_limited），
            # 此时报"暂时不可用"会误导用户，应给出明确提示
            message = "Model service temporarily unavailable"
            body = e.body
            if isinstance(body, dict):
                # openai SDK 会拆掉 {"error": {...}} 包装，code 在顶层；
                # 兼容未拆包装的形态
                err = body
                error_field = body.get("error")
                if isinstance(error_field, dict):
                    err = error_field
                if err.get("code") == "free_rate_limited":
                    message = (
                        "OrcaRouter free tier prompt length limit exceeded: "
                        "shorten the conversation, or configure ORCAROUTER_MODEL "
                        "to a paid model to remove the cap"
                    )
                elif err.get("code") == "free_quota_exhausted":
                    # 本服务不会发送 thinking:enabled（见 generate 注释），
                    # 真实触发 402 的场景是免费额度耗尽；thinking 模式
                    # 实测也不被免费额度覆盖，两种原因一并说明
                    message = (
                        "OrcaRouter free tier quota exhausted (thinking mode "
                        "is not covered by the free allowance): wait for the "
                        "allowance to reset, or configure ORCAROUTER_MODEL "
                        "to a paid model"
                    )
            yield {"error": message, "details": str(e)}

    # 标题生成配置：orcarouter/free 路由到推理模型（deepseek-v4-flash），
    # 默认 40 token 预算会被推理吃光，导致 content 为空而降级为提问截断。
    # 双保险：禁用思考（标题无需推理）+ 提高预算（万一禁用参数不被接受）。
    # 注意：chat 的思考模式刻意不传 thinking 参数（免费档 402，见 generate），
    # 勿在此处与 chat 路径"统一"为传 thinking:enabled。
    _title_max_tokens: int = 200
    _title_extra_params: ClassVar[dict | None] = {"thinking": {"type": "disabled"}}

    def _get_title_model(self) -> str:
        return ORCAROUTER_MODEL
