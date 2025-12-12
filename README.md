# ✋ Hands

> In the future, you will share a Hands workbook before you share a GDoc, Notion doc or anything else for most things in a business.

This page summarizes core concepts and the ongoing development roadmap for Hands: a local-first, codeless ADE for data workbooks, business apps, and internal tools. Hands aims to empower users to build and collaborate on data-driven notebooks and applications that run locally or on the edge.

---

### Vision

Almost all business process problems that can be solved by software can be modelled using SaaS primitives. Our goal is to put the power of these primitives of common SaaS workflows (standard ui, ETL jobs, etc...) and IDEs (coding agents, runtimes, type checkers, dbs) in the hands of everyday people.

Thus, Hands wants to be **an app builder that feels like your notebook**: a fully capable IDE, scalable web app framework and runtime in the form factor of an simple, collaborative note taking app.

Design Decisions:

- **Agent manages user**: At the start of any task, often the bottleneck is the lack of clear intent from the user to fully express an action, even on small operations like "import a file" as these daisy chain into longer term user goals quickly. At the cost of immediate latency / predictability, we want to put the agent in between operations between the User -> Workbook in order to clarify intent by having the agent take the first stab and show the user its work. We beleive users observing an agent and intervening is a much faster way to identify true intent and get to global maximum.
- **Local-first, deployable anywhere**: Local first is super important, as often the person empowered to make change at an organization is one that has a unique access to enoguh data, motiation, competence and authority to really improve a process
- **Everything as code, but you never see code**: We think code is the best way to codify intent and to help agents reason about process, but we never want the user to see any bstraction.

---

### Key Architecture & Components

#### Workbooks

- The central artifact, a block-based editor comprising a collection of _Pages_ (default landing page included).
- Stored as a Git repository in `~/.hands/<workbookID>`, with full history and structure defined in a `hands.json`.
- Compiled and deployable anywhere serverless functions can run (local, private cloud, or serverless platform). Default is Cloudflare workers.

#### Blocks

- Serverless functions that query for data nad return RSC (React Server Components) Partials, refreshable and modular.
- Handle both UI and data/query logic.
- Typically installed from stdlib and shaped via AI agents.

#### Sources

- Define schemas, secret dependencies, transformation logic, and scheduling.
- Support jobs—background or scheduled data processes.
- Created by library install (`hands add source <name>`), customized via agent.

#### Database

- Embedded Postgres per workbook (using PGlite).
- Imports handled by agents; direct data writing supported.

---

### Runtime & Editor

- **Dev Server**: Runs static checks, serves RSC functions, and manages job runners (`hands dev`).
- **Builder**: Handles static builds for deployment (`hands build`).
- **Stdlib**: Contains reusable UI components, source definitions.
- **Editor**: Block-based UI for layout and resizing, view/edit switch, real-time updates via agent, and live rendering using RSC.

---

### Packages Overview

The Hands monorepo is organized into the following packages:

#### [`@hands/runtime`](./packages/runtime/)

**Core runtime and build system**

- **Purpose**: Dev server, build pipeline, and deployment infrastructure
- **Key Features**:
  - Instant HTTP server with progressive readiness (manifest → DB → RSC)
  - Embedded PGlite database management per workbook
  - Vite-based RSC build system for React Server Components
  - Cloudflare Workers template generation for production builds
  - Block registry and manifest generation from filesystem
  - Source management and job scheduling
- **Exports**: `buildRSC`, `buildProduction`, `initWorkbookDb`, configuration utilities
- **Entry Points**: `hands-runtime` CLI, `hands-config` CLI

#### [`@hands/cli`](./packages/cli/)

**Command-line interface**

- **Purpose**: User-facing CLI commands for workbook management
- **Commands**:
  - `hands dev` - Start development server
  - `hands build` - Build workbook for production
  - `hands new <name>` - Create a new workbook
  - `hands add source <name>` - Add a source from registry
  - `hands sources` - List available sources
- **Dependencies**: `@hands/runtime` for build/dev operations

#### [`@hands/desktop`](./packages/desktop/)

**Desktop application (Tauri)**

- **Purpose**: Native desktop app for macOS/Windows/Linux
- **Key Features**:
  - Tauri-based native window with Rust backend
  - React-based UI with TanStack Router
  - Integrated block editor (uses `@hands/editor`)
  - Chat interface with AI agents
  - Workbook management and navigation
  - Real-time RSC rendering and hot reload
- **Tech Stack**: React 19, Tauri 2, Plate.js, Radix UI, Tailwind CSS

#### [`@hands/editor`](./packages/editor/)

**Block-based visual editor**

- **Purpose**: WYSIWYG structural editor for React Server Component blocks
- **Key Features**:
  - Plate.js-based rich text editor
  - AST manipulation and code generation
  - RSC component rendering via sandbox
  - Surgical code mutations (preserves formatting)
  - Slate operations for collaborative editing
- **Exports**: `useEditor` hook, AST utilities, scene management, RSC client

#### [`@hands/agent`](./packages/agent/)

**AI agent server**

- **Purpose**: OpenCode-based AI agents for workbook operations
- **Agents**:
  - `hands` - Main workbook manipulation agent
  - `coder` - Code generation and editing
  - `import` - Data import and transformation
- **Tools**: Database queries, schema inspection, source management, component discovery, secrets management, navigation
- **Integration**: Spawned as subprocess by desktop app

#### [`@hands/stdlib`](./packages/stdlib/)

**Standard library and component registry**

- **Purpose**: Reusable UI components, source definitions, and type definitions
- **Components**:
  - **UI Components**: Button, Card, Badge, DataTable, Charts (Bar, Line), and 50+ Radix UI-based components
  - **Blocks**: Pre-built block templates
  - **Sources**: Source definitions (e.g., HackerNews)
- **Exports**: Component registry, source types, RSC component server
- **Structure**: Organized by category (ui/, charts/, data/, sources/)
