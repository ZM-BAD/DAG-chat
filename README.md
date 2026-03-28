<div align="center">

<img src="frontend/public/logo.png" alt="DAG-chat Logo" width="120" />

# DAG-chat

**Conversations, Reimagined as Graphs**

[![中文文档](https://img.shields.io/badge/中文-文档-red.svg)](README_zh.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*DAG-chat is a web-based LLM conversation application that organizes dialogues as Directed Acyclic Graphs — enabling branching, merging, and non-linear exploration of ideas that linear chat interfaces simply cannot express.*

**[中文文档 / Chinese Documentation](README_zh.md)**

</div>

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>Chat Overview</b></td>
    <td align="center"><b>DAG Branching & Merging</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/chat-overview.png" alt="Chat Overview" width="480" /></td>
    <td><img src="docs/screenshots/dag-branching.png" alt="DAG Branching" width="480" /></td>
  </tr>
</table>

## Why DAG-chat?

Traditional chat applications force conversations into a single, linear thread. Once you ask a question, you're locked into that path. **DAG-chat breaks that limitation.**

| Feature | Linear Chat | DAG-chat |
|---------|:-----------:|:--------:|
| Branch from any response | ✗ | ✓ |
| Merge multiple responses | ✗ | ✓ |
| Explore alternative paths | ✗ | ✓ |
| Multi-model comparison | ✗ | ✓ |
| Non-destructive editing | ✗ | ✓ |
| Instant path switching | — | ✓ |

## Features

- **DAG Conversation Structure** — Branch and merge conversations freely. Every response is a node; every question can spawn new paths or converge existing ones.
- **Multi-LLM Support** — Seamlessly switch between GLM, Kimi, Qwen, DeepSeek, and more through a unified interface.
- **Deep Thinking Mode** — Toggle deep reasoning with expandable/collapsible thinking process display.
- **Streaming Responses** — Real-time streaming of LLM responses with interactive rendering.
- **Markdown & Code** — Rich rendering with syntax highlighting, LaTeX math, GFM tables, and emoji support.
- **Internationalization** — Full i18n support with English and Chinese.

## How It Works

Every message in DAG-chat is a **node** with bidirectional references, forming a Directed Acyclic Graph:

```
          ┌─────────┐
          │  Root Q │ (first user question)
          └────┬────┘
               │
          ┌────▼────┐
          │  Ans A  │ (assistant response)
          └────┬────┘
          ┌────┴────┬─────────┐
          │         │         │
     ┌────▼───┐ ┌───▼───┐ ┌───▼───┐
     │  Q B1  │ │ Q B2  │ │ Q B3  │  ← Branching
     └────┬───┘ └───┬───┘ └──┬────┘
          │         │        │
     ┌────▼───┐ ┌───▼───┐    │
     │ Ans C  │ │ Ans D │    │
     └────┬───┘ └───┬───┘    │
          │         │        │
          └────┬────┘        │
          ┌────▼────┐        │
          │  Q E    │◄───────┘  ← Merging
          └────┬────┘
               │
          ┌────▼────┐
          │  Ans F  │
          └─────────┘
```

- **Branching** — One assistant response can lead to multiple user follow-ups. Click a tab to switch between parallel branches.
- **Merging** — One user question can reference multiple assistant responses as parents, converging different exploration paths.
- **Non-destructive** — Switching paths never deletes anything. Every branch and merge is preserved and navigable.

## Usage

### Branching — Explore Different Directions

Not satisfied with one answer? Want to try a different angle?

1. **Hover** over any **user message** — a branch icon appears on the left
2. Click it — the **assistant message above it** is quoted in your input box
3. Type your new question and send
4. A **tab bar** appears, letting you switch between all branches

<img src="docs/screenshots/branch-hover.png" alt="Branch icon on hover" width="560" />

```
You: "Explain quicksort"
  → AI: [explanation A]        ← original path
  → You: "Use Python instead"  ← branched from the same AI reply
  → AI: [explanation B]        ← new branch
```

### Merging — Combine Multiple Insights

Want to cross-reference answers from different branches?

1. **Hover** over any **assistant message** — a merge icon appears on the right
2. Click it — the message is quoted in your input box
3. Click more merge icons to quote additional assistant messages
4. Type your follow-up question and send — all quoted messages become the context

<img src="docs/screenshots/merge-hover.png" alt="Merge icon on hover" width="560" />

```
AI: [explanation A]  ──┐
AI: [explanation B]  ──┼── You: "Compare A and B, which is better?"
AI: [explanation C]  ──┘    AI: [comparison]
```

### Quick Tips

- **Switch paths** — Click tabs above the conversation to jump between branches or merge sources
- **Non-destructive** — Branching and merging never delete anything. All paths are preserved
- **Multi-model** — Switch models mid-conversation to compare outputs from different LLMs

## Quick Start

### Prerequisites

- **Python** >= 3.14
- **Node.js** >= 22
- **MongoDB** on `localhost:27017`
- **MySQL** on `localhost:3306`

### Launch

```bash
git clone https://github.com/ZM-BAD/DAG-chat.git
cd DAG-chat

# Start both frontend and backend
./start.sh --all
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

<details>
<summary>Manual start (optional)</summary>

Backend:
```bash
source ../.venv/bin/activate
cd backend && pip install -r requirements.txt
python3 run_api.py
```

Frontend:
```bash
cd frontend && npm install --legacy-peer-deps
npm run dev
```

Stop all services: `./start.sh --stop`

</details>

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2025-present 周铭 (ZM-BAD)

---

<div align="center">

**[Report Bug](https://github.com/ZM-BAD/DAG-chat/issues) · [Request Feature](https://github.com/ZM-BAD/DAG-chat/issues) · [Contribute](https://github.com/ZM-BAD/DAG-chat/pulls)**

</div>
