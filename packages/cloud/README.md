# Hands Cloud Architecture

> **Status:** Spec / Design Document
> **Last Updated:** 2024-12

This document defines the cloud infrastructure for Hands workbooks.

---

## Overview

Hands Cloud provides:
1. **Identity & Billing** - User accounts, subscriptions, usage metering
2. **AI Gateway** - Proxied AI requests with per-user tracking via CF AI Gateway
3. **Published Workbooks** - Deploy workbooks to edge with isolated D1 databases
4. **OAuth Broker** - Central OAuth apps for integrations (Google, Slack, Salesforce, etc.)
5. **Multiplayer** - Real-time collaboration on workbooks (future)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HANDS CLOUD                                     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    CENTRAL SERVICES (CF Workers)                        │ │
│  │                                                                          │ │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐ │ │
│  │   │   Auth API   │    │  Billing API │    │     OAuth Broker         │ │ │
│  │   │  (tRPC)      │    │   (Stripe)   │    │  (Google, Slack, etc.)   │ │ │
│  │   └──────┬───────┘    └──────┬───────┘    └────────────┬─────────────┘ │ │
│  │          │                   │                         │               │ │
│  │          └───────────────────┴─────────────────────────┘               │ │
│  │                              │                                          │ │
│  │                    ┌─────────▼─────────┐                               │ │
│  │                    │  Central Postgres │  (Neon via Hyperdrive)        │ │
│  │                    │  - users          │                               │ │
│  │                    │  - subscriptions  │                               │ │
│  │                    │  - usage_daily    │                               │ │
│  │                    │  - oauth_tokens   │                               │ │
│  │                    │  - workbook_index │                               │ │
│  │                    └───────────────────┘                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     CF AI GATEWAY                                       │ │
│  │                                                                          │ │
│  │   Desktop/Web ──► AI Gateway ──► Anthropic/OpenAI/Google                │ │
│  │                      │                                                   │ │
│  │              cf-aig-metadata:                                           │ │
│  │              { "userId": "xxx", "workbookId": "yyy" }                   │ │
│  │                      │                                                   │ │
│  │              Analytics API ──► Usage aggregation ──► Central Postgres   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   PUBLISHED WORKBOOKS (per-workbook D1)                 │ │
│  │                                                                          │ │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │ │
│  │   │  Workbook A     │  │  Workbook B     │  │  Workbook C     │        │ │
│  │   │  (D1 Database)  │  │  (D1 Database)  │  │  (D1 Database)  │        │ │
│  │   │                 │  │                 │  │                 │        │ │
│  │   │  User Tables:   │  │  User Tables:   │  │  User Tables:   │        │ │
│  │   │  - customers    │  │  - products     │  │  - metrics      │        │ │
│  │   │  - orders       │  │  - inventory    │  │  - events       │        │ │
│  │   │                 │  │                 │  │                 │        │ │
│  │   │  _hands Tables: │  │  _hands Tables: │  │  _hands Tables: │        │ │
│  │   │  - _hands_meta  │  │  - _hands_meta  │  │  - _hands_meta  │        │ │
│  │   │  - _hands_acl   │  │  - _hands_acl   │  │  - _hands_acl   │        │ │
│  │   │  - _hands_sync  │  │  - _hands_sync  │  │  - _hands_sync  │        │ │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘        │ │
│  │                                                                          │ │
│  │   Each workbook Worker validates requests against Central Postgres      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Central Postgres Schema

All cross-workbook data lives in a single Postgres database (Neon), accessed via Hyperdrive.

```sql
-- Users (source of truth for identity)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  avatar_url    TEXT,
  stripe_customer_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions (Stripe-synced)
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL,
  status                TEXT NOT NULL,  -- active, canceled, past_due
  plan                  TEXT NOT NULL,  -- free, pro, team
  included_tokens       INTEGER NOT NULL DEFAULT 500000,
  current_period_start  TIMESTAMPTZ NOT NULL,
  current_period_end    TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usage (daily aggregates from CF AI Gateway)
CREATE TABLE usage_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  tokens_input    BIGINT NOT NULL DEFAULT 0,
  tokens_output   BIGINT NOT NULL DEFAULT 0,
  requests        INTEGER NOT NULL DEFAULT 0,
  cost_cents      INTEGER NOT NULL DEFAULT 0,  -- estimated cost
  UNIQUE(user_id, date)
);

-- OAuth Connections (central broker)
CREATE TABLE oauth_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,  -- google, slack, salesforce, github, etc.
  access_token    TEXT NOT NULL,  -- encrypted
  refresh_token   TEXT,           -- encrypted
  expires_at      TIMESTAMPTZ,
  scopes          JSONB,
  account_email   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Workbook Registry (index of all published workbooks)
CREATE TABLE workbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,  -- url slug
  name            TEXT NOT NULL,

  -- D1 binding info
  d1_database_id  TEXT,           -- CF D1 database ID
  worker_name     TEXT,           -- CF Worker name
  worker_url      TEXT,           -- deployed URL

  -- Settings
  is_public       BOOLEAN NOT NULL DEFAULT false,

  deployed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workbook Collaborators (who can access each workbook)
-- Roles (Google Docs style):
--   viewer     - Read-only access to published workbook
--   editor     - Can edit data via edit routes (CRUD on user tables)
--   developer  - Can edit workbook source (pages, blocks, schema)
--   owner      - Full access, can manage collaborators, delete workbook
CREATE TABLE workbook_collaborators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id     UUID NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'developer', 'owner')),
  invited_by      UUID REFERENCES users(id),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workbook_id, user_id)
);

-- Git repositories for workbook source
CREATE TABLE workbook_repos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id     UUID NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE UNIQUE,

  -- Git remote info
  remote_url      TEXT NOT NULL,  -- e.g., https://git.hands.app/user/workbook.git
  default_branch  TEXT NOT NULL DEFAULT 'main',

  -- Latest commit info
  head_sha        TEXT,
  head_message    TEXT,
  head_author     TEXT,
  head_at         TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Per-Workbook D1 Schema

Each published workbook gets its own D1 database. User tables are whatever the workbook defines. Hands injects `_hands_*` tables for internal coordination.

```sql
-- =============================================================================
-- USER TABLES (defined by workbook author)
-- =============================================================================
-- Examples: customers, orders, products, etc.
-- These are synced from the local PGlite on publish.

-- =============================================================================
-- _HANDS INTERNAL TABLES (injected by Hands)
-- =============================================================================

-- Workbook metadata
CREATE TABLE _hands_meta (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL  -- unix timestamp
);
-- Keys: 'workbook_id', 'owner_id', 'schema_version', 'last_sync', etc.

-- Access control cache (synced from central Postgres)
CREATE TABLE _hands_acl (
  user_id         TEXT PRIMARY KEY,  -- UUID as text
  role            TEXT NOT NULL,     -- owner, editor, viewer
  permissions     TEXT NOT NULL,     -- JSON array of permissions
  synced_at       INTEGER NOT NULL   -- unix timestamp
);
-- Cached from central workbook_collaborators table
-- Refreshed on each request or via TTL

-- Sync state (for local ↔ cloud sync)
CREATE TABLE _hands_sync (
  table_name      TEXT NOT NULL,
  row_id          TEXT NOT NULL,
  version         INTEGER NOT NULL,
  checksum        TEXT NOT NULL,
  synced_at       INTEGER NOT NULL,
  PRIMARY KEY (table_name, row_id)
);

-- Operation log (for multiplayer/CRDT)
CREATE TABLE _hands_ops (
  id              TEXT PRIMARY KEY,  -- ULID for ordering
  user_id         TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  row_id          TEXT,
  op_type         TEXT NOT NULL,     -- insert, update, delete
  op_data         TEXT NOT NULL,     -- JSON patch or full row
  created_at      INTEGER NOT NULL,  -- unix timestamp
  applied         INTEGER NOT NULL DEFAULT 0
);
-- Used for:
-- 1. Conflict resolution in sync
-- 2. Undo/redo history
-- 3. Real-time collaboration (future)

-- Sessions (for multiplayer presence)
CREATE TABLE _hands_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  cursor_state    TEXT,              -- JSON: { page, selection, etc. }
  last_seen       INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);
```

---

## Auth Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Desktop   │         │  Cloud API  │         │   Google    │
│    App      │         │  (Worker)   │         │   OAuth     │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  1. Start OAuth       │                       │
       │  (PKCE challenge)     │                       │
       ├──────────────────────►│                       │
       │                       │                       │
       │  2. Auth URL          │                       │
       │◄──────────────────────┤                       │
       │                       │                       │
       │  3. Open browser ─────────────────────────────►
       │                       │                       │
       │                       │  4. User authenticates│
       │                       │◄──────────────────────┤
       │                       │                       │
       │  5. Redirect: hands://oauth?code=xxx          │
       │◄──────────────────────┤                       │
       │                       │                       │
       │  6. Exchange code     │                       │
       │  (with PKCE verifier) │                       │
       ├──────────────────────►│                       │
       │                       │                       │
       │  7. JWT + refresh     │                       │
       │◄──────────────────────┤                       │
       │                       │                       │
       │  Store in keychain    │                       │
       │                       │                       │
```

**Token format:**
- Access token: JWT, 7-day expiry, contains `{ sub, email, name }`
- Refresh token: opaque, 30-day expiry, stored in Postgres

---

## AI Gateway Integration

We use **Cloudflare AI Gateway** (not a custom proxy) for:
- Routing to providers (Anthropic, OpenAI, Google)
- Caching identical requests
- Rate limiting
- Analytics & usage tracking

**Request flow:**
```
Desktop App
    │
    │  POST /ai/v1/messages
    │  Authorization: Bearer <jwt>
    │
    ▼
Cloud API Worker
    │
    │  1. Validate JWT
    │  2. Check subscription/quota
    │  3. Add metadata header
    │
    ▼
CF AI Gateway
    │
    │  cf-aig-metadata: { "userId": "xxx", "workbookId": "yyy" }
    │
    ▼
Anthropic/OpenAI/Google
    │
    ▼
Response streams back

(Async) CF AI Gateway Analytics API
    │
    │  Query usage by userId metadata
    │
    ▼
Cron job aggregates → usage_daily table
```

**Why CF AI Gateway?**
- Free caching saves money
- Built-in analytics with custom metadata
- Rate limiting per gateway
- We just add `userId` to track per-user usage

---

## Published Workbook Flow

```
Local Development                    Publish                         Production
┌─────────────────┐                     │                     ┌─────────────────┐
│  Desktop App    │                     │                     │  CF Worker      │
│  + PGlite       │                     │                     │  + D1           │
│                 │                     │                     │                 │
│  User tables    │ ────── sync ───────►│                     │  User tables    │
│  (customers,    │                     │                     │  (customers,    │
│   orders, etc.) │                     │                     │   orders, etc.) │
│                 │                     │                     │                 │
│  No _hands_*    │                     │                     │  + _hands_meta  │
│  tables locally │                     │                     │  + _hands_acl   │
└─────────────────┘                     │                     │  + _hands_sync  │
                                        │                     │  + _hands_ops   │
                                        │                     └─────────────────┘
                                        │
                              Central Postgres
                              - workbooks registry
                              - workbook_collaborators
```

**On publish:**
1. Desktop sends workbook schema + data to Cloud API
2. Cloud API creates/updates D1 database for workbook
3. Cloud API deploys Worker with D1 binding
4. Cloud API registers workbook in central Postgres
5. `_hands_*` tables are created in D1

**On request to published workbook:**
1. Worker receives request with JWT
2. Worker checks `_hands_acl` cache in D1
3. If cache miss/expired, queries central Postgres via Hyperdrive
4. Validates permission, serves request

---

## Multiplayer / Collaboration (Future)

**Phase 1: Async collaboration**
- `_hands_ops` table logs all changes
- Sync on reconnect, merge via last-write-wins or CRDT

**Phase 2: Real-time presence**
- `_hands_sessions` tracks active users
- Durable Objects for WebSocket connections
- Broadcast cursor positions, selections

**Phase 3: Real-time sync**
- Durable Object per workbook for coordination
- Operations broadcast to all connected clients
- Conflict resolution via operational transforms or CRDT

---

## API Structure

```
/health                    GET   Health check
/trpc/*                    ALL   tRPC API

tRPC Routers:
├── auth
│   ├── startOAuth         Start OAuth flow (returns URL)
│   ├── exchangeCode       Exchange code for tokens
│   ├── refresh            Refresh access token
│   ├── me                 Get current user
│   └── logout             Logout
│
├── billing
│   ├── subscription       Get current subscription
│   ├── usage              Get current period usage
│   ├── checkout           Create Stripe checkout session
│   └── portal             Get Stripe billing portal URL
│
├── workbooks
│   ├── list               List user's workbooks
│   ├── get                Get workbook details
│   ├── create             Register new workbook
│   ├── publish            Publish/update workbook
│   ├── unpublish          Take workbook offline
│   └── delete             Delete workbook
│
├── collaborators
│   ├── list               List workbook collaborators
│   ├── invite             Invite collaborator
│   ├── updateRole         Change collaborator role
│   └── remove             Remove collaborator
│
├── oauth
│   ├── providers          List available providers
│   ├── connections        List user's connections
│   ├── connect            Start OAuth for integration
│   ├── disconnect         Remove integration
│   └── getToken           Get access token for provider
│
└── usage
    ├── summary            Usage summary for period
    ├── daily              Daily usage breakdown
    └── byModel            Usage by AI model

/ai/v1/messages            POST  AI gateway proxy (validates, adds metadata, forwards to CF AI Gateway)
/webhooks/stripe           POST  Stripe webhook handler
```

---

## Environment & Secrets

**wrangler.jsonc bindings:**
```jsonc
{
  "name": "hands-cloud",
  "compatibility_date": "2025-12-01",

  // Hyperdrive for Postgres
  "hyperdrive": [{
    "binding": "DB",
    "id": "<hyperdrive-config-id>"
  }],

  // AI Gateway
  "ai": {
    "binding": "AI"
  },

  "vars": {
    "APP_URL": "https://hands.app",
    "API_URL": "https://api.hands.app",
    "AI_GATEWAY_ID": "<ai-gateway-id>"
  }
}
```

**Secrets (via `wrangler secret put`):**
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
AUTH_SECRET           # JWT signing key
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
DATABASE_URL          # Neon connection string (for Hyperdrive)
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Central Postgres schema (Neon)
- [ ] Hyperdrive configuration
- [ ] Auth flow (Google OAuth + JWT)
- [ ] Basic tRPC API

### Phase 2: AI Gateway
- [ ] CF AI Gateway setup
- [ ] Proxy endpoint with JWT validation
- [ ] Metadata injection (userId)
- [ ] Usage aggregation cron

### Phase 3: Billing
- [ ] Stripe integration
- [ ] Subscription management
- [ ] Usage-based billing
- [ ] Billing portal

### Phase 4: Published Workbooks
- [ ] Workbook registry in Postgres
- [ ] D1 per-workbook provisioning
- [ ] `_hands_*` table injection
- [ ] Worker deployment pipeline

### Phase 5: OAuth Broker
- [ ] Google (Drive, Sheets, Gmail)
- [ ] Slack
- [ ] GitHub
- [ ] Salesforce, QuickBooks, Shopify

### Phase 6: Collaboration
- [ ] `_hands_ops` logging
- [ ] Sync protocol
- [ ] Real-time presence (Durable Objects)

---

## Open Questions

1. **D1 provisioning**: How do we dynamically create D1 databases per workbook? May need CF API.

2. **Worker deployment**: How do we deploy per-workbook Workers? Wrangler API or CF API?

3. **Sync protocol**: What's the conflict resolution strategy for local ↔ cloud sync?

4. **AI Gateway billing**: Do we query CF Analytics API or implement our own logging?

5. **Multi-tenant vs multi-database**: Is D1-per-workbook the right isolation model, or should we use row-level security in a shared D1?

---

## References

- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [Neon Serverless Driver](https://neon.tech/docs/serverless/serverless-driver)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Stripe Usage-Based Billing](https://stripe.com/docs/billing/subscriptions/usage-based)
