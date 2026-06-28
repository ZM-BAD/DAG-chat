# Spec Index

## Naming Convention

- Files: `NNN-kebab-case.md` (3-digit zero-padded number + hyphen + kebab-case slug)
- `000` = template/meta files
- `0xx` = foundational (constitution, overview, commands)
- `1xx` = architecture & core domain
- `2xx` = infrastructure & quality
- Numbers are spaced by 10 for future insertion

## Spec Status

| Status       | Meaning                          |
| ------------ | -------------------------------- |
| `active`     | Current and maintained           |
| `draft`      | Under development, not yet approved |
| `deprecated` | Superseded or no longer applicable |

## Spec List

Read this index first, then open only the spec(s) relevant to your task — do not load every spec.

| ID  | File                                                            | Title                       | Scope                                        | Status  |
| --- | --------------------------------------------------------------- | --------------------------- | -------------------------------------------- | ------- |
| 010 | [010-constitution.md](./010-constitution.md)                   | Constitution                | Hard rules & constraints (must-read)         | active  |
| 020 | [020-project-overview.md](./020-project-overview.md)           | Project Overview            | What it is, tech stack, config               | active  |
| 030 | [030-dev-commands.md](./030-dev-commands.md)                   | Development Commands        | dev / test / build commands                  | active  |
| 100 | [100-backend-architecture.md](./100-backend-architecture.md)   | Backend Architecture        | FastAPI layers & structure                   | active  |
| 110 | [110-frontend-architecture.md](./110-frontend-architecture.md) | Frontend Architecture       | React structure, hooks, components           | active  |
| 120 | [120-dag-structure.md](./120-dag-structure.md)                 | DAG Structure               | DAG conversation model & implementation      | active  |
| 130 | [130-model-service-factory.md](./130-model-service-factory.md) | Model Service Factory       | Multi-LLM provider abstraction               | active  |
| 140 | [140-database-schema.md](./140-database-schema.md)             | Database Schema             | MongoDB & MySQL schema                       | active  |
| 200 | [200-docker-topology.md](./200-docker-topology.md)             | Docker Compose Topology     | Container service layout                     | active  |
| 210 | [210-code-quality.md](./210-code-quality.md)                   | Code Quality                | Pre-commit, commits, CI gates                | active  |
| 220 | [220-testing.md](./220-testing.md)                             | Testing                     | Test strategy & commands                     | active  |
| 230 | [230-frontend-typescript-toolchain.md](./230-frontend-typescript-toolchain.md) | Frontend TypeScript Toolchain | TS config, version policy, type-check CI | active  |

## Usage

- AI agents: Read `010-constitution.md` before any coding task
- New features: Copy `000-template.md` to `NNN-feature-name.md`, pick next available number
- Editing specs: Update `last-updated` date in frontmatter on any change
