# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DAG-chat is a web-based LLM Q&A application that organizes conversations in a DAG (Directed Acyclic Graph) structure, providing more flexible conversation logic than traditional linear chat interfaces.

**Tech Stack:**
- **Backend**: Python 3.14+ with FastAPI, MongoDB, and MySQL
- **Frontend**: React 18 with TypeScript, Vite, and i18next for internationalization

## Development Commands

### Backend
```bash
# Activate virtual environment (if not active)
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
  - `glm_service.py`, `kimi_service.py`, `qwen_service.py`, `deepseek_service.py`: Specific LLM implementations

**Models** (`backend/models/`):
- Pydantic schemas for request/response validation

### Frontend Architecture

The frontend uses React with hooks for state management:

**Main Structure**:
- `App.tsx`: Root component with `ToastProvider` context
- `Sidebar.tsx`: Navigation and dialogue list with collapsible state

**Custom Hooks** (`src/hooks/`):
- `useChat.ts`: Re-exports combined chat functionality from `chat/` subdirectory
- `useDialogues.ts`: Re-exports dialogue list management
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
- `EnhancedMarkdown.tsx`: Markdown rendering with syntax highlighting
- `LanguageSwitcher.tsx`: i18n language switcher
- `Toast.tsx`: Toast notification component
- `LoadingScreen.tsx`: Loading state display
- `ErrorBoundary.tsx`: React error boundary for error handling

**Contexts** (`src/contexts/`):
- `ToastContext.tsx`: Toast notification system

**i18n** (`src/i18n/`):
- Configuration files for internationalization (uses i18next with HTTP backend)
  - `config.ts`: i18next configuration
  - `locales/en.json`: English translations
  - `locales/zh.json`: Chinese translations

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
1. Each LLM provider (GLM, Kimi, Qwen, DeepSeek) extends `BaseModelService`
2. Services are registered via `@ModelFactory.register()` decorator
3. `ModelFactory.get_service(model_name)` retrieves the appropriate service

### Configuration

- **Backend**: `backend/config.py` contains database configs and LLM API keys
- **Frontend**: `frontend/.env` for environment variables
- **Virtual Environment**: Located at `.venv/` in project root

## Code Quality

### Pre-commit Hooks
The project uses pre-commit hooks for code quality:
- **Backend**: Ruff (linting + formatting), Pylint (quality, min score: 8)
- **Frontend**: ESLint, Prettier, TypeScript compiler

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
