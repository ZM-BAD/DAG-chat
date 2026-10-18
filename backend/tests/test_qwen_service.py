"""Regression tests for Qwen streaming behavior."""

import asyncio
from types import SimpleNamespace

import pytest

from backend.api.services.qwen_service import QwenService

TEST_API_KEY = "sk-qwen-test"


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr("backend.api.services.qwen_service.QWEN_API_KEY", TEST_API_KEY)
    return QwenService()


class _FakeStream:
    def __init__(self, chunks):
        self._chunks = list(chunks)
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._chunks):
            raise StopAsyncIteration
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk


def _chunk(content=None, reasoning=None):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content=content, reasoning_content=reasoning)
            )
        ]
    )


def _collect(service, deep_thinking=False):
    async def run():
        items = []
        async for item in service.generate(
            [{"role": "user", "content": "hi"}], deep_thinking=deep_thinking
        ):
            items.append(item)
        return items

    return asyncio.run(run())


def test_non_thinking_skips_usage_only_chunk(service):
    async def fake_create(**kwargs):
        assert kwargs["stream"] is True
        assert kwargs["extra_body"] == {"enable_thinking": False}
        return _FakeStream([_chunk(content="answer"), SimpleNamespace(choices=[])])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service) == [{"content": "answer", "reasoning": ""}]


def test_thinking_yields_reasoning_and_enables_thinking(service):
    async def fake_create(**kwargs):
        assert kwargs["extra_body"] == {"enable_thinking": True}
        return _FakeStream([_chunk(content="answer", reasoning="thinking")])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service, deep_thinking=True) == [
        {"content": "answer", "reasoning": "thinking"}
    ]
