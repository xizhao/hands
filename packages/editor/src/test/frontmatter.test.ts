/**
 * Frontmatter Tests
 *
 * Tests for YAML frontmatter parsing and serialization.
 */

import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  updateFrontmatter,
  stripFrontmatter,
} from "../frontmatter";

describe("parseFrontmatter", () => {
  it("parses basic frontmatter", () => {
    const source = `---
title: Hello World
description: A test page
---

Content here`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter.title).toBe("Hello World");
    expect(result.frontmatter.description).toBe("A test page");
    expect(result.error).toBeUndefined();
  });

  it("returns empty object for no frontmatter", () => {
    const source = "Just some content";
    const result = parseFrontmatter(source);
    expect(result.frontmatter).toEqual({});
    expect(result.contentStart).toBe(0);
  });

  it("handles empty frontmatter", () => {
    const source = `---
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter).toEqual({});
  });

  it("handles multiline strings", () => {
    const source = `---
title: Test
description: |
  This is a
  multiline description
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter.description).toContain("multiline");
  });

  it("handles special characters in values", () => {
    const source = `---
title: "Quotes and colons: test"
query: SELECT * FROM users
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter.title).toBe("Quotes and colons: test");
    expect(result.frontmatter.query).toBe("SELECT * FROM users");
  });

  it("handles nested objects", () => {
    const source = `---
title: Test
meta:
  author: John
  date: 2024-01-01
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter.meta).toEqual({
      author: "John",
      date: "2024-01-01",
    });
  });

  it("handles arrays", () => {
    const source = `---
tags:
  - javascript
  - react
  - typescript
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.frontmatter.tags).toEqual(["javascript", "react", "typescript"]);
  });

  it("returns correct contentStart index", () => {
    const frontmatter = `---
title: Test
---

`;
    const content = "Content here";
    const source = frontmatter + content;

    const result = parseFrontmatter(source);
    expect(source.slice(result.contentStart)).toBe(content);
  });

  it("handles invalid YAML gracefully", () => {
    const source = `---
title: [invalid yaml
---

Content`;

    const result = parseFrontmatter(source);
    expect(result.error).toBeDefined();
  });
});

describe("serializeFrontmatter", () => {
  it("serializes basic frontmatter", () => {
    const frontmatter = { title: "Hello", description: "World" };
    const result = serializeFrontmatter(frontmatter);

    expect(result).toContain("---");
    expect(result).toContain("title: Hello");
    expect(result).toContain("description: World");
  });

  it("returns empty string for empty object", () => {
    const result = serializeFrontmatter({});
    expect(result).toBe("");
  });

  it("skips undefined values", () => {
    const frontmatter = { title: "Hello", description: undefined };
    const result = serializeFrontmatter(frontmatter);

    expect(result).toContain("title: Hello");
    expect(result).not.toContain("description");
  });

  it("handles special characters", () => {
    const frontmatter = { title: "Hello: World" };
    const result = serializeFrontmatter(frontmatter);
    // YAML should quote strings with colons
    expect(result).toContain("Hello: World");
  });

  it("ends with double newline", () => {
    const frontmatter = { title: "Test" };
    const result = serializeFrontmatter(frontmatter);
    expect(result).toMatch(/---\n\n$/);
  });
});

describe("updateFrontmatter", () => {
  it("updates existing frontmatter", () => {
    const source = `---
title: Old Title
---

Content here`;

    const result = updateFrontmatter(source, { title: "New Title" });
    expect(result).toContain("title: New Title");
    expect(result).toContain("Content here");
    expect(result).not.toContain("Old Title");
  });

  it("adds frontmatter to content without it", () => {
    const source = "Just content";
    const result = updateFrontmatter(source, { title: "New Title" });

    expect(result).toContain("---");
    expect(result).toContain("title: New Title");
    expect(result).toContain("Just content");
  });

  it("preserves content exactly", () => {
    const content = "# Heading\n\nParagraph with **bold** text.";
    const source = `---
title: Test
---

${content}`;

    const result = updateFrontmatter(source, { title: "Updated" });
    expect(result).toContain(content);
  });
});

describe("stripFrontmatter", () => {
  it("removes frontmatter from source", () => {
    const source = `---
title: Test
---

Content here`;

    const result = stripFrontmatter(source);
    expect(result).toBe("Content here");
  });

  it("returns original if no frontmatter", () => {
    const source = "Just content";
    const result = stripFrontmatter(source);
    expect(result).toBe("Just content");
  });
});

describe("roundtrip", () => {
  it("parse → serialize → parse produces same result", () => {
    const original = {
      title: "Test Page",
      description: "A description",
      tags: ["a", "b"],
    };

    const serialized = serializeFrontmatter(original);
    const parsed = parseFrontmatter(serialized + "content");

    expect(parsed.frontmatter.title).toBe(original.title);
    expect(parsed.frontmatter.description).toBe(original.description);
    expect(parsed.frontmatter.tags).toEqual(original.tags);
  });
});
