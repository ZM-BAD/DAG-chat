#!/usr/bin/env python3.13
import asyncio
import logging

from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam

from config import DEEPSEEK_API_KEY, DEEPSEEK_API_BASE_URL

# 获取日志记录器
logger = logging.getLogger(__name__)

client = OpenAI(api_key=DEEPSEEK_API_KEY,
                base_url=DEEPSEEK_API_BASE_URL)


async def call_deepseek_r1(messages: list, model: str = "deepseek-reasoner"):
    """
    DeepSeek API调用函数
    :param messages: 对话消息列表
    :param model: 模型名称，默认deepseek-reasoner
    :return: 生成的内容和推理内容的流式生成器
    """
    try:
        logger.info("Sending request to DeepSeek API")
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True
        )

        for chunk in response:
            reasoning_chunk = chunk.choices[0].delta.reasoning_content or ""
            content_chunk = chunk.choices[0].delta.content or ""
            yield {
                "content": content_chunk,
                "reasoning": reasoning_chunk
            }

        logger.info("DeepSeek API调用成功")

    except Exception as e:
        logger.error(f"DeepSeek API调用失败: {str(e)}")
        yield {
            "error": "模型服务暂不可用",
            "details": str(e)
        }


def generate_title(user_input: str, full_response: str) -> str:
    """
    根据用户输入和完整响应生成对话标题
    
    使用 DeepSeek V3 接口生成不超过20个字的简洁标题
    """
    try:
        messages = [
            ChatCompletionUserMessageParam(
                role="user",
                content=f"根据以下对话生成20字内标题（只需返回标题）：\n用户：{user_input}\nAI：{full_response}"
            )
        ]
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.3,
            max_tokens=20,
        )

        # 清理响应中的多余符号和空格
        title = response.choices[0].message.content.strip("。\n")
        return title[:20]
    except Exception as e:
        logger.error(f"标题生成失败: {str(e)}")
        return full_response[:20]


async def main():
    test_messages = [{"role": "user", "content": "请解释什么是人工智能"}]
    try:
        has_content = False
        has_reasoning = False
        async for chunk in call_deepseek_r1(test_messages):
            if "error" in chunk:
                print(f"错误: {chunk['error']}, 详情: {chunk['details']}")
            else:
                content = chunk.get('content', '').strip()
                reasoning = chunk.get('reasoning', '').strip()
                
                if content:
                    if not has_content:
                        print("\n内容:\n", end="", flush=True)
                        has_content = True
                    print(content, end="", flush=True)
                
                if reasoning:
                    if not has_reasoning:
                        print("推理:\n", end="", flush=True)
                        has_reasoning = True
                    print(reasoning, end="", flush=True)
    except Exception as e:
        print(f"测试过程中发生错误: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
