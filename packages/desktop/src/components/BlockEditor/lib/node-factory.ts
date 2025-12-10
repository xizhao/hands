/**
 * Node factory - creates JsxNode instances for each component type
 */

import type { JsxNode } from "../types";
import { generateNodeId } from "./node-utils";

export type ComponentType =
  | "container"
  | "text"
  | "heading"
  | "button"
  | "input"
  | "card"
  | "expression"
  | "datatable";

export function createNode(nodeType: ComponentType | string): JsxNode {
  const id = generateNodeId();

  switch (nodeType) {
    case "container":
      return {
        id,
        type: "element",
        tagName: "div",
        props: {
          className: { type: "literal", value: "flex flex-col gap-2 p-4" },
        },
        children: [],
      };

    case "text":
      return {
        id,
        type: "element",
        tagName: "p",
        props: {
          className: { type: "literal", value: "text-base" },
        },
        children: [
          { id: `${id}_text`, type: "text", text: "Edit me" },
        ],
      };

    case "heading":
      return {
        id,
        type: "element",
        tagName: "h2",
        props: {
          className: { type: "literal", value: "text-xl font-semibold" },
        },
        children: [
          { id: `${id}_text`, type: "text", text: "Heading" },
        ],
      };

    case "button":
      return {
        id,
        type: "element",
        tagName: "button",
        props: {
          className: { type: "literal", value: "px-4 py-2 bg-primary text-primary-foreground rounded-md" },
        },
        children: [
          { id: `${id}_text`, type: "text", text: "Button" },
        ],
      };

    case "input":
      return {
        id,
        type: "element",
        tagName: "input",
        props: {
          type: { type: "literal", value: "text" },
          placeholder: { type: "literal", value: "Enter text..." },
          className: { type: "literal", value: "w-full px-3 py-2 border rounded-md" },
        },
      };

    case "card":
      return {
        id,
        type: "element",
        tagName: "div",
        props: {
          className: { type: "literal", value: "p-4 border rounded-lg bg-card" },
        },
        children: [],
      };

    case "expression":
      return {
        id,
        type: "expression",
        expression: "data",
      };

    case "datatable":
      return {
        id,
        type: "element",
        tagName: "DataTable",
        props: {
          data: { type: "expression", value: "data", rawSource: "data" },
        },
      };

    default:
      return {
        id,
        type: "element",
        tagName: "div",
        children: [],
      };
  }
}
