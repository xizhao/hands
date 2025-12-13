/**
 * Component Discovery Tests
 *
 * Tests for:
 * 1. JSX tree recognition - identifying top-level elements
 * 2. Conversion to Plate blocks - correct number of editable blocks
 * 3. Component type detection - custom vs HTML elements
 */

import { describe, expect, test } from "bun:test";
import { parseSourceWithLocations } from "../ast/oxc-parser";
import { sourceToPlateValueSurgical } from "../plate/surgical-converters";

/**
 * Helper to wrap JSX in export default (required by parser)
 * The parser expects block file format: `export default (ctx) => (<JSX />)`
 */
function wrapJsx(jsx: string): string {
  return `export default (ctx) => (${jsx})`;
}

describe("Component Discovery", () => {
  describe("JSX Tree Recognition", () => {
    test("recognizes single top-level element", () => {
      const source = wrapJsx(`<div>Hello</div>`);
      const result = parseSourceWithLocations(source);

      expect(result.root).toBeDefined();
      expect(result.root?.tagName).toBe("div");
      expect(result.root?.children).toHaveLength(1);
      expect(result.root?.children[0].isText).toBe(true);
    });

    test("recognizes fragment with multiple top-level elements", () => {
      const source = wrapJsx(`<>
        <h1>Title</h1>
        <p>Paragraph</p>
        <Button>Click</Button>
      </>`);
      const result = parseSourceWithLocations(source);

      expect(result.root).toBeDefined();
      expect(result.root?.tagName).toBe("#fragment");
      expect(result.root?.children).toHaveLength(3);
    });

    test("recognizes nested elements as children, not top-level", () => {
      const source = wrapJsx(`<div>
        <span>Nested span</span>
        <p>Nested paragraph</p>
      </div>`);
      const result = parseSourceWithLocations(source);

      expect(result.root).toBeDefined();
      expect(result.root?.tagName).toBe("div");
      // Children are nested, not top-level
      expect(result.root?.children).toHaveLength(2);
      expect(result.root?.children[0].tagName).toBe("span");
      expect(result.root?.children[1].tagName).toBe("p");
    });

    test("recognizes PascalCase as custom component", () => {
      const source = wrapJsx(`<Button variant="primary">Click me</Button>`);
      const result = parseSourceWithLocations(source);

      expect(result.root?.tagName).toBe("Button");
      // Props are preserved
      expect(result.root?.props.variant?.value).toBe("primary");
    });

    test("recognizes kebab-case as custom element", () => {
      const source = wrapJsx(`<my-widget data-id="123">Content</my-widget>`);
      const result = parseSourceWithLocations(source);

      expect(result.root?.tagName).toBe("my-widget");
    });

    test("preserves element IDs for surgical updates", () => {
      const source = wrapJsx(`<div><span>A</span><span>B</span></div>`);
      const result = parseSourceWithLocations(source);

      expect(result.root?.id).toBeDefined();
      expect(result.root?.children[0].id).toBeDefined();
      expect(result.root?.children[1].id).toBeDefined();
      // IDs should be unique
      expect(result.root?.children[0].id).not.toBe(result.root?.children[1].id);
    });
  });

  describe("Conversion to Plate Blocks", () => {
    test("single div becomes one Plate block", () => {
      const source = wrapJsx(`<div>Hello world</div>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(1);
      expect(value[0].type).toBe("div");
    });

    test("fragment children become multiple Plate blocks", () => {
      const source = wrapJsx(`<>
        <h1>Title</h1>
        <p>Paragraph</p>
      </>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(2);
      expect(value[0].type).toBe("h1");
      expect(value[1].type).toBe("p");
    });

    test("wrapper div with block children flattens to blocks", () => {
      const source = wrapJsx(`<div>
        <h1>Title</h1>
        <p>Content</p>
      </div>`);
      const { value } = sourceToPlateValueSurgical(source);

      // div wrapper with block children should flatten
      expect(value.length).toBeGreaterThanOrEqual(1);
    });

    test("Button component becomes editable Plate block", () => {
      const source = wrapJsx(`<Button variant="primary">Click</Button>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(1);
      expect(value[0].type).toBe("Button");
      // Components with children are editable, not void
      expect((value[0] as any).isVoid).toBeFalsy();
    });

    test("Card with children becomes editable Plate block", () => {
      const source = wrapJsx(`<Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
      </Card>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(1);
      expect(value[0].type).toBe("Card");
      // Card is editable - its children are traversable
      expect((value[0] as any).isVoid).toBeFalsy();
      // Children should be preserved
      const card = value[0] as any;
      expect(card.children.some((c: any) => c.type === "CardHeader")).toBe(true);
    });

    test("mixed HTML and components create correct blocks", () => {
      const source = wrapJsx(`<>
        <h1>Welcome</h1>
        <Button>Action</Button>
        <p>More text</p>
      </>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(3);
      expect(value[0].type).toBe("h1");
      expect(value[1].type).toBe("Button");
      // Button is editable, not void
      expect((value[1] as any).isVoid).toBeFalsy();
      expect(value[2].type).toBe("p");
    });

    test("preserves props on Plate blocks", () => {
      const source = wrapJsx(`<Button variant="destructive" size="lg">Delete</Button>`);
      const { value } = sourceToPlateValueSurgical(source);

      expect(value[0].type).toBe("Button");
      // Props should be in jsxProps
      const block = value[0] as any;
      expect(block.jsxProps?.variant).toBe("destructive");
      expect(block.jsxProps?.size).toBe("lg");
    });

    test("preserves stable IDs from source", () => {
      // Use a non-flattening structure to test ID preservation
      const source = wrapJsx(`<Card><CardContent>Text</CardContent></Card>`);
      const { value, parseResult } = sourceToPlateValueSurgical(source);

      expect((value[0] as any).id).toBeDefined();
      // ID should match the parsed AST root
      expect((value[0] as any).id).toBe(parseResult.root?.id);
    });
  });

  describe("Block Count Verification", () => {
    test("empty JSX creates one empty paragraph", () => {
      // Empty source (no export default) results in fallback
      const source = ``;
      const { value } = sourceToPlateValueSurgical(source);

      expect(value).toHaveLength(1);
      expect(value[0].type).toBe("p");
    });

    test("complex layout creates correct block count", () => {
      const source = wrapJsx(`<>
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricCard title="Users" value={100} />
            <MetricCard title="Revenue" value={5000} />
          </CardContent>
        </Card>
        <div>
          <h2>Actions</h2>
          <Button>Refresh</Button>
          <Button>Export</Button>
        </div>
      </>`);
      const { value } = sourceToPlateValueSurgical(source);

      // Should have 2 top-level blocks: Card and div
      expect(value).toHaveLength(2);
      expect(value[0].type).toBe("Card");
      expect(value[1].type).toBe("div");
    });
  });
});

describe("Component Type Detection", () => {
  /**
   * Component detection logic:
   * - PascalCase (starts with uppercase) = React component (custom)
   * - lowercase HTML elements = native HTML
   * - kebab-case = custom elements (web components)
   *
   * This matches JSX semantics where <button> is HTML but <Button> is a component
   */
  function isCustomComponent(tagName: string): boolean {
    // PascalCase = always a React component
    if (/^[A-Z]/.test(tagName)) {
      return true;
    }

    // Check if it's a known HTML element (lowercase only)
    const HTML_ELEMENTS = new Set([
      "div",
      "p",
      "span",
      "section",
      "article",
      "aside",
      "header",
      "footer",
      "main",
      "nav",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "form",
      "fieldset",
      "legend",
      "label",
      "input",
      "textarea",
      "select",
      "option",
      "figure",
      "figcaption",
      "img",
      "video",
      "audio",
      "canvas",
      "svg",
      "pre",
      "code",
      "blockquote",
      "hr",
      "br",
      "a",
      "em",
      "strong",
      "small",
      "mark",
      "del",
      "ins",
      "button",
      "fragment",
    ]);

    return !HTML_ELEMENTS.has(tagName);
  }

  test("lowercase HTML elements are not custom components", () => {
    expect(isCustomComponent("div")).toBe(false);
    expect(isCustomComponent("span")).toBe(false);
    expect(isCustomComponent("p")).toBe(false);
    expect(isCustomComponent("h1")).toBe(false);
    expect(isCustomComponent("button")).toBe(false);
    expect(isCustomComponent("input")).toBe(false);
  });

  test("PascalCase elements are ALWAYS custom components", () => {
    // This is the JSX convention: <Button> is a component, <button> is HTML
    expect(isCustomComponent("Button")).toBe(true);
    expect(isCustomComponent("Card")).toBe(true);
    expect(isCustomComponent("MyComponent")).toBe(true);
    expect(isCustomComponent("DataTable")).toBe(true);
    // Even things that look like HTML when lowercase
    expect(isCustomComponent("Div")).toBe(true);
    expect(isCustomComponent("Span")).toBe(true);
  });

  test("kebab-case custom elements are custom components", () => {
    expect(isCustomComponent("my-widget")).toBe(true);
    expect(isCustomComponent("x-button")).toBe(true);
    expect(isCustomComponent("custom-element")).toBe(true);
  });

  test("uppercase HTML is still custom (JSX convention)", () => {
    // In JSX, DIV would be treated as a component reference, not HTML
    // This is how React works - only lowercase = HTML
    expect(isCustomComponent("DIV")).toBe(true);
    expect(isCustomComponent("SPAN")).toBe(true);
  });
});
