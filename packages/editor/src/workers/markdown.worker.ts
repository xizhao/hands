/**
 * Markdown Worker - handles serialization off main thread
 *
 * Static imports ensure proper bundling with Vite.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
// Use alias - Vite should resolve this via the main config
import { serializationRules } from "@hands/core/primitives/serialization";

// Build lookup maps for rules
const rulesById = new Map<string, (typeof serializationRules)[number]>();
const rulesByTag = new Map<string, (typeof serializationRules)[number]>();

if (!serializationRules || !Array.isArray(serializationRules)) {
  console.error("[MarkdownWorker] FATAL: serializationRules failed to import:", serializationRules);
} else {
  for (const rule of serializationRules) {
    rulesById.set(rule.key, rule);
    rulesByTag.set(rule.tagName, rule);
  }
  console.log("[MarkdownWorker] Ready with", serializationRules.length, "rules:", [...rulesByTag.keys()].join(", "));
}

let isReady = true;
self.postMessage({ type: "ready" });

// ============================================================================
// Plate -> Markdown (Serialization)
// ============================================================================

function plateToMdast(nodes: unknown[]): unknown {
  return { type: "root", children: nodes.map(convertNode).filter(Boolean) };
}

function convertNode(node: any): unknown {
  if (!node) return null;

  // Text node with marks
  if ("text" in node) {
    let result: any = { type: "text", value: node.text };
    if (node.bold) result = { type: "strong", children: [result] };
    if (node.italic) result = { type: "emphasis", children: [result] };
    if (node.code) return { type: "inlineCode", value: node.text };
    if (node.strikethrough) result = { type: "delete", children: [result] };
    return result;
  }

  const t = node.type;
  const c = () => (node.children || []).map(convertNode).filter(Boolean);

  // Check for custom rule first
  const rule = rulesById.get(t);
  if (rule) {
    // Build options with _rules for serializeChildren
    const rulesMap: Record<string, any> = {};
    for (const r of serializationRules) {
      rulesMap[r.key] = { serialize: (el: any, opts: any) => convertNode(el) };
    }
    return rule.serialize(node, { _rules: rulesMap });
  }

  // Built-in types
  switch (t) {
    case "p": return { type: "paragraph", children: c() };
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return { type: "heading", depth: +t[1], children: c() };
    case "blockquote": return { type: "blockquote", children: c() };
    case "code_block": return { type: "code", lang: node.lang, value: getText(node) };
    case "ul": return { type: "list", ordered: false, children: c() };
    case "ol": return { type: "list", ordered: true, children: c() };
    case "li": return { type: "listItem", children: c() };
    case "hr": return { type: "thematicBreak" };
    case "a": return { type: "link", url: node.url, children: c() };
    case "img": return { type: "image", url: node.url, alt: node.alt };
    default:
      // Unknown MDX element - generic fallback
      if (t && node.children) {
        const { type, children, id, ...props } = node;
        return {
          type: "mdxJsxFlowElement",
          name: t,
          attributes: Object.entries(props).map(([k, v]) => ({
            type: "mdxJsxAttribute",
            name: k,
            value: typeof v === "string" ? v : { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(v) },
          })),
          children: c(),
        };
      }
      return { type: "paragraph", children: c() };
  }
}

function getText(node: any): string {
  if (!node?.children) return "";
  return node.children.map((c: any) => c.text ?? getText(c) ?? "").join("");
}

// ============================================================================
// Markdown -> Plate (Deserialization)
// ============================================================================

function mdastToPlate(root: any): unknown[] {
  return (root.children || []).map(convertMdast).filter(Boolean).flat();
}

function convertMdast(node: any): unknown {
  if (!node) return null;

  const c = () => {
    const r = (node.children || []).map(convertMdast).filter(Boolean).flat();
    return r.length ? r : [{ text: "" }];
  };

  // MDX elements - use custom rule if available
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const rule = rulesByTag.get(node.name);
    if (rule) {
      const convertChildren = (children: unknown[]): any[] => {
        return children.map(convertMdast).filter(Boolean).flat();
      };
      return rule.deserialize(node, {}, { convertChildren } as any);
    }

    // Generic MDX fallback for unknown components
    const props: any = {};
    for (const a of node.attributes || []) {
      let v = a.value;
      if (v === null || v === undefined) {
        props[a.name] = true;
      } else if (typeof v === "string") {
        props[a.name] = v;
      } else if (v?.type === "mdxJsxAttributeValueExpression") {
        try { props[a.name] = JSON.parse(v.value); } catch { props[a.name] = v.value; }
      }
    }
    return { type: node.name, ...props, children: c() };
  }

  // Built-in mdast types
  switch (node.type) {
    case "paragraph": return { type: "p", children: c() };
    case "heading": return { type: `h${node.depth}`, children: c() };
    case "blockquote": return { type: "blockquote", children: c() };
    case "code": return { type: "code_block", lang: node.lang, children: [{ type: "code_line", children: [{ text: node.value || "" }] }] };
    case "list": return { type: node.ordered ? "ol" : "ul", children: c() };
    case "listItem": return { type: "li", children: c() };
    case "thematicBreak": return { type: "hr", children: [{ text: "" }] };
    case "link": return { type: "a", url: node.url, children: c() };
    case "image": return { type: "img", url: node.url, alt: node.alt, children: [{ text: "" }] };
    case "text": return { text: node.value || "" };
    case "strong": return c().map((x: any) => ({ ...x, bold: true }));
    case "emphasis": return c().map((x: any) => ({ ...x, italic: true }));
    case "delete": return c().map((x: any) => ({ ...x, strikethrough: true }));
    case "inlineCode": return { text: node.value, code: true };
    default:
      if (node.children) return { type: "p", children: c() };
      if (node.value) return { text: node.value };
      return null;
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = (e) => {
  const { id, type, value, markdown } = e.data;

  if (!isReady) {
    self.postMessage({ id, type: "error", error: "Not ready" });
    return;
  }

  try {
    if (type === "serialize") {
      const mdast = plateToMdast(value);
      const result = unified()
        .use(remarkGfm)
        .use(remarkMdx)
        .use(remarkStringify, { emphasis: "_", bullet: "-", fences: true })
        .stringify(mdast as any);
      self.postMessage({ id, type: "serialize", result });
    } else if (type === "deserialize") {
      const mdast = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMdx)
        .parse(markdown);
      const result = mdastToPlate(mdast);
      self.postMessage({ id, type: "deserialize", result });
    }
  } catch (err) {
    self.postMessage({ id, type: "error", error: String(err) });
  }
};
