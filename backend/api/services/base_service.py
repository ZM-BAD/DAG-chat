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
    模型服务基类，定义所有模型服务需要实现的接口
    """

    # 标题生成配置 —— 子类按需覆盖
    _title_max_tokens: int = 20
    _title_extra_params: Optional[Dict] = None

    @abc.abstractmethod
    async def generate(self, messages, deep_thinking: bool = False):
        """
        生成流式响应

        参数:
            messages: 消息历史列表，每个消息包含role和content字段
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """

    @abc.abstractmethod
    def _get_title_model(self) -> str:
        """
        返回标题生成使用的模型名称

        子类必须实现此方法，返回对应的模型标识
        """

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题

        模板方法：共性逻辑统一处理，子类通过属性覆盖差异配置
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
                        "%s生成的标题超过20字被截断, 原始标题(%d字): %s",
                        service_name,
                        len(title),
                        title,
                    )
                else:
                    logger.info(
                        "%s标题生成正常(%d字): %s",
                        service_name,
                        len(title),
                        title,
                    )
                return title[:MAX_TITLE_LENGTH]

            # content 为空的 fallback
            logger.warning("%s标题生成返回空内容，使用fallback", service_name)
            return full_response[:MAX_TITLE_LENGTH]
        except Exception as e:
            logger.error("Title generation failed (%s): %s", service_name, str(e))
            return full_response[:MAX_TITLE_LENGTH]

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称，用于在工厂中标识
        """
        return cls.__name__.lower().replace("service", "")
