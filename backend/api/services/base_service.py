import abc
import logging
from typing import List, Dict, AsyncGenerator

# 获取日志记录器
logger = logging.getLogger(__name__)


class BaseModelService(metaclass=abc.ABCMeta):
    """
    模型服务基类，定义所有模型服务需要实现的接口
    """

    @abc.abstractmethod
    async def generate(
        self, messages: List[Dict[str, str]], deep_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        生成流式响应

        参数:
            messages: 消息历史列表，每个消息包含role和content字段
            deep_thinking: 是否使用思考模型

        返回:
            包含content和reasoning字段的异步生成器
        """
        pass

    @abc.abstractmethod
    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        生成对话标题

        参数:
            user_input: 用户输入
            full_response: 完整的模型响应

        返回:
            生成的标题字符串
        """
        pass

    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称，用于在工厂中标识
        """
        return cls.__name__.lower().replace("service", "")
