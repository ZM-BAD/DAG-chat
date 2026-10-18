"""Regression tests for Kimi K3 request compatibility."""

import asyncio
from types import SimpleNamespace

import pytest

from backend.api.services.kimi_service import KimiService
from backend.config import KIMI_MODEL, KIMI_TITLE_MODEL


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr("backend.api.services.kimi_service.KIMI_API_KEY", "kimi-test")
    return KimiService()


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


def test_uses_latest_kimi_models(service):
    assert KIMI_MODEL == "kimi-k3"
    assert KIMI_TITLE_MODEL == "kimi-k3"


def test_thinking_is_explicitly_enabled(service):
    async def fake_create(**kwargs):
        assert kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
        return _FakeStream([_chunk(reasoning="thinking"), _chunk(content="answer")])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service, deep_thinking=True) == [
        {"content": "", "reasoning": "thinking"},
        {"content": "answer", "reasoning": ""},
    ]


def test_non_thinking_is_explicitly_disabled(service):
    async def fake_create(**kwargs):
        assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
        return _FakeStream([_chunk(content="answer")])

    service.async_client.chat.completions.create = fake_create

    assert _collect(service) == [{"content": "answer", "reasoning": ""}]


def test_title_disables_thinking_and_omits_temperature(service):
    def fake_create(**kwargs):
        assert kwargs["model"] == KIMI_TITLE_MODEL
        assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
        assert "temperature" not in kwargs
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content="Python快速排序实现"))
            ]
        )

    service.client.chat.completions.create = fake_create

    assert service.generate_title(
        "如何实现快速排序？", "使用基准元素递归划分数组。"
    ) == ("Python快速排序实现")
