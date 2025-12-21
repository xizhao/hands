/**
 * Serialization Rules Tests
 *
 * Comprehensive tests for all stdlib component serialization rules.
 * Tests:
 * 1. Deserialize: MDX node → Plate element
 * 2. Serialize: Plate element → MDX node
 * 3. Roundtrip: deserialize → serialize → deserialize preserves values
 */

import { describe, expect, it } from "vitest";
import {
  liveValueRule,
  liveQueryRule,
} from "./rules/live-value";
import {
  liveActionRule,
  buttonRule,
  inputRule,
  selectRule,
  checkboxRule,
  textareaRule,
} from "./rules/live-action";
import {
  lineChartRule,
  barChartRule,
  areaChartRule,
  pieChartRule,
} from "./rules/charts";
import { kanbanRule } from "./rules/kanban";
import { dataGridRule } from "./rules/data-grid";
import {
  metricRule,
  badgeRule,
  progressRule,
  alertRule,
  loaderRule,
} from "./rules/view";
import {
  cardRule,
  cardHeaderRule,
  cardContentRule,
  cardFooterRule,
  cardTitleRule,
  cardDescriptionRule,
} from "./rules/card";
import type { MdxDeserializeNode } from "./types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock MDX attribute
 */
function createMdxAttribute(
  name: string,
  value: string | number | boolean | object | null
) {
  if (value === null || value === undefined) {
    return { type: "mdxJsxAttribute" as const, name, value: null };
  }
  if (typeof value === "string") {
    return { type: "mdxJsxAttribute" as const, name, value };
  }
  return {
    type: "mdxJsxAttribute" as const,
    name,
    value: {
      type: "mdxJsxAttributeValueExpression" as const,
      value: JSON.stringify(value),
    },
  };
}

/**
 * Create a mock MDX node with attributes
 */
function createMdxNode(
  attributes: Array<{ name: string; value: any }>,
  children: any[] = []
): MdxDeserializeNode {
  return {
    attributes: attributes.map((attr) =>
      createMdxAttribute(attr.name, attr.value)
    ),
    children,
  };
}

/**
 * Mock convertChildren function for testing.
 * Converts mdast text nodes to Plate text format.
 */
const mockConvertChildren = (children: any[]): any[] => {
  return children.map((child) => {
    // Convert mdast text nodes to Plate format
    if (child.type === "text" && "value" in child) {
      return { text: child.value };
    }
    // Convert mdast paragraphs to Plate format
    if (child.type === "paragraph") {
      return { type: "p", children: mockConvertChildren(child.children || []) };
    }
    return child;
  });
};

/**
 * Build serialization rules that pass through children as-is.
 * Used for simple unit tests that don't need recursive child serialization.
 */
function buildSimpleRules(): Record<string, { serialize: (node: any, opts: any) => unknown }> {
  const rules: Record<string, { serialize: (node: any, opts: any) => unknown }> = {
    // Pass through text nodes
    text: { serialize: (node: any) => ({ type: "text", value: node.text }) },
    // Pass through children unchanged for simple testing
    p: { serialize: (node: any, opts: any) => ({ type: "paragraph", children: serializeWithRules(node.children, opts) }) },
  };
  return rules;
}

/**
 * Serialize nodes using _rules (mirrors serializeChildren in helpers.ts)
 */
function serializeWithRules(nodes: any[], options: any): any[] {
  const rules = options?._rules;
  if (!rules || !nodes) return nodes || [];
  return nodes.map((node: any) => {
    if ("text" in node) {
      return { type: "text", value: node.text };
    }
    const rule = rules[node.type];
    if (rule) {
      return rule.serialize(node, options);
    }
    return node;
  });
}

/**
 * Create serialize options for testing
 */
function createTestSerializeOptions() {
  return {
    _rules: buildSimpleRules(),
  };
}

// ============================================================================
// LiveValue Tests
// ============================================================================

describe("liveValueRule", () => {
  describe("deserialize", () => {
    it("deserializes basic LiveValue with query", () => {
      const mdxNode = createMdxNode([
        { name: "query", value: "SELECT COUNT(*) FROM users" },
      ]);
      const result = liveValueRule.deserialize(mdxNode);

      expect(result.type).toBe("live_value");
      expect(result.query).toBe("SELECT COUNT(*) FROM users");
      expect(result.display).toBe("auto");
      expect(result.children).toEqual([{ text: "" }]);
    });

    it("deserializes LiveValue with all properties", () => {
      const mdxNode = createMdxNode([
        { name: "query", value: "SELECT * FROM tasks" },
        { name: "display", value: "table" },
        { name: "params", value: { limit: 10 } },
        { name: "columns", value: "auto" },
        { name: "className", value: "custom-class" },
      ]);
      const result = liveValueRule.deserialize(mdxNode);

      expect(result.type).toBe("live_value");
      expect(result.query).toBe("SELECT * FROM tasks");
      expect(result.display).toBe("table");
      expect(result.params).toEqual({ limit: 10 });
      expect(result.columns).toBe("auto");
      expect(result.className).toBe("custom-class");
    });

    it("deserializes LiveValue with template children", () => {
      const mdxNode = createMdxNode(
        [{ name: "query", value: "SELECT name FROM users" }],
        [{ type: "text", value: "## {{name}}" }]
      );
      const result = liveValueRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      // After deserialization, text nodes are converted to Plate format
      expect(result.children).toEqual([{ text: "## {{name}}" }]);
    });
  });

  describe("serialize", () => {
    it("serializes basic LiveValue", () => {
      const element = {
        type: "live_value" as const,
        query: "SELECT * FROM users",
        display: "auto" as const,
        children: [{ text: "" }],
      };
      const result = liveValueRule.serialize(element);

      expect(result.type).toBe("mdxJsxTextElement");
      expect(result.name).toBe("LiveValue");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "query",
        value: "SELECT * FROM users",
      });
      // display: "auto" should be omitted (default)
      expect(result.attributes.find((a) => a.name === "display")).toBeUndefined();
    });

    it("serializes LiveValue with all properties", () => {
      const element = {
        type: "live_value" as const,
        query: "SELECT * FROM tasks",
        display: "table" as const,
        params: { limit: 10 },
        columns: [{ key: "name", label: "Name" }],
        className: "custom",
        children: [{ text: "" }],
      };
      const result = liveValueRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "display",
        value: "table",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "params",
        value: { type: "mdxJsxAttributeValueExpression", value: '{"limit":10}' },
      });
    });

    it("serializes LiveValue with template as flow element", () => {
      const element = {
        type: "live_value" as const,
        query: "SELECT * FROM users",
        display: "auto" as const,
        children: [{ text: "## {{name}}" }],
      };
      const result = liveValueRule.serialize(element as any, {
        ...createTestSerializeOptions(),
      });

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.children).toHaveLength(1);
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "query", value: "SELECT * FROM users" },
        { name: "display", value: "list" },
        { name: "params", value: { offset: 5 } },
      ]);

      const deserialized = liveValueRule.deserialize(original);
      const serialized = liveValueRule.serialize(deserialized);
      const roundtrip = liveValueRule.deserialize(serialized);

      expect(roundtrip.query).toBe(deserialized.query);
      expect(roundtrip.display).toBe(deserialized.display);
      expect(roundtrip.params).toEqual(deserialized.params);
    });
  });
});

describe("liveQueryRule", () => {
  it("is an alias for LiveValue", () => {
    const mdxNode = createMdxNode([
      { name: "query", value: "SELECT 1" },
    ]);
    const result = liveQueryRule.deserialize(mdxNode);

    expect(result.type).toBe("live_value");
    expect(liveQueryRule.tagName).toBe("LiveQuery");
    expect(liveQueryRule.key).toBe("live_value");
  });
});

// ============================================================================
// LiveAction Tests
// ============================================================================

describe("liveActionRule", () => {
  describe("deserialize", () => {
    it("deserializes LiveAction with sql", () => {
      const mdxNode = createMdxNode([
        { name: "sql", value: "UPDATE tasks SET status = {{status}}" },
      ]);
      const result = liveActionRule.deserialize(mdxNode);

      expect(result.type).toBe("live_action");
      expect(result.sql).toBe("UPDATE tasks SET status = {{status}}");
      expect(result.src).toBeUndefined();
    });

    it("deserializes LiveAction with src", () => {
      const mdxNode = createMdxNode([
        { name: "src", value: "/api/update" },
        { name: "params", value: { id: 1 } },
      ]);
      const result = liveActionRule.deserialize(mdxNode);

      expect(result.type).toBe("live_action");
      expect(result.src).toBe("/api/update");
      expect(result.params).toEqual({ id: 1 });
    });
  });

  describe("serialize", () => {
    it("serializes LiveAction", () => {
      const element = {
        type: "live_action" as const,
        sql: "DELETE FROM tasks WHERE id = {{id}}",
        children: [{ type: "p" as const, children: [{ text: "" }] }],
      };
      const result = liveActionRule.serialize(element);

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("LiveAction");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "sql",
        value: "DELETE FROM tasks WHERE id = {{id}}",
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "sql", value: "INSERT INTO tasks (name) VALUES ({{name}})" },
        { name: "params", value: { name: "test" } },
      ]);

      const deserialized = liveActionRule.deserialize(original);
      const serialized = liveActionRule.serialize(deserialized);
      const roundtrip = liveActionRule.deserialize(serialized);

      expect(roundtrip.sql).toBe(deserialized.sql);
      expect(roundtrip.params).toEqual(deserialized.params);
    });
  });
});

// ============================================================================
// Button Tests
// ============================================================================

describe("buttonRule", () => {
  describe("deserialize", () => {
    it("deserializes Button with default variant", () => {
      const mdxNode = createMdxNode([], [{ text: "Click me" }]);
      const result = buttonRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("button");
      expect(result.variant).toBeUndefined();
      expect(result.children).toEqual([{ text: "Click me" }]);
    });

    it("deserializes Button with variant", () => {
      const mdxNode = createMdxNode(
        [{ name: "variant", value: "destructive" }],
        [{ text: "Delete" }]
      );
      const result = buttonRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.variant).toBe("destructive");
    });
  });

  describe("serialize", () => {
    it("serializes Button", () => {
      const element = {
        type: "button" as const,
        variant: "outline" as const,
        children: [{ text: "Submit" }],
      };
      const result = buttonRule.serialize(element);

      expect(result.type).toBe("mdxJsxTextElement");
      expect(result.name).toBe("Button");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "variant",
        value: "outline",
      });
    });

    it("omits default variant", () => {
      const element = {
        type: "button" as const,
        variant: "default" as const,
        children: [{ text: "Submit" }],
      };
      const result = buttonRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "variant")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves variant through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "variant", value: "ghost" }],
        [{ text: "Close" }]
      );

      const deserialized = buttonRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = buttonRule.serialize(deserialized, {
        ...createTestSerializeOptions(),
      });
      const roundtrip = buttonRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.variant).toBe(deserialized.variant);
    });
  });
});

// ============================================================================
// Input Tests
// ============================================================================

describe("inputRule", () => {
  describe("deserialize", () => {
    it("deserializes Input with basic properties", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "email" },
        { name: "type", value: "email" },
        { name: "placeholder", value: "Enter email" },
      ]);
      const result = inputRule.deserialize(mdxNode);

      expect(result.type).toBe("input");
      expect(result.name).toBe("email");
      expect(result.inputType).toBe("email");
      expect(result.placeholder).toBe("Enter email");
      expect(result.required).toBe(false);
    });

    it("deserializes Input with number constraints", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "amount" },
        { name: "type", value: "number" },
        { name: "min", value: 0 },
        { name: "max", value: 100 },
        { name: "step", value: 5 },
      ]);
      const result = inputRule.deserialize(mdxNode);

      expect(result.inputType).toBe("number");
      expect(result.min).toBe(0);
      expect(result.max).toBe(100);
      expect(result.step).toBe(5);
    });

    it("deserializes Input with required flag", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "username" },
        { name: "required", value: null },
      ]);
      const result = inputRule.deserialize(mdxNode);

      expect(result.required).toBe(true);
    });
  });

  describe("serialize", () => {
    it("serializes Input", () => {
      const element = {
        type: "input" as const,
        name: "username",
        inputType: "text" as const,
        placeholder: "Enter username",
        required: true,
        children: [{ text: "Username" }],
      };
      const result = inputRule.serialize(element);

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("Input");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "name",
        value: "username",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "required",
        value: null,
      });
    });

    it("omits default values", () => {
      const element = {
        type: "input" as const,
        name: "field",
        inputType: "text" as const,
        required: false,
        children: [{ text: "" }],
      };
      const result = inputRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "type")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "required")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "name", value: "age" },
        { name: "type", value: "number" },
        { name: "min", value: 18 },
        { name: "max", value: 120 },
        { name: "defaultValue", value: "25" },
      ]);

      const deserialized = inputRule.deserialize(original);
      const serialized = inputRule.serialize(deserialized);
      const roundtrip = inputRule.deserialize(serialized);

      expect(roundtrip.name).toBe(deserialized.name);
      expect(roundtrip.inputType).toBe(deserialized.inputType);
      expect(roundtrip.min).toBe(deserialized.min);
      expect(roundtrip.max).toBe(deserialized.max);
      expect(roundtrip.defaultValue).toBe(deserialized.defaultValue);
    });
  });
});

// ============================================================================
// Select Tests
// ============================================================================

describe("selectRule", () => {
  describe("deserialize", () => {
    it("deserializes Select with options", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "status" },
        {
          name: "options",
          value: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]);
      const result = selectRule.deserialize(mdxNode);

      expect(result.type).toBe("select");
      expect(result.name).toBe("status");
      expect(result.options).toEqual([
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ]);
    });

    it("deserializes Select with defaultValue", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "priority" },
        { name: "options", value: [{ value: "high", label: "High" }] },
        { name: "defaultValue", value: "high" },
      ]);
      const result = selectRule.deserialize(mdxNode);

      expect(result.defaultValue).toBe("high");
    });
  });

  describe("serialize", () => {
    it("serializes Select", () => {
      const element = {
        type: "select" as const,
        name: "country",
        options: [
          { value: "us", label: "United States" },
          { value: "uk", label: "United Kingdom" },
        ],
        required: true,
        children: [{ text: "Country" }],
      };
      const result = selectRule.serialize(element);

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("Select");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "required",
        value: null,
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves options through roundtrip", () => {
      const original = createMdxNode([
        { name: "name", value: "size" },
        {
          name: "options",
          value: [
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ],
        },
      ]);

      const deserialized = selectRule.deserialize(original);
      const serialized = selectRule.serialize(deserialized);
      const roundtrip = selectRule.deserialize(serialized);

      expect(roundtrip.options).toEqual(deserialized.options);
    });
  });
});

// ============================================================================
// Checkbox Tests
// ============================================================================

describe("checkboxRule", () => {
  describe("deserialize", () => {
    it("deserializes Checkbox", () => {
      const mdxNode = createMdxNode(
        [{ name: "name", value: "agree" }],
        [{ text: "I agree to the terms" }]
      );
      const result = checkboxRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("checkbox");
      expect(result.name).toBe("agree");
      expect(result.defaultChecked).toBe(false);
      expect(result.children).toEqual([{ text: "I agree to the terms" }]);
    });

    it("deserializes Checkbox with defaultChecked", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "subscribe" },
        { name: "defaultChecked", value: null },
      ]);
      const result = checkboxRule.deserialize(mdxNode);

      expect(result.defaultChecked).toBe(true);
    });
  });

  describe("serialize", () => {
    it("serializes Checkbox", () => {
      const element = {
        type: "checkbox" as const,
        name: "terms",
        defaultChecked: true,
        required: false,
        children: [{ text: "Accept terms" }],
      };
      const result = checkboxRule.serialize(element);

      expect(result.name).toBe("Checkbox");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "defaultChecked",
        value: null,
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves checked state through roundtrip", () => {
      const original = createMdxNode([
        { name: "name", value: "notifications" },
        { name: "defaultChecked", value: null },
      ]);

      const deserialized = checkboxRule.deserialize(original);
      const serialized = checkboxRule.serialize(deserialized);
      const roundtrip = checkboxRule.deserialize(serialized);

      expect(roundtrip.defaultChecked).toBe(deserialized.defaultChecked);
    });
  });
});

// ============================================================================
// Textarea Tests
// ============================================================================

describe("textareaRule", () => {
  describe("deserialize", () => {
    it("deserializes Textarea", () => {
      const mdxNode = createMdxNode([
        { name: "name", value: "description" },
        { name: "rows", value: 5 },
        { name: "placeholder", value: "Enter description" },
      ]);
      const result = textareaRule.deserialize(mdxNode);

      expect(result.type).toBe("textarea");
      expect(result.name).toBe("description");
      expect(result.rows).toBe(5);
      expect(result.placeholder).toBe("Enter description");
    });
  });

  describe("serialize", () => {
    it("serializes Textarea", () => {
      const element = {
        type: "textarea" as const,
        name: "notes",
        rows: 10,
        required: true,
        children: [{ text: "Notes" }],
      };
      const result = textareaRule.serialize(element);

      expect(result.name).toBe("Textarea");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "rows",
        value: { type: "mdxJsxAttributeValueExpression", value: "10" },
      });
    });

    it("omits default rows", () => {
      const element = {
        type: "textarea" as const,
        name: "comment",
        rows: 3,
        children: [{ text: "" }],
      };
      const result = textareaRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "rows")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "name", value: "bio" },
        { name: "rows", value: 8 },
        { name: "placeholder", value: "Tell us about yourself" },
      ]);

      const deserialized = textareaRule.deserialize(original);
      const serialized = textareaRule.serialize(deserialized);
      const roundtrip = textareaRule.deserialize(serialized);

      expect(roundtrip.rows).toBe(deserialized.rows);
      expect(roundtrip.placeholder).toBe(deserialized.placeholder);
    });
  });
});

// ============================================================================
// LineChart Tests
// ============================================================================

describe("lineChartRule", () => {
  describe("deserialize", () => {
    it("deserializes LineChart with basic properties", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "date" },
        { name: "yKey", value: "revenue" },
      ]);
      const result = lineChartRule.deserialize(mdxNode);

      expect(result.type).toBe("line_chart");
      expect(result.xKey).toBe("date");
      expect(result.yKey).toBe("revenue");
    });

    it("deserializes LineChart with multiple yKeys", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "month" },
        { name: "yKey", value: ["revenue", "expenses"] },
      ]);
      const result = lineChartRule.deserialize(mdxNode);

      expect(result.yKey).toEqual(["revenue", "expenses"]);
    });

    it("deserializes LineChart with all properties", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "date" },
        { name: "yKey", value: "value" },
        { name: "height", value: 400 },
        { name: "showLegend", value: null },
        { name: "curve", value: "monotone" },
        { name: "colors", value: ["#ff0000", "#00ff00"] },
      ]);
      const result = lineChartRule.deserialize(mdxNode);

      expect(result.height).toBe(400);
      expect(result.showLegend).toBe(true);
      expect(result.curve).toBe("monotone");
      expect(result.colors).toEqual(["#ff0000", "#00ff00"]);
    });
  });

  describe("serialize", () => {
    it("serializes LineChart", () => {
      const element = {
        type: "line_chart" as const,
        xKey: "date",
        yKey: "sales",
        height: 300,
        showDots: false,
        children: [{ text: "" }],
      };
      const result = lineChartRule.serialize(element);

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("LineChart");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "height",
        value: { type: "mdxJsxAttributeValueExpression", value: "300" },
      });
      // showDots: false is omitted (false booleans are not serialized)
      expect(result.attributes.find((a) => a.name === "showDots")).toBeUndefined();
    });

    it("omits default values", () => {
      const element = {
        type: "line_chart" as const,
        xKey: "x",
        yKey: "y",
        curve: "linear" as const,
        showDots: true,
        showTooltip: true,
        showGrid: true,
        children: [{ text: "" }],
      };
      const result = lineChartRule.serialize(element);

      // All these are defaults and should be omitted
      expect(result.attributes.find((a) => a.name === "curve")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showDots")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showTooltip")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showGrid")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "xKey", value: "timestamp" },
        { name: "yKey", value: ["cpu", "memory"] },
        { name: "height", value: 500 },
        { name: "curve", value: "step" },
      ]);

      const deserialized = lineChartRule.deserialize(original);
      const serialized = lineChartRule.serialize(deserialized);
      const roundtrip = lineChartRule.deserialize(serialized);

      expect(roundtrip.xKey).toBe(deserialized.xKey);
      expect(roundtrip.yKey).toEqual(deserialized.yKey);
      expect(roundtrip.height).toBe(deserialized.height);
      expect(roundtrip.curve).toBe(deserialized.curve);
    });
  });
});

// ============================================================================
// BarChart Tests
// ============================================================================

describe("barChartRule", () => {
  describe("deserialize", () => {
    it("deserializes BarChart", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "category" },
        { name: "yKey", value: "count" },
        { name: "stacked", value: null },
      ]);
      const result = barChartRule.deserialize(mdxNode);

      expect(result.type).toBe("bar_chart");
      expect(result.xKey).toBe("category");
      expect(result.yKey).toBe("count");
      expect(result.stacked).toBe(true);
    });

    it("deserializes BarChart with layout", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "month" },
        { name: "yKey", value: ["sales", "costs"] },
        { name: "layout", value: "horizontal" },
      ]);
      const result = barChartRule.deserialize(mdxNode);

      expect(result.layout).toBe("horizontal");
    });
  });

  describe("serialize", () => {
    it("serializes BarChart", () => {
      const element = {
        type: "bar_chart" as const,
        xKey: "product",
        yKey: "sales",
        stacked: true,
        layout: "horizontal" as const,
        children: [{ text: "" }],
      };
      const result = barChartRule.serialize(element);

      expect(result.name).toBe("BarChart");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "stacked",
        value: null, // true is serialized as null (boolean attribute)
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "layout",
        value: "horizontal",
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "xKey", value: "region" },
        { name: "yKey", value: ["q1", "q2", "q3", "q4"] },
        { name: "stacked", value: null },
      ]);

      const deserialized = barChartRule.deserialize(original);
      const serialized = barChartRule.serialize(deserialized);
      const roundtrip = barChartRule.deserialize(serialized);

      expect(roundtrip.yKey).toEqual(deserialized.yKey);
      expect(roundtrip.stacked).toBe(deserialized.stacked);
    });
  });
});

// ============================================================================
// AreaChart Tests
// ============================================================================

describe("areaChartRule", () => {
  describe("deserialize", () => {
    it("deserializes AreaChart", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "date" },
        { name: "yKey", value: "temperature" },
        { name: "fillOpacity", value: 0.6 },
      ]);
      const result = areaChartRule.deserialize(mdxNode);

      expect(result.type).toBe("area_chart");
      expect(result.fillOpacity).toBe(0.6);
    });

    it("deserializes stacked AreaChart", () => {
      const mdxNode = createMdxNode([
        { name: "xKey", value: "month" },
        { name: "yKey", value: ["desktop", "mobile", "tablet"] },
        { name: "stacked", value: null },
      ]);
      const result = areaChartRule.deserialize(mdxNode);

      expect(result.stacked).toBe(true);
      expect(result.yKey).toEqual(["desktop", "mobile", "tablet"]);
    });
  });

  describe("serialize", () => {
    it("serializes AreaChart", () => {
      const element = {
        type: "area_chart" as const,
        xKey: "time",
        yKey: "value",
        curve: "monotone" as const,
        fillOpacity: 0.5,
        children: [{ text: "" }],
      };
      const result = areaChartRule.serialize(element);

      expect(result.name).toBe("AreaChart");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "curve",
        value: "monotone",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "fillOpacity",
        value: { type: "mdxJsxAttributeValueExpression", value: "0.5" },
      });
    });

    it("omits default fillOpacity", () => {
      const element = {
        type: "area_chart" as const,
        xKey: "x",
        yKey: "y",
        fillOpacity: 0.3,
        children: [{ text: "" }],
      };
      const result = areaChartRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "fillOpacity")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "xKey", value: "year" },
        { name: "yKey", value: "population" },
        { name: "stacked", value: null },
        { name: "fillOpacity", value: 0.8 },
      ]);

      const deserialized = areaChartRule.deserialize(original);
      const serialized = areaChartRule.serialize(deserialized);
      const roundtrip = areaChartRule.deserialize(serialized);

      expect(roundtrip.stacked).toBe(deserialized.stacked);
      expect(roundtrip.fillOpacity).toBe(deserialized.fillOpacity);
    });
  });
});

// ============================================================================
// PieChart Tests
// ============================================================================

describe("pieChartRule", () => {
  describe("deserialize", () => {
    it("deserializes PieChart", () => {
      const mdxNode = createMdxNode([
        { name: "valueKey", value: "value" },
        { name: "nameKey", value: "category" },
      ]);
      const result = pieChartRule.deserialize(mdxNode);

      expect(result.type).toBe("pie_chart");
      expect(result.valueKey).toBe("value");
      expect(result.nameKey).toBe("category");
    });

    it("deserializes PieChart with innerRadius (donut)", () => {
      const mdxNode = createMdxNode([
        { name: "valueKey", value: "amount" },
        { name: "nameKey", value: "label" },
        { name: "innerRadius", value: 60 },
      ]);
      const result = pieChartRule.deserialize(mdxNode);

      expect(result.innerRadius).toBe(60);
    });
  });

  describe("serialize", () => {
    it("serializes PieChart", () => {
      const element = {
        type: "pie_chart" as const,
        valueKey: "value",
        nameKey: "name",
        innerRadius: 50,
        showLabels: true,
        children: [{ text: "" }],
      };
      const result = pieChartRule.serialize(element);

      expect(result.name).toBe("PieChart");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "innerRadius",
        value: { type: "mdxJsxAttributeValueExpression", value: "50" },
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "showLabels",
        value: null, // true is serialized as null (boolean attribute)
      });
    });

    it("omits defaults", () => {
      const element = {
        type: "pie_chart" as const,
        valueKey: "v",
        nameKey: "n",
        innerRadius: 0,
        showLegend: true,
        showLabels: false,
        children: [{ text: "" }],
      };
      const result = pieChartRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "innerRadius")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showLegend")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showLabels")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "valueKey", value: "sales" },
        { name: "nameKey", value: "product" },
        { name: "innerRadius", value: 70 },
        { name: "colors", value: ["#ff0000", "#00ff00", "#0000ff"] },
      ]);

      const deserialized = pieChartRule.deserialize(original);
      const serialized = pieChartRule.serialize(deserialized);
      const roundtrip = pieChartRule.deserialize(serialized);

      expect(roundtrip.valueKey).toBe(deserialized.valueKey);
      expect(roundtrip.nameKey).toBe(deserialized.nameKey);
      expect(roundtrip.innerRadius).toBe(deserialized.innerRadius);
      expect(roundtrip.colors).toEqual(deserialized.colors);
    });
  });
});

// ============================================================================
// Kanban Tests
// ============================================================================

describe("kanbanRule", () => {
  describe("deserialize", () => {
    it("deserializes Kanban with basic properties", () => {
      const mdxNode = createMdxNode([
        { name: "query", value: "SELECT * FROM tasks" },
        { name: "groupByColumn", value: "status" },
        { name: "cardTitleField", value: "title" },
        { name: "updateSql", value: "UPDATE tasks SET status = {{status}}" },
      ]);
      const result = kanbanRule.deserialize(mdxNode);

      expect(result.type).toBe("kanban");
      expect(result.query).toBe("SELECT * FROM tasks");
      expect(result.groupByColumn).toBe("status");
      expect(result.cardTitleField).toBe("title");
      expect(result.updateSql).toBe("UPDATE tasks SET status = {{status}}");
    });

    it("deserializes Kanban with all properties", () => {
      const mdxNode = createMdxNode([
        { name: "query", value: "SELECT * FROM tickets" },
        { name: "groupByColumn", value: "stage" },
        { name: "columnOrder", value: ["backlog", "todo", "in_progress", "done"] },
        { name: "cardTitleField", value: "title" },
        { name: "cardFields", value: ["assignee", "priority"] },
        { name: "updateSql", value: "UPDATE tickets SET stage = {{stage}}" },
        { name: "idField", value: "ticket_id" },
      ]);
      const result = kanbanRule.deserialize(mdxNode);

      expect(result.columnOrder).toEqual(["backlog", "todo", "in_progress", "done"]);
      expect(result.cardFields).toEqual(["assignee", "priority"]);
      expect(result.idField).toBe("ticket_id");
    });
  });

  describe("serialize", () => {
    it("serializes Kanban", () => {
      const element = {
        type: "kanban" as const,
        query: "SELECT * FROM tasks",
        groupByColumn: "status",
        cardTitleField: "name",
        updateSql: "UPDATE tasks SET status = {{status}} WHERE id = {{id}}",
        idField: "task_id",
        children: [{ text: "" }],
      };
      const result = kanbanRule.serialize(element);

      expect(result.name).toBe("Kanban");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "query",
        value: "SELECT * FROM tasks",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "idField",
        value: "task_id",
      });
    });

    it("omits default idField", () => {
      const element = {
        type: "kanban" as const,
        query: "SELECT * FROM tasks",
        groupByColumn: "status",
        cardTitleField: "title",
        updateSql: "UPDATE tasks SET status = {{status}}",
        idField: "id",
        children: [{ text: "" }],
      };
      const result = kanbanRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "idField")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "query", value: "SELECT * FROM issues" },
        { name: "groupByColumn", value: "state" },
        { name: "columnOrder", value: ["open", "in_review", "closed"] },
        { name: "cardTitleField", value: "summary" },
        { name: "cardFields", value: ["reporter", "priority", "tags"] },
        { name: "updateSql", value: "UPDATE issues SET state = {{state}} WHERE issue_id = {{issue_id}}" },
        { name: "idField", value: "issue_id" },
      ]);

      const deserialized = kanbanRule.deserialize(original);
      const serialized = kanbanRule.serialize(deserialized);
      const roundtrip = kanbanRule.deserialize(serialized);

      expect(roundtrip.query).toBe(deserialized.query);
      expect(roundtrip.groupByColumn).toBe(deserialized.groupByColumn);
      expect(roundtrip.columnOrder).toEqual(deserialized.columnOrder);
      expect(roundtrip.cardFields).toEqual(deserialized.cardFields);
      expect(roundtrip.idField).toBe(deserialized.idField);
    });
  });
});

// ============================================================================
// DataGrid Tests
// ============================================================================

describe("dataGridRule", () => {
  describe("deserialize", () => {
    it("deserializes DataGrid with no properties", () => {
      const mdxNode = createMdxNode([]);
      const result = dataGridRule.deserialize(mdxNode);

      expect(result.type).toBe("data_grid");
      expect(result.children).toEqual([{ text: "" }]);
    });

    it("deserializes DataGrid with height and readOnly", () => {
      const mdxNode = createMdxNode([
        { name: "height", value: 400 },
        { name: "readOnly", value: null }, // boolean attribute
      ]);
      const result = dataGridRule.deserialize(mdxNode);

      expect(result.height).toBe(400);
      expect(result.readOnly).toBe(true);
    });

    it("deserializes DataGrid with columns config", () => {
      const columns = [
        { key: "name", label: "Name", width: 200 },
        { key: "email", label: "Email" },
        { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }] },
      ];
      const mdxNode = createMdxNode([
        { name: "columns", value: columns },
      ]);
      const result = dataGridRule.deserialize(mdxNode);

      expect(result.columns).toEqual(columns);
    });

    it("deserializes DataGrid with columns='auto'", () => {
      const mdxNode = createMdxNode([
        { name: "columns", value: "auto" },
      ]);
      const result = dataGridRule.deserialize(mdxNode);

      expect(result.columns).toBe("auto");
    });

    it("deserializes DataGrid with all features enabled", () => {
      const mdxNode = createMdxNode([
        { name: "height", value: 500 },
        { name: "enableSearch", value: null },
        { name: "enablePaste", value: null },
      ]);
      const result = dataGridRule.deserialize(mdxNode);

      expect(result.height).toBe(500);
      expect(result.enableSearch).toBe(true);
      expect(result.enablePaste).toBe(true);
    });
  });

  describe("serialize", () => {
    it("serializes DataGrid with minimal props", () => {
      const element = {
        type: "data_grid" as const,
        children: [{ text: "" }],
      };
      const result = dataGridRule.serialize(element);

      expect(result.name).toBe("DataGrid");
      expect(result.attributes).toEqual([]);
    });

    it("serializes DataGrid with height", () => {
      const element = {
        type: "data_grid" as const,
        height: 400,
        children: [{ text: "" }],
      };
      const result = dataGridRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "height",
        value: { type: "mdxJsxAttributeValueExpression", value: "400" },
      });
    });

    it("serializes DataGrid with columns config", () => {
      const columns = [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
      ];
      const element = {
        type: "data_grid" as const,
        columns,
        children: [{ text: "" }],
      };
      const result = dataGridRule.serialize(element);

      const columnsAttr = result.attributes.find((a) => a.name === "columns");
      expect(columnsAttr).toBeDefined();
    });

    it("omits default values", () => {
      const element = {
        type: "data_grid" as const,
        columns: "auto" as const,
        readOnly: false,
        enableSearch: false,
        enablePaste: false,
        children: [{ text: "" }],
      };
      const result = dataGridRule.serialize(element);

      // All values are defaults, should be empty
      expect(result.attributes).toEqual([]);
    });

    it("serializes boolean flags", () => {
      const element = {
        type: "data_grid" as const,
        readOnly: true,
        enableSearch: true,
        enablePaste: true,
        children: [{ text: "" }],
      };
      const result = dataGridRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "readOnly",
        value: null,
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "enableSearch",
        value: null,
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "enablePaste",
        value: null,
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const columns = [
        { key: "id", label: "ID", width: 80 },
        { key: "name", label: "Name", width: 200 },
        { key: "status", label: "Status", type: "select" as const, options: [{ value: "active", label: "Active" }] },
      ];
      const original = createMdxNode([
        { name: "columns", value: columns },
        { name: "height", value: 450 },
        { name: "readOnly", value: null },
        { name: "enableSearch", value: null },
      ]);

      const deserialized = dataGridRule.deserialize(original);
      const serialized = dataGridRule.serialize(deserialized);
      const roundtrip = dataGridRule.deserialize(serialized);

      expect(roundtrip.columns).toEqual(deserialized.columns);
      expect(roundtrip.height).toBe(deserialized.height);
      expect(roundtrip.readOnly).toBe(deserialized.readOnly);
      expect(roundtrip.enableSearch).toBe(deserialized.enableSearch);
    });
  });
});

// ============================================================================
// Metric Tests
// ============================================================================

describe("metricRule", () => {
  describe("deserialize", () => {
    it("deserializes Metric with basic properties", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: 1234 },
        { name: "label", value: "Total Users" },
      ]);
      const result = metricRule.deserialize(mdxNode);

      expect(result.type).toBe("metric");
      expect(result.value).toBe(1234);
      expect(result.label).toBe("Total Users");
    });

    it("deserializes Metric with prefix and suffix", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: 87 },
        { name: "prefix", value: "$" },
        { name: "suffix", value: "%" },
      ]);
      const result = metricRule.deserialize(mdxNode);

      expect(result.prefix).toBe("$");
      expect(result.suffix).toBe("%");
    });

    it("deserializes Metric with change", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: 42.5 },
        { name: "change", value: 5.2 },
        { name: "changeLabel", value: "vs last month" },
      ]);
      const result = metricRule.deserialize(mdxNode);

      expect(result.change).toBe(5.2);
      expect(result.changeLabel).toBe("vs last month");
    });

    it("deserializes Metric with size", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: "42.5K" },
        { name: "size", value: "lg" },
      ]);
      const result = metricRule.deserialize(mdxNode);

      expect(result.value).toBe("42.5K");
      expect(result.size).toBe("lg");
    });
  });

  describe("serialize", () => {
    it("serializes Metric", () => {
      const element = {
        type: "metric" as const,
        value: 9999,
        label: "Revenue",
        prefix: "$",
        change: -2.5,
        size: "lg" as const,
        children: [{ text: "" }],
      };
      const result = metricRule.serialize(element);

      expect(result.name).toBe("Metric");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "value",
        value: { type: "mdxJsxAttributeValueExpression", value: "9999" },
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "prefix",
        value: "$",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "size",
        value: "lg",
      });
    });

    it("omits default size", () => {
      const element = {
        type: "metric" as const,
        value: 100,
        size: "md" as const,
        children: [{ text: "" }],
      };
      const result = metricRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "size")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "value", value: 12345 },
        { name: "label", value: "Active Users" },
        { name: "prefix", value: "~" },
        { name: "suffix", value: "K" },
        { name: "change", value: 12.5 },
        { name: "changeLabel", value: "from yesterday" },
        { name: "size", value: "sm" },
      ]);

      const deserialized = metricRule.deserialize(original);
      const serialized = metricRule.serialize(deserialized);
      const roundtrip = metricRule.deserialize(serialized);

      expect(roundtrip.value).toBe(deserialized.value);
      expect(roundtrip.label).toBe(deserialized.label);
      expect(roundtrip.prefix).toBe(deserialized.prefix);
      expect(roundtrip.suffix).toBe(deserialized.suffix);
      expect(roundtrip.change).toBe(deserialized.change);
      expect(roundtrip.changeLabel).toBe(deserialized.changeLabel);
      expect(roundtrip.size).toBe(deserialized.size);
    });
  });
});

// ============================================================================
// Badge Tests
// ============================================================================

describe("badgeRule", () => {
  describe("deserialize", () => {
    it("deserializes Badge with default variant", () => {
      const mdxNode = createMdxNode([], [{ text: "New" }]);
      const result = badgeRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("badge");
      expect(result.variant).toBeUndefined();
      expect(result.children).toEqual([{ text: "New" }]);
    });

    it("deserializes Badge with variant", () => {
      const mdxNode = createMdxNode(
        [{ name: "variant", value: "success" }],
        [{ text: "Completed" }]
      );
      const result = badgeRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.variant).toBe("success");
      expect(result.children).toEqual([{ text: "Completed" }]);
    });
  });

  describe("serialize", () => {
    it("serializes Badge", () => {
      const element = {
        type: "badge" as const,
        variant: "warning" as const,
        children: [{ text: "Pending" }],
      };
      const result = badgeRule.serialize(element);

      expect(result.name).toBe("Badge");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "variant",
        value: "warning",
      });
    });

    it("omits default variant", () => {
      const element = {
        type: "badge" as const,
        variant: "default" as const,
        children: [{ text: "Tag" }],
      };
      const result = badgeRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "variant")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves variant through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "variant", value: "destructive" }],
        [{ text: "Error" }]
      );

      const deserialized = badgeRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = badgeRule.serialize(deserialized, {
        ...createTestSerializeOptions(),
      });
      const roundtrip = badgeRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.variant).toBe(deserialized.variant);
    });
  });
});

// ============================================================================
// Progress Tests
// ============================================================================

describe("progressRule", () => {
  describe("deserialize", () => {
    it("deserializes Progress with value", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: 75 },
      ]);
      const result = progressRule.deserialize(mdxNode);

      expect(result.type).toBe("progress");
      expect(result.value).toBe(75);
    });

    it("deserializes Progress with all properties", () => {
      const mdxNode = createMdxNode([
        { name: "value", value: 50 },
        { name: "max", value: 200 },
        { name: "label", value: "Upload Progress" },
        { name: "showValue", value: null },
        { name: "variant", value: "success" },
        { name: "size", value: "lg" },
      ]);
      const result = progressRule.deserialize(mdxNode);

      expect(result.value).toBe(50);
      expect(result.max).toBe(200);
      expect(result.label).toBe("Upload Progress");
      expect(result.showValue).toBe(true);
      expect(result.variant).toBe("success");
      expect(result.size).toBe("lg");
    });

    it("deserializes indeterminate Progress", () => {
      const mdxNode = createMdxNode([
        { name: "indeterminate", value: null },
        { name: "label", value: "Loading..." },
      ]);
      const result = progressRule.deserialize(mdxNode);

      expect(result.indeterminate).toBe(true);
      expect(result.label).toBe("Loading...");
    });
  });

  describe("serialize", () => {
    it("serializes Progress", () => {
      const element = {
        type: "progress" as const,
        value: 90,
        max: 100,
        variant: "default" as const,
        size: "md" as const,
        indeterminate: false,
        showValue: false,
        children: [{ text: "" }],
      };
      const result = progressRule.serialize(element);

      expect(result.name).toBe("Progress");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "value",
        value: { type: "mdxJsxAttributeValueExpression", value: "90" },
      });
    });

    it("omits defaults", () => {
      const element = {
        type: "progress" as const,
        value: 50,
        max: 100,
        indeterminate: false,
        showValue: false,
        variant: "default" as const,
        size: "md" as const,
        children: [{ text: "" }],
      };
      const result = progressRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "max")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "indeterminate")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "showValue")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "variant")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "size")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "value", value: 65 },
        { name: "max", value: 150 },
        { name: "showValue", value: null },
        { name: "variant", value: "warning" },
      ]);

      const deserialized = progressRule.deserialize(original);
      const serialized = progressRule.serialize(deserialized);
      const roundtrip = progressRule.deserialize(serialized);

      expect(roundtrip.value).toBe(deserialized.value);
      expect(roundtrip.max).toBe(deserialized.max);
      expect(roundtrip.showValue).toBe(deserialized.showValue);
      expect(roundtrip.variant).toBe(deserialized.variant);
    });
  });
});

// ============================================================================
// Alert Tests
// ============================================================================

describe("alertRule", () => {
  describe("deserialize", () => {
    it("deserializes Alert with basic content", () => {
      const mdxNode = createMdxNode([], [{ text: "This is an alert." }]);
      const result = alertRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("alert");
      expect(result.variant).toBeUndefined();
      expect(result.children).toEqual([{ text: "This is an alert." }]);
    });

    it("deserializes Alert with title and variant", () => {
      const mdxNode = createMdxNode(
        [
          { name: "title", value: "Success" },
          { name: "variant", value: "success" },
        ],
        [{ text: "Your changes have been saved." }]
      );
      const result = alertRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.title).toBe("Success");
      expect(result.variant).toBe("success");
    });
  });

  describe("serialize", () => {
    it("serializes Alert", () => {
      const element = {
        type: "alert" as const,
        title: "Warning",
        variant: "warning" as const,
        children: [{ text: "Please review before continuing." }],
      };
      const result = alertRule.serialize(element);

      expect(result.name).toBe("Alert");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "title",
        value: "Warning",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "variant",
        value: "warning",
      });
    });

    it("omits default variant", () => {
      const element = {
        type: "alert" as const,
        variant: "default" as const,
        children: [{ text: "Info" }],
      };
      const result = alertRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "variant")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode(
        [
          { name: "title", value: "Error" },
          { name: "variant", value: "destructive" },
        ],
        [{ text: "An error occurred." }]
      );

      const deserialized = alertRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = alertRule.serialize(deserialized, {
        ...createTestSerializeOptions(),
      });
      const roundtrip = alertRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.title).toBe(deserialized.title);
      expect(roundtrip.variant).toBe(deserialized.variant);
    });
  });
});

// ============================================================================
// Loader Tests
// ============================================================================

describe("loaderRule", () => {
  describe("deserialize", () => {
    it("deserializes Loader with defaults", () => {
      const mdxNode = createMdxNode([]);
      const result = loaderRule.deserialize(mdxNode);

      expect(result.type).toBe("loader");
    });

    it("deserializes Loader with all properties", () => {
      const mdxNode = createMdxNode([
        { name: "variant", value: "dots" },
        { name: "size", value: "lg" },
        { name: "color", value: "primary" },
        { name: "label", value: "Loading data..." },
        { name: "speed", value: "fast" },
      ]);
      const result = loaderRule.deserialize(mdxNode);

      expect(result.variant).toBe("dots");
      expect(result.size).toBe("lg");
      expect(result.color).toBe("primary");
      expect(result.label).toBe("Loading data...");
      expect(result.speed).toBe("fast");
    });
  });

  describe("serialize", () => {
    it("serializes Loader", () => {
      const element = {
        type: "loader" as const,
        variant: "pulse" as const,
        size: "xl" as const,
        color: "secondary" as const,
        speed: "slow" as const,
        children: [{ text: "" }],
      };
      const result = loaderRule.serialize(element);

      expect(result.name).toBe("Loader");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "variant",
        value: "pulse",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "size",
        value: "xl",
      });
    });

    it("omits defaults", () => {
      const element = {
        type: "loader" as const,
        variant: "spinner" as const,
        size: "md" as const,
        color: "default" as const,
        speed: "normal" as const,
        children: [{ text: "" }],
      };
      const result = loaderRule.serialize(element);

      expect(result.attributes.find((a) => a.name === "variant")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "size")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "color")).toBeUndefined();
      expect(result.attributes.find((a) => a.name === "speed")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves properties through roundtrip", () => {
      const original = createMdxNode([
        { name: "variant", value: "bars" },
        { name: "size", value: "sm" },
        { name: "label", value: "Please wait..." },
      ]);

      const deserialized = loaderRule.deserialize(original);
      const serialized = loaderRule.serialize(deserialized);
      const roundtrip = loaderRule.deserialize(serialized);

      expect(roundtrip.variant).toBe(deserialized.variant);
      expect(roundtrip.size).toBe(deserialized.size);
      expect(roundtrip.label).toBe(deserialized.label);
    });
  });
});

// ============================================================================
// Card Component Tests
// ============================================================================

describe("cardRule", () => {
  describe("deserialize", () => {
    it("deserializes Card", () => {
      const mdxNode = createMdxNode(
        [],
        [{ type: "p", children: [{ text: "Content" }] }]
      );
      const result = cardRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("card");
      expect(result.children).toEqual([{ type: "p", children: [{ text: "Content" }] }]);
    });
  });

  describe("serialize", () => {
    it("serializes Card", () => {
      const element = {
        type: "card" as const,
        children: [{ type: "p" as const, children: [{ text: "Content" }] }],
      };
      const result = cardRule.serialize(element, {
        ...createTestSerializeOptions(),
      });

      expect(result.name).toBe("Card");
      expect(result.attributes).toEqual([]);
    });
  });

  describe("roundtrip", () => {
    it("preserves structure through roundtrip", () => {
      const original = createMdxNode(
        [],
        [{ type: "p", children: [{ text: "Test content" }] }]
      );

      const deserialized = cardRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = cardRule.serialize(deserialized, {
        ...createTestSerializeOptions(),
      });
      const roundtrip = cardRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.children).toEqual(deserialized.children);
    });
  });
});

describe("cardHeaderRule", () => {
  it("deserializes CardHeader", () => {
    const mdxNode = createMdxNode(
      [],
      [{ type: "card_title", children: [{ text: "Title" }] }]
    );
    const result = cardHeaderRule.deserialize(mdxNode, undefined, {
      convertChildren: mockConvertChildren,
    });

    expect(result.type).toBe("card_header");
  });

  it("serializes CardHeader", () => {
    const element = {
      type: "card_header" as const,
      children: [{ type: "card_title" as const, children: [{ text: "Title" }] }],
    };
    const result = cardHeaderRule.serialize(element);

    expect(result.name).toBe("CardHeader");
  });
});

describe("cardContentRule", () => {
  it("deserializes CardContent", () => {
    const mdxNode = createMdxNode(
      [],
      [{ type: "p", children: [{ text: "Content here" }] }]
    );
    const result = cardContentRule.deserialize(mdxNode, undefined, {
      convertChildren: mockConvertChildren,
    });

    expect(result.type).toBe("card_content");
  });

  it("serializes CardContent", () => {
    const element = {
      type: "card_content" as const,
      children: [{ type: "p" as const, children: [{ text: "Content" }] }],
    };
    const result = cardContentRule.serialize(element);

    expect(result.name).toBe("CardContent");
  });
});

describe("cardFooterRule", () => {
  it("deserializes CardFooter", () => {
    const mdxNode = createMdxNode(
      [],
      [{ type: "button", children: [{ text: "Save" }] }]
    );
    const result = cardFooterRule.deserialize(mdxNode, undefined, {
      convertChildren: mockConvertChildren,
    });

    expect(result.type).toBe("card_footer");
  });

  it("serializes CardFooter", () => {
    const element = {
      type: "card_footer" as const,
      children: [{ type: "button" as const, children: [{ text: "Save" }] }],
    };
    const result = cardFooterRule.serialize(element);

    expect(result.name).toBe("CardFooter");
  });
});

describe("cardTitleRule", () => {
  it("deserializes CardTitle", () => {
    const mdxNode = createMdxNode([], [{ text: "Project Overview" }]);
    const result = cardTitleRule.deserialize(mdxNode, undefined, {
      convertChildren: mockConvertChildren,
    });

    expect(result.type).toBe("card_title");
    expect(result.children).toEqual([{ text: "Project Overview" }]);
  });

  it("serializes CardTitle", () => {
    const element = {
      type: "card_title" as const,
      children: [{ text: "Title" }],
    };
    const result = cardTitleRule.serialize(element);

    expect(result.name).toBe("CardTitle");
  });
});

describe("cardDescriptionRule", () => {
  it("deserializes CardDescription", () => {
    const mdxNode = createMdxNode([], [{ text: "A brief description" }]);
    const result = cardDescriptionRule.deserialize(mdxNode, undefined, {
      convertChildren: mockConvertChildren,
    });

    expect(result.type).toBe("card_description");
    expect(result.children).toEqual([{ text: "A brief description" }]);
  });

  it("serializes CardDescription", () => {
    const element = {
      type: "card_description" as const,
      children: [{ text: "Description text" }],
    };
    const result = cardDescriptionRule.serialize(element);

    expect(result.name).toBe("CardDescription");
  });
});
