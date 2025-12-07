# {{name}}

{{description}}

## Structure

- `src/` - Main worker entry point and API routes
- `monitors/` - Scheduled functions that run on cron triggers
- `charts/` - Data visualizations and query definitions
- `config/` - Configuration files

## Development

```bash
# Install dependencies
npm install

# Start local dev server (Miniflare)
npm run dev

# Initialize local D1 database
npm run db:migrate
```

## Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

This workbook runs on Cloudflare Workers with D1 (SQLite) for data storage.
