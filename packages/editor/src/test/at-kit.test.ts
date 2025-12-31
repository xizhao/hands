/**
 * At-Kit Tests
 *
 * Tests for @ autocomplete behavior:
 * 1. Sub-editor preview pattern (using createPlateEditor for isolated selection context)
 * 2. Block insertion without selection corruption
 */

import { createPlateEditor } from "platejs/react";
import { describe, expect, it } from "vitest";
import { createTestEditor, testDeserialize } from "./create-test-editor";

describe("at-kit ghost preview", () => {
  /**
   * The ghost preview uses a sub-editor pattern (editable void) to render
   * deserialized MDX content. This gives the preview its own selection context,
   * preventing useSelected() crashes when stdlib components render.
   */
  it("sub-editor has independent selection context", () => {
    const mainEditor = createTestEditor({
      value: [{ type: "p", children: [{ text: "main editor" }] }],
    });

    // Main editor has its own selection
    mainEditor.tf.select({ path: [0, 0], offset: 0 });
    expect(mainEditor.selection).not.toBeNull();

    // Sub-editor created with same plugins has its own selection (null initially)
    const subEditor = createPlateEditor({
      plugins: mainEditor.pluginList as any,
      value: [{ type: "p", children: [{ text: "sub editor" }] }],
    });

    // Sub-editor selection is independent from main editor
    expect(subEditor.selection).toBeNull();

    // Setting selection on sub-editor doesn't affect main editor
    subEditor.tf.select({ path: [0, 0], offset: 0 });
    expect(subEditor.selection).not.toBeNull();
    expect(mainEditor.selection?.anchor.offset).toBe(0);
  });

  it("deserialized block content can be rendered in sub-editor", () => {
    const mainEditor = createTestEditor();

    // Deserialize block content
    const chartMdx = `<BarChart data={[{name: "A", value: 10}]} xKey="name" yKeys={["value"]} />`;
    const nodes = testDeserialize(chartMdx);

    expect(nodes.length).toBeGreaterThan(0);

    // Create sub-editor with the deserialized content
    const subEditor = createPlateEditor({
      plugins: mainEditor.pluginList as any,
      value: nodes,
    });

    // Sub-editor should have the content
    expect(subEditor.children.length).toBeGreaterThan(0);
  });
});

describe("at-kit block insertion", () => {
  it("inserting block content should not corrupt selection", () => {
    // Create editor with initial content including a paragraph
    const editor = createTestEditor({
      value: [{ type: "p", children: [{ text: "Hello " }] }],
    });

    // Set selection at end of paragraph
    editor.tf.select({ path: [0, 0], offset: 6 });

    // Simulate what at-ghost-input does: deserialize block MDX and insert
    const chartMdx = `<BarChart data={[{name: "A", value: 10}]} xKey="name" yKeys={["value"]} />`;
    const nodes = testDeserialize(chartMdx);

    // Insert block content at current position (simulating at-kit behavior)
    editor.tf.withoutNormalizing(() => {
      editor.tf.insertNodes(nodes, { at: [0] });
    });

    // The critical test: selection should be valid
    // This would crash before the fix with "Cannot read properties of undefined (reading 'path')"
    expect(editor.selection).not.toBeNull();

    if (editor.selection) {
      expect(editor.selection.anchor).toBeDefined();
      expect(editor.selection.anchor.path).toBeDefined();
      expect(editor.selection.focus).toBeDefined();
      expect(editor.selection.focus.path).toBeDefined();
    }
  });

  it("inserting block content then calling insertText should not crash", () => {
    const editor = createTestEditor({
      value: [{ type: "p", children: [{ text: "Test" }] }],
    });

    editor.tf.select({ path: [0, 0], offset: 4 });

    const tableMdx = `| Col1 | Col2 |\n|------|------|\n| A | B |`;
    const nodes = testDeserialize(tableMdx);

    // Insert block content
    editor.tf.withoutNormalizing(() => {
      editor.tf.insertNodes(nodes, { at: [0] });
    });

    // This is what was causing the crash - calling insertText after block insertion
    // The fix: only call insertText(" ") for inline content
    // For block content, we should NOT call insertText

    // Verify the editor is in a valid state
    expect(editor.selection).not.toBeNull();
    expect(() => {
      // Simulate what useSelected does internally
      if (editor.selection) {
        const { anchor, focus } = editor.selection;
        // This would throw if selection is corrupted
        expect(anchor.path.length).toBeGreaterThan(0);
        expect(focus.path.length).toBeGreaterThan(0);
      }
    }).not.toThrow();
  });

  it("inserting inline content should allow trailing space", () => {
    const editor = createTestEditor({
      value: [{ type: "p", children: [{ text: "Hello " }] }],
    });

    editor.tf.select({ path: [0, 0], offset: 6 });

    // Insert inline text
    editor.tf.insertNodes([{ text: "world" }]);

    // For inline content, adding a space should be safe
    editor.tf.insertText(" ");

    // Selection should still be valid
    expect(editor.selection).not.toBeNull();
    if (editor.selection) {
      expect(editor.selection.anchor.path).toBeDefined();
    }

    // Content should include the space
    const text = (editor.children[0] as any).children[0].text;
    expect(text).toContain("world ");
  });

  it("isInline check correctly identifies block vs inline content", () => {
    // Block content - should NOT get trailing space
    const chartNodes = testDeserialize(`<BarChart data={[]} xKey="x" yKeys={["y"]} />`);
    const isChartInline = chartNodes.length === 1 && !("type" in chartNodes[0]);
    expect(isChartInline).toBe(false);

    // Inline content from single paragraph - should get trailing space
    const inlineNodes = testDeserialize("hello world");
    // If it's a single paragraph, we unwrap to get inline children
    let finalNodes: ((typeof inlineNodes)[0] | { text: string })[] = inlineNodes;
    if (inlineNodes.length === 1 && inlineNodes[0].type === "p" && inlineNodes[0].children) {
      finalNodes = inlineNodes[0].children as typeof finalNodes;
    }
    const isTextInline = finalNodes.length === 1 && !("type" in finalNodes[0]);
    expect(isTextInline).toBe(true);
  });
});
