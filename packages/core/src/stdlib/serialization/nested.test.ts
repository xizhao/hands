/**
 * Nested/Composed Component Serialization Tests
 *
 * Tests for complex nested patterns involving:
 * - Card with full structure (CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button)
 * - LiveAction with form controls (Input, Select, Checkbox, Button)
 * - LiveValue with template content
 * - Alert with nested markdown
 */

import { describe, expect, it, vi } from "vitest";
import type { TElement, TText } from "platejs";
import type { DeserializeOptions, SerializeOptions, MdxJsxElement, MdxNode } from "./types";

// Import rules
import {
  cardRule,
  cardHeaderRule,
  cardTitleRule,
  cardDescriptionRule,
  cardContentRule,
  cardFooterRule,
  CARD_KEY,
  CARD_HEADER_KEY,
  CARD_TITLE_KEY,
  CARD_DESCRIPTION_KEY,
  CARD_CONTENT_KEY,
  CARD_FOOTER_KEY,
} from "./rules/card";

import {
  liveActionRule,
  buttonRule,
  inputRule,
  selectRule,
  checkboxRule,
} from "./rules/live-action";

import { liveValueRule } from "./rules/live-value";
import { alertRule } from "./rules/view";
import { barChartRule, lineChartRule } from "./rules/charts";

// Import keys from types (only those not exported from rules)
import {
  LIVE_ACTION_KEY,
  BUTTON_KEY,
  INPUT_KEY,
  SELECT_KEY,
  CHECKBOX_KEY,
  LIVE_VALUE_KEY,
  ALERT_KEY,
  BAR_CHART_KEY,
  LINE_CHART_KEY,
} from "../../types";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * All serialization rules for building test options.
 */
const allRules = [
  cardRule,
  cardHeaderRule,
  cardTitleRule,
  cardDescriptionRule,
  cardContentRule,
  cardFooterRule,
  buttonRule,
  inputRule,
  selectRule,
  checkboxRule,
  liveActionRule,
  liveValueRule,
  alertRule,
  barChartRule,
  lineChartRule,
];

/**
 * Mock convertChildren for deserialization.
 * Simulates Plate's recursive conversion of MDX nodes to Plate elements.
 */
function createMockConvertChildren(): (children: unknown[], deco: unknown, options: DeserializeOptions) => TElement[] {
  const convertChildren = vi.fn((children: unknown[], _deco: unknown, options: DeserializeOptions): TElement[] => {
    return (children as any[]).map((child: any): TElement => {
      // Handle MDX JSX elements
      if (child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement") {
        const rule = allRules.find((r) => r.tagName === child.name);
        if (rule) {
          return rule.deserialize({ attributes: child.attributes, children: child.children }, _deco, options);
        }
      }

      // Handle text nodes
      if (child.type === "text") {
        return { text: child.value } as any;
      }

      // Handle paragraph nodes
      if (child.type === "paragraph") {
        return {
          type: "p",
          children: convertChildren(child.children, _deco, options),
        };
      }

      // Handle heading nodes
      if (child.type === "heading") {
        return {
          type: `h${child.depth}`,
          children: convertChildren(child.children, _deco, options),
        };
      }

      // Handle strong/bold
      if (child.type === "strong") {
        return {
          type: "strong",
          children: convertChildren(child.children, _deco, options),
        };
      }

      // Fallback: return as-is
      return child;
    });
  });

  return convertChildren;
}

/**
 * Build serialization rules for testing.
 * Maps element type keys to their serialize functions.
 */
function buildSerializeRules(): Record<string, { serialize: (node: any, opts: SerializeOptions) => unknown }> {
  const rules: Record<string, { serialize: (node: any, opts: SerializeOptions) => unknown }> = {};

  // Add all stdlib rules
  for (const rule of allRules) {
    rules[rule.key] = { serialize: rule.serialize as any };
  }

  // Add standard markdown element handlers that recursively serialize children
  rules["p"] = {
    serialize: (node: TElement, opts: SerializeOptions) => ({
      type: "paragraph",
      children: serializeNodes(node.children, opts),
    }),
  };

  for (let i = 1; i <= 6; i++) {
    rules[`h${i}`] = {
      serialize: (node: TElement, opts: SerializeOptions) => ({
        type: "heading",
        depth: i,
        children: serializeNodes(node.children, opts),
      }),
    };
  }

  rules["strong"] = {
    serialize: (node: TElement, opts: SerializeOptions) => ({
      type: "strong",
      children: serializeNodes(node.children, opts),
    }),
  };

  return rules;
}

/**
 * Recursively serialize Plate nodes to mdast nodes using rules.
 * Simplified version of convertNodesSerialize that doesn't require an editor.
 */
function serializeNodes(nodes: (TElement | TText)[], options: SerializeOptions): unknown[] {
  const rules = (options as any)._rules as ReturnType<typeof buildSerializeRules>;
  return nodes.map((node) => {
    // Handle text nodes
    if ("text" in node) {
      return { type: "text", value: node.text };
    }
    // Handle element nodes
    const element = node as TElement;
    const rule = rules[element.type];
    if (rule) {
      return rule.serialize(element, options);
    }
    // Fallback: return node as-is
    return node;
  });
}

/**
 * Create serialize options with rules for testing.
 * Uses a custom _rules property to avoid needing a real Plate editor.
 */
function createSerializeOptions(): SerializeOptions {
  const rules = buildSerializeRules();
  return {
    _rules: rules,
  } as SerializeOptions;
}

/**
 * Helper to create properly typed MDX attribute.
 */
function attr(name: string, value: string | { type: "mdxJsxAttributeValueExpression"; value: string } | null = null) {
  return { type: "mdxJsxAttribute" as const, name, value };
}

// ============================================================================
// Card with Full Structure Tests
// ============================================================================

describe("Card with full structure", () => {
  it("deserializes Card with CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // MDX structure representing:
    // <Card>
    //   <CardHeader>
    //     <CardTitle>Title</CardTitle>
    //     <CardDescription>Description</CardDescription>
    //   </CardHeader>
    //   <CardContent>
    //     <p>Content here</p>
    //   </CardContent>
    //   <CardFooter>
    //     <Button>Save</Button>
    //   </CardFooter>
    // </Card>
    const mdxNode = {
      attributes: [],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "CardHeader",
          attributes: [],
          children: [
            {
              type: "mdxJsxFlowElement",
              name: "CardTitle",
              attributes: [],
              children: [{ type: "text", value: "Title" }],
            },
            {
              type: "mdxJsxFlowElement",
              name: "CardDescription",
              attributes: [],
              children: [{ type: "text", value: "Description" }],
            },
          ],
        },
        {
          type: "mdxJsxFlowElement",
          name: "CardContent",
          attributes: [],
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "Content here" }],
            },
          ],
        },
        {
          type: "mdxJsxFlowElement",
          name: "CardFooter",
          attributes: [],
          children: [
            {
              type: "mdxJsxTextElement",
              name: "Button",
              attributes: [],
              children: [{ type: "text", value: "Save" }],
            },
          ],
        },
      ],
    };

    const result = cardRule.deserialize(mdxNode, undefined, options);

    expect(result.type).toBe(CARD_KEY);
    expect(result.children).toHaveLength(3);

    // Check CardHeader
    const header = result.children[0] as TElement;
    expect(header.type).toBe(CARD_HEADER_KEY);
    expect(header.children).toHaveLength(2);

    // Check CardTitle
    const title = header.children[0] as TElement;
    expect(title.type).toBe(CARD_TITLE_KEY);
    expect((title.children[0] as TText).text).toBe("Title");

    // Check CardDescription
    const description = header.children[1] as TElement;
    expect(description.type).toBe(CARD_DESCRIPTION_KEY);
    expect((description.children[0] as TText).text).toBe("Description");

    // Check CardContent
    const content = result.children[1] as TElement;
    expect(content.type).toBe(CARD_CONTENT_KEY);
    const contentPara = content.children[0] as TElement;
    expect(contentPara.type).toBe("p");
    expect((contentPara.children[0] as TText).text).toBe("Content here");

    // Check CardFooter
    const footer = result.children[2] as TElement;
    expect(footer.type).toBe(CARD_FOOTER_KEY);
    const button = footer.children[0] as TElement;
    expect(button.type).toBe(BUTTON_KEY);
    expect((button.children[0] as TText).text).toBe("Save");
  });

  it("serializes Card with full structure", () => {
    const options = createSerializeOptions();

    // Plate structure
    const plateElement = {
      type: CARD_KEY,
      children: [
        {
          type: CARD_HEADER_KEY,
          children: [
            {
              type: CARD_TITLE_KEY,
              children: [{ text: "Title" }],
            },
            {
              type: CARD_DESCRIPTION_KEY,
              children: [{ text: "Description" }],
            },
          ],
        },
        {
          type: CARD_CONTENT_KEY,
          children: [
            {
              type: "p",
              children: [{ text: "Content here" }],
            },
          ],
        },
        {
          type: CARD_FOOTER_KEY,
          children: [
            {
              type: BUTTON_KEY,
              variant: "default",
              children: [{ text: "Save" }],
            },
          ],
        },
      ],
    } as any;

    const result = cardRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxFlowElement");
    expect(result.name).toBe("Card");
    expect(result.children).toHaveLength(3);

    // Check CardHeader
    const header = result.children[0] as MdxJsxElement;
    expect(header.name).toBe("CardHeader");
    expect(header.children).toHaveLength(2);

    // Check CardTitle
    const title = header.children[0] as MdxJsxElement;
    expect(title.name).toBe("CardTitle");

    // Check CardDescription
    const description = header.children[1] as MdxJsxElement;
    expect(description.name).toBe("CardDescription");

    // Check CardContent
    const content = result.children[1] as MdxJsxElement;
    expect(content.name).toBe("CardContent");

    // Check CardFooter
    const footer = result.children[2] as MdxJsxElement;
    expect(footer.name).toBe("CardFooter");
    const button = footer.children[0] as MdxJsxElement;
    expect(button.name).toBe("Button");
  });

  it("roundtrips Card structure correctly", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    const mdxNode = {
      attributes: [],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "CardHeader",
          attributes: [],
          children: [
            {
              type: "mdxJsxFlowElement",
              name: "CardTitle",
              attributes: [],
              children: [{ type: "text", value: "Project Overview" }],
            },
          ],
        },
        {
          type: "mdxJsxFlowElement",
          name: "CardContent",
          attributes: [],
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "Your project is on track." }],
            },
          ],
        },
      ],
    };

    // Deserialize
    const plateElement = cardRule.deserialize(mdxNode, undefined, deserializeOptions);

    // Serialize
    const serialized = cardRule.serialize(plateElement, serializeOptions);

    expect(serialized.type).toBe("mdxJsxFlowElement");
    expect(serialized.name).toBe("Card");

    const header = serialized.children[0] as MdxJsxElement;
    expect(header.name).toBe("CardHeader");

    const content = serialized.children[1] as MdxJsxElement;
    expect(content.name).toBe("CardContent");
  });
});

// ============================================================================
// LiveAction with Form Controls Tests
// ============================================================================

describe("LiveAction with form controls", () => {
  it("deserializes LiveAction with Input, Select, Checkbox, Button", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // MDX structure representing:
    // <LiveAction sql="UPDATE users SET name = {{name}} WHERE id = {{id}}">
    //   <Input name="name" type="text" placeholder="Enter name">Name</Input>
    //   <Select name="status" options={[{value: "active", label: "Active"}]}>Status</Select>
    //   <Checkbox name="verified">Verified</Checkbox>
    //   <Button variant="default">Submit</Button>
    // </LiveAction>
    const mdxNode = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "sql",
          value: "UPDATE users SET name = {{name}} WHERE id = {{id}}",
        },
      ],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "Input",
          attributes: [
            { type: "mdxJsxAttribute", name: "name", value: "name" },
            { type: "mdxJsxAttribute", name: "type", value: "text" },
            { type: "mdxJsxAttribute", name: "placeholder", value: "Enter name" },
          ],
          children: [{ type: "text", value: "Name" }],
        },
        {
          type: "mdxJsxFlowElement",
          name: "Select",
          attributes: [
            { type: "mdxJsxAttribute", name: "name", value: "status" },
            {
              type: "mdxJsxAttribute",
              name: "options",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value: '[{ value: "active", label: "Active" }]',
              },
            },
          ],
          children: [{ type: "text", value: "Status" }],
        },
        {
          type: "mdxJsxFlowElement",
          name: "Checkbox",
          attributes: [{ type: "mdxJsxAttribute", name: "name", value: "verified" }],
          children: [{ type: "text", value: "Verified" }],
        },
        {
          type: "mdxJsxTextElement",
          name: "Button",
          attributes: [{ type: "mdxJsxAttribute", name: "variant", value: "default" }],
          children: [{ type: "text", value: "Submit" }],
        },
      ],
    };

    const result = liveActionRule.deserialize(mdxNode as any, undefined, options);

    expect(result.type).toBe(LIVE_ACTION_KEY);
    expect(result.sql).toBe("UPDATE users SET name = {{name}} WHERE id = {{id}}");
    expect(result.children).toHaveLength(4);

    // Check Input
    const input = result.children[0] as any;
    expect(input.type).toBe(INPUT_KEY);
    expect(input.name).toBe("name");
    expect(input.inputType).toBe("text");
    expect(input.placeholder).toBe("Enter name");
    expect((input.children[0] as TText).text).toBe("Name");

    // Check Select
    const select = result.children[1] as any;
    expect(select.type).toBe(SELECT_KEY);
    expect(select.name).toBe("status");
    expect(select.options).toEqual([{ value: "active", label: "Active" }]);
    expect((select.children[0] as TText).text).toBe("Status");

    // Check Checkbox
    const checkbox = result.children[2] as any;
    expect(checkbox.type).toBe(CHECKBOX_KEY);
    expect(checkbox.name).toBe("verified");
    expect((checkbox.children[0] as TText).text).toBe("Verified");

    // Check Button
    const button = result.children[3] as any;
    expect(button.type).toBe(BUTTON_KEY);
    expect(button.variant).toBe("default");
    expect((button.children[0] as TText).text).toBe("Submit");
  });

  it("serializes LiveAction with form controls", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: LIVE_ACTION_KEY,
      sql: "UPDATE users SET name = {{name}} WHERE id = {{id}}",
      children: [
        {
          type: INPUT_KEY,
          name: "name",
          inputType: "text",
          placeholder: "Enter name",
          required: false,
          children: [{ text: "Name" }],
        },
        {
          type: SELECT_KEY,
          name: "status",
          options: [{ value: "active", label: "Active" }],
          required: false,
          children: [{ text: "Status" }],
        },
        {
          type: CHECKBOX_KEY,
          name: "verified",
          defaultChecked: false,
          required: false,
          children: [{ text: "Verified" }],
        },
        {
          type: BUTTON_KEY,
          variant: "default",
          children: [{ text: "Submit" }],
        },
      ],
    } as any;

    const result = liveActionRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxFlowElement");
    expect(result.name).toBe("LiveAction");
    expect(result.attributes.find((a) => a.name === "sql")?.value).toBe(
      "UPDATE users SET name = {{name}} WHERE id = {{id}}"
    );
    expect(result.children).toHaveLength(4);

    // Check Input
    const input = result.children[0] as MdxJsxElement;
    expect(input.name).toBe("Input");
    expect(input.attributes.find((a) => a.name === "name")?.value).toBe("name");
    // Note: type="text" is the default, so it's omitted from attributes
    expect(input.attributes.find((a) => a.name === "placeholder")?.value).toBe("Enter name");

    // Check Select
    const select = result.children[1] as MdxJsxElement;
    expect(select.name).toBe("Select");
    expect(select.attributes.find((a) => a.name === "name")?.value).toBe("status");

    // Check Checkbox
    const checkbox = result.children[2] as MdxJsxElement;
    expect(checkbox.name).toBe("Checkbox");
    expect(checkbox.attributes.find((a) => a.name === "name")?.value).toBe("verified");

    // Check Button
    const button = result.children[3] as MdxJsxElement;
    expect(button.name).toBe("Button");
  });

  it("roundtrips LiveAction with multiple form controls", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    const mdxNode = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "sql",
          value: "INSERT INTO tasks (title, priority) VALUES ({{title}}, {{priority}})",
        },
      ],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "Input",
          attributes: [
            { type: "mdxJsxAttribute", name: "name", value: "title" },
            { type: "mdxJsxAttribute", name: "type", value: "text" },
          ],
          children: [{ type: "text", value: "Task Title" }],
        },
        {
          type: "mdxJsxFlowElement",
          name: "Select",
          attributes: [
            { type: "mdxJsxAttribute", name: "name", value: "priority" },
            {
              type: "mdxJsxAttribute",
              name: "options",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value: '[{ value: "high", label: "High" }, { value: "low", label: "Low" }]',
              },
            },
          ],
          children: [{ type: "text", value: "Priority" }],
        },
        {
          type: "mdxJsxTextElement",
          name: "Button",
          attributes: [],
          children: [{ type: "text", value: "Create Task" }],
        },
      ],
    };

    // Deserialize
    const plateElement = liveActionRule.deserialize(mdxNode as any, undefined, deserializeOptions);

    expect(plateElement.type).toBe(LIVE_ACTION_KEY);
    expect(plateElement.sql).toBe("INSERT INTO tasks (title, priority) VALUES ({{title}}, {{priority}})");

    // Serialize
    const serialized = liveActionRule.serialize(plateElement, serializeOptions);

    expect(serialized.name).toBe("LiveAction");
    expect(serialized.children).toHaveLength(3);
  });
});

// ============================================================================
// LiveValue with Template Content Tests
// ============================================================================

describe("LiveValue with template content", () => {
  it("deserializes LiveValue with template content", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // MDX structure representing:
    // <LiveValue query="SELECT * FROM metrics">
    //   ## {{value}}
    //   {{label}}
    // </LiveValue>
    const mdxNode = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "query",
          value: "SELECT * FROM metrics",
        },
      ],
      children: [
        {
          type: "heading",
          depth: 2,
          children: [{ type: "text", value: "{{value}}" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "{{label}}" }],
        },
      ],
    };

    const result = liveValueRule.deserialize(mdxNode as any, undefined, options);

    expect(result.type).toBe(LIVE_VALUE_KEY);
    expect(result.query).toBe("SELECT * FROM metrics");
    expect(result.children).toHaveLength(2);

    // Check heading
    const heading = result.children[0] as TElement;
    expect(heading.type).toBe("h2");
    expect((heading.children[0] as TText).text).toBe("{{value}}");

    // Check paragraph
    const para = result.children[1] as TElement;
    expect(para.type).toBe("p");
    expect((para.children[0] as TText).text).toBe("{{label}}");
  });

  it("serializes LiveValue with template content", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: LIVE_VALUE_KEY,
      query: "SELECT * FROM metrics",
      display: "auto",
      children: [
        {
          type: "h2",
          children: [{ text: "{{value}}" }],
        },
        {
          type: "p",
          children: [{ text: "{{label}}" }],
        },
      ],
    } as any;

    const result = liveValueRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxFlowElement"); // Has template content
    expect(result.name).toBe("LiveValue");
    expect(result.attributes.find((a) => a.name === "query")?.value).toBe("SELECT * FROM metrics");
    expect(result.children).toHaveLength(2);

    // Check heading
    const heading = result.children[0] as any;
    expect(heading.type).toBe("heading");
    expect(heading.depth).toBe(2);

    // Check paragraph
    const para = result.children[1] as any;
    expect(para.type).toBe("paragraph");
  });

  it("serializes LiveValue without template as void element", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: LIVE_VALUE_KEY,
      query: "SELECT COUNT(*) FROM users",
      display: "auto",
      children: [{ text: "" }],
    } as any;

    const result = liveValueRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxTextElement"); // No template content
    expect(result.name).toBe("LiveValue");
    expect(result.children).toHaveLength(0);
  });

  it("roundtrips LiveValue with template content", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    const mdxNode = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "query",
          value: "SELECT name, value FROM dashboard_metrics",
        },
      ],
      children: [
        {
          type: "heading",
          depth: 3,
          children: [{ type: "text", value: "Metric: {{name}}" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "Value: {{value}}" }],
        },
      ],
    };

    // Deserialize
    const plateElement = liveValueRule.deserialize(mdxNode as any, undefined, deserializeOptions);

    expect(plateElement.type).toBe(LIVE_VALUE_KEY);
    expect(plateElement.children).toHaveLength(2);

    // Serialize
    const serialized = liveValueRule.serialize(plateElement, serializeOptions);

    expect(serialized.name).toBe("LiveValue");
    expect(serialized.type).toBe("mdxJsxFlowElement");
    expect(serialized.children).toHaveLength(2);
  });
});

// ============================================================================
// Alert with Nested Markdown Tests
// ============================================================================

describe("Alert with nested markdown", () => {
  it("deserializes Alert with nested markdown (bold)", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // MDX structure representing:
    // <Alert title="Warning" variant="warning">
    //   Please **review** before continuing.
    // </Alert>
    const mdxNode = {
      attributes: [
        { type: "mdxJsxAttribute", name: "title", value: "Warning" },
        { type: "mdxJsxAttribute", name: "variant", value: "warning" },
      ],
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Please " },
            {
              type: "strong",
              children: [{ type: "text", value: "review" }],
            },
            { type: "text", value: " before continuing." },
          ],
        },
      ],
    };

    const result = alertRule.deserialize(mdxNode as any, undefined, options);

    expect(result.type).toBe(ALERT_KEY);
    expect(result.title).toBe("Warning");
    expect(result.variant).toBe("warning");
    expect(result.children).toHaveLength(1);

    // Check paragraph with nested content
    const para = result.children[0] as TElement;
    expect(para.type).toBe("p");
    expect(para.children).toHaveLength(3);

    expect((para.children[0] as TText).text).toBe("Please ");

    const strong = para.children[1] as TElement;
    expect(strong.type).toBe("strong");
    expect((strong.children[0] as TText).text).toBe("review");

    expect((para.children[2] as TText).text).toBe(" before continuing.");
  });

  it("serializes Alert with nested markdown", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: ALERT_KEY,
      title: "Warning",
      variant: "warning",
      children: [
        {
          type: "p",
          children: [
            { text: "Please " },
            {
              type: "strong",
              children: [{ text: "review" }],
            },
            { text: " before continuing." },
          ],
        },
      ],
    } as any;

    const result = alertRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxFlowElement");
    expect(result.name).toBe("Alert");
    expect(result.attributes.find((a) => a.name === "title")?.value).toBe("Warning");
    expect(result.attributes.find((a) => a.name === "variant")?.value).toBe("warning");
    expect(result.children).toHaveLength(1);

    // Check paragraph
    const para = result.children[0] as any;
    expect(para.type).toBe("paragraph");
    expect(para.children).toHaveLength(3);

    // Check strong
    const strong = para.children[1] as any;
    expect(strong.type).toBe("strong");
  });

  it("roundtrips Alert with complex nested markdown", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    const mdxNode = {
      attributes: [
        { type: "mdxJsxAttribute", name: "title", value: "Important Notice" },
        { type: "mdxJsxAttribute", name: "variant", value: "default" },
      ],
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "This is " },
            {
              type: "strong",
              children: [{ type: "text", value: "very important" }],
            },
            { type: "text", value: " information." },
          ],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "Please take action immediately." }],
        },
      ],
    };

    // Deserialize
    const plateElement = alertRule.deserialize(mdxNode as any, undefined, deserializeOptions);

    expect(plateElement.type).toBe(ALERT_KEY);
    expect(plateElement.children).toHaveLength(2);

    // Serialize
    const serialized = alertRule.serialize(plateElement, serializeOptions);

    expect(serialized.name).toBe("Alert");
    expect(serialized.children).toHaveLength(2);

    // Verify first paragraph has strong element
    const firstPara = serialized.children[0] as any;
    expect(firstPara.children).toHaveLength(3);
    expect(firstPara.children[1].type).toBe("strong");
  });

  it("handles Alert with default variant", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    const mdxNode = {
      attributes: [{ type: "mdxJsxAttribute", name: "title", value: "Note" }],
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "This is a simple note." }],
        },
      ],
    };

    const result = alertRule.deserialize(mdxNode as any, undefined, options);

    expect(result.type).toBe(ALERT_KEY);
    expect(result.title).toBe("Note");
    expect(result.variant).toBeUndefined(); // No variant specified
  });

  it("serializes Alert without title attribute when undefined", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: ALERT_KEY,
      variant: "success",
      children: [
        {
          type: "p",
          children: [{ text: "Operation completed successfully." }],
        },
      ],
    } as any;

    const result = alertRule.serialize(plateElement, options);

    expect(result.attributes.find((a) => a.name === "title")).toBeUndefined();
    expect(result.attributes.find((a) => a.name === "variant")?.value).toBe("success");
  });
});

// ============================================================================
// Complex Nesting Scenarios
// ============================================================================

describe("Complex nesting scenarios", () => {
  it("handles Card containing LiveAction with form controls", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // Card > CardContent > LiveAction > Input + Button
    const mdxNode = {
      attributes: [],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "CardHeader",
          attributes: [],
          children: [
            {
              type: "mdxJsxFlowElement",
              name: "CardTitle",
              attributes: [],
              children: [{ type: "text", value: "Update User" }],
            },
          ],
        },
        {
          type: "mdxJsxFlowElement",
          name: "CardContent",
          attributes: [],
          children: [
            {
              type: "mdxJsxFlowElement",
              name: "LiveAction",
              attributes: [
                {
                  type: "mdxJsxAttribute",
                  name: "sql",
                  value: "UPDATE users SET email = {{email}}",
                },
              ],
              children: [
                {
                  type: "mdxJsxFlowElement",
                  name: "Input",
                  attributes: [
                    { type: "mdxJsxAttribute", name: "name", value: "email" },
                    { type: "mdxJsxAttribute", name: "type", value: "email" },
                  ],
                  children: [{ type: "text", value: "Email" }],
                },
                {
                  type: "mdxJsxTextElement",
                  name: "Button",
                  attributes: [],
                  children: [{ type: "text", value: "Update" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = cardRule.deserialize(mdxNode, undefined, options);

    expect(result.type).toBe(CARD_KEY);

    // Navigate to LiveAction
    const cardContent = result.children[1] as TElement;
    expect(cardContent.type).toBe(CARD_CONTENT_KEY);

    const liveAction = cardContent.children[0] as any;
    expect(liveAction.type).toBe(LIVE_ACTION_KEY);
    expect(liveAction.sql).toBe("UPDATE users SET email = {{email}}");
    expect(liveAction.children).toHaveLength(2);

    const input = liveAction.children[0] as any;
    expect(input.type).toBe(INPUT_KEY);
    expect(input.name).toBe("email");

    const button = liveAction.children[1] as any;
    expect(button.type).toBe(BUTTON_KEY);
  });

  it("handles multiple Alerts within a Card", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    const mdxNode = {
      attributes: [],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "CardContent",
          attributes: [],
          children: [
            {
              type: "mdxJsxFlowElement",
              name: "Alert",
              attributes: [
                { type: "mdxJsxAttribute", name: "variant", value: "success" },
              ],
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Success message" }],
                },
              ],
            },
            {
              type: "mdxJsxFlowElement",
              name: "Alert",
              attributes: [
                { type: "mdxJsxAttribute", name: "variant", value: "warning" },
              ],
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Warning message" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = cardRule.deserialize(mdxNode, undefined, options);

    expect(result.type).toBe(CARD_KEY);

    const cardContent = result.children[0] as TElement;
    expect(cardContent.type).toBe(CARD_CONTENT_KEY);
    expect(cardContent.children).toHaveLength(2);

    const alert1 = cardContent.children[0] as any;
    expect(alert1.type).toBe(ALERT_KEY);
    expect(alert1.variant).toBe("success");

    const alert2 = cardContent.children[1] as any;
    expect(alert2.type).toBe(ALERT_KEY);
    expect(alert2.variant).toBe("warning");
  });

  it("handles empty children gracefully", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    const mdxNode = {
      attributes: [],
      children: [],
    };

    const result = cardRule.deserialize(mdxNode, undefined, options);

    expect(result.type).toBe(CARD_KEY);
    expect(result.children).toHaveLength(1); // Default empty paragraph
    expect((result.children[0] as TElement).type).toBe("p");
  });
});

// ============================================================================
// LiveValue with Chart Children (Critical Roundtrip Test)
// ============================================================================

describe("LiveValue with chart children", () => {
  it("deserializes LiveValue with BarChart child", () => {
    const convertChildren = createMockConvertChildren();
    const options: DeserializeOptions = { convertChildren };

    // MDX: <LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
    //        <BarChart xKey="status" yKey="count" />
    //      </LiveValue>
    const mdxNode = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "query",
          value: "SELECT status, COUNT(*) as count FROM features GROUP BY status",
        },
      ],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "BarChart",
          attributes: [
            { type: "mdxJsxAttribute", name: "xKey", value: "status" },
            { type: "mdxJsxAttribute", name: "yKey", value: "count" },
          ],
          children: [],
        },
      ],
    };

    const result = liveValueRule.deserialize(mdxNode as any, undefined, options);

    expect(result.type).toBe(LIVE_VALUE_KEY);
    expect(result.query).toBe("SELECT status, COUNT(*) as count FROM features GROUP BY status");
    // Should have BarChart as child
    expect(result.children).toHaveLength(1);
    const barChart = result.children[0] as TElement;
    expect(barChart.type).toBe(BAR_CHART_KEY);
    expect((barChart as any).xKey).toBe("status");
    expect((barChart as any).yKey).toBe("count");
  });

  it("serializes LiveValue with BarChart child", () => {
    const options = createSerializeOptions();

    const plateElement = {
      type: LIVE_VALUE_KEY,
      query: "SELECT status, COUNT(*) as count FROM tasks GROUP BY status",
      display: "auto",
      children: [
        {
          type: BAR_CHART_KEY,
          xKey: "status",
          yKey: "count",
          height: 300,
          children: [{ text: "" }],
        },
      ],
    } as any;

    const result = liveValueRule.serialize(plateElement, options);

    expect(result.type).toBe("mdxJsxFlowElement");
    expect(result.name).toBe("LiveValue");
    // Should have BarChart child in serialized output
    expect(result.children).toHaveLength(1);
    const barChart = result.children[0] as any;
    expect(barChart.name).toBe("BarChart");
    expect(barChart.attributes.find((a: any) => a.name === "xKey")?.value).toBe("status");
    expect(barChart.attributes.find((a: any) => a.name === "yKey")?.value).toBe("count");
  });

  it("roundtrips LiveValue with BarChart child correctly", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    // Original MDX structure
    const originalMdx = {
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "query",
          value: "SELECT category, SUM(amount) as total FROM sales GROUP BY category",
        },
      ],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "BarChart",
          attributes: [
            { type: "mdxJsxAttribute", name: "xKey", value: "category" },
            { type: "mdxJsxAttribute", name: "yKey", value: "total" },
            {
              type: "mdxJsxAttribute",
              name: "height",
              value: { type: "mdxJsxAttributeValueExpression", value: "400" },
            },
          ],
          children: [],
        },
      ],
    };

    // Deserialize: MDX → Plate
    const plateElement = liveValueRule.deserialize(originalMdx as any, undefined, deserializeOptions);

    expect(plateElement.type).toBe(LIVE_VALUE_KEY);
    expect(plateElement.children).toHaveLength(1);
    expect((plateElement.children[0] as TElement).type).toBe(BAR_CHART_KEY);

    // Serialize: Plate → MDX
    const serialized = liveValueRule.serialize(plateElement, serializeOptions);

    expect(serialized.name).toBe("LiveValue");
    expect(serialized.type).toBe("mdxJsxFlowElement");
    // Critical: BarChart should be preserved in children
    expect(serialized.children).toHaveLength(1);
    const barChart = serialized.children[0] as any;
    expect(barChart.name).toBe("BarChart");
    expect(barChart.attributes.find((a: any) => a.name === "xKey")?.value).toBe("category");
    expect(barChart.attributes.find((a: any) => a.name === "yKey")?.value).toBe("total");
  });

  it("handles LiveValue with LineChart child", () => {
    const convertChildren = createMockConvertChildren();
    const deserializeOptions: DeserializeOptions = { convertChildren };
    const serializeOptions = createSerializeOptions();

    const mdxNode = {
      attributes: [
        { type: "mdxJsxAttribute", name: "query", value: "SELECT date, revenue FROM sales" },
      ],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "LineChart",
          attributes: [
            { type: "mdxJsxAttribute", name: "xKey", value: "date" },
            { type: "mdxJsxAttribute", name: "yKey", value: "revenue" },
          ],
          children: [],
        },
      ],
    };

    // Deserialize
    const plateElement = liveValueRule.deserialize(mdxNode as any, undefined, deserializeOptions);

    expect(plateElement.children).toHaveLength(1);
    expect((plateElement.children[0] as TElement).type).toBe(LINE_CHART_KEY);

    // Serialize
    const serialized = liveValueRule.serialize(plateElement, serializeOptions);

    expect(serialized.children).toHaveLength(1);
    expect((serialized.children[0] as any).name).toBe("LineChart");
  });
});
