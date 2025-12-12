# ✋ Hands

> In the future, you will share a Hands workbook before you share a GDoc, Notion doc or anything else for most things in a business.

This page summarizes core concepts and the ongoing development roadmap for Hands: a local-first, codeless ADE for data workbooks, business apps, and internal tools. Hands aims to empower users to build and collaborate on data-driven notebooks and applications that run locally or on the edge.

---

## Vision

Almost all business process problems that can be solved by software can be modelled using SaaS primitives. Our goal is to put the power of these primitives of common SaaS workflows (standard ui, ETL jobs, etc...) and IDEs (coding agents, runtimes, type checkers, dbs) in the hands of everyday people.

Thus, Hands wants to be **an app builder that feels like your notebook**: a fully capable IDE, scalable web app framework and runtime in the form factor of an simple, collaborative note taking app.

Design Decisions:

- **Agent manages user**: At the start of any task, often the bottleneck is the lack of clear intent from the user to fully express an action, even on small operations like "import a file" as these daisy chain into longer term user goals quickly. At the cost of immediate latency / predictability, we want to put the agent in between operations between the User -> Workbook in order to clarify intent by having the agent take the first stab and show the user its work. We beleive users observing an agent and intervening is a much faster way to identify true intent and get to global maximum.
- **Local-first, deployable anywhere**: Local first is super important, as often the person empowered to make change at an organization is one that has a unique access to enoguh data, motiation, competence and authority to really improve a process
- **Everything as code, but you never see code**: We think code is the best way to codify intent and to help agents reason about process, but we never want the user to see any bstraction.

---

## Key Architecture & Components

### Workbooks

The central artifact, a block-based editor comprising a collection of `Blocks` and `Sources` connected to an isolated embedded Postgres instance (one per Workbook). Stored as a Git repository in `~/.hands/<workbookID>`, with full history and structure defined in a `hands.json`. Compiled and deployable anywhere serverless functions can run (local, private cloud, or serverless platform). Default is Cloudflare workers.

#### Blocks

Serverless functions that query for data and return RSC (React Server Components) Partials. Refreshable and modular, they handle both UI and data/query logic. Typically installed from stdlib and shaped via AI agents.

#### Sources

Define schemas, secret dependencies, transformation logic, and scheduling. Support jobs—background or scheduled data processes. Created by library install (`hands add source <name>`), customized via agent.

#### Database

Embedded Postgres per workbook (using PGlite). Imports handled by agents; direct data writing supported.

**Packages:**

- [`@hands/runtime`](./packages/runtime/) — Dev server, build pipeline, PGlite database management, RSC build system, source/job scheduling, Cloudflare Workers deployment
- [`@hands/cli`](./packages/cli/) — User-facing CLI (`hands dev`, `hands build`, `hands new`, `hands add source`)
- [`@hands/editor`](./packages/editor/) — WYSIWYG structural editor with Plate.js, AST manipulation, surgical code mutations, RSC sandbox rendering
- [`@hands/stdlib`](./packages/stdlib/) — Pre-built block templates, source definitions, 50+ Radix UI-based components

---

### AI Agents

OpenCode-based AI agents power workbook operations—clarifying intent, generating code, and managing imports.

**Packages:**

- [`@hands/agent`](./packages/agent/) — Agent server with `hands` (main), `coder`, and `import` agents. Tools for database queries, schema inspection, source management, component discovery, secrets, and navigation.

---

### Desktop App

Native desktop application for macOS/Windows/Linux with integrated editor, chat interface, and real-time RSC rendering.

**Packages:**

- [`@hands/desktop`](./packages/desktop/) — Tauri-based native app with React 19, TanStack Router, integrated `@hands/editor`, AI chat interface, hot reload
