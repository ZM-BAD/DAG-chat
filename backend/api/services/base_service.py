import abc
import logging
from typing import Dict, Optional

# 获取日志记录器
logger = logging.getLogger(__name__)

# 标题生成使用的 prompt 模板
TITLE_PROMPT_TEMPLATE = (
    "Generate a concise title (max 20 chars) for the following conversation. "
    "IMPORTANT: The title MUST be in the SAME language as the user's message. "
    "Return ONLY the title, nothing else.\n"
    "User: {user_input}\nAI: {full_response}"
)

MAX_TITLE_LENGTH = 20


class BaseModelService(metaclass=abc.ABCMeta):
    """
    Base class for model services, defines the interface all model services must implement
    """

    # 标题生成配置 —— 子类按需覆盖
    _title_max_tokens: int = 20
    _title_extra_params: Optional[Dict] = None

    @abc.abstractmethod
    async def generate(self, messages, deep_thinking: bool = False):
        """
        Generate streaming response

        Args:
            messages: List of message history, each message contains role and content fields
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """

    @abc.abstractmethod
    def _get_title_model(self) -> str:
        """
        Return the model name used for title generation

        Subclasses must implement this method, returning the corresponding model identifier
        """

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        Generate conversation title from user input and full response

        Template method: common logic handled uniformly, subclasses override
        differential configuration through properties
        """
        service_name = self.get_service_name()
        try:
            messages = [
                {
                    "role": "user",
                    "content": TITLE_PROMPT_TEMPLATE.format(
                        user_input=user_input, full_response=full_response
                    ),
                }
            ]

            kwargs = {
                "model": self._get_title_model(),
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": self._title_max_tokens,
            }
            if self._title_extra_params:
                kwargs["extra_body"] = self._title_extra_params

            response = self.client.chat.completions.create(**kwargs)

            content = response.choices[0].message.content
            if content:
                title = content.strip("。\n")
                if len(title) > MAX_TITLE_LENGTH:
                    logger.warning(
                        "%s generated title exceeds 20 chars and was truncated, original title (%d chars): %s",
                        service_name,
                        len(title),
                        title,
                    )
                return title[:MAX_TITLE_LENGTH]

            # content 为空的 fallback
            logger.warning(
                "%s title generation returned empty content, using fallback",
                service_name,
            )
            return full_response[:MAX_TITLE_LENGTH]
        except Exception as e:
            logger.error("Title generation failed (%s): %s", service_name, str(e))
            return full_response[:MAX_TITLE_LENGTH]

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name, used for identification in the factory
        """
        return cls.__name__.lower().replace("service", "")
