---
name: dag-structure
spec-id: "120"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "010-constitution"
  - "100-backend-architecture"
  - "110-frontend-architecture"
  - "220-testing"
---

# DAG Structure — Core Concept & Frontend Implementation

## Overview

DAG-chat's key innovation is its DAG-based conversation structure. This spec covers both the core DAG
concepts (backend data model) and the complete frontend DAG architecture (types, utilities, rendering,
tab switching). These are merged into one spec because they are tightly coupled and cross-reference
each other heavily.

## Details

### Core Concepts

**Single Root Node Constraint**:
While general DAG structures can have multiple root nodes, each dialogue's DAG has exactly one root
node:

- **Root node characteristics**: Has `children` but no `parent_ids`
- **Root node identity**: The user's first question in the dialogue, forming the initial Q&A pair
- **Enforcement**: This single-root constraint ensures a coherent conversation history with a clear entry point

**Atomic Q&A Pair**:
In normal operation (excluding interruption scenarios), a user question and its corresponding LLM response form a logically indivisible Q&A pair:

- **user.message.children**: Contains exactly one element — the `assistant.message.id`
- **assistant.message.parent_ids**: Contains exactly one element — the `user.message.id`

**DAG Relationships**:

- **parent_ids**: User messages reference parent assistant message IDs (can be multiple for merging)
- **children**: Assistant messages link to child user messages (can be multiple for branching)
- **Branching**: Multiple user questions can share the same parent assistant message (one-to-many)
- **Merging**: One user question can have multiple parent assistant messages (many-to-one)

**Key Backend Functions** (in `backend/api/routes/chat.py`):

- `build_dag_from_parents()`: BFS traversal to build SubDAG from parent_ids
- `topological_sort_subdag()`: Kahn's algorithm with chain-preservation for message ordering
- `build_history_from_parent_ids()`: Constructs LLM API history from DAG

See `backend/tests/README.md` for detailed test scenarios.

### Frontend DAG Types (`src/types/index.ts`, re-exported via `src/types/dag.ts`)

- **DagNode**: Single message node with bidirectional references
  - `id`, `content`, `role` ('user' | 'assistant')
  - `parent_ids`: Array of parent node IDs
  - `children`: Array of child node references
  - `dag`: Reference to the parent DAG object

- **Dag**: Complete DAG structure
  - `nodes`: Map<string, DagNode>
  - `rootId`: Single root node ID

- **ChildrenTabsContainer**: Manages multiple user branches sharing the same assistant parent
  - `assistantMessageId`, `userMessages[]`, `activeTab`

- **ParentTabsContainer**: Manages multiple assistant messages pointing to the same user (merge point)
  - `userMessageId`, `assistantMessages[]`, `activeTab`

- **MessageToTabsMap**: `Map<string, string[]>` — O(1) lookup for container IDs per message
  - Only stores static structural relationships, NOT dynamic state
  - tabsMap is NEVER rebuilt on tab clicks

- **ConversationPath**: `DagNode[]` — Linear path from root to leaf

### Frontend DAG Utilities (`src/utils/`)

- **dagUtils.ts**: Unified re-export layer — the single import point
- **dagBuilder.ts**: `buildDag(messages)` — Constructs DAG from flat message list
- **tabsContainerBuilder.ts**: `buildTabsContainers(dag)` — Identifies branch/merge points
- **pathBuilder.ts**: Path construction (buildPath, buildPathToRoot, buildPathToLeaf)
- **tabSwitchHandler.ts**: `handleTabSwitch()` — Tab click event handling
- **dialogueStateManager.ts**: `DialogueStateManager` — Per-dialogue state caching
- **conversationDag.ts**: Standalone DagNode type for component-level rendering
- **incrementallyUpdateDag.ts**: Incremental updates during streaming
- **dagHelpers.ts**: Helper functions (e.g., `getAllBranchingPoints`)
- **apiError.ts**: API error resolution for backend SSE error codes

### Rendering Strategy (`src/components/ChatContainer.tsx`)

1. Build DAG from messages → Build TabsContainers → Build initial Path
2. Render by iterating through Path nodes
3. For each node, check MessageToTabsMap for container IDs
4. ChildrenTabsContainer rendered BEFORE its user messages
5. ParentTabsContainer rendered AFTER its assistant messages

### Path-Container Strict Consistency

> **Invariant**: If a path contains a node, the corresponding Container's `activeTab` must equal that node's ID.

**Three-layer defense**:

1. **Rendering-time Degradation** (`ChatContainer.tsx`): Forces activeTab correction on inconsistency
2. **Strict Sync on Tab Switch** (`tabSwitchHandler.ts`): Rebuilds path after sync instructions
3. **Validation on State Restoration** (`ChatContainer.tsx`): Validates cached state, rebuilds if inconsistent

### Tab Switch Strategies

- **ChildrenTabsContainer Switch** (branch selection): Preserve prefix, DFS from selected user node to leaf
- **ParentTabsContainer Switch** (merge source selection): DFS upward to root, then downward to leaf, rebuild entire path

### Multi-Dialogue Path Caching

`DialogueStateManager` stores `dag`, `tabsMap`, and `path` per dialogueId, enabling instant UI restoration and preserving tab selections across dialogue switches.

## Key Files

- `frontend/src/types/index.ts` — Core DAG type definitions
- `frontend/src/types/dag.ts` — DAG type re-exports
- `frontend/src/utils/dagBuilder.ts` — DAG construction
- `frontend/src/utils/tabsContainerBuilder.ts` — Container builder
- `frontend/src/utils/pathBuilder.ts` — Path construction
- `frontend/src/utils/tabSwitchHandler.ts` — Tab switching logic
- `frontend/src/utils/incrementallyUpdateDag.ts` — Streaming updates
- `frontend/src/components/ChatContainer.tsx` — Main rendering logic
- `frontend/src/components/TabsContainer.tsx` — Tab container component
- `frontend/src/components/ConversationBranchTabs.tsx` — Branch tabs UI
- `backend/api/routes/chat.py` — Backend DAG logic
- `backend/tests/test_dag_chat.py` — DAG tests

## Constraints

1. tabsMap is static — NEVER rebuild on tab clicks
2. Path-Container invariant MUST hold at all times
3. Single root node per dialogue
4. Atomic Q&A Pair must be preserved in normal flow
5. Always run DAG tests before and after changes

## References

- [010-constitution](./010-constitution.md) — Hard constraints (these are derived from this spec)
- [100-backend-architecture](./100-backend-architecture.md) — Backend structure
- [110-frontend-architecture](./110-frontend-architecture.md) — General frontend structure
- [220-testing](./220-testing.md) — DAG test details
