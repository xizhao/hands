# Hands - Data Analysis Desktop App

## Project Structure

```
packages/
  desktop/     # Tauri + React desktop app
    src/
      components/   # React components (Toolbar, SlidePanel, ChatMessage)
      hooks/        # React Query hooks (useSession, useWorkbook)
      lib/          # API client, utilities
      stores/       # Zustand stores (ui, theme)
    src-tauri/      # Rust backend

```

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, Framer Motion
- **Desktop**: Tauri 2.x (Rust backend)
- **State**: TanStack Query (server state)
- **AI Backend**: OpenCode server on port 4096
- **Database**: Embedded SQLite

## Key Rules

### OpenCode SDK Usage

**ALWAYS use the `@opencode-ai/sdk` client methods. NEVER use raw fetch for API calls.**

The SDK client (`OpencodeClient`) provides typed methods for all endpoints:

```typescript
// Good - use SDK
const client = getClient();
const result = await client.session.list();
const agents = await client.app.agents();
const config = await client.config.get();

// Bad - never do this
fetch("/session");
fetch("/agent");
```

Available SDK methods:

- `client.session.*` - sessions, messages, prompts, todos
- `client.app.agents()` - list all agents
- `client.provider.list()` - list providers/models
- `client.config.get/update()` - config management
- `client.tool.ids/list()` - tool management
- `client.mcp.status()` - MCP server status
- `client.global.event()` - SSE event stream

### Custom Agents

Custom agents go in `.opencode/agent/` as markdown files:

```markdown
---
description: What this agent does
mode: subagent
model: anthropic/claude-sonnet-4-20250514 # optional model override
temperature: 0.1
tools:
  write: true
  bash: true
permission:
  bash:
    "*": "allow"
---

System prompt instructions here.
```

Invoke agents with `@agent-name` in prompts.

### UI Patterns

- iOS-style chat bubbles (user right, assistant left)
- Floating toolbar with drag handle
- Thread chips for session management
- Glassmorphism styling (backdrop-blur, semi-transparent)

### Event Handling

SSE events use SDK's typed `GlobalEvent` discriminated union:

- `session.created/updated/deleted`
- `session.status`
- `message.updated/removed`
- `message.part.updated`
- `todo.updated`

### Database Architecture

- SQLite database stored at `{workbook}/.hands/workbook.db`
- Direct access via `bun:sqlite` (no external process)
- LiveValue/LiveQuery components use tRPC for data access
- SSE subscription for live query updates

### Development

- `bun run tauri:dev` - Run the desktop app in development mode
- `bun run build:sidecars` - Build the sidecar binaries (required before tauri:dev)
- Sidecars are standalone compiled binaries (no external Node/Bun required)

### File Safety

When ingesting files, the import agent must:

- NEVER modify source files
- Write temp files only to `/tmp/hands-ingest/`
