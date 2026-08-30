---
name: model-service-factory
spec-id: "130"
version: 1.1
status: active
last-updated: 2026-08-30
related-specs:
  - "100-backend-architecture"
---

# Model Service Factory

## Overview

The backend uses a factory pattern for LLM services, allowing multiple LLM providers to be integrated through a unified interface.

## Details

### Pattern

1. Each LLM provider extends `BaseModelService`
2. Services are registered via `@ModelFactory.register()` decorator
3. `ModelFactory.get_service(model_name)` retrieves the appropriate service

### Supported Providers

- GLM (`glm_service.py`)
- Kimi (`kimi_service.py`)
- Qwen (`qwen_service.py`)
- DeepSeek (`deepseek_service.py`)
- MiniMax (`minimax_service.py`)
- Ollama (`ollama_service.py`)
- OrcaRouter (`orcarouter_service.py`, optional third-party gateway)

### Adding a New LLM Provider

1. Extend `BaseModelService` in `backend/api/services/`
2. Register with `@ModelFactory.register()` (decorator in the service file)
3. **Import the service in `backend/api/services/__init__.py`** — the decorator only runs when the module is imported; without this step the provider never appears in the model list
4. Add the model name constant in `backend/config.py`
5. Add display name in `backend/api/routes/base.py` (`display_name_map`)
6. Add logo mapping in `frontend/src/components/common/ModelLogo.tsx`

## Key Files

- `backend/api/services/model_factory.py` — Factory class and register decorator
- `backend/api/services/base_service.py` — Base class for model services
- `backend/api/services/glm_service.py` — Example provider implementation
- `backend/config.py` — Model name constants
- `frontend/src/components/common/ModelLogo.tsx` — Logo mapping

## Constraints

All new providers MUST follow the 6-step registration process above.

## References

- [100-backend-architecture](./100-backend-architecture.md) — Backend architecture overview
