---
name: code-quality
spec-id: "210"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "220-testing"
---

# Code Quality

## Overview

Code quality enforcement through pre-commit hooks, commit message conventions, and CI/CD pipelines.

## Details

### Pre-commit Hooks

- **Backend**: Ruff (linting + formatting), Pylint (quality, min score: 9), pip-audit (dependency security audit), backend DAG tests
- **Frontend**: ESLint, Prettier, TypeScript compiler, npm ci check, production build verification

### Commit Message Convention

Uses conventional commits format: `<type>(<scope>): <subject>`

- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- See `.gitmessage` for full template

## Key Files

- `.pre-commit-config.yaml` — Pre-commit hook definitions
- `.pylintrc` — Pylint configuration
- `.gitmessage` — Commit message template
- `.github/workflows/format.yml` — Format check workflow
- `.github/workflows/pylint.yml` — Pylint workflow
- `.github/workflows/frontend.yml` — Frontend CI workflow
- `.github/workflows/security.yml` — Security scan workflow

## Constraints

Pylint minimum score: 9. All pre-commit hooks must pass before commit.

## References

- [220-testing](./220-testing.md) — Testing strategy
