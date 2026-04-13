# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Author** is an AI-assisted creative writing platform. It's a Next.js single-page app with an Electron desktop wrapper and optional CloudBase (腾讯云开发) cloud sync. The codebase is entirely JavaScript (no TypeScript). Comments and UI strings are primarily in Chinese.

## Commands

```bash
# Development
npm run dev              # Next.js dev server at localhost:3000
npm run build            # Production build (standalone output)
npm run start            # Production server
npm run lint             # ESLint (eslint-config-next/core-web-vitals)

# Electron desktop
npm run electron:dev     # Dev server + Electron window
npm run electron:build   # Production build + Windows NSIS installer
npm run electron:start   # Launch Electron (requires prior build)
```

No test framework is configured. There are no unit or integration tests.

## Architecture

### Single-page App with Next.js App Router

The entire UI is a single client-side page (`app/page.js`). Next.js App Router is used only for API routes — there is no file-based page routing. All components are dynamically imported with `ssr: false`. Navigation is state-driven via Zustand.

### Key Directories

- `app/components/` — React components. The two largest are `Editor.js` (Tiptap editor with pagination, 3000+ lines) and `AiSidebar.js` (multi-turn AI chat, 3000+ lines).
- `app/lib/` — Business logic modules. The largest are `settings.js` (writing mode schemas, ~59KB), `context-engine.js` (RAG context builder, ~40KB), and `project-io.js` (multi-format import/export, ~32KB).
- `app/store/useAppStore.js` — Zustand store with auto-tracking proxy (components only re-render when accessed properties change).
- `app/api/` — Next.js API routes for AI providers, file parsing, storage, and tools.
- `app/locales/` — i18n JSON files (en, zh, ru). Custom hook `useI18n()` — no i18n library.
- `electron/` — Electron main process (`main.js`) and preload script.

### Data Flow: Local-First, Cloud-Optional

```
IndexedDB (idb-keyval)  →  Server /api/storage (self-hosted)  →  CloudBase NoSQL (cloud sync)
```

- `app/lib/persistence.js` — Unified read/write across all three backends. `persistGet()` falls through backends; `persistSet()` writes to all available backends.
- `app/lib/storage.js` — Chapter CRUD operations, delegates to persistence layer.
- `app/lib/cloudbase.js` — CloudBase SDK initialization (`@cloudbase/js-sdk`).
- `app/lib/auth.js` — CloudBase Auth wrapper (email OTP + WeChat OAuth).
- `app/lib/cloudbase-sync.js` — Cloud sync with 5-minute debounce, smart merge for multi-device conflicts. Data stored in `author-sync` collection.
- `app/lib/firebase.js` / `app/lib/firestore-sync.js` — Compatibility re-export shims (redirect to cloudbase modules).
- All data works offline in browser without any server or cloud.

### AI Provider Architecture

Multiple AI providers are supported through separate API routes:

| Route | Provider |
|---|---|
| `/api/ai` | OpenAI-compatible (ZhipuAI, DeepSeek, SiliconFlow, Moonshot, etc.) |
| `/api/ai/claude` | Anthropic Claude (native API) |
| `/api/ai/gemini` | Google Gemini (native API) |
| `/api/ai/responses` | OpenAI Responses API |

Provider selection logic is in `app/page.js` (`handleInlineAiRequest`) and `app/components/AiSidebar.js`. The provider type from `apiConfig.providerType` determines which endpoint to call. All routes return SSE streams with `data: {"text": "..."}` chunks.

API key rotation is handled by `app/lib/keyRotator.js` — supports comma-separated key pools for rate limit distribution.

### Context Engine (RAG)

`app/lib/context-engine.js` builds AI system prompts by assembling context from:
- Writing rules and project settings
- Current chapter content
- Character/worldbuilding/plot settings
- Other chapter summaries
- Chat history

Context is prioritized and trimmed to fit within token budgets. Optional vector embeddings (`app/lib/embeddings.js`) enable RAG-based settings retrieval for large projects.

### Editor System

The editor is built on Tiptap v3 with custom extensions:
- `MathExtension.js` — KaTeX math rendering
- `PageBreakExtension.js` — WYSIWYG A4 pagination
- `SearchHighlightExtension.js` — Find/replace
- `SlashCommands.js` — `/` command menu for AI actions
- `GhostMark.js` — Streaming AI text preview ("ghost text")

### Settings System

`app/lib/settings.js` defines three writing modes (`webnovel`, `traditional`, `screenplay`) each with structured settings categories (characters, worldbuilding, plot, etc.). Settings are stored per-project in IndexedDB with a tree-node structure.

### Path Aliases

`@/*` maps to project root (configured in `jsconfig.json`).

## Environment Configuration

Copy `.env.example` to `.env.local`. Key variable groups:
- `API_KEY` / `API_BASE_URL` / `API_MODEL` — OpenAI-compatible providers
- `GEMINI_API_KEY` / `GEMINI_BASE_URL` / `GEMINI_MODEL` — Google Gemini
- `CLAUDE_API_KEY` / `CLAUDE_BASE_URL` / `CLAUDE_MODEL` — Anthropic Claude
- `NEXT_PUBLIC_CLOUDBASE_ENV_ID` / `NEXT_PUBLIC_CLOUDBASE_REGION` / `NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY` — CloudBase cloud sync (all optional)

App-level settings (configured via UI) take priority over env vars.

## Deployment

- **Vercel**: Standard Next.js deployment (no cloud sync without CloudBase config)
- **Docker**: `Dockerfile` + `docker-compose.yml` with Caddy reverse proxy; server-side storage via `/api/storage`
- **Electron**: GitHub Actions builds Windows NSIS installer on `v*` tags, published to GitHub Releases with auto-updater
