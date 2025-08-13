#!/usr/bin/env python3.13

import logging

from openai import OpenAI

from config import DEEPSEEK_API_KEY, DEEPSEEK_API_BASE_URL

# 获取日志记录器
logger = logging.getLogger(__name__)

client = OpenAI(api_key=DEEPSEEK_API_KEY,
                base_url=DEEPSEEK_API_BASE_URL)

# Round 1
messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
logger.info("Sending request to DeepSeek API")
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages,
    stream=True
)
logger.info("Received response from DeepSeek API")

reasoning_content = ""
content = ""

for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        reasoning_content += chunk.choices[0].delta.reasoning_content
    else:
        content += chunk.choices[0].delta.content or ""
