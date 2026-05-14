---
name: project-overview
spec-id: "020"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "100-backend-architecture"
  - "110-frontend-architecture"
  - "200-docker-topology"
---

# Project Overview

## Overview

DAG-chat is a web-based LLM Q&A application that organizes conversations in a DAG (Directed Acyclic Graph) structure, providing more flexible conversation logic than traditional linear chat interfaces.

## Details

### Tech Stack

- **Backend**: Python 3.14+ with FastAPI, MongoDB, and MySQL
- **Frontend**: React 19 with TypeScript, Vite, and i18next for internationalization (Node.js 24+)

### Configuration

- **Backend**: `backend/config.py` loads settings from root `.env`. Reference `.env.example` for all
  available env vars (LLM keys, model overrides, MySQL, Ollama)
- **Frontend**: `vite.config.ts` reads `DEFAULT_USER_ID` from root `.env` via `loadEnv` and injects it
  as `import.meta.env.VITE_DEFAULT_USER_ID` via `define`. `VITE_API_BASE_URL` is read directly
  via `envDir: '..'`.
- **Database**: MySQL auto-initializes from `sql/t_conversations.sql` via docker-compose. For manual setup, execute the SQL file against the `dag_chat` database
- **Virtual Environment**: Located at `.venv/` in project root

## Key Files

- `backend/config.py` — Backend configuration loader
- `frontend/vite.config.ts` — Frontend build configuration
- `.env.example` — Environment variable reference
- `sql/t_conversations.sql` — MySQL schema initialization

## Constraints

None specific to this spec.

## References

- [030-dev-commands](./030-dev-commands.md) — How to run the project
- [200-docker-topology](./200-docker-topology.md) — Docker configuration
- [140-database-schema](./140-database-schema.md) — Database details
