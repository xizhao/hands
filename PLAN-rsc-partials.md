# Plan: RSC Partial Rendering with "use client" Support

## Problem Statement

The current RSC implementation uses a **dummy proxy manifest** that breaks `"use client"` directive support:

```typescript
// worker-template.ts:62-66
const createClientManifest = () => new Proxy({}, {
  get(_, key) {
    return { id: key, name: key, chunks: [] };  // ← chunks is EMPTY!
  },
});
```

When `renderToReadableStream` encounters a `"use client"` component, it serializes a **client reference** in the Flight stream using this manifest. With `chunks: []`, the client has no way to load the actual client component code.

## Current Architecture

### Server Side (worker-template.ts)
- Uses `renderToReadableStream` from `react-server-dom-webpack/server.edge`
- Passes dummy manifest → Flight stream contains client refs with no chunk info

### Client Side (Two implementations)
1. **Desktop (`rsc-webpack-shim.ts`)**: Returns placeholder components that just render `children` - **no actual hydration**
2. **Editor (`webpack-shim.ts`)**: Dynamically imports from runtime dev server - **closer to correct**

## Solution: Proper Client Manifest Pipeline

### How RSC Client Components Work

1. Server sees `"use client"` directive on a component
2. Server serializes a **client reference** in Flight stream: `{"$type": "ref", "id": "/path/file.tsx#ComponentName"}`
3. Client receives Flight stream, sees client ref
4. Client's `__webpack_require__(id)` is called to load the module
5. Module is loaded, component hydrates

The key is the **manifest format**:
```typescript
{
  "Button": {
    id: "/src/components/ui/button.tsx#Button",  // Module specifier
    name: "Button",                               // Export name
    chunks: ["/src/components/ui/button.tsx"]    // Files to load
  }
}
```

## Implementation Steps

### Step 1: Generate Client Manifest at Build Time

Create `packages/runtime/src/build/manifest.ts`:

```typescript
/**
 * Scan for "use client" components and generate manifest
 */
export async function generateClientManifest(
  blocksDir: string,
  stdlibDir: string
): Promise<ClientManifest> {
  const manifest: ClientManifest = {};

  // Scan stdlib/src/registry/components for "use client" files
  const clientFiles = await findClientDirectiveFiles(stdlibDir);

  for (const file of clientFiles) {
    const exports = await extractExports(file);
    for (const exportName of exports) {
      const id = `${file}#${exportName}`;
      manifest[id] = {
        id,
        name: exportName,
        chunks: [file],  // The file path relative to runtime root
      };
    }
  }

  return manifest;
}
```

### Step 2: Modify Worker Template to Use Real Manifest

Update `worker-template.ts`:

```typescript
// Instead of dynamic proxy, import the generated manifest
import clientManifest from "./client-manifest.json";

// Use it directly
const stream = renderToReadableStream(
  React.createElement(Component, props),
  clientManifest  // Real manifest with chunk paths
);
```

### Step 3: Update Webpack Shim for Dev Mode

The editor's webpack shim already handles dynamic loading. Ensure it:

1. Parses the module ID correctly: `/path/to/file.tsx#ExportName`
2. Loads via dynamic import from runtime Vite dev server
3. Returns the correct export

```typescript
// webpack-shim.ts - already mostly correct
const webpackRequire = function (id: string) {
  const [file, exportName] = id.split('#');
  const moduleUrl = `http://localhost:${runtimePort}${file}`;

  // Dynamic import and wrap in React.lazy
  const Lazy = React.lazy(() =>
    import(moduleUrl).then(mod => ({ default: mod[exportName] }))
  );

  return { [id]: Lazy };
};
```

### Step 4: Build Pipeline Changes

Modify `buildRSC()` in `rsc.ts`:

1. Call `generateClientManifest()` during build
2. Write `client-manifest.json` to `.hands/src/`
3. Import manifest in generated `worker.tsx`

### Step 5: Alternative: Vite-Native Approach (No Manifest File)

Instead of pre-generating, use Vite's transform to inject manifest at bundle time:

```typescript
// vite.config.mts
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "worker" } }),
    redwood(),
    handsClientManifestPlugin(),  // Custom plugin
  ],
});
```

The plugin intercepts `"use client"` imports and tracks them for manifest generation.

## Architecture Decision

**Option A: Pre-generated Manifest (Simpler)**
- Generate JSON at build time
- Import in worker
- Works without modifying Vite config deeply
- Limitation: Must rebuild to pick up new client components

**Option B: Vite Plugin (More Dynamic)**
- Let rwsdk's Vite plugin handle it naturally
- Requires understanding rwsdk internals
- More "correct" but more complex

**Recommendation: Option A** - Start with pre-generated manifest for MVP. It's simpler to implement and debug. We can migrate to Option B later if needed.

## File Changes Required

1. **New file**: `packages/runtime/src/build/client-manifest.ts`
   - `generateClientManifest()` function
   - `findClientDirectiveFiles()` helper
   - `extractExports()` helper

2. **Modify**: `packages/runtime/src/build/rsc.ts`
   - Call manifest generation
   - Write `client-manifest.json`

3. **Modify**: `packages/runtime/src/build/worker-template.ts`
   - Import real manifest instead of proxy
   - Pass to `renderToReadableStream`

4. **Verify**: `packages/editor/src/rsc/webpack-shim.ts`
   - Ensure it handles the manifest format correctly
   - Test with actual `"use client"` component

5. **Verify**: `packages/desktop/src/lib/rsc-webpack-shim.ts`
   - May need to upgrade from placeholder to real loading

## Testing Plan

1. Create a test block that uses a `"use client"` component (e.g., Dialog)
2. Render via RSC endpoint
3. Verify Flight stream contains proper client reference with chunks
4. Verify client loads and hydrates the component
5. Test interactivity (click handlers, state)

## Notes

- The stdlib already has 18+ `"use client"` components (dialog, tooltip, etc.)
- These components use Radix UI primitives which require client-side JS
- Without proper client hydration, these components render but aren't interactive
- rwsdk's full-page approach doesn't directly support partials, but we're using the underlying Flight APIs which do

## References

- [RedwoodSDK RSC Blog](https://rwsdk.com/blog/react-rsc-redwoodsdk)
- [React Flight Format](https://github.com/facebook/react/tree/main/packages/react-server-dom-webpack)
- Current shim: `packages/editor/src/rsc/webpack-shim.ts`
