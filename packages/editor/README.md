# @hands/editor

A WYSIWYG block editor for React Server Components (RSC) that enables visual editing of JSX/TSX source code for the Hands runtime. Depends on the `@hands/runtime`, which has a special islands-style implementation of RSC that supports RSC-partials.

## Overview

This editor provides a bidirectional sync between:

- **TSX Source Code** — The single source of truth
- **Plate Visual Editor** — A block-based WYSIWYG editor (built on [Plate](https://platejs.org/)/Slate)

The key innovation is **source-first editing**: source code is canonical, and all visual edits translate to surgical text mutations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           @hands/editor                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    parse     ┌──────────────┐    convert   ┌────────┐ │
│  │  TSX Source  │ ──────────▶  │ EditableNode │ ──────────▶  │ Plate  │ │
│  │  (string)    │              │ AST (OXC)    │              │ Value  │ │
│  └──────────────┘              └──────────────┘              └────────┘ │
│         ▲                                                         │     │
│         │                                                         │     │
│         │  surgical mutations                    Slate operations │     │
│         │  (character-level edits)                               │     │
│         │                                                         ▼     │
│         └─────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Source as Single Source of Truth

1. **Source → Plate**: When source changes externally (e.g., from a code editor), the Plate value is overwritten
2. **Plate → Source**: Slate operations are intercepted and translated to surgical text edits

This ensures:

- Non-JSX code (imports, types, expressions) is preserved
- Source formatting is maintained
- No information loss during round-trips

## Key Modules

### `/ast` — AST Parsing & Code Generation

| File                    | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `oxc-parser.ts`         | **OXC-based TSX parser** (~100x faster than Babel). Extracts `EditableNode` tree with source locations |
| `parser.ts`             | Legacy regex-based parser (fallback for `JsxNode`)                                                     |
| `generator.ts`          | Generate JSX strings from `JsxNode` trees                                                              |
| `surgical-mutations.ts` | Apply mutations directly to source using character positions                                           |
| `slate-operations.ts`   | Convert Slate ops (`insert_node`, `remove_node`, etc.) to source edits                                 |
| `plate-diff.ts`         | Diff two Plate values to generate `SurgicalMutation[]`                                                 |

**Key Types:**

```typescript
interface EditableNode {
  id: string; // Stable ID based on structural position
  tagName: string; // 'div', 'Card', 'Button', etc.
  selfClosing: boolean;
  props: Record<string, EditableProp>;
  children: EditableNode[];
  loc: SourceLocation; // { start: number, end: number }
  openingTagLoc: SourceLocation;
  childrenLoc?: SourceLocation;
}
```

### `/plate` — Plate Editor Integration

| File                     | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `PlateVisualEditor.tsx`  | Main editor component. Wires source sync via operation interception       |
| `editor-kit.ts`          | Plate plugin bundle (basic nodes, DnD, slash commands, etc.)              |
| `surgical-converters.ts` | `sourceToPlateValueSurgical()` — converts source to Plate with stable IDs |
| `converters.ts`          | Legacy full-serialize converters (fallback)                               |
| `plate-elements.tsx`     | Standard HTML element renderers (p, h1, h2, blockquote, etc.)             |

**Plugins (`/plugins`):**
| Plugin | Purpose |
|--------|---------|
| `element-plugin.tsx` | Unified element renderer. Routes HTML to `React.createElement`, custom components to RSC |
| `source-sync-plugin.ts` | Intercepts Slate operations and syncs to source |
| `dnd-kit.tsx` | Drag-and-drop with handles |
| `block-selection-kit.tsx` | Multi-block selection |
| `slash-kit.tsx` | Slash command menu (`/`) |

### `/rsc` — React Server Components Integration

The **key hack**: Loading and rendering arbitrary React components in the editor without bundling them.

| File              | Purpose                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `client.ts`       | Fetch Flight streams from runtime, parse via `react-server-dom-webpack/client`                      |
| `webpack-shim.ts` | **THE HACK**: Shims `globalThis.__webpack_require__` to load client components from Vite dev server |
| `context.tsx`     | `RscProvider` and `useRsc()` hook for component rendering                                           |
| `types.ts`        | `RscComponentRequest`, `RscRenderResult`, `RscConfig`                                               |

#### How RSC Integration Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Editor (Browser)                                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Editor encounters <MetricCard title="Revenue" />                  │  │
│  │ 2. Calls renderComponentViaRsc() with tagName + props                │  │
│  │ 3. POST to http://localhost:55000/rsc/component                      │  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Runtime API Server (port 55000)                                      │  │
│  │ Proxies to Vite worker for RSC rendering                            │  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Vite Worker (port 55200)                                             │  │
│  │ - Renders component server-side                                      │  │
│  │ - Returns Flight stream (text/x-component)                           │  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Flight stream parsed by createFromReadableStream()                │  │
│  │ 5. Client components loaded via __webpack_require__ shim             │  │
│  │    - Shim intercepts module IDs like "/path/to/component.tsx#Button" │  │
│  │    - Loads via dynamic import from Vite: /@fs/path/to/component.tsx  │  │
│  │ 6. Rendered React element displayed in editor                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The Webpack Shim Hack (`webpack-shim.ts`):**

React's Flight client (`react-server-dom-webpack/client`) expects Webpack's module system. When the Flight stream references a `"use client"` component, it includes a module ID like `/absolute/path/to/file.tsx#ExportName`.

The shim:

1. Intercepts `__webpack_require__(id)` calls
2. Parses the module ID: `file#exportName`
3. Converts to Vite-loadable URL: `http://localhost:55000/vite-proxy/@fs/absolute/path/to/file.tsx`
4. Uses `React.lazy()` to wrap the dynamically imported component
5. Returns a module-like object that React expects

### `/scene` — Rendered Scene Graph (Future)

For visual selection and hit-testing on rendered output:

| File         | Purpose                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `capture.ts` | Walk React element tree, build `RenderedScene` with source path mappings |
| `types.ts`   | `RenderedNode`, `RenderedScene`, `IteratorContext`                       |

### `/sandbox` — Embeddable Editor

Standalone editor that can be embedded in an iframe:

```
/sandbox?blockId=myBlock&runtimePort=55000
```

Fetches block source from runtime, auto-saves on changes.

## Usage

### Basic Editor

```tsx
import { PlateVisualEditor } from "@hands/editor";
import { RscProvider } from "@hands/editor/rsc";

function MyEditor() {
  const [source, setSource] = useState(initialSource);

  return (
    <RscProvider port={55000} enabled>
      <PlateVisualEditor source={source} onSourceChange={setSource} />
    </RscProvider>
  );
}
```

### Programmatic AST Access

```tsx
import { parseSourceWithLocations, getNodeById } from "@hands/editor/ast";

const parseResult = parseSourceWithLocations(source);
const node = getNodeById(parseResult.root, "div_0.1");
console.log(node?.loc); // { start: 150, end: 280 }
```

### Surgical Mutations

```tsx
import { applySurgicalMutation } from "@hands/editor/ast";

const newSource = applySurgicalMutation(source, {
  type: "set-prop",
  nodeId: "card_0.2",
  propName: "title",
  value: "New Title",
});
```

## Design Decisions

### Why OXC Parser?

[OXC](https://github.com/oxc-project/oxc) is ~100x faster than Babel for parsing TypeScript/JSX. Since we re-parse after every edit to update source locations, speed is critical.

### Why Surgical Mutations?

Full serialization (AST → string) loses:

- Import statements and non-JSX code
- Formatting and whitespace
- Comments

Surgical mutations preserve everything by editing source at exact character positions.

### Why Route ALL Custom Components Through RSC?

The editor doesn't know what components exist ahead of time. By using RSC:

- **stdlib components** (Button, Card, MetricCard) work automatically
- **User-defined components** work automatically
- **Any React component** registered in the workbook works
- No build step needed for new components

### Path-Based vs ID-Based Operations

Slate uses **paths** (e.g., `[0, 2, 1]`) to identify nodes. Our `EditableNode` AST uses stable **IDs** (e.g., `div_0.2.1`). The mapping is straightforward since IDs encode the structural path.
