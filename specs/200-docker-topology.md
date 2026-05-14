---
name: docker-topology
spec-id: "200"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "020-project-overview"
  - "140-database-schema"
---

# Docker Compose Topology

## Overview

Docker Compose configuration for running the full stack locally. Documents port mapping, service dependencies, and environment configuration.

## Details

### Port Mapping

- MongoDB: host 27018 → container 27017
- MySQL: host 3307 → container 3306
- Backend: host 8000 → container 8000
- Frontend: host 3000 → container 80 (nginx)

### Environment

- Backend and frontend both read root `.env`
- Requires Docker >= 29, Docker Compose >= v5

## Key Files

- `docker-compose.yml` — Compose configuration
- `backend/Dockerfile` — Backend image
- `frontend/Dockerfile` or frontend nginx config — Frontend image
- `.env` — Environment variables

## Constraints

Docker version requirements: Docker >= 29, Docker Compose >= v5.

## References

- [020-project-overview](./020-project-overview.md) — Configuration details
- [140-database-schema](./140-database-schema.md) — Database schema
