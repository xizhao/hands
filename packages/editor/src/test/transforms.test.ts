/**
 * Transforms Tests
 *
 * Tests for editor transform utilities (pure functions only).
 * setBlockType tests are skipped as they require full editor setup.
 */

import { describe, it, expect } from "vitest";
import { KEYS } from "platejs";
import { getBlockType } from "../transforms";

describe("getBlockType", () => {
  it("returns type for regular block", () => {
    const block = { type: "p", children: [{ text: "" }] };
    expect(getBlockType(block)).toBe("p");
  });

  it("returns type for heading", () => {
    const block = { type: "h1", children: [{ text: "Title" }] };
    expect(getBlockType(block)).toBe("h1");
  });

  it("returns type for code block", () => {
    const block = { type: "code_block", children: [{ text: "code" }] };
    expect(getBlockType(block)).toBe("code_block");
  });

  it("returns ul for unordered list item", () => {
    const block = {
      type: "p",
      [KEYS.listType]: "ul",
      children: [{ text: "" }],
    };
    expect(getBlockType(block as any)).toBe(KEYS.ul);
  });

  it("returns ol for ordered list item", () => {
    const block = {
      type: "p",
      [KEYS.listType]: KEYS.ol,
      children: [{ text: "" }],
    };
    expect(getBlockType(block as any)).toBe(KEYS.ol);
  });

  it("returns listTodo for todo list item", () => {
    const block = {
      type: "p",
      [KEYS.listType]: KEYS.listTodo,
      children: [{ text: "" }],
    };
    expect(getBlockType(block as any)).toBe(KEYS.listTodo);
  });
});
