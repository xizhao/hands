# Runtime TODOs & Known Issues

## PGlite + Bun WASM Compatibility

### Current Status (Dec 2024)
- **PGlite 0.2.17**: Works with both Bun and Node.js
- **PGlite 0.3.x**: WASM errors with both Bun and Node.js

### The Problem
PGlite 0.3.x (and likely newer) has WASM compatibility issues:
```
RuntimeError: Unreachable code should not be executed
    at postgres (wasm://wasm/postgres.wasm...)
```

This affects:
- Bun (all versions tested)
- Node.js via tsx (tested with Node 20+)

### Relevant GitHub Issues

1. **Primary Issue - Bun WASM compatibility**
   https://github.com/electric-sql/pglite/issues/478
   - Opened: Oct 2024
   - Status: Open
   - Workaround attempted: Embedding WASM with `with { type: "file" }` - didn't work

2. **Related - Bun bundle issues**
   https://github.com/electric-sql/pglite/issues/195
   - Bun bundler compatibility

3. **WASM loading in different environments**
   https://github.com/electric-sql/pglite/issues/380
   - General WASM loading issues across runtimes

### Current Workaround
Pin to PGlite 0.2.17:
```json
{
  "dependencies": {
    "@electric-sql/pglite": "0.2.17"
  }
}
```

### What to Check When Revisiting

1. Test PGlite 0.3.x+ with Bun:
   ```bash
   bun add @electric-sql/pglite@latest
   bun run src/index.ts --workbook-id=test --workbook-dir=/tmp/test
   ```

2. Check if issue #478 is closed/fixed

3. Test the embedded WASM workaround again if Bun has been updated:
   ```typescript
   // @ts-expect-error Bun-specific import
   import wasmPath from "./pglite.wasm" with { type: "file" }
   const wasmModule = await WebAssembly.compile(await Bun.file(wasmPath).arrayBuffer())
   const db = await PGlite.create(dataDir, { wasmModule })
   ```

### Version Matrix

| PGlite | Bun | Node/tsx | Status |
|--------|-----|----------|--------|
| 0.2.17 | OK  | OK       | Current |
| 0.3.14 | FAIL | FAIL    | WASM error |
| 0.3.x  | FAIL | FAIL    | WASM error |

### Files Affected
- `packages/runtime/package.json` - PGlite version pinned
- `packages/runtime/src/build/rsc.ts` - Generated package.json also uses 0.2.17
- `packages/runtime/src/index.ts` - Uses PGlite directly

---

## Future Improvements

### Switch to Neon/D1 for Simpler Architecture
Consider replacing PGlite with:
- **Neon Serverless** - Postgres over HTTP, no WASM needed
- **Cloudflare D1** - SQLite, native to Workers
- **Turso/libSQL** - SQLite with sync

Benefits:
- No WASM compatibility issues
- Smaller bundle size
- Better for production deployment

### RedwoodSDK Integration
The runtime is being refactored to be a thin wrapper over RedwoodSDK.
See: `.claude/plans/rippling-tinkering-unicorn.md`

---

## Links

- PGlite Docs: https://pglite.dev/
- PGlite GitHub: https://github.com/electric-sql/pglite
- Bun WASM Docs: https://bun.sh/docs/runtime/wasm
- RedwoodSDK: https://rwsdk.com/
