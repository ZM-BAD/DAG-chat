---
name: testing
spec-id: "220"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "010-constitution"
  - "120-dag-structure"
---

# Testing

## Overview

Testing strategy for the project, focused on DAG structure correctness. Tests MUST be run before and after any DAG-related logic changes.

## Details

### Backend DAG Tests (`backend/tests/`)

Comprehensive DAG structure tests covering:

- Linear conversation chains
- Tree structures (branching only)
- Complex DAGs (branching + merging)
- Edge cases (empty parent_ids, non-existent IDs, single nodes)

### Test Execution

```bash
# Run all tests
cd backend && python tests/run_all_tests.py

# Run specific test file
cd backend && python tests/test_dag_chat.py

# Run tests with pytest
cd backend && python -m pytest tests/test_dag_chat.py -v
```

See `backend/tests/README.md` for detailed test scenarios.

## Key Files

- `backend/tests/run_all_tests.py` — Test runner
- `backend/tests/test_dag_chat.py` — DAG structure tests
- `backend/tests/README.md` — Test documentation

## Constraints

Run tests before making changes to DAG-related logic.

## References

- [010-constitution](./010-constitution.md) — Must-run-tests constraint
- [120-dag-structure](./120-dag-structure.md) — DAG concepts being tested
