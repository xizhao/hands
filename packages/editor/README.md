# @hands/editor

Standalone Plate-based rich text editor with MDX support. A pure UI library with no backend dependencies.

## Installation

```bash
npm install @hands/editor
# or
bun add @hands/editor
```

## Basic Usage

```typescript
import { createPlateEditor } from 'platejs/react';
import { FullKit } from '@hands/editor';

// Create editor with full plugin preset
const editor = createPlateEditor({
  plugins: [...FullKit],
});

// Deserialize MDX content
const value = editor.api.markdown.deserialize(mdxContent);

// Serialize back to MDX
const mdx = editor.api.markdown.serialize({ value });
```

## Plugin Presets

Three presets are available for different use cases:

### BaseKit
Minimal editor with basic formatting.
- Paragraphs and headings
- Bold, italic, underline, strikethrough, code
- Autoformat shortcuts
- Markdown serialization

```typescript
import { BaseKit } from '@hands/editor';
```

### RichTextKit
Full-featured text editing (includes BaseKit).
- Tables
- Bulleted, numbered, and todo lists
- Code blocks with syntax highlighting
- Callouts and toggles
- Links and mentions
- Math equations (LaTeX)
- Media embeds
- Table of contents

```typescript
import { RichTextKit } from '@hands/editor';
```

### FullKit
Complete editor with all interactive features (includes RichTextKit).
- Emoji picker
- Drag-and-drop block reordering
- Block selection
- Floating toolbar

```typescript
import { FullKit } from '@hands/editor';
```

## Custom Plugin Composition

Compose your own plugin set from individual kits:

```typescript
import {
  BasicBlocksKit,
  BasicMarksKit,
  TableKit,
  ListKit,
  MarkdownKit,
} from '@hands/editor/plugins';

const CustomKit = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...TableKit,
  ...ListKit,
  ...MarkdownKit,
];

const editor = createPlateEditor({
  plugins: CustomKit,
});
```

## AI Copilot (Optional)

Enable AI-powered text completion with the copilot factory:

```typescript
import { FullKit, createCopilotKit, EditorProvider } from '@hands/editor';

// Create tRPC adapter
const editorTrpc = {
  ai: {
    generateMdx: { mutate: (input) => trpc.ai.generateMdx.mutateAsync(input) },
    generateMdxBlock: { mutate: (input) => trpc.ai.generateMdxBlock.mutateAsync(input) },
  },
};

const copilotKit = createCopilotKit({
  trpc: editorTrpc,
  autoTrigger: false,        // Trigger on Ctrl+Space
  debounceDelay: 150,        // ms to wait before requesting
  onError: (error) => console.error(error),
  onComplete: (completion) => console.log('Received:', completion),
});

const editor = createPlateEditor({
  plugins: [...FullKit, ...copilotKit],
});
```

### CopilotConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `trpc` | `EditorTrpcClient` | required | tRPC client with AI methods |
| `autoTrigger` | `boolean` | `false` | Auto-trigger on typing |
| `debounceDelay` | `number` | `150` | Debounce delay in ms |
| `onError` | `function` | - | Error callback |
| `onComplete` | `function` | - | Completion callback |
| `getPageContext` | `function` | - | Page context for prompts |
| `tables` | `Array` | `[]` | Database tables for AI context |

## UI Components

Import UI components for building custom editor interfaces:

```typescript
import {
  MarkToolbarButton,
  TurnIntoToolbarButton,
  LinkToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@hands/editor/ui';
```

### Available Components

**Toolbar Components:**
- `MarkToolbarButton` - Toggle text marks (bold, italic, etc.)
- `TurnIntoToolbarButton` - Block type selector
- `LinkToolbarButton` - Insert/edit links
- `FontColorToolbarButton` - Text color picker
- `ToolbarGroup`, `ToolbarSeparator` - Layout helpers

**Node Renderers:**
- `ParagraphNode`, `HeadingNode`, `BlockquoteNode`
- `CodeBlockNode`, `TableNode`, `ToggleNode`
- `CalloutNode`, `LinkNode`, `MentionNode`
- And more...

**Floating Toolbar:**
- `FloatingToolbar` - Context-aware formatting toolbar
- `FloatingToolbarButtons` - Default button set

## Hooks

```typescript
import {
  useDebounce,
  useMounted,
  useCopyToClipboard,
  useMediaQuery,
  useIsTouchDevice,
  useLockScroll,
  useOnClickOutside,
} from '@hands/editor/hooks';
```

## Testing

Create test editors for unit testing:

```typescript
import { createTestEditor } from '@hands/editor/test';

describe('MDX Serialization', () => {
  it('roundtrips content', () => {
    const editor = createTestEditor({ preset: 'full' });

    const mdx = '# Hello World\n\nSome **bold** text.';
    const value = editor.api.markdown.deserialize(mdx);
    const serialized = editor.api.markdown.serialize({ value });

    expect(serialized).toContain('# Hello World');
    expect(serialized).toContain('**bold**');
  });
});
```

### Test Presets

```typescript
// Full-featured editor (default)
createTestEditor({ preset: 'full' });

// Rich text editing
createTestEditor({ preset: 'rich-text' });

// Basic formatting only
createTestEditor({ preset: 'base' });

// No plugins (custom composition)
createTestEditor({ preset: 'none', plugins: [...customPlugins] });
```

## MDX Component Support

The editor supports MDX components from `@hands/core/stdlib`:

```mdx
# Dashboard

<LiveValue query="SELECT COUNT(*) FROM users" display="table" />

<AreaChart query="SELECT date, revenue FROM sales" height={400} />

<Button onClick={handleClick}>Click me</Button>
```

For desktop-specific components (like `<Block>` or `<Prompt>`), add custom serialization rules in your application.

## Exports

| Export Path | Contents |
|-------------|----------|
| `@hands/editor` | Main exports, presets, types |
| `@hands/editor/plugins` | Individual plugin kits |
| `@hands/editor/ui` | UI components |
| `@hands/editor/hooks` | Utility hooks |
| `@hands/editor/lib` | Library utilities |
| `@hands/editor/test` | Test utilities |

## Requirements

- React 18+ or 19+
- platejs ^52.0.0
- @hands/core (workspace dependency)
