---
name: constitution
spec-id: "010"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "120-dag-structure"
  - "130-model-service-factory"
  - "220-testing"
---

# Constitution — Cross-cutting Rules & Constraints

## Overview

This spec defines the hard rules that MUST be followed by all AI agents when modifying code in this
repository. These constraints exist to prevent regressions in the DAG conversation system and maintain
architectural integrity.

## Details

### Hard Constraints (Never Violate)

1. **Do NOT rebuild tabsMap on tab clicks** — it is static; only the `containers` array holds dynamic state (activeTab)
2. **Do NOT break the Path-Container invariant** — if a node is in `path`, its container's `activeTab` MUST equal that node's ID
3. **Do NOT allow multiple root nodes in a DAG** — each dialogue must have exactly one root node (no `parent_ids`)
4. **Do NOT break Atomic Q&A Pair** — in normal flow, `user.children` has exactly 1 element and `assistant.parent_ids` has exactly 1 element
5. **Do NOT skip DAG-related tests** — run tests before and after any DAG logic changes

### Workflow Rules

- Read relevant specs in `specs/` before implementing
- Never implement without acceptance criteria
- Do not invent requirements that are not described
- Do not change behavior without updating the spec
- Code should be simple and readable — avoid overengineering

## Key Files

- `frontend/src/utils/tabSwitchHandler.ts` — Tab switch logic (constraint 1, 2)
- `frontend/src/utils/tabsContainerBuilder.ts` — Tabs container builder (constraint 1)
- `frontend/src/utils/pathBuilder.ts` — Path builder (constraint 2)
- `frontend/src/utils/dagBuilder.ts` — DAG builder (constraint 3, 4)
- `backend/api/routes/chat.py` — Backend DAG logic (constraint 3, 4)

## Constraints

This IS the constraints spec. See individual specs for domain-specific constraints.

## References

- [120-dag-structure](./120-dag-structure.md) — Path-Container invariant details
- [130-model-service-factory](./130-model-service-factory.md) — New provider checklist
- [220-testing](./220-testing.md) — Test execution requirements
