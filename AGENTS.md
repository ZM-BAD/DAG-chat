# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

DAG-chat is a web-based LLM Q&A application that organizes conversations in a DAG (Directed Acyclic Graph) structure, providing more flexible conversation logic than traditional linear chat interfaces.

**Tech Stack:**
- **Backend**: Python 3.14+ with FastAPI, MongoDB, and MySQL
- **Frontend**: React 19 with TypeScript, Vite, and i18next for internationalization (Node.js 24+)

## Development Commands

### Backend
```bash
# Activate virtual environment (run from backend/ directory)
source ../.venv/bin/activate

# Install dependencies
cd backend && pip install -r requirements.txt

# Run the API server (default port: 8000)
cd backend && python3 run_api.py

# Run all tests
cd backend && python tests/run_all_tests.py

# Run specific test file
cd backend && python tests/test_dag_chat.py

# Run tests with pytest
cd backend && python -m pytest tests/test_dag_chat.py -v
```

### Frontend
```bash
# Install dependencies
cd frontend && npm install --legacy-peer-deps

# Start development server (default port: 3000)
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Preview production build
cd frontend && npm run preview

# Lint code
cd frontend && npm run lint

# Lint and fix
cd frontend && npm run lint:fix

# Format code
cd frontend && npm run format

# Check formatting
cd frontend && npm run format:check

# Check i18n key synchronization
cd frontend && npm run i18n:check
```

### Quick Start (Both Services)
```bash
# Start both frontend and backend
./start.sh --all

# Start only frontend
./start.sh --frontend

# Start only backend
./start.sh --backend

# Stop all services
./start.sh --stop
```

### Docker Compose Topology (for reference)
- MongoDB:27018, MySQL:3307 (host ports; containers listen on standard 27017/3306 internally)
- Backend:8000, Frontend:3000→80 (nginx)
- Backend and frontend both read root `.env`
- Requires Docker >= 29, Docker Compose >= v5

## Architecture

### Backend Architecture

The backend uses a modular architecture with the following key components:

**Database Layer** (`backend/database/`):
- `mongodb_connection.py`: MongoDB operations for message storage and DAG structure
- `mysql_connection.py`: MySQL operations for user/dialogue metadata

**API Layer** (`backend/api/`):
- `main.py`: FastAPI application setup with CORS middleware
- `router.py`: API router aggregation
- `routes/`: Route handlers organized by feature
  - `base.py`: Base endpoints
  - `conversation.py`: Dialogue CRUD operations
  - `chat.py`: Chat message handling and DAG logic
  - `model_service.py`: Model service management endpoints
- `services/`: LLM service implementations using factory pattern
  - `model_factory.py`: Factory for creating model service instances
  - `base_service.py`: Base class for model services
  - `glm_service.py`, `kimi_service.py`, `qwen_service.py`, `deepseek_service.py`, `minimax_service.py`, `ollama_service.py`: Specific LLM implementations

**Models** (`backend/models/`):
- `schemas.py`: Pydantic schemas for request/response validation
- `requests.py`: Request model definitions
- `error_codes.py`: Unified API error code constants

**Other Backend Files**:
- `run_api.py`: Application entry point (starts Uvicorn server with logging setup)
- `config.py`: Loads settings from environment variables (with defaults). Reference `.env.example` for all available env vars
- `logging_config.py`: Logging configuration
- `Dockerfile`: Docker build configuration

### Frontend Architecture

The frontend uses React with hooks for state management:

**Main Structure**:
- `App.tsx`: Root component with `ToastProvider` context
- `Sidebar.tsx`: Navigation and dialogue list with collapsible state

#### Frontend DAG Architecture

The frontend implements a DAG (Directed Acyclic Graph) structure to manage and render conversations with branching and merging capabilities.

**Core Types** (`src/types/index.ts`, re-exported via `src/types/dag.ts`):

- **DagNode**: Represents a single message node with bidirectional references
  - `id`: Unique message identifier
  - `content`: Message text content
  - `role`: 'user' | 'assistant'
  - `parent_ids`: Array of parent node IDs (for merging scenarios)
  - `children`: Array of child node references (for branching scenarios)
  - `dag`: Reference to the parent DAG object for traversing

- **Dag**: The complete DAG structure for a dialogue
  - `nodes`: Map<string, DagNode> - All nodes indexed by ID
  - `rootId`: The single root node ID (first user question in dialogue)

- **TabsContainer Types**:
  - `ChildrenTabsContainer`: Manages multiple user branches sharing the same assistant parent
    - `assistantMessageId`: The common parent assistant node
    - `userMessages`: Array of sibling user nodes (branches)
    - `activeTab`: Currently selected user message ID
  - `ParentTabsContainer`: Manages multiple assistant messages pointing to the same user (merge point)
    - `userMessageId`: The common child user node
    - `assistantMessages`: Array of parent assistant nodes (merge sources)
    - `activeTab`: Currently selected assistant message ID

- **MessageToTabsMap**: `Map<string, string[]>` - O(1) lookup to find which container IDs a message belongs to
  - **Key Design Principle**: tabsMap only stores static structural relationships (message → container IDs), not dynamic state (activeTab selections)
  - Container objects are looked up by ID from the containers array when needed
  - This separation ensures tabsMap never needs to be rebuilt on tab clicks

- **ConversationPath**: `DagNode[]` - Linear path from root to leaf for rendering

**Core Utilities** (`src/utils/`):

- **dagUtils.ts**: Unified re-export layer for all DAG utilities — the single import point used by components and hooks
- **dagBuilder.ts**: `buildDag(messages)` - Constructs DAG from flat message list with bidirectional references
- **tabsContainerBuilder.ts**: `buildTabsContainers(dag)` - Scans DAG to identify branch/merge points and create containers
  - `getContainersByIds(containerIds, containers)`: Looks up container objects from IDs
- **pathBuilder.ts**: Path construction utilities
  - `buildPath(dag, tabsMap, containers)`: DFS from root to leaf following activeTab selections
  - `buildPathToRoot(nodeId, dag, tabsMap, containers)`: Build path upward to root (for ParentTabsContainer switches)
  - `buildPathToLeaf(nodeId, dag, tabsMap, containers)`: Build path downward to leaf (for ChildrenTabsContainer switches)
- **tabSwitchHandler.ts**: `handleTabSwitch(containerId, newTabId, ...)` - Handles tab click events
  - ChildrenTabsContainer switch: Rebuild path suffix from selected user node downward
  - ParentTabsContainer switch: Rebuild path prefix to root, then suffix to leaf
  - Collects sync instructions to update other containers' activeTab for consistency
  - **Note**: tabsMap is NOT rebuilt on tab clicks (static relationship)
- **dialogueStateManager.ts**: `DialogueStateManager` class - Caches per-dialogue state (DAG, tabsMap, path) for instant switching
- **conversationDag.ts**: Standalone DagNode type for component-level rendering (without `children` array, uses `dag` reference for traversal). Used by `ChatMessage.tsx` and `ConversationBranchTabs.tsx`
- **incrementallyUpdateDag.ts**: Incrementally updates DAG, containers, and path during streaming responses (normal, branching, and merging scenarios)
- **dagHelpers.ts**: DAG helper functions (e.g., `getAllBranchingPoints`)
- **apiError.ts**: API error resolution utilities for backend SSE error codes. Used by `useChatMessages.ts` and `Sidebar.tsx`

**Rendering Strategy** (`src/components/ChatContainer.tsx`):

1. Build DAG from messages → Build TabsContainers → Build initial Path
2. Render by iterating through Path nodes
3. For each node, check MessageToTabsMap to get container IDs, then look up container objects
4. ChildrenTabsContainer rendered BEFORE its user messages (shows branch tabs)
5. ParentTabsContainer rendered AFTER its assistant messages (shows merge tabs)

**Key Design Decisions**:

1. **Bidirectional References**: Each DagNode has both `parent_ids` (string[]) and `children` (DagNode[]), enabling efficient traversal in both directions
2. **Container Rendering Timing**: Containers are rendered based on Path position, not DAG position. Only containers for nodes in the current path are shown.
3. **ActiveTab Synchronization**: When switching tabs, all affected containers are updated atomically to maintain Path-Container consistency
4. **Path-Driven Rendering**: The linearized Path simplifies React rendering and ensures correct message ordering
5. **Static tabsMap**: MessageToTabsMap stores container IDs (not object references) because the relationship between messages and containers is determined by DAG structure and doesn't change on tab clicks. Only the containers array holds dynamic state (activeTab).

**Path-Container Strict Consistency**:

An invariant that must be strictly enforced, ensuring rendered message content always matches the Tabs highlight state:

> **Invariant**: If a path contains a node, the corresponding Container's `activeTab` must equal that node's ID.

- **ChildrenTabsContainer**: `path.includes(userNode) → container.activeTab === userNode.id`
- **ParentTabsContainer**: `path.includes(assistantNode) → container.activeTab === assistantNode.id`

**Implementation Strategy** (three-layer defense):

1. **Rendering-time Degradation** (`ChatContainer.tsx` - Layer 1):
   - `getChildrenContainerForUser`: When `container.activeTab !== userNode.id`, returns a corrected container instead of null (forces `userNode.id` from path as activeTab)
   - `getParentContainerForAssistant`: Same logic — forces activeTab correction on inconsistency
   - **Purpose**: Prevents containers from "disappearing", ensuring users always see Tabs; prints warnings for debugging

2. **Strict Sync on Tab Switch** (`tabSwitchHandler.ts` - Layer 2):
   - `handleTabSwitch`: After applying all sync instructions, **rebuilds path** to ensure strict consistency between path and final container state
   - **Purpose**: Eliminates inconsistency at the source, ensuring `newPath`, `updatedContainers`, and `updatedTabsMap` are always consistent

3. **Validation on State Restoration** (`ChatContainer.tsx` - Layer 3):
   - When restoring `savedState`, runs `validatePathContainerConsistency` to verify path-container alignment
   - If inconsistent, rebuilds all state from scratch instead of using cached state
   - **Purpose**: Prevents cached state from polluting the current render

**Why This Matters**:

Violating this invariant causes the bug seen in user screenshots: the rendered `user.message` is A, but `children-tabs-container` highlights B (or the container "disappears" entirely). This creates a severe UX issue where displayed content does not match the Tab indicator.

**Tab Switch Strategies**:

- **ChildrenTabsContainer Switch** (branch selection):
  1. Find the assistant node position in current path
  2. Preserve path prefix [0, assistantIndex]
  3. Start from selected user node, DFS traverse to leaf following activeTab selections
  4. Concatenate prefix + suffix to form new path
  5. Collect sync instructions for containers in the new suffix path

- **ParentTabsContainer Switch** (merge source selection):
  1. Start from selected assistant node, DFS traverse UPWARD to root
  2. Then DFS traverse DOWNWARD from userMessageId to leaf
  3. Merge paths (handling duplicates at junction points)
  4. Collect sync instructions for all containers in the new path
  5. This rebuilds the entire path since merge point affects all upstream nodes

**Multi-Dialogue Path Caching**:

The `DialogueStateManager` class provides state caching per dialogue:
- Stores `dag`, `tabsMap`, and `path` for each dialogueId
- Enables instant UI restoration when switching between dialogues
- Preserves user's browsing position (activeTab selections) across dialogue switches
- Example: User views dialogue A, switches to dialogue B, returns to A → previous tab selections and scroll position are preserved

**Custom Hooks** (`src/hooks/`):
- `useChat.ts`: Re-exports combined chat functionality from `chat/` subdirectory
  - `chat/index.ts`: Composition hook combining 4 sub-hooks with MiniMax deep-thinking auto-toggle and citation cleanup on dialogue switch
- `useDialogues.ts`: Dialogue list management with retry/exponential backoff, custom event listeners (`dialogueCreated`/`titleUpdated`/`dialogueUpdated`), and incremental model info updates with top-sorting
- `chat/`: Modular hooks organized by concern
  - `index.ts`: Combines all chat hooks into single `useChat` API
  - `useChatSettings.ts`: Chat settings (deep thinking, search, branching state)
  - `useChatMessages.ts`: Message management and API interactions
  - `useDialogueManagement.ts`: Dialogue selection and creation
  - `useModelSelection.ts`: Model selection logic

**Components** (`src/components/`):
- `WelcomeScreen.tsx`: Initial screen with model selection
- `ChatContainer.tsx`: Message display area with auto-scroll
- `ChatInput.tsx`: Input area with branching support
- `ChatHeader.tsx`: Current dialogue title display
- `ChatMessage.tsx`: Individual message rendering
- `ConversationBranchTabs.tsx`: Branching UI for multiple conversation paths
- `TabsContainer.tsx`: Tab container rendering (children/parent tabs)
- `ChatScrollAnchor.tsx`: Scroll position tracking during streaming
- `EnhancedMarkdown.tsx`: Markdown rendering with syntax highlighting
- `LanguageSwitcher.tsx`: i18n language switcher
- `Toast.tsx`: Toast notification component
- `LoadingScreen.tsx`: Loading state display
- `ErrorBoundary.tsx`: React error boundary for error handling
- `common/ModelLogo.tsx`: LLM model logo display (used by ChatMessage, Sidebar, WelcomeScreen, ChatInput)

**Contexts** (`src/contexts/`):
- `ToastContext.tsx`: Toast notification system

**i18n** (`src/i18n/`):
- Configuration files for internationalization (uses i18next with react-i18next, static JSON imports; i18next-http-backend is installed for future extensibility)
  - `config.ts`: i18next configuration
  - `locales/en.json`: English translations
  - `locales/zh.json`: Chinese translations

**API Config** (`src/config/`):
- `api.ts`: API endpoint definitions and URL builder utilities

**Styles** (`src/styles/`):
- CSS files organized by component (App, Sidebar, Chat, Markdown, etc.)

## Core Concepts

### DAG (Directed Acyclic Graph) Conversation Structure

The application's key innovation is its DAG-based conversation structure.

**Single Root Node Constraint**:
While general DAG structures can have multiple root nodes (nodes with no parents), each dialogue's DAG has exactly one root node:
- **Root node characteristics**: Has `children` but no `parent_ids`
- **Root node identity**: The user's first question in the dialogue, forming the initial Q&A pair
- **Enforcement**: This single-root constraint ensures a coherent conversation history with a clear entry point

**Atomic Q&A Pair**:
In normal operation (excluding interruption scenarios), a user question and its corresponding LLM response form a logically indivisible Q&A pair—the atomic unit of the conversation:

- **user.message.children**: Contains exactly one element—the `assistant.message.id`
- **assistant.message.parent_ids**: Contains exactly one element—the `user.message.id`

**DAG Relationships**:
- **parent_ids**: User messages reference parent assistant message IDs (can be multiple for merging)
- **children**: Assistant messages link to child user messages (can be multiple for branching)
- **Branching**: Multiple user questions can share the same parent assistant message (one-to-many)
- **Merging**: One user question can have multiple parent assistant messages (many-to-one)

**Key Functions** (in `backend/api/routes/chat.py` and `backend/tests/test_dag_chat.py`):
- `build_dag_from_parents()`: BFS traversal to build SubDAG from parent_ids
- `topological_sort_subdag()`: Kahn's algorithm with chain-preservation for message ordering
- `build_history_from_parent_ids()`: Constructs LLM API history from DAG

See `backend/tests/README.md` for detailed test scenarios covering linear chains, trees, and complex DAG structures.

### Model Service Factory

The backend uses a factory pattern for LLM services:
1. Each LLM provider (GLM, Kimi, Qwen, DeepSeek, MiniMax, Ollama) extends `BaseModelService`
2. Services are registered via `@ModelFactory.register()` decorator
3. `ModelFactory.get_service(model_name)` retrieves the appropriate service

### Configuration

- **Backend**: `backend/config.py` loads settings from root `.env`. Reference `.env.example` for all available env vars (LLM keys, model overrides, MySQL, Ollama)
- **Frontend**: `vite.config.ts` reads `DEFAULT_USER_ID` from root `.env` via `loadEnv` and injects it as `import.meta.env.VITE_DEFAULT_USER_ID` via `define`. `VITE_API_BASE_URL` is read directly via `envDir: '..'`.
- **Database**: MySQL auto-initializes from `sql/t_conversations.sql` via docker-compose. For manual setup, execute the SQL file against the `dag_chat` database
- **Virtual Environment**: Located at `.venv/` in project root

## Constraints for AI Agents

When modifying code, do NOT:

1. **Rebuild tabsMap on tab clicks** — it is static; only the `containers` array holds dynamic state (activeTab)
2. **Break the Path-Container invariant** — if a node is in `path`, its container's `activeTab` MUST equal that node's ID
3. **Allow multiple root nodes in a DAG** — each dialogue must have exactly one root node (no `parent_ids`)
4. **Break Atomic Q&A Pair** — in normal flow, `user.children` has exactly 1 element and `assistant.parent_ids` has exactly 1 element
5. **Skip DAG-related tests** — run tests before and after any DAG logic changes

When adding a new LLM provider:

1. Extend `BaseModelService` in `backend/api/services/`
2. Register with `@ModelFactory.register()` in `model_factory.py`
3. Add the model name constant in `backend/config.py`
4. Add logo mapping in `frontend/src/components/common/ModelLogo.tsx`

## Code Quality

### Pre-commit Hooks
The project uses pre-commit hooks for code quality:
- **Backend**: Ruff (linting + formatting), Pylint (quality, min score: 9), pip-audit (dependency security audit), backend DAG tests
- **Frontend**: ESLint, Prettier, TypeScript compiler, npm ci check, production build verification

### Commit Message Convention
Uses conventional commits format: `<type>(<scope>): <subject>`
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- See `.gitmessage` for full template

## Database Schema

**MongoDB** (dag_chat database):
- Stores message nodes with DAG relationships
- Collection structure supports parent_ids and children tracking

**MySQL** (dag_chat database):
- User metadata and dialogue information
- Separates dialogue management from message content

## Testing

The `backend/tests/` directory contains comprehensive DAG structure tests:
- Linear conversation chains
- Tree structures (branching only)
- Complex DAGs (branching + merging)
- Edge cases (empty parent_ids, non-existent IDs, single nodes)

Run tests before making changes to DAG-related logic.
