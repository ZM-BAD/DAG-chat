---
name: frontend-typescript-toolchain
spec-id: "230"
version: 1.0
status: active
last-updated: 2026-06-28
related-specs:
  - "110-frontend-architecture"
  - "210-code-quality"
  - "030-dev-commands"
---

# Frontend TypeScript Toolchain

## Overview

The frontend is a TypeScript 6 application (strict mode, `bundler` module
resolution, `esnext` modules). This spec documents the compiler configuration, the
TypeScript version policy, and how type-checking is enforced in CI.

## Details

### Version policy

- `typescript` is pinned to `~6.0.0` in `frontend/package.json`. The tilde keeps
  upgrades inside the `typescript-eslint` peer window (`>=4.8.4 <6.1.0`); widening
  to `~6.1.0` requires a coordinated `typescript-eslint` bump.
- `typescript-eslint` is declared at `^8.59.2` (resolves to 8.60.1) and officially
  supports TS 6.0.x with no "unsupported version" warning.

### Compiler configuration

- `tsconfig.json` (application, `src/`):
  - `target: ESNext`, `lib: ["dom", "ESNext"]` (ESNext is a superset of ES2024/ES2025).
  - `strict: true`, `moduleResolution: "bundler"`, `module: "esnext"`.
  - `types: []` — no ambient `@types` packages are auto-included (the option only
    suppresses automatic inclusion, not explicit imports). `@types/react*` still
    resolve via normal imports; `vite/client` is pulled in by the
    `/// <reference types="vite/client" />` triple-slash directive in
    `src/vite-env.d.ts`, which declares the `*.css` module type used by side-effect
    style imports.
  - `noEmit: true` — Vite/esbuild produce the runtime bundle; the emit target is
    `build.target: 'es2024'` in `vite.config.ts`.
- `tsconfig.node.json` (composite project for `vite.config.ts`):
  - `target: ESNext`, `lib: ["ESNext"]`, `types: ["node"]` (runs in Node).

### Type-checking in CI

`.github/workflows/frontend.yml` runs:

- `npx tsc --noEmit` — type-checks `src/`.
- `npx tsc -p tsconfig.node.json --noEmit` — type-checks `vite.config.ts` (plain
  `tsc` skips project references, so this is a separate step).
- `npx prettier --check` over `src/**` **and** the root config files
  (`vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`).

The composite project emits `frontend/dist/tsconfig.node.tsbuildinfo` despite
`--noEmit`; it is gitignored via `*.tsbuildinfo` and `frontend/dist/`.

## Key Files

- `frontend/package.json` — TypeScript version pin
- `frontend/tsconfig.json` — application compiler config
- `frontend/tsconfig.node.json` — vite.config.ts type-check project
- `frontend/vite.config.ts` — Vite config (runtime build target)
- `frontend/src/vite-env.d.ts` — vite/client reference that declares CSS module types
- `.github/workflows/frontend.yml` — type-check and build CI

## Constraints

- Toolchain/type-checking configuration only; must not change runtime behavior.
- Bumping the TypeScript major version requires verifying the `typescript-eslint`
  peer window and updating this spec.

## References

- [110-frontend-architecture](./110-frontend-architecture.md) — Frontend stack
- [210-code-quality](./210-code-quality.md) — Lint/format/type-check gates
- [030-dev-commands](./030-dev-commands.md) — Frontend commands
