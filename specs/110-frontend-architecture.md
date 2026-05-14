---
name: frontend-architecture
spec-id: "110"
version: 1.0
status: active
last-updated: 2026-05-14
related-specs:
  - "120-dag-structure"
---

# Frontend Architecture

## Overview

The frontend uses React 19 with hooks for state management, TypeScript for type safety, and i18next for internationalization. DAG-specific frontend logic is documented separately in [120-dag-structure](./120-dag-structure.md).

## Details

### Main Structure

- `App.tsx`: Root component with `ToastProvider` context
- `Sidebar.tsx`: Navigation and dialogue list with collapsible state

### Custom Hooks (`src/hooks/`)

- `useChat.ts`: Re-exports combined chat functionality from `chat/` subdirectory
  - `chat/index.ts`: Composition hook combining 4 sub-hooks with MiniMax deep-thinking auto-toggle and citation cleanup on dialogue switch
- `useDialogues.ts`: Dialogue list management with retry/exponential backoff, custom event listeners (`dialogueCreated`/`titleUpdated`/`dialogueUpdated`), and incremental model info updates with top-sorting
- `chat/`: Modular hooks organized by concern
  - `index.ts`: Combines all chat hooks into single `useChat` API
  - `useChatSettings.ts`: Chat settings (deep thinking, search, branching state)
  - `useChatMessages.ts`: Message management and API interactions
  - `useDialogueManagement.ts`: Dialogue selection and creation
  - `useModelSelection.ts`: Model selection logic

### Components (`src/components/`)

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

### Contexts (`src/contexts/`)

- `ToastContext.tsx`: Toast notification system

### i18n (`src/i18n/`)

Uses i18next with react-i18next, static JSON imports; i18next-http-backend is installed for future extensibility.

- `config.ts`: i18next configuration
- `locales/en.json`: English translations
- `locales/zh.json`: Chinese translations

### API Config (`src/config/`)

- `api.ts`: API endpoint definitions and URL builder utilities

### Styles (`src/styles/`)

CSS files organized by component (App, Sidebar, Chat, Markdown, etc.)

## Key Files

- `frontend/src/App.tsx` — Root component
- `frontend/src/components/Sidebar.tsx` — Navigation
- `frontend/src/hooks/useChat.ts` — Chat hook entry point
- `frontend/src/hooks/useDialogues.ts` — Dialogue management
- `frontend/src/config/api.ts` — API endpoints
- `frontend/src/i18n/config.ts` — i18n configuration

## Constraints

None specific to this spec. DAG-related components are covered in [120-dag-structure](./120-dag-structure.md).

## References

- [120-dag-structure](./120-dag-structure.md) — DAG-specific frontend architecture
- [130-model-service-factory](./130-model-service-factory.md) — Model selection context
