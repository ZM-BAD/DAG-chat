---
name: dev-commands
spec-id: "030"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "020-project-overview"
  - "220-testing"
---

# Development Commands

## Overview

All commands needed for local development, testing, and building the project.

## Details

### Backend

```bash
# Activate virtual environment (run from backend/ directory)
source ../.venv/bin/activate

# Install dependencies
cd backend && pip install -r requirements.txt

# Run the API server (default port: 8000)
cd backend && python3 run_api.py

# Run all tests
cd backend && python tests/run_all_tests.py

# Run specific test file
cd backend && python tests/test_dag_chat.py

# Run tests with pytest
cd backend && python -m pytest tests/test_dag_chat.py -v
```

### Frontend

```bash
# Install dependencies
cd frontend && npm install --legacy-peer-deps

# Start development server (default port: 3000)
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Preview production build
cd frontend && npm run preview

# Lint code
cd frontend && npm run lint

# Lint and fix
cd frontend && npm run lint:fix

# Format code
cd frontend && npm run format

# Check formatting
cd frontend && npm run format:check

# Check i18n key synchronization
cd frontend && npm run i18n:check
```

### Quick Start (Both Services)

```bash
# Start both frontend and backend
./start.sh --all

# Start only frontend
./start.sh --frontend

# Start only backend
./start.sh --backend

# Stop all services
./start.sh --stop
```

## Key Files

- `start.sh` — Quick start script
- `backend/run_api.py` — Backend entry point
- `frontend/package.json` — Frontend scripts definitions
- `Makefile` — Make commands for development

## Constraints

Always activate the virtual environment before running backend commands.

## References

- [220-testing](./220-testing.md) — Test details
- [020-project-overview](./020-project-overview.md) — Project configuration
