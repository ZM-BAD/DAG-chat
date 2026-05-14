---
name: backend-architecture
spec-id: "100"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "120-dag-structure"
  - "130-model-service-factory"
  - "140-database-schema"
---

# Backend Architecture

## Overview

The backend uses a modular architecture built on Python 3.14+ with FastAPI, MongoDB for message storage, and MySQL for user/dialogue metadata.

## Details

### Database Layer (`backend/database/`)

- `mongodb_connection.py`: MongoDB operations for message storage and DAG structure
- `mysql_connection.py`: MySQL operations for user/dialogue metadata

### API Layer (`backend/api/`)

- `main.py`: FastAPI application setup with CORS middleware
- `router.py`: API router aggregation
- `routes/`: Route handlers organized by feature
  - `base.py`: Base endpoints
  - `conversation.py`: Dialogue CRUD operations
  - `chat.py`: Chat message handling and DAG logic
  - `model_service.py`: Model service management endpoints
- `services/`: LLM service implementations using factory pattern
  - `model_factory.py`: Factory for creating model service instances
  - `base_service.py`: Base class for model services
  - `glm_service.py`, `kimi_service.py`, `qwen_service.py`, `deepseek_service.py`, `minimax_service.py`, `ollama_service.py`: Specific LLM implementations

### Models (`backend/models/`)

- `schemas.py`: Pydantic schemas for request/response validation
- `requests.py`: Request model definitions
- `error_codes.py`: Unified API error code constants

### Other Backend Files

- `run_api.py`: Application entry point (starts Uvicorn server with logging setup)
- `config.py`: Loads settings from environment variables (with defaults)
- `logging_config.py`: Logging configuration
- `Dockerfile`: Docker build configuration

## Key Files

- `backend/api/main.py` — FastAPI app setup
- `backend/api/router.py` — Route aggregation
- `backend/api/routes/chat.py` — Chat DAG logic
- `backend/database/mongodb_connection.py` — MongoDB operations
- `backend/database/mysql_connection.py` — MySQL operations
- `backend/models/schemas.py` — Pydantic schemas

## Constraints

None specific to this spec. See [010-constitution](./010-constitution.md) for general rules.

## References

- [120-dag-structure](./120-dag-structure.md) — DAG backend logic in chat.py
- [130-model-service-factory](./130-model-service-factory.md) — LLM service pattern
- [140-database-schema](./140-database-schema.md) — Database details
