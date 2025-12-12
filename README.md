# Hands

A desktop application for AI-powered data analysis and custom
application development, built with Tauri and React.

## Quickstart

```bash
bun install
rustup update stable
rustup default stable   # rustc 1.83 or newer required

# Must build docs before launching the app
cd docs
bun install
bun run build

mkdir -p packages/desktop/src-tauri/resources/opencode

bun run dev:desktop     # Run desktop app
bun run typecheck       # Type check all packages
bun run build:desktop   # Build for production
```

## Project Structure

```
packages/
├── desktop/     # Tauri + React desktop app (port 1420)
├── agent/       # OpenCode AI server (port 55300)
├── runtime/     # Workbook runtime with embedded PostgreSQL
├── editor/      # Plate.js rich text editor
├── stdlib/      # Shared components & data sources
└── cli/         # Command-line interface
```

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, Framer Motion
- **Desktop**: Tauri 2.x (Rust backend)
- **State**: TanStack Query (server state), Zustand (UI state)
- **Editor**: Plate.js
- **Database**: PGlite (embedded PostgreSQL)
- **AI**: OpenCode SDK

## Architecture

### Desktop App (`packages/desktop/`)

- Main application: React frontend using TanStack Router
- Tauri Rust backend for workbook management and process spawning
- Real-time updates via server-sent events

### OpenCode (`packages/agent/`)

- Runs on port 55300 as a Tauri subprocess
- Custom AI agents defined in `.opencode/agent/*.md`
- Provides typed SDK client for all AI interactions

### Workbook Runtime (`packages/runtime/`)

Each workbook is built on a shared backend that can be run locally
(using workerd/pglite) or deployed to Cloudflare Workers. It includes:

- Its own Hono HTTP server
- Embedded PGlite database
- React Server Components for blocks and pages

## Ports

| Port  | Service                    |
|-------|----------------------------|
| 1420  | Vite dev server (UI)       |
| 55000 | Workbook runtime           |
| 55100 | PGlite database            |
| 55300 | OpenCode agent server      |
