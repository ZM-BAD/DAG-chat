"""Regression tests for GLM-5.3 request parameters and title generation."""

import asyncio
from types import SimpleNamespace

import pytest

from backend.api.services.glm_service import GLMService
from backend.config import GLM_MODEL

TEST_API_KEY = "glm-test-key"


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr("backend.api.services.glm_service.GLM_API_KEY", TEST_API_KEY)
    return GLMService()


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

    def __iter__(self):
        return iter(self._chunks)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


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


def test_uses_glm_5_3_by_default(service):
    assert service._get_title_model() == GLM_MODEL
    assert GLM_MODEL == "glm-5.3"


def test_thinking_uses_high_effort_and_returns_reasoning(service):
    async def fake_create(**kwargs):
        assert kwargs["reasoning_effort"] == "max"
        assert kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
        return _FakeStream([_chunk(reasoning="thinking"), _chunk(content="answer")])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service, deep_thinking=True) == [
        {"content": "", "reasoning": "thinking"},
        {"content": "answer", "reasoning": ""},
    ]


def test_non_thinking_uses_low_effort_and_still_works(service):
    async def fake_create(**kwargs):
        assert kwargs["reasoning_effort"] == "low"
        assert kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
        return _FakeStream([_chunk(content="answer")])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service, deep_thinking=False) == [
        {"content": "answer", "reasoning": ""}
    ]


def test_title_uses_streaming_with_low_effort(service):
    def fake_create(**kwargs):
        assert kwargs["stream"] is True
        assert kwargs["reasoning_effort"] == "low"
        assert kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
        return _FakeStream([_chunk(content="Python快速排序实现")])

    service.client.chat.completions.create = fake_create

    assert service.generate_title(
        "如何实现快速排序？", "使用基准元素递归划分数组。"
    ) == ("Python快速排序实现")
