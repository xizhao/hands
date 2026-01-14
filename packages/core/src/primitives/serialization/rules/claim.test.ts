/**
 * Claim Component Serialization Tests
 *
 * Tests for Claim and Evidence MDX serialization rules.
 */

import { describe, expect, it } from "vitest";
import { claimRule, evidenceRule } from "./claim";
import type { MdxDeserializeNode } from "../types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock MDX attribute
 */
function createMdxAttribute(name: string, value: string | number | boolean | object | null) {
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
    attributes: attributes.map((attr) => createMdxAttribute(attr.name, attr.value)),
    children,
  };
}

/**
 * Mock convertChildren function for testing.
 */
const mockConvertChildren = (children: any[]): any[] => {
  return children.map((child) => {
    if (child.type === "text" && "value" in child) {
      return { text: child.value };
    }
    if (child.type === "paragraph") {
      return { type: "p", children: mockConvertChildren(child.children || []) };
    }
    return child;
  });
};

/**
 * Build serialization options for testing
 */
function createTestSerializeOptions() {
  return {
    _rules: {
      text: { serialize: (node: any) => ({ type: "text", value: node.text }) },
      p: {
        serialize: (node: any, opts: any) => ({
          type: "paragraph",
          children: node.children?.map((c: any) =>
            "text" in c ? { type: "text", value: c.text } : c
          ),
        }),
      },
    },
  };
}

// ============================================================================
// Claim Rule Tests
// ============================================================================

describe("claimRule", () => {
  describe("deserialize", () => {
    it("deserializes simple claim with text", () => {
      const mdxNode = createMdxNode([], [{ type: "text", value: "Inflation returns to target" }]);
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.type).toBe("claim");
      expect(result.children).toEqual([{ text: "Inflation returns to target" }]);
      expect(result.source).toBeUndefined();
      expect(result.derivation).toBeUndefined();
    });

    it("deserializes claim with source prop", () => {
      const mdxNode = createMdxNode(
        [{ name: "source", value: "https://fred.stlouisfed.org/series/PCEPILFE" }],
        [{ type: "text", value: "Core PCE fell to 2.4%" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.source).toBe("https://fred.stlouisfed.org/series/PCEPILFE");
      expect(result.children).toEqual([{ text: "Core PCE fell to 2.4%" }]);
    });

    it("deserializes claim with multiple sources", () => {
      const mdxNode = createMdxNode(
        [
          {
            name: "sources",
            value: [
              "https://fred.stlouisfed.org/series/PCEPILFE",
              "https://bls.gov/cpi",
            ],
          },
        ],
        [{ type: "text", value: "Inflation data confirms decline" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.sources).toEqual([
        "https://fred.stlouisfed.org/series/PCEPILFE",
        "https://bls.gov/cpi",
      ]);
    });

    it("deserializes claim with refutes prop", () => {
      const mdxNode = createMdxNode(
        [{ name: "refutes", value: "https://reuters.com/tariff-impact" }],
        [{ type: "text", value: "Tariffs don't cause stagflation" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.refutes).toBe("https://reuters.com/tariff-impact");
    });

    it("deserializes claim with action prop", () => {
      const mdxNode = createMdxNode(
        [{ name: "action", value: "check-labor-data" }],
        [{ type: "text", value: "Labor market softens" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.action).toBe("check-labor-data");
    });

    it("deserializes claim with derivation=or", () => {
      const mdxNode = createMdxNode(
        [{ name: "derivation", value: "or" }],
        [{ type: "text", value: "Market expects rate cuts" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.derivation).toBe("or");
    });

    it("deserializes claim with all properties", () => {
      const mdxNode = createMdxNode(
        [
          { name: "source", value: "https://example.com/data" },
          { name: "action", value: "verify-data" },
          { name: "derivation", value: "and" },
        ],
        [{ type: "text", value: "Complex claim" }]
      );
      const result = claimRule.deserialize(mdxNode, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(result.source).toBe("https://example.com/data");
      expect(result.action).toBe("verify-data");
      expect(result.derivation).toBe("and");
    });
  });

  describe("serialize", () => {
    it("serializes simple claim", () => {
      const element = {
        type: "claim" as const,
        children: [{ text: "Simple claim text" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("Claim");
      expect(result.attributes).toEqual([]);
      expect(result.children).toHaveLength(1);
    });

    it("serializes claim with source", () => {
      const element = {
        type: "claim" as const,
        source: "https://fred.stlouisfed.org/series/PCEPILFE",
        children: [{ text: "Core PCE data" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "source",
        value: "https://fred.stlouisfed.org/series/PCEPILFE",
      });
    });

    it("serializes claim with sources array", () => {
      const element = {
        type: "claim" as const,
        sources: ["https://source1.com", "https://source2.com"],
        children: [{ text: "Multiple sources" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      const sourcesAttr = result.attributes.find((a) => a.name === "sources");
      expect(sourcesAttr).toBeDefined();
      expect(sourcesAttr?.value).toEqual({
        type: "mdxJsxAttributeValueExpression",
        value: '["https://source1.com","https://source2.com"]',
      });
    });

    it("serializes claim with refutes", () => {
      const element = {
        type: "claim" as const,
        refutes: "https://reuters.com/article",
        children: [{ text: "Refuted claim" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "refutes",
        value: "https://reuters.com/article",
      });
    });

    it("serializes claim with action", () => {
      const element = {
        type: "claim" as const,
        action: "verify-assumption",
        children: [{ text: "Action-verified claim" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "action",
        value: "verify-assumption",
      });
    });

    it("serializes claim with derivation=or", () => {
      const element = {
        type: "claim" as const,
        derivation: "or" as const,
        children: [{ text: "OR logic claim" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "derivation",
        value: "or",
      });
    });

    it("omits default derivation=and", () => {
      const element = {
        type: "claim" as const,
        derivation: "and" as const,
        children: [{ text: "AND logic claim" }],
      };
      const result = claimRule.serialize(element, createTestSerializeOptions());

      expect(result.attributes.find((a) => a.name === "derivation")).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    it("preserves source through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "source", value: "https://example.com/data" }],
        [{ type: "text", value: "Test claim" }]
      );

      const deserialized = claimRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = claimRule.serialize(deserialized, createTestSerializeOptions());
      const roundtrip = claimRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.source).toBe(deserialized.source);
    });

    it("preserves refutes through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "refutes", value: "https://counter.example.com" }],
        [{ type: "text", value: "Refuted" }]
      );

      const deserialized = claimRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = claimRule.serialize(deserialized, createTestSerializeOptions());
      const roundtrip = claimRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.refutes).toBe(deserialized.refutes);
    });

    it("preserves action through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "action", value: "check-data" }],
        [{ type: "text", value: "Action claim" }]
      );

      const deserialized = claimRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = claimRule.serialize(deserialized, createTestSerializeOptions());
      const roundtrip = claimRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.action).toBe(deserialized.action);
    });

    it("preserves derivation=or through roundtrip", () => {
      const original = createMdxNode(
        [{ name: "derivation", value: "or" }],
        [{ type: "text", value: "OR claim" }]
      );

      const deserialized = claimRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = claimRule.serialize(deserialized, createTestSerializeOptions());
      const roundtrip = claimRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.derivation).toBe(deserialized.derivation);
    });

    it("preserves all properties through roundtrip", () => {
      const original = createMdxNode(
        [
          { name: "source", value: "https://primary.source.com" },
          { name: "action", value: "verify" },
          { name: "derivation", value: "or" },
        ],
        [{ type: "text", value: "Full claim" }]
      );

      const deserialized = claimRule.deserialize(original, undefined, {
        convertChildren: mockConvertChildren,
      });
      const serialized = claimRule.serialize(deserialized, createTestSerializeOptions());
      const roundtrip = claimRule.deserialize(serialized, undefined, {
        convertChildren: mockConvertChildren,
      });

      expect(roundtrip.source).toBe(deserialized.source);
      expect(roundtrip.action).toBe(deserialized.action);
      expect(roundtrip.derivation).toBe(deserialized.derivation);
    });
  });
});

// ============================================================================
// Evidence Rule Tests
// ============================================================================

describe("evidenceRule", () => {
  describe("deserialize", () => {
    it("deserializes source evidence", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "source" },
        { name: "url", value: "https://fred.stlouisfed.org/data" },
        { name: "verdict", value: "supports" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.type).toBe("evidence");
      expect(result.evidenceType).toBe("source");
      expect(result.url).toBe("https://fred.stlouisfed.org/data");
      expect(result.verdict).toBe("supports");
    });

    it("deserializes source evidence with quote", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "source" },
        { name: "url", value: "https://cme.com/futures" },
        { name: "quote", value: "Markets pricing 4.2 cuts by Dec 2025" },
        { name: "verdict", value: "supports" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.quote).toBe("Markets pricing 4.2 cuts by Dec 2025");
    });

    it("deserializes action evidence", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "action" },
        { name: "actionId", value: "check-labor-data" },
        { name: "verdict", value: "supports" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.evidenceType).toBe("action");
      expect(result.actionId).toBe("check-labor-data");
    });

    it("deserializes llm evidence", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "llm" },
        { name: "verdict", value: "supports" },
        { name: "confidence", value: 0.7 },
        { name: "reasoning", value: "Historical pattern suggests rate cuts" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.evidenceType).toBe("llm");
      expect(result.confidence).toBe(0.7);
      expect(result.reasoning).toBe("Historical pattern suggests rate cuts");
    });

    it("deserializes refuting evidence", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "source" },
        { name: "url", value: "https://reuters.com/counter" },
        { name: "verdict", value: "refutes" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.verdict).toBe("refutes");
    });

    it("defaults to source type and supports verdict", () => {
      const mdxNode = createMdxNode([{ name: "url", value: "https://example.com" }]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.evidenceType).toBe("source");
      expect(result.verdict).toBe("supports");
    });

    it("deserializes evidence with timestamp", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "source" },
        { name: "url", value: "https://data.gov" },
        { name: "timestamp", value: "2024-12-15T10:00:00Z" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.timestamp).toBe("2024-12-15T10:00:00Z");
    });

    it("deserializes llm evidence with model", () => {
      const mdxNode = createMdxNode([
        { name: "type", value: "llm" },
        { name: "confidence", value: 0.85 },
        { name: "model", value: "claude-3-sonnet" },
      ]);
      const result = evidenceRule.deserialize(mdxNode);

      expect(result.model).toBe("claude-3-sonnet");
    });
  });

  describe("serialize", () => {
    it("serializes source evidence", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "source" as const,
        url: "https://fred.stlouisfed.org/data",
        verdict: "supports" as const,
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.type).toBe("mdxJsxFlowElement");
      expect(result.name).toBe("Evidence");
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "type",
        value: "source",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "url",
        value: "https://fred.stlouisfed.org/data",
      });
      // verdict: "supports" should be omitted (default)
      expect(result.attributes.find((a) => a.name === "verdict")).toBeUndefined();
      // Children should be empty (void element)
      expect(result.children).toEqual([]);
    });

    it("serializes source evidence with quote", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "source" as const,
        url: "https://cme.com",
        quote: "Important quote here",
        verdict: "supports" as const,
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "quote",
        value: "Important quote here",
      });
    });

    it("serializes action evidence", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "action" as const,
        actionId: "verify-data",
        verdict: "supports" as const,
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "type",
        value: "action",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "actionId",
        value: "verify-data",
      });
    });

    it("serializes llm evidence", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "llm" as const,
        confidence: 0.75,
        reasoning: "Based on historical analysis",
        verdict: "supports" as const,
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "type",
        value: "llm",
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "confidence",
        value: { type: "mdxJsxAttributeValueExpression", value: "0.75" },
      });
      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "reasoning",
        value: "Based on historical analysis",
      });
    });

    it("serializes refuting verdict", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "source" as const,
        url: "https://counter.com",
        verdict: "refutes" as const,
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "verdict",
        value: "refutes",
      });
    });

    it("serializes evidence with timestamp", () => {
      const element = {
        type: "evidence" as const,
        evidenceType: "source" as const,
        url: "https://data.gov",
        verdict: "supports" as const,
        timestamp: "2024-12-15T10:00:00Z",
        children: [{ text: "" }],
      };
      const result = evidenceRule.serialize(element);

      expect(result.attributes).toContainEqual({
        type: "mdxJsxAttribute",
        name: "timestamp",
        value: "2024-12-15T10:00:00Z",
      });
    });
  });

  describe("roundtrip", () => {
    it("preserves source evidence through roundtrip", () => {
      const original = createMdxNode([
        { name: "type", value: "source" },
        { name: "url", value: "https://fred.stlouisfed.org/data" },
        { name: "quote", value: "Key quote" },
        { name: "verdict", value: "supports" },
      ]);

      const deserialized = evidenceRule.deserialize(original);
      const serialized = evidenceRule.serialize(deserialized);
      const roundtrip = evidenceRule.deserialize(serialized);

      expect(roundtrip.evidenceType).toBe(deserialized.evidenceType);
      expect(roundtrip.url).toBe(deserialized.url);
      expect(roundtrip.quote).toBe(deserialized.quote);
      expect(roundtrip.verdict).toBe(deserialized.verdict);
    });

    it("preserves action evidence through roundtrip", () => {
      const original = createMdxNode([
        { name: "type", value: "action" },
        { name: "actionId", value: "verify-assumption" },
        { name: "verdict", value: "refutes" },
      ]);

      const deserialized = evidenceRule.deserialize(original);
      const serialized = evidenceRule.serialize(deserialized);
      const roundtrip = evidenceRule.deserialize(serialized);

      expect(roundtrip.evidenceType).toBe(deserialized.evidenceType);
      expect(roundtrip.actionId).toBe(deserialized.actionId);
      expect(roundtrip.verdict).toBe(deserialized.verdict);
    });

    it("preserves llm evidence through roundtrip", () => {
      const original = createMdxNode([
        { name: "type", value: "llm" },
        { name: "confidence", value: 0.82 },
        { name: "reasoning", value: "Analysis shows pattern" },
        { name: "model", value: "claude-3" },
        { name: "verdict", value: "supports" },
      ]);

      const deserialized = evidenceRule.deserialize(original);
      const serialized = evidenceRule.serialize(deserialized);
      const roundtrip = evidenceRule.deserialize(serialized);

      expect(roundtrip.evidenceType).toBe(deserialized.evidenceType);
      expect(roundtrip.confidence).toBe(deserialized.confidence);
      expect(roundtrip.reasoning).toBe(deserialized.reasoning);
      expect(roundtrip.model).toBe(deserialized.model);
    });
  });
});
