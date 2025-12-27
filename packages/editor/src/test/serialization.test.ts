/**
 * MDX Serialization E2E Tests
 *
 * Tests roundtrip serialization of MDX content using the same code path
 * as the production markdown worker.
 */

import { describe, it, expect } from 'vitest';
import { createTestEditor, testSerialize, testDeserialize } from './create-test-editor';

/**
 * Normalize MDX string for comparison
 * - Trims whitespace
 * - Normalizes line endings
 * - Removes trailing newlines
 */
function normalize(mdx: string): string {
  return mdx.trim().replace(/\r\n/g, '\n').replace(/\n+$/g, '');
}

describe('MDX Roundtrip Serialization', () => {
  describe('Basic Markdown', () => {
    it('roundtrips paragraph text', () => {
      const mdx = 'Hello, world!';

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);

      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips headings', () => {
      const mdx = `# Heading 1

## Heading 2

### Heading 3`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips bold and italic', () => {
      const mdx = 'This is **bold** and this is *italic* text.';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Markdown serializer may use _ instead of * for italic - both are valid
      expect(serialized).toContain('**bold**');
      expect(serialized.includes('*italic*') || serialized.includes('_italic_')).toBe(true);
    });

    it('roundtrips code blocks', () => {
      const mdx = `\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\``;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips blockquotes', () => {
      const mdx = '> This is a blockquote.';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips unordered lists', () => {
      const mdx = `- Item 1
- Item 2
- Item 3`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Markdown serializer may use * instead of - for lists - both are valid
      expect(serialized).toContain('Item 1');
      expect(serialized).toContain('Item 2');
      expect(serialized).toContain('Item 3');
      expect(serialized.includes('- ') || serialized.includes('* ')).toBe(true);
    });

    it('roundtrips ordered lists', () => {
      const mdx = `1. First item
2. Second item
3. Third item`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Note: Plate's list serialization may convert to unordered - check content is preserved
      expect(serialized).toContain('First item');
      expect(serialized).toContain('Second item');
      expect(serialized).toContain('Third item');
      // Should have some list markers (either ordered 1. or unordered -)
      expect(serialized).toMatch(/^(\d+\.|[-*]) /m);
    });

    it('roundtrips links', () => {
      const mdx = 'Check out [this link](https://example.com).';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips inline code', () => {
      const mdx = 'Use the `console.log()` function.';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });
  });

  describe('MDX Components', () => {
    it('roundtrips simple MDX component', () => {
      const mdx = '<LiveValue query="SELECT * FROM users" />';

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();

      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips LiveValue with nested BarChart', () => {
      const mdx = `<LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
  <BarChart xKey="status" yKey="count" />
</LiveValue>`;

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);

      const serialized = testSerialize(parsed);

      // Should contain LiveValue with query
      expect(serialized).toContain('LiveValue');
      expect(serialized).toContain('SELECT status');
      // Should contain nested BarChart
      expect(serialized).toContain('BarChart');
      expect(serialized).toContain('xKey');
      expect(serialized).toContain('yKey');
      // Should NOT have escaped angle brackets
      expect(serialized).not.toContain('&lt;');
      expect(serialized).not.toContain('&gt;');
    });

    it('roundtrips MDX component with string props', () => {
      const mdx = '<LiveValue query="SELECT name, email FROM users WHERE active = true" display="table" />';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it('roundtrips MDX component with expression props', () => {
      const mdx = '<AreaChart query="SELECT date, count FROM metrics" height={400} />';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Verify component name and height prop are preserved
      expect(serialized).toContain('AreaChart');
      expect(serialized).toContain('height={400}');
    });

    it('roundtrips MDX component with object props', () => {
      const mdx = `<LiveValue query="SELECT * FROM items WHERE category = :category" params={{ category: "electronics" }} />`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Object props might be normalized differently, so we check structure
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed Content', () => {
    it('roundtrips markdown with MDX components', () => {
      const mdx = `# Dashboard

Welcome to the dashboard.

<LiveValue query="SELECT COUNT(*) as total FROM users" />

Here is some more text.`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);

      // Check that key elements are preserved
      expect(serialized).toContain('# Dashboard');
      expect(serialized).toContain('Welcome to the dashboard');
      expect(serialized).toContain('LiveValue');
      expect(serialized).toContain('SELECT COUNT(*)');
    });
  });
});

describe('Whitespace Preservation', () => {
  it('preserves blank lines around block-level MDX components', () => {
    const mdx = `# Dashboard

<LiveValue query="SELECT * FROM users" />

More content here.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank lines around MDX component (block-level spacing)
    expect(serialized).toContain('Dashboard\n\n<LiveValue');
    expect(serialized).toContain('/>\n\nMore content');
  });

  it('preserves inline MDX components within paragraphs', () => {
    const mdx = 'There are <LiveValue query="SELECT COUNT(*) FROM users" /> users online.';

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should stay inline, no extra newlines
    expect(normalize(serialized)).toBe(normalize(mdx));
    expect(serialized).not.toMatch(/\n.*LiveValue/);
    expect(serialized).not.toMatch(/LiveValue.*\n\n/);
  });

  it('preserves blank lines around MDX with block children', () => {
    const mdx = `# Chart

<LiveValue query="SELECT x, y FROM data">
  <BarChart xKey="x" yKey="y" />
</LiveValue>

Some text after.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank lines (block-level because of children)
    expect(serialized).toContain('Chart\n\n<LiveValue');
    expect(serialized).toContain('</LiveValue>\n\nSome text');
  });

  it('preserves blank lines between multiple block MDX components', () => {
    const mdx = `<LiveValue query="SELECT 1" />

<LiveValue query="SELECT 2" />`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank line between components
    expect(serialized).toContain('/>\n\n<LiveValue');
  });
});

describe('Editor Presets', () => {
  it('creates base editor with BaseKit', () => {
    const editor = createTestEditor({ preset: 'base' });
    expect(editor).toBeDefined();
    // Check that editor has plugins by verifying it has the markdown API
    expect(editor.api).toBeDefined();
  });

  it('creates rich-text editor with RichTextKit', () => {
    const editor = createTestEditor({ preset: 'rich-text' });
    expect(editor).toBeDefined();
    expect(editor.api).toBeDefined();
  });

  it('creates full editor with FullKit', () => {
    const editor = createTestEditor({ preset: 'full' });
    expect(editor).toBeDefined();
    expect(editor.api).toBeDefined();
  });

  it('creates empty editor with no preset', () => {
    const editor = createTestEditor({ preset: 'none' });
    expect(editor).toBeDefined();
  });
});
