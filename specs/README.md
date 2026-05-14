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

| ID  | File                                                                    | Title                                            | Status  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| 010 | [010-constitution.md](./010-constitution.md)                           | Constitution — Cross-cutting Rules & Constraints | active  |
| 020 | [020-project-overview.md](./020-project-overview.md)                   | Project Overview                                 | active  |
| 030 | [030-dev-commands.md](./030-dev-commands.md)                           | Development Commands                             | active  |
| 100 | [100-backend-architecture.md](./100-backend-architecture.md)           | Backend Architecture                             | active  |
| 110 | [110-frontend-architecture.md](./110-frontend-architecture.md)         | Frontend Architecture                            | active  |
| 120 | [120-dag-structure.md](./120-dag-structure.md)                         | DAG Structure & Frontend Implementation          | active  |
| 130 | [130-model-service-factory.md](./130-model-service-factory.md)         | Model Service Factory                            | active  |
| 140 | [140-database-schema.md](./140-database-schema.md)                     | Database Schema                                  | active  |
| 200 | [200-docker-topology.md](./200-docker-topology.md)                     | Docker Compose Topology                          | active  |
| 210 | [210-code-quality.md](./210-code-quality.md)                           | Code Quality                                     | active  |
| 220 | [220-testing.md](./220-testing.md)                                     | Testing                                          | active  |

## Usage

- AI agents: Read `010-constitution.md` before any coding task
- New features: Copy `000-template.md` to `NNN-feature-name.md`, pick next available number
- Editing specs: Update `last-updated` date in frontmatter on any change
