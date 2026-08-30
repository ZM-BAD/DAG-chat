"""
Tests for OrcaRouter model service: factory registration, streaming, error handling.

Run with:
    cd backend && python -m pytest tests/test_orcarouter_service.py -v

pytest 夹具参数与受保护成员访问是测试惯例，pylint 常规误报，此处禁用：
- redefined-outer-name: 夹具名与测试方法参数同名（pytest 标准模式）
- protected-access: 测试需访问 _instances/_get_title_model 等内部成员
"""

# pylint: disable=redefined-outer-name,protected-access

import asyncio
from types import SimpleNamespace

import pytest
from openai import APIError

from backend.api.services.model_factory import ModelFactory
from backend.api.services.orcarouter_service import OrcaRouterService
from backend.config import ORCAROUTER_MODEL

# 非空测试 key（OpenAI SDK 构造客户端时校验非空，但不发请求）
TEST_API_KEY = "sk-orca-test"


@pytest.fixture
def service(monkeypatch):
    """构造 OrcaRouterService 实例。

    未配置 ORCAROUTER_API_KEY 时构造会抛 OpenAIError（与现有服务行为一致，
    由 factory 的 try_or 优雅降级为 None），测试必须提供非空 key。
    """
    monkeypatch.setattr(
        "backend.api.services.orcarouter_service.ORCAROUTER_API_KEY", TEST_API_KEY
    )
    return OrcaRouterService()


@pytest.fixture
def isolated_factory():
    """隔离 ModelFactory._instances 缓存，避免测试间互相污染。

    factory 测试会向类级缓存写入实例，若不清空，后续
    「缺 key 降级为 None」之类的测试会受残留实例影响。
    """
    saved = ModelFactory._instances
    ModelFactory._instances = {}
    yield ModelFactory
    ModelFactory._instances = saved


class _FakeStream:
    """Fake async iterator of streaming chunks."""

    def __init__(self, chunks):
        self._chunks = list(chunks)
        self._i = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._i >= len(self._chunks):
            raise StopAsyncIteration
        chunk = self._chunks[self._i]
        self._i += 1
        return chunk


def _chunk(content=None, reasoning=None):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content=content, reasoning_content=reasoning)
            )
        ]
    )


def _collect(service, messages, deep_thinking=False):
    """同步驱动 async generator，避免依赖 pytest-asyncio。"""

    async def run():
        collected = []
        async for item in service.generate(messages, deep_thinking=deep_thinking):
            collected.append(item)
        return collected

    return asyncio.run(run())


class TestOrcaRouterRegistration:
    def test_registered_in_factory(self):
        services = ModelFactory.get_available_services()
        assert "orcarouter" in services
        assert services["orcarouter"] is OrcaRouterService

    def test_get_service_name(self):
        assert OrcaRouterService.get_service_name() == "orcarouter"

    def test_exported_via_services_package(self):
        # 回归保护：装饰器注册依赖 services 包的显式 import，
        # 若 __init__.py 漏导入，生产环境模型列表不会出现 orcarouter
        from backend.api import services

        assert "OrcaRouterService" in services.__all__
        assert hasattr(services, "OrcaRouterService")

    def test_factory_resolves_orcarouter_model(self, monkeypatch, isolated_factory):
        monkeypatch.setattr(
            "backend.api.services.orcarouter_service.ORCAROUTER_API_KEY", TEST_API_KEY
        )
        service = isolated_factory.get_service("orcarouter")
        assert isinstance(service, OrcaRouterService)

    def test_factory_resolves_namespaced_model(self, monkeypatch, isolated_factory):
        # 网关模型名可能带命名空间（如 orcarouter/free），仍应解析到同一服务
        monkeypatch.setattr(
            "backend.api.services.orcarouter_service.ORCAROUTER_API_KEY", TEST_API_KEY
        )
        service = isolated_factory.get_service("orcarouter/free")
        assert isinstance(service, OrcaRouterService)

    def test_missing_key_degrades_to_none(self, monkeypatch, isolated_factory):
        # 硬约束：未配置 key 时 provider 不可用（与现有 6 个 provider 一致，
        # factory 的 try_or 捕获构造异常返回 None）
        monkeypatch.setattr(
            "backend.api.services.orcarouter_service.ORCAROUTER_API_KEY", ""
        )
        assert isolated_factory.get_service("orcarouter") is None

    def test_title_model_uses_configured_model(self, service):
        assert service._get_title_model() == ORCAROUTER_MODEL

    def test_title_config_prevents_reasoning_budget_starvation(self, service):
        # 回归保护：orcarouter/free 路由到推理模型，默认 40 token 预算
        # 会被推理吃光导致空 content（标题降级为提问截断）。
        # 修复 = 禁用思考 + 提高预算，两者都必须在。
        assert service._title_max_tokens >= 200
        assert service._title_extra_params == {"thinking": {"type": "disabled"}}


class TestOrcaRouterGenerate:
    def test_streams_content_chunks(self, service):
        async def fake_create(**kwargs):
            assert kwargs["model"] == ORCAROUTER_MODEL
            assert kwargs["stream"] is True
            # 非思考模式必须显式禁用推理（实测免费档推理空转）
            assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
            return _FakeStream(
                [_chunk(content="你好"), _chunk(content="，世界"), _chunk(content=None)]
            )

        service.async_client.chat.completions.create = fake_create

        collected = _collect(service, [{"role": "user", "content": "hi"}])

        assert collected == [
            {"content": "你好", "reasoning": ""},
            {"content": "，世界", "reasoning": ""},
        ]

    def test_streams_reasoning_when_deep_thinking(self, service):
        async def fake_create(**kwargs):
            # 思考模式不传 thinking 参数：显式 enabled 在免费档会 402
            assert "extra_body" not in kwargs
            return _FakeStream([_chunk(content="answer", reasoning="thinking...")])

        service.async_client.chat.completions.create = fake_create

        collected = _collect(
            service, [{"role": "user", "content": "hi"}], deep_thinking=True
        )

        assert collected == [{"content": "", "reasoning": "thinking..."}]

    def test_yields_error_on_api_error(self, service):
        async def fake_create(**kwargs):
            raise APIError("upstream 500", request=None, body=None)

        service.async_client.chat.completions.create = fake_create

        collected = _collect(service, [{"role": "user", "content": "hi"}])

        assert len(collected) == 1
        assert collected[0]["error"]
        assert "upstream 500" in collected[0]["details"]

    @pytest.mark.parametrize(
        # openai SDK 2.44 会把 {"error": {...}} 包装拆掉（code 在顶层）；
        # 同时兼容未拆包形态
        "body",
        [
            {
                "message": "This prompt is longer than the free tier allows",
                "type": "invalid_request_error",
                "param": "",
                "code": "free_rate_limited",
                "metadata": {"reason": "err_free_prompt_cap"},
            },
            {"error": {"code": "free_rate_limited", "message": "too long"}},
        ],
    )
    def test_free_tier_cap_yields_clear_message(self, service, body):
        # 免费档 prompt 超限（code: free_rate_limited）应提示真实原因，
        # 而不是误导性的"暂时不可用"
        async def fake_create(**kwargs):
            raise APIError("free prompt cap exceeded", request=None, body=body)

        service.async_client.chat.completions.create = fake_create

        collected = _collect(service, [{"role": "user", "content": "hi"}])

        assert len(collected) == 1
        assert "free tier prompt length limit" in collected[0]["error"]

    def test_free_quota_exhausted_yields_clear_message(self, service):
        # 免费额度耗尽（code: free_quota_exhausted）应提示真实原因：
        # 等待额度重置或配置付费模型，而非误导性的"暂时不可用"
        async def fake_create(**kwargs):
            raise APIError(
                "free quota exhausted",
                request=None,
                body={
                    "code": "free_quota_exhausted",
                    "type": "insufficient_quota",
                    "message": "your orcarouter/free allowance is used up",
                },
            )

        service.async_client.chat.completions.create = fake_create

        collected = _collect(service, [{"role": "user", "content": "hi"}])

        assert len(collected) == 1
        assert "free tier quota exhausted" in collected[0]["error"]
