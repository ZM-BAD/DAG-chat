import asyncio
import logging
import json
import requests
from typing import List, Dict, Any, AsyncGenerator

from .base_service import BaseModelService
from .model_factory import ModelFactory

from config import QWEN_API_KEY, QWEN_API_BASE_URL

# 获取日志记录器
logger = logging.getLogger(__name__)


@ModelFactory.register
class QwenService(BaseModelService):
    """
    Qwen模型服务实现
    """
    
    def __init__(self):
        self.api_key = QWEN_API_KEY
        self.base_url = QWEN_API_BASE_URL
    
    @classmethod
    def get_service_name(cls) -> str:
        """
        获取服务名称
        """
        return "qwen"
    
    async def generate(self, messages: List[Dict[str, str]], deep_thinking: bool = False) -> AsyncGenerator[Dict[str, str], None]:
        """
        调用Qwen API生成流式响应

        参数:
            messages: 消息历史列表
            deep_thinking: 是否使用思考模型（Qwen暂不支持，保留参数兼容性）

        返回:
            包含content和reasoning字段的异步生成器
        """
        try:
            logger.info("Sending request to Qwen API")
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            
            data = {
                "model": "qwen-plus",  # 使用Qwen的默认模型
                "messages": messages,
                "stream": True
            }
            
            # 使用requests库发起请求，并设置stream=True
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                lambda: requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=data,
                    stream=True
                )
            )
            
            # 处理流式响应
            for chunk in response.iter_lines():
                if chunk:
                    # 去除data:前缀和可能的换行符
                    chunk_str = chunk.decode('utf-8').strip()
                    if chunk_str.startswith('data: '):
                        chunk_str = chunk_str[6:]
                    
                    # 检查是否是结束标记
                    if chunk_str == '[DONE]':
                        break
                    
                    try:
                        chunk_data = json.loads(chunk_str)
                        # 提取内容
                        content = ""
                        if chunk_data.get('choices') and chunk_data['choices'][0].get('delta'):
                            content = chunk_data['choices'][0]['delta'].get('content', '')
                        
                        yield {
                            "content": content,
                            "reasoning": ""  # Qwen可能不直接提供reasoning字段
                        }
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse chunk: {chunk_str}")
            
            logger.info("Qwen API调用成功")
            
        except Exception as e:
            logger.error(f"Qwen API调用失败: {str(e)}")
            yield {
                "error": "模型服务暂不可用",
                "details": str(e)
            }
    
    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        根据用户输入和完整响应生成对话标题
        """
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            
            messages = [
                {
                    "role": "user",
                    "content": f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}"
                }
            ]
            
            data = {
                "model": "qwen-plus",
                "messages": messages,
                "max_tokens": 20,
                "temperature": 0.3
            }
            
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=data
            )
            
            response_data = response.json()
            if response_data.get('choices') and response_data['choices'][0].get('message'):
                title = response_data['choices'][0]['message'].get('content', '').strip("。\n")
                return title[:20]
            
            # 如果API返回异常，使用默认方式生成标题
            return full_response[:20]
        except Exception as e:
            logger.error(f"标题生成失败: {str(e)}")
            return full_response[:20]