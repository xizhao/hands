# {{name}}

{{description}}

A Cloudflare Worker app with SSR React dashboards and shadcn/ui components.

## Structure

```
├── wrangler.toml           # App config (source of truth)
├── src/
│   ├── index.tsx           # Hono routes + SSR rendering
│   ├── components/
│   │   ├── ui/             # shadcn components
│   │   └── charts/         # Chart wrappers
│   ├── pages/Dashboard.tsx # Dashboard page
│   └── lib/
│       ├── db.ts           # PostgreSQL connection
│       ├── utils.ts        # Utilities
│       └── render.tsx      # SSR helper
├── charts/index.ts         # Chart definitions
└── components.json         # shadcn config
```

## Development

```bash
bun install
bun run dev
```

Visit http://localhost:8787

## Adding Components

```bash
bunx shadcn@latest add button
bunx shadcn@latest add table
```

## Adding Charts

Edit `charts/index.ts`:

```ts
export const charts: Chart[] = [
  {
    id: "daily-users",
    title: "Daily Active Users",
    type: "line",
    query: `SELECT date, count(*) as value FROM events GROUP BY date`,
  },
];
```

## Adding Cron Jobs

Edit `wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]
```

## Type Check

```bash
bun run typecheck
```

## Deploy

```bash
bun run deploy
```
