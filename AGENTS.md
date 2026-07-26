# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Quick Reference

- **Tech Stack**: Python 3.14+ / FastAPI / React 19 / TypeScript / MongoDB / MySQL
- **Spec Directory**: `specs/` — All feature specifications are split into numbered spec files
- **Dev Commands**: See `specs/030-dev-commands.md`

## Must Read Before Coding

1. `specs/010-constitution.md` — Hard constraints, never violate
2. `specs/120-dag-structure.md` — DAG core concept, the project's key innovation

## Spec Index

See `specs/README.md` for the full index with numbering, status, and descriptions.

## Commit Messages

Conventional Commits format, enforced by commitlint (pre-commit `commit-msg` hook + CI).

**Format:** `<type>(<scope>): <subject>` — imperative, ≤50 chars (72 hard), no period. Blank line, then body (WHY + landmines only, never restate the diff; ≤72 chars/line), then `Co-Authored-By: Claude <noreply@anthropic.com>` (required for every AI commit).

**Types:** `feat` `fix` `docs` `refactor` `perf` `test` `build` `ci` `chore` `style`. Scope is the affected module (e.g. `frontend` `backend` `dag` `ci`).

## Workflow

1. Read relevant specs before implementing
2. Never break constraints defined in `specs/010-constitution.md`
3. Run tests before and after DAG-related changes (see `specs/220-testing.md`)
