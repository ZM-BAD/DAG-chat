---
name: database-schema
spec-id: "140"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "100-backend-architecture"
  - "200-docker-topology"
---

# Database Schema

## Overview

DAG-chat uses two databases: MongoDB for message content and DAG structure, MySQL for user metadata and dialogue information.

## Details

### MongoDB (dag_chat database)

- Stores message nodes with DAG relationships
- Collection structure supports `parent_ids` and `children` tracking
- Handles message content, role assignment, and graph traversal data

### MySQL (dag_chat database)

- User metadata and dialogue information
- Separates dialogue management from message content
- Auto-initializes from `sql/t_conversations.sql` via docker-compose

## Key Files

- `backend/database/mongodb_connection.py` — MongoDB operations
- `backend/database/mysql_connection.py` — MySQL operations
- `sql/t_conversations.sql` — MySQL schema initialization

## Constraints

For manual MySQL setup, execute `sql/t_conversations.sql` against the `dag_chat` database.

## References

- [100-backend-architecture](./100-backend-architecture.md) — Backend database layer
- [200-docker-topology](./200-docker-topology.md) — Docker database ports
