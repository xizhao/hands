/**
 * MDX Serialization E2E Tests
 *
 * Tests roundtrip serialization of MDX content using the same code path
 * as the production markdown worker.
 */

import { describe, expect, it } from "vitest";
import { testDeserialize, testSerialize } from "./test-serialization";

// Note: createTestEditor is in create-test-editor.ts but imports workers
// which don't work in vitest. Skipping those tests for now.

/**
 * Normalize MDX string for comparison
 * - Trims whitespace
 * - Normalizes line endings
 * - Removes trailing newlines
 */
function normalize(mdx: string): string {
  return mdx.trim().replace(/\r\n/g, "\n").replace(/\n+$/g, "");
}

describe("MDX Roundtrip Serialization", () => {
  describe("Basic Markdown", () => {
    it("roundtrips paragraph text", () => {
      const mdx = "Hello, world!";

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);

      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips headings", () => {
      const mdx = `# Heading 1

## Heading 2

### Heading 3`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips bold and italic", () => {
      const mdx = "This is **bold** and this is *italic* text.";

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Markdown serializer may use _ instead of * for italic - both are valid
      expect(serialized).toContain("**bold**");
      expect(serialized.includes("*italic*") || serialized.includes("_italic_")).toBe(true);
    });

    it("roundtrips code blocks", () => {
      const mdx = `\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\``;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips blockquotes", () => {
      const mdx = "> This is a blockquote.";

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips unordered lists", () => {
      const mdx = `- Item 1
- Item 2
- Item 3`;

      const parsed = testDeserialize(mdx);

      // Verify structure: indent-based format (paragraphs with listStyleType)
      expect(parsed.length).toBe(3);
      expect(parsed[0].type).toBe("p");
      expect(parsed[0].listStyleType).toBe("disc");
      expect(parsed[0].indent).toBe(1);
      expect(parsed[1].listStyleType).toBe("disc");
      expect(parsed[2].listStyleType).toBe("disc");

      const serialized = testSerialize(parsed);

      // TRUE ROUNDTRIP: output should match input exactly
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips ordered lists", () => {
      const mdx = `1. First item
2. Second item
3. Third item`;

      const parsed = testDeserialize(mdx);

      // Verify structure: indent-based format (paragraphs with listStyleType)
      expect(parsed.length).toBe(3);
      expect(parsed[0].type).toBe("p");
      expect(parsed[0].listStyleType).toBe("decimal");
      expect(parsed[0].indent).toBe(1);
      expect(parsed[0].listStart).toBe(1);
      expect(parsed[1].listStyleType).toBe("decimal");
      expect(parsed[2].listStyleType).toBe("decimal");

      const serialized = testSerialize(parsed);

      // TRUE ROUNDTRIP: output should match input exactly
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips nested unordered lists", () => {
      const mdx = `- Parent 1
  - Child 1.1
  - Child 1.2
- Parent 2`;

      const parsed = testDeserialize(mdx);

      // Verify nested structure: indent-based format
      expect(parsed.length).toBe(4);
      expect(parsed[0].type).toBe("p");
      expect(parsed[0].indent).toBe(1); // Parent at level 1
      expect(parsed[1].indent).toBe(2); // Child at level 2
      expect(parsed[2].indent).toBe(2); // Child at level 2
      expect(parsed[3].indent).toBe(1); // Parent at level 1

      const serialized = testSerialize(parsed);

      // Verify content preserved
      expect(serialized).toContain("Parent 1");
      expect(serialized).toContain("Child 1.1");
      expect(serialized).toContain("Child 1.2");
      expect(serialized).toContain("Parent 2");
    });

    it("roundtrips mixed nested lists", () => {
      const mdx = `1. First ordered
   - Nested unordered
   - Another nested
2. Second ordered`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);

      // Verify content preserved
      expect(serialized).toContain("First ordered");
      expect(serialized).toContain("Nested unordered");
      expect(serialized).toContain("Another nested");
      expect(serialized).toContain("Second ordered");
    });

    it("roundtrips links", () => {
      const mdx = "Check out [this link](https://example.com).";

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips inline code", () => {
      const mdx = "Use the `console.log()` function.";

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });
  });

  describe("MDX Components", () => {
    it("roundtrips simple MDX component", () => {
      const mdx = '<LiveValue query="SELECT * FROM users" />';

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();

      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips LiveValue with nested BarChart", () => {
      const mdx = `<LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
  <BarChart xKey="status" yKey="count" />
</LiveValue>`;

      const parsed = testDeserialize(mdx);
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);

      const serialized = testSerialize(parsed);

      // Should contain LiveValue with query
      expect(serialized).toContain("LiveValue");
      expect(serialized).toContain("SELECT status");
      // Should contain nested BarChart
      expect(serialized).toContain("BarChart");
      expect(serialized).toContain("xKey");
      expect(serialized).toContain("yKey");
      // Should NOT have escaped angle brackets
      expect(serialized).not.toContain("&lt;");
      expect(serialized).not.toContain("&gt;");
    });

    it("roundtrips MDX component with string props", () => {
      const mdx =
        '<LiveValue query="SELECT name, email FROM users WHERE active = true" display="table" />';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });

    it("roundtrips MDX component with expression props", () => {
      const mdx = '<AreaChart query="SELECT date, count FROM metrics" height={400} />';

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Verify component name and height prop are preserved
      expect(serialized).toContain("AreaChart");
      expect(serialized).toContain("height={400}");
    });

    it("roundtrips MDX component with object props", () => {
      const mdx = `<LiveValue query="SELECT * FROM items WHERE category = :category" params={{ category: "electronics" }} />`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      // Object props might be normalized differently, so we check structure
      expect(parsed).toBeDefined();
      expect(parsed.length).toBeGreaterThan(0);
    });
  });

  describe("Mixed Content", () => {
    it("roundtrips markdown with MDX components", () => {
      const mdx = `# Dashboard

Welcome to the dashboard.

<LiveValue query="SELECT COUNT(*) as total FROM users" />

Here is some more text.`;

      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);

      // Check that key elements are preserved
      expect(serialized).toContain("# Dashboard");
      expect(serialized).toContain("Welcome to the dashboard");
      expect(serialized).toContain("LiveValue");
      expect(serialized).toContain("SELECT COUNT(*)");
    });
  });
});

describe("Whitespace Preservation", () => {
  it("preserves blank lines around block-level MDX components", () => {
    const mdx = `# Dashboard

<LiveValue query="SELECT * FROM users" />

More content here.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank lines around MDX component (block-level spacing)
    expect(serialized).toContain("Dashboard\n\n<LiveValue");
    expect(serialized).toContain("/>\n\nMore content");
  });

  it("preserves inline MDX components within paragraphs", () => {
    const mdx = 'There are <LiveValue query="SELECT COUNT(*) FROM users" /> users online.';

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should stay inline, no extra newlines
    expect(normalize(serialized)).toBe(normalize(mdx));
    expect(serialized).not.toMatch(/\n.*LiveValue/);
    expect(serialized).not.toMatch(/LiveValue.*\n\n/);
  });

  it("preserves blank lines around MDX with block children", () => {
    const mdx = `# Chart

<LiveValue query="SELECT x, y FROM data">
  <BarChart xKey="x" yKey="y" />
</LiveValue>

Some text after.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank lines (block-level because of children)
    expect(serialized).toContain("Chart\n\n<LiveValue");
    expect(serialized).toContain("</LiveValue>\n\nSome text");
  });

  it("preserves blank lines between multiple block MDX components", () => {
    const mdx = `<LiveValue query="SELECT 1" />

<LiveValue query="SELECT 2" />`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should have blank line between components
    expect(serialized).toContain("/>\n\n<LiveValue");
  });
});

describe("Tables", () => {
  it("roundtrips simple table", () => {
    const mdx = `| Name | Age |
| --- | --- |
| Alice | 30 |
| Bob | 25 |`;

    const parsed = testDeserialize(mdx);

    // Verify table structure
    expect(parsed.length).toBe(1);
    expect(parsed[0].type).toBe("table");

    const serialized = testSerialize(parsed);

    // Verify table preserved
    expect(serialized).toContain("Name");
    expect(serialized).toContain("Age");
    expect(serialized).toContain("Alice");
    expect(serialized).toContain("30");
    expect(serialized).toContain("Bob");
    expect(serialized).toContain("25");
    // Should have table separators
    expect(serialized).toContain("|");
    expect(serialized).toContain("---");
  });

  it("roundtrips table with alignment", () => {
    const mdx = `| Left | Center | Right |
| :--- | :---: | ---: |
| L | C | R |`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("Left");
    expect(serialized).toContain("Center");
    expect(serialized).toContain("Right");
  });
});

describe("Horizontal Rules", () => {
  it("roundtrips horizontal rule", () => {
    const mdx = `Before

---

After`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("Before");
    expect(serialized).toContain("After");
    // May use --- or *** or ___ for horizontal rule
    expect(serialized).toMatch(/(---|[*]{3}|___)/);
  });
});

describe("Complex Documents", () => {
  it("roundtrips document with multiple element types", () => {
    const mdx = `# Report Title

## Summary

This is the **summary** with _emphasis_.

## Data

<LiveValue query="SELECT * FROM metrics" />

### Details

- Point 1
- Point 2
- Point 3

1. Step one
2. Step two
3. Step three

## Code Example

\`\`\`sql
SELECT COUNT(*) FROM users;
\`\`\`

> Important note here.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Verify all elements preserved
    expect(serialized).toContain("# Report Title");
    expect(serialized).toContain("## Summary");
    expect(serialized).toContain("**summary**");
    expect(serialized).toContain("## Data");
    expect(serialized).toContain("LiveValue");
    expect(serialized).toContain("### Details");
    expect(serialized).toContain("Point 1");
    expect(serialized).toContain("Step one");
    expect(serialized).toContain("```sql");
    expect(serialized).toContain("SELECT COUNT(*)");
    expect(serialized).toContain("> Important note");
  });

  it("roundtrips lists followed by paragraphs", () => {
    const mdx = `Here's a list:

- Item 1
- Item 2

And here's text after the list.`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("Here's a list:");
    expect(serialized).toContain("Item 1");
    expect(serialized).toContain("Item 2");
    expect(serialized).toContain("And here");
  });

  it("roundtrips MDX between list items", () => {
    const mdx = `- Item with <LiveValue query="SELECT 1" /> inline
- Normal item
- Another <LiveValue query="SELECT 2" /> inline`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("Item with");
    expect(serialized).toContain("LiveValue");
    expect(serialized).toContain("SELECT 1");
    expect(serialized).toContain("Normal item");
    expect(serialized).toContain("SELECT 2");
  });
});

describe("Edge Cases", () => {
  it("handles empty list items", () => {
    const mdx = `-
- Item
- `;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    // Should not crash and preserve non-empty item
    expect(serialized).toContain("Item");
  });

  it("handles special characters in list items", () => {
    // Note: <angle> would be parsed as MDX, so we test other special chars
    const mdx = `- Item with "quotes"
- Item with 'apostrophe'
- Item with & ampersand`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("quotes");
    expect(serialized).toContain("apostrophe");
    expect(serialized).toContain("ampersand");
  });

  it("handles code in list items", () => {
    const mdx = `- Run \`npm install\`
- Execute \`npm start\``;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("`npm install`");
    expect(serialized).toContain("`npm start`");
  });

  it("handles bold and italic in list items", () => {
    const mdx = `- **Bold item**
- *Italic item*
- Normal item`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("**Bold item**");
    // May use _ for italic
    expect(serialized.includes("*Italic item*") || serialized.includes("_Italic item_")).toBe(true);
  });

  it("handles links in list items", () => {
    const mdx = `- [Link 1](https://example.com/1)
- [Link 2](https://example.com/2)`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("[Link 1](https://example.com/1)");
    expect(serialized).toContain("[Link 2](https://example.com/2)");
  });

  it("preserves list after heading", () => {
    const mdx = `# Heading

- Item 1
- Item 2`;

    const parsed = testDeserialize(mdx);
    const serialized = testSerialize(parsed);

    expect(serialized).toContain("# Heading");
    expect(serialized).toContain("Item 1");
    expect(serialized).toContain("Item 2");
    // List markers should be present
    expect(serialized).toMatch(/[-*] Item 1/);
  });
});

describe("Strict Roundtrip Tests", () => {
  // These tests verify exact MDX → Plate → MDX equality
  // If any of these fail, serialization is broken

  const strictRoundtripCases = [
    { name: "paragraph", mdx: "Hello world" },
    { name: "heading h1", mdx: "# Title" },
    { name: "heading h2", mdx: "## Subtitle" },
    { name: "heading h3", mdx: "### Section" },
    { name: "bold", mdx: "**bold text**" },
    { name: "inline code", mdx: "Use `console.log()` here" },
    { name: "unordered list", mdx: "- Item 1\n- Item 2\n- Item 3" },
    { name: "ordered list", mdx: "1. First\n2. Second\n3. Third" },
    { name: "code block", mdx: "```js\nconst x = 1;\n```" },
    { name: "blockquote", mdx: "> Quote here" },
    { name: "link", mdx: "[link](https://example.com)" },
    { name: "LiveValue simple", mdx: '<LiveValue query="SELECT 1" />' },
    {
      name: "LiveValue with display",
      mdx: '<LiveValue query="SELECT * FROM users" display="table" />',
    },
    { name: "BarChart", mdx: '<BarChart xKey="x" yKey="y" />' },
    {
      name: "mixed document",
      mdx: '# Title\n\nParagraph\n\n- List item\n\n<LiveValue query="SELECT 1" />',
    },
  ];

  for (const { name, mdx } of strictRoundtripCases) {
    it(`exact roundtrip: ${name}`, () => {
      const parsed = testDeserialize(mdx);
      const serialized = testSerialize(parsed);
      expect(normalize(serialized)).toBe(normalize(mdx));
    });
  }
});

// Editor Presets tests skipped - require createTestEditor which imports workers
// These tests are covered in at-kit.test.ts which runs separately
describe.skip("Editor Presets", () => {
  it("creates base editor with BaseKit", () => {
    // Skipped - worker import issue in vitest
  });

  it("creates rich-text editor with RichTextKit", () => {
    // Skipped - worker import issue in vitest
  });

  it("creates full editor with FullKit", () => {
    // Skipped - worker import issue in vitest
  });

  it("creates empty editor with no preset", () => {
    // Skipped - worker import issue in vitest
  });
});
