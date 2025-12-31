/**
 * Serialization Helpers Tests
 *
 * Comprehensive tests including edge cases and boundary conditions.
 */

import { describe, expect, it } from "vitest";
import {
  createContainerElement,
  createVoidElement,
  hasChildContent,
  parseAttributes,
  parseAttributesTyped,
  parseAttributeValue,
  parseExpression,
  serializeAttributes,
  serializeAttributeValue,
  serializeAttributeValueReadable,
} from "./helpers";

// ============================================================================
// parseAttributeValue Tests
// ============================================================================

describe("parseAttributeValue", () => {
  it("returns true for null (boolean attribute)", () => {
    expect(parseAttributeValue(null)).toBe(true);
  });

  it("returns true for undefined (boolean attribute)", () => {
    expect(parseAttributeValue(undefined)).toBe(true);
  });

  it("returns string for string value", () => {
    expect(parseAttributeValue("hello")).toBe("hello");
  });

  it("returns empty string for empty string", () => {
    expect(parseAttributeValue("")).toBe("");
  });

  it("parses expression with JSON object", () => {
    const result = parseAttributeValue({
      type: "mdxJsxAttributeValueExpression",
      value: '{"key": "value"}',
    });
    expect(result).toEqual({ key: "value" });
  });

  it("parses expression with JSON array", () => {
    const result = parseAttributeValue({
      type: "mdxJsxAttributeValueExpression",
      value: "[1, 2, 3]",
    });
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses expression with number", () => {
    const result = parseAttributeValue({
      type: "mdxJsxAttributeValueExpression",
      value: "42",
    });
    expect(result).toBe(42);
  });

  it("parses expression with boolean true", () => {
    const result = parseAttributeValue({
      type: "mdxJsxAttributeValueExpression",
      value: "true",
    });
    expect(result).toBe(true);
  });

  it("parses expression with boolean false", () => {
    const result = parseAttributeValue({
      type: "mdxJsxAttributeValueExpression",
      value: "false",
    });
    expect(result).toBe(false);
  });

  // Worker context: expression objects may get stringified during structured cloning
  it("parses stringified expression object (worker context)", () => {
    const stringified = JSON.stringify({
      type: "mdxJsxAttributeValueExpression",
      value: '[{ value: "a", label: "Option A" }]',
      data: { estree: { type: "Program" } }, // AST data from remark-mdx
    });
    const result = parseAttributeValue(stringified);
    expect(result).toEqual([{ value: "a", label: "Option A" }]);
  });

  it("parses stringified expression with number value", () => {
    const stringified = JSON.stringify({
      type: "mdxJsxAttributeValueExpression",
      value: "42",
    });
    const result = parseAttributeValue(stringified);
    expect(result).toBe(42);
  });

  it("returns regular string if not a stringified expression", () => {
    expect(parseAttributeValue("hello world")).toBe("hello world");
    expect(parseAttributeValue('{"other": "json"}')).toBe('{"other": "json"}');
  });
});

// ============================================================================
// parseExpression Tests
// ============================================================================

describe("parseExpression", () => {
  describe("JSON parsing", () => {
    it("parses JSON object", () => {
      expect(parseExpression('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 });
    });

    it("parses JSON array", () => {
      expect(parseExpression("[1, 2, 3]")).toEqual([1, 2, 3]);
    });

    it("parses JSON string", () => {
      expect(parseExpression('"hello"')).toBe("hello");
    });

    it("parses JSON null", () => {
      expect(parseExpression("null")).toBe(null);
    });

    it("parses nested JSON", () => {
      const result = parseExpression('{"users": [{"name": "Alice"}]}');
      expect(result).toEqual({ users: [{ name: "Alice" }] });
    });
  });

  describe("JS object syntax", () => {
    it("parses JS object with unquoted keys", () => {
      expect(parseExpression("{ value: 1, label: 2 }")).toEqual({
        value: 1,
        label: 2,
      });
    });

    it("parses array of JS objects", () => {
      const result = parseExpression(
        '[{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }]',
      );
      expect(result).toEqual([
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ]);
    });

    it("parses mixed quoted/unquoted", () => {
      expect(parseExpression('{ "quoted": 1, unquoted: 2 }')).toEqual({
        quoted: 1,
        unquoted: 2,
      });
    });
  });

  describe("primitives", () => {
    it("parses integer", () => {
      expect(parseExpression("42")).toBe(42);
    });

    it("parses negative integer", () => {
      expect(parseExpression("-42")).toBe(-42);
    });

    it("parses float", () => {
      expect(parseExpression("3.14")).toBe(3.14);
    });

    it("parses negative float", () => {
      expect(parseExpression("-3.14")).toBe(-3.14);
    });

    it("parses boolean true", () => {
      expect(parseExpression("true")).toBe(true);
    });

    it("parses boolean false", () => {
      expect(parseExpression("false")).toBe(false);
    });

    it("parses null", () => {
      expect(parseExpression("null")).toBe(null);
    });

    it("parses undefined", () => {
      expect(parseExpression("undefined")).toBe(undefined);
    });
  });

  describe("edge cases", () => {
    it("returns undefined for empty string", () => {
      expect(parseExpression("")).toBe(undefined);
    });

    it("returns undefined for whitespace", () => {
      expect(parseExpression("   ")).toBe(undefined);
    });

    it("handles whitespace around values", () => {
      expect(parseExpression("  42  ")).toBe(42);
    });

    it("returns string for unrecognized value", () => {
      expect(parseExpression("some random text")).toBe("some random text");
    });

    it("returns string for function-like syntax", () => {
      expect(parseExpression("myFunction()")).toBe("myFunction()");
    });

    it("handles special characters in strings", () => {
      expect(parseExpression('"hello\\"world"')).toBe('hello"world');
    });

    it("handles unicode", () => {
      expect(parseExpression('"日本語"')).toBe("日本語");
    });
  });
});

// ============================================================================
// parseAttributes Tests
// ============================================================================

describe("parseAttributes", () => {
  it("parses empty attributes", () => {
    expect(parseAttributes({ attributes: [] })).toEqual({});
  });

  it("parses undefined attributes", () => {
    expect(parseAttributes({})).toEqual({});
  });

  it("parses string attributes", () => {
    const result = parseAttributes({
      attributes: [
        { type: "mdxJsxAttribute", name: "query", value: "SELECT * FROM users" },
        { type: "mdxJsxAttribute", name: "display", value: "table" },
      ],
    });
    expect(result).toEqual({
      query: "SELECT * FROM users",
      display: "table",
    });
  });

  it("parses boolean attributes", () => {
    const result = parseAttributes({
      attributes: [
        { type: "mdxJsxAttribute", name: "required", value: null },
        { type: "mdxJsxAttribute", name: "disabled", value: null },
      ],
    });
    expect(result).toEqual({
      required: true,
      disabled: true,
    });
  });

  it("parses expression attributes", () => {
    const result = parseAttributes({
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "min",
          value: { type: "mdxJsxAttributeValueExpression", value: "5" },
        },
        {
          type: "mdxJsxAttribute",
          name: "options",
          value: {
            type: "mdxJsxAttributeValueExpression",
            value: '[{ value: "a", label: "A" }]',
          },
        },
      ],
    });
    expect(result).toEqual({
      min: 5,
      options: [{ value: "a", label: "A" }],
    });
  });

  it("ignores non-mdxJsxAttribute types", () => {
    const result = parseAttributes({
      attributes: [
        { type: "mdxJsxAttribute", name: "valid", value: "yes" },
        { type: "otherType", name: "invalid", value: "no" } as any,
      ],
    });
    expect(result).toEqual({ valid: "yes" });
  });
});

// ============================================================================
// parseAttributesTyped Tests
// ============================================================================

describe("parseAttributesTyped", () => {
  it("applies defaults for missing attributes", () => {
    const result = parseAttributesTyped(
      { attributes: [{ type: "mdxJsxAttribute", name: "query", value: "SELECT 1" }] },
      { query: "", display: "auto", limit: 100 },
    );
    expect(result).toEqual({
      query: "SELECT 1",
      display: "auto",
      limit: 100,
    });
  });

  it("overrides defaults with parsed values", () => {
    const result = parseAttributesTyped(
      {
        attributes: [
          { type: "mdxJsxAttribute", name: "display", value: "table" },
          {
            type: "mdxJsxAttribute",
            name: "limit",
            value: { type: "mdxJsxAttributeValueExpression", value: "50" },
          },
        ],
      },
      { query: "", display: "auto", limit: 100 },
    );
    expect(result).toEqual({
      query: "",
      display: "table",
      limit: 50,
    });
  });
});

// ============================================================================
// serializeAttributeValue Tests
// ============================================================================

describe("serializeAttributeValue", () => {
  it("returns undefined for undefined", () => {
    expect(serializeAttributeValue(undefined)).toBe(undefined);
  });

  it("returns undefined for null", () => {
    expect(serializeAttributeValue(null)).toBe(undefined);
  });

  it("returns null for true (boolean attribute)", () => {
    expect(serializeAttributeValue(true)).toBe(null);
  });

  it("returns undefined for false (omit attribute)", () => {
    expect(serializeAttributeValue(false)).toBe(undefined);
  });

  it("returns string for string", () => {
    expect(serializeAttributeValue("hello")).toBe("hello");
  });

  it("returns expression for number", () => {
    expect(serializeAttributeValue(42)).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: "42",
    });
  });

  it("returns expression for array", () => {
    expect(serializeAttributeValue([1, 2, 3])).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: "[1,2,3]",
    });
  });

  it("returns expression for object", () => {
    expect(serializeAttributeValue({ a: 1 })).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: '{"a":1}',
    });
  });
});

// ============================================================================
// serializeAttributeValueReadable Tests
// ============================================================================

describe("serializeAttributeValueReadable", () => {
  it("uses JS object syntax for array of objects", () => {
    const result = serializeAttributeValueReadable([
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
    ]);
    expect(result).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: '[{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }]',
    });
  });

  it("falls back to JSON for simple arrays", () => {
    const result = serializeAttributeValueReadable([1, 2, 3]);
    expect(result).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: "[1,2,3]",
    });
  });

  it("falls back to standard for non-arrays", () => {
    expect(serializeAttributeValueReadable("hello")).toBe("hello");
    expect(serializeAttributeValueReadable(42)).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: "42",
    });
  });
});

// ============================================================================
// serializeAttributes Tests
// ============================================================================

describe("serializeAttributes", () => {
  it("serializes simple props", () => {
    const result = serializeAttributes({ query: "SELECT 1", display: "table" });
    expect(result).toEqual([
      { type: "mdxJsxAttribute", name: "query", value: "SELECT 1" },
      { type: "mdxJsxAttribute", name: "display", value: "table" },
    ]);
  });

  it("omits undefined values", () => {
    const result = serializeAttributes({ query: "SELECT 1", display: undefined });
    expect(result).toEqual([{ type: "mdxJsxAttribute", name: "query", value: "SELECT 1" }]);
  });

  it("omits null values", () => {
    const result = serializeAttributes({ query: "SELECT 1", display: null });
    expect(result).toEqual([{ type: "mdxJsxAttribute", name: "query", value: "SELECT 1" }]);
  });

  it("omits false boolean values", () => {
    const result = serializeAttributes({ required: true, disabled: false });
    expect(result).toEqual([{ type: "mdxJsxAttribute", name: "required", value: null }]);
  });

  it("uses include option to filter and order", () => {
    const result = serializeAttributes({ c: 3, a: 1, b: 2 }, { include: ["a", "b"] });
    expect(result.map((a) => a.name)).toEqual(["a", "b"]);
  });

  it("uses exclude option to filter out keys", () => {
    const result = serializeAttributes({ a: 1, b: 2, c: 3 }, { exclude: ["b"] });
    expect(result.map((a) => a.name)).toEqual(["a", "c"]);
  });

  it("skips values that match defaults", () => {
    const result = serializeAttributes(
      { query: "SELECT 1", display: "auto" },
      { defaults: { display: "auto" } },
    );
    expect(result).toEqual([{ type: "mdxJsxAttribute", name: "query", value: "SELECT 1" }]);
  });

  it("includes values that differ from defaults", () => {
    const result = serializeAttributes(
      { query: "SELECT 1", display: "table" },
      { defaults: { display: "auto" } },
    );
    expect(result).toHaveLength(2);
  });

  it("respects readable option for array of objects", () => {
    const result = serializeAttributes(
      { options: [{ value: "a", label: "A" }] },
      { readable: true },
    );
    expect(result[0].value).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: '[{ value: "a", label: "A" }]',
    });
  });

  it("uses JSON when readable is false", () => {
    const result = serializeAttributes(
      { options: [{ value: "a", label: "A" }] },
      { readable: false },
    );
    expect(result[0].value).toEqual({
      type: "mdxJsxAttributeValueExpression",
      value: '[{"value":"a","label":"A"}]',
    });
  });
});

// ============================================================================
// hasChildContent Tests
// ============================================================================

describe("hasChildContent", () => {
  it("returns false for empty array", () => {
    expect(hasChildContent([])).toBe(false);
  });

  it("returns false for null-ish", () => {
    expect(hasChildContent(null as any)).toBe(false);
    expect(hasChildContent(undefined as any)).toBe(false);
  });

  it("returns false for single empty text node (type: text)", () => {
    expect(hasChildContent([{ type: "text", value: "" }])).toBe(false);
  });

  it("returns false for single empty text node (text property)", () => {
    expect(hasChildContent([{ text: "" }])).toBe(false);
  });

  it("returns true for text with content", () => {
    expect(hasChildContent([{ type: "text", value: "hello" }])).toBe(true);
    expect(hasChildContent([{ text: "hello" }])).toBe(true);
  });

  it("returns true for multiple children", () => {
    expect(hasChildContent([{ text: "" }, { text: "" }])).toBe(true);
  });

  it("returns true for element children", () => {
    expect(hasChildContent([{ type: "p", children: [] }])).toBe(true);
  });
});

// ============================================================================
// createVoidElement Tests
// ============================================================================

describe("createVoidElement", () => {
  it("creates element with type and empty text child", () => {
    const result = createVoidElement("metric", { value: 42, label: "Count" });
    expect(result).toEqual({
      type: "metric",
      value: 42,
      label: "Count",
      children: [{ text: "" }],
    });
  });
});

// ============================================================================
// createContainerElement Tests
// ============================================================================

describe("createContainerElement", () => {
  it("creates element with provided children", () => {
    const children = [{ type: "p", children: [{ text: "Hello" }] }];
    const result = createContainerElement("card", { variant: "default" }, children);
    expect(result).toEqual({
      type: "card",
      variant: "default",
      children,
    });
  });

  it("uses empty text child when children are empty", () => {
    const result = createContainerElement("card", { variant: "default" }, []);
    expect(result).toEqual({
      type: "card",
      variant: "default",
      children: [{ text: "" }],
    });
  });
});

// ============================================================================
// Roundtrip Tests (Parse → Serialize → Parse)
// ============================================================================

describe("roundtrip", () => {
  it("preserves string values", () => {
    const original = { query: "SELECT * FROM users WHERE id = 1" };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves number values", () => {
    const original = { min: 5, max: 100, step: 0.5 };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves boolean true values", () => {
    const original = { required: true, disabled: true };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves array values", () => {
    const original = { columns: ["id", "name", "email"] };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves object values", () => {
    const original = { params: { limit: 10, offset: 0 } };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves array of objects", () => {
    const original = {
      options: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ],
    };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });

  it("preserves complex nested structure", () => {
    const original = {
      config: {
        columns: [
          { key: "id", label: "ID", width: 100 },
          { key: "name", label: "Name" },
        ],
        pagination: { enabled: true, pageSize: 25 },
      },
    };
    const attrs = serializeAttributes(original);
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed).toEqual(original);
  });
});

// ============================================================================
// SQL Edge Cases
// ============================================================================

describe("SQL edge cases", () => {
  it("preserves SQL with special characters", () => {
    const queries = [
      "SELECT * FROM users WHERE name LIKE '%test%'",
      "SELECT * FROM users WHERE data->>'key' = 'value'",
      "SELECT * FROM users WHERE id IN (1, 2, 3)",
      'SELECT * FROM users WHERE name = "O\'Brien"',
      "SELECT * FROM users; DROP TABLE users; --",
    ];

    for (const query of queries) {
      const attrs = serializeAttributes({ query });
      const parsed = parseAttributes({ attributes: attrs });
      expect(parsed.query).toBe(query);
    }
  });

  it("preserves multiline SQL", () => {
    const query = `
      SELECT u.id, u.name, COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.active = true
      GROUP BY u.id, u.name
      HAVING COUNT(o.id) > 5
      ORDER BY order_count DESC
    `;
    const attrs = serializeAttributes({ query });
    const parsed = parseAttributes({ attributes: attrs });
    expect(parsed.query).toBe(query);
  });
});
