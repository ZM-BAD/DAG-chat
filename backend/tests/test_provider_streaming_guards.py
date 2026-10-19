"""Regression tests for usage-only stream chunks across providers."""

import asyncio
from types import SimpleNamespace

from backend.api.services.minimax_service import MiniMaxService
from backend.api.services.ollama_service import OllamaService


class FakeStream:
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


def content_chunk(content):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(
                    content=content,
                    reasoning_details=None,
                )
            )
        ]
    )


def collect(service):
    async def run():
        items = []
        async for item in service.generate(
            [{"role": "user", "content": "hi"}], deep_thinking=False
        ):
            items.append(item)
        return items

    return asyncio.run(run())


def test_minimax_skips_usage_only_chunk(monkeypatch):
    monkeypatch.setattr(
        "backend.api.services.minimax_service.MINIMAX_API_KEY", "mini-test"
    )
    service = MiniMaxService()

    async def fake_create(**kwargs):
        return FakeStream([content_chunk("answer"), SimpleNamespace(choices=[])])

    service.async_client.chat.completions.create = fake_create
    assert collect(service) == [{"content": "answer", "reasoning": ""}]


def test_ollama_skips_usage_only_chunk(monkeypatch):
    service = OllamaService("ollama/test-model")

    async def fake_create(**kwargs):
        return FakeStream([content_chunk("answer"), SimpleNamespace(choices=[])])

    service.async_client.chat.completions.create = fake_create
    assert collect(service) == [{"content": "answer", "reasoning": ""}]
