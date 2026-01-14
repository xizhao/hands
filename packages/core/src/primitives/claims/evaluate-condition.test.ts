/**
 * Condition Evaluator Tests
 *
 * Tests for evaluating conditions against data rows.
 * Used for data-driven claims inside LiveValue.
 */

import { describe, expect, it } from "vitest";
import {
  detectConditionType,
  evaluateCondition,
  evaluateConditions,
  evaluateExpect,
  evaluateRegex,
  parseCondition,
  parseRegex,
  type LLMEvaluator,
} from "./evaluate-condition";

// ============================================================================
// parseCondition Tests
// ============================================================================

describe("parseCondition", () => {
  it("parses simple comparison", () => {
    const result = parseCondition("value < 2.5");
    expect(result).toEqual({
      field: "value",
      op: "<",
      value: 2.5,
    });
  });

  it("parses greater than", () => {
    const result = parseCondition("count > 0");
    expect(result).toEqual({
      field: "count",
      op: ">",
      value: 0,
    });
  });

  it("parses less than or equal", () => {
    const result = parseCondition("rate <= 4.0");
    expect(result).toEqual({
      field: "rate",
      op: "<=",
      value: 4.0,
    });
  });

  it("parses greater than or equal", () => {
    const result = parseCondition("score >= 80");
    expect(result).toEqual({
      field: "score",
      op: ">=",
      value: 80,
    });
  });

  it("parses equality", () => {
    const result = parseCondition("status == 'active'");
    expect(result).toEqual({
      field: "status",
      op: "==",
      value: "active",
    });
  });

  it("parses inequality", () => {
    const result = parseCondition("type != 'error'");
    expect(result).toEqual({
      field: "type",
      op: "!=",
      value: "error",
    });
  });

  it("parses strict equality", () => {
    const result = parseCondition("flag === true");
    expect(result).toEqual({
      field: "flag",
      op: "===",
      value: true,
    });
  });

  it("parses strict inequality", () => {
    const result = parseCondition("value !== null");
    expect(result).toEqual({
      field: "value",
      op: "!==",
      value: null,
    });
  });

  it("parses double-quoted strings", () => {
    const result = parseCondition('name == "John"');
    expect(result).toEqual({
      field: "name",
      op: "==",
      value: "John",
    });
  });

  it("handles whitespace variations", () => {
    const result = parseCondition("  value   <   2.5  ");
    expect(result).toEqual({
      field: "value",
      op: "<",
      value: 2.5,
    });
  });

  it("returns null for invalid conditions", () => {
    expect(parseCondition("")).toBeNull();
    expect(parseCondition("invalid")).toBeNull();
    expect(parseCondition("no operator here")).toBeNull();
  });

  it("parses false boolean", () => {
    const result = parseCondition("enabled == false");
    expect(result).toEqual({
      field: "enabled",
      op: "==",
      value: false,
    });
  });
});

// ============================================================================
// evaluateCondition Tests
// ============================================================================

describe("evaluateCondition", () => {
  describe("numeric comparisons", () => {
    it("evaluates less than (true)", () => {
      expect(evaluateCondition("value < 2.5", { value: 2.4 })).toBe(true);
    });

    it("evaluates less than (false)", () => {
      expect(evaluateCondition("value < 2.5", { value: 2.6 })).toBe(false);
    });

    it("evaluates less than (boundary false)", () => {
      expect(evaluateCondition("value < 2.5", { value: 2.5 })).toBe(false);
    });

    it("evaluates greater than (true)", () => {
      expect(evaluateCondition("count > 0", { count: 5 })).toBe(true);
    });

    it("evaluates greater than (false)", () => {
      expect(evaluateCondition("count > 0", { count: 0 })).toBe(false);
    });

    it("evaluates less than or equal (true on equal)", () => {
      expect(evaluateCondition("rate <= 4.0", { rate: 4.0 })).toBe(true);
    });

    it("evaluates less than or equal (true on less)", () => {
      expect(evaluateCondition("rate <= 4.0", { rate: 3.5 })).toBe(true);
    });

    it("evaluates greater than or equal (true on equal)", () => {
      expect(evaluateCondition("score >= 80", { score: 80 })).toBe(true);
    });

    it("evaluates greater than or equal (true on greater)", () => {
      expect(evaluateCondition("score >= 80", { score: 95 })).toBe(true);
    });
  });

  describe("string comparisons", () => {
    it("evaluates string equality (true)", () => {
      expect(evaluateCondition("status == 'active'", { status: "active" })).toBe(true);
    });

    it("evaluates string equality (false)", () => {
      expect(evaluateCondition("status == 'active'", { status: "inactive" })).toBe(false);
    });

    it("evaluates string inequality (true)", () => {
      expect(evaluateCondition("type != 'error'", { type: "success" })).toBe(true);
    });

    it("evaluates string inequality (false)", () => {
      expect(evaluateCondition("type != 'error'", { type: "error" })).toBe(false);
    });
  });

  describe("boolean comparisons", () => {
    it("evaluates boolean true", () => {
      expect(evaluateCondition("enabled === true", { enabled: true })).toBe(true);
    });

    it("evaluates boolean false", () => {
      expect(evaluateCondition("enabled === false", { enabled: false })).toBe(true);
    });
  });

  describe("null comparisons", () => {
    it("evaluates null equality (true)", () => {
      expect(evaluateCondition("value == null", { value: null })).toBe(true);
    });

    it("evaluates null equality (false)", () => {
      expect(evaluateCondition("value == null", { value: 5 })).toBe(false);
    });

    it("evaluates null inequality (true)", () => {
      expect(evaluateCondition("value != null", { value: 5 })).toBe(true);
    });

    it("evaluates undefined as null", () => {
      expect(evaluateCondition("value == null", { value: undefined })).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns false for null data", () => {
      expect(evaluateCondition("value < 2.5", null)).toBe(false);
    });

    it("returns false for undefined data", () => {
      expect(evaluateCondition("value < 2.5", undefined)).toBe(false);
    });

    it("returns false for empty condition", () => {
      expect(evaluateCondition("", { value: 2.4 })).toBe(false);
    });

    it("returns false for invalid condition", () => {
      expect(evaluateCondition("invalid", { value: 2.4 })).toBe(false);
    });

    it("returns false when field not in data", () => {
      expect(evaluateCondition("missing < 5", { value: 2.4 })).toBe(false);
    });

    it("handles numeric strings in data", () => {
      expect(evaluateCondition("value < 2.5", { value: "2.4" })).toBe(true);
    });
  });
});

// ============================================================================
// evaluateConditions Tests
// ============================================================================

describe("evaluateConditions", () => {
  it("returns true when all conditions pass", () => {
    const conditions = ["value < 2.5", "count > 0"];
    const data = { value: 2.4, count: 5 };
    expect(evaluateConditions(conditions, data)).toBe(true);
  });

  it("returns false when any condition fails", () => {
    const conditions = ["value < 2.5", "count > 10"];
    const data = { value: 2.4, count: 5 };
    expect(evaluateConditions(conditions, data)).toBe(false);
  });

  it("returns true for empty conditions array", () => {
    expect(evaluateConditions([], { value: 2.4 })).toBe(true);
  });

  it("handles single condition", () => {
    expect(evaluateConditions(["value < 2.5"], { value: 2.4 })).toBe(true);
  });
});

// ============================================================================
// detectConditionType Tests
// ============================================================================

describe("detectConditionType", () => {
  describe("simple conditions", () => {
    it("detects less than", () => {
      expect(detectConditionType("value < 2.5")).toBe("simple");
    });

    it("detects greater than", () => {
      expect(detectConditionType("count > 0")).toBe("simple");
    });

    it("detects equality", () => {
      expect(detectConditionType("status == 'active'")).toBe("simple");
    });

    it("detects inequality", () => {
      expect(detectConditionType("type != 'error'")).toBe("simple");
    });

    it("detects strict equality", () => {
      expect(detectConditionType("flag === true")).toBe("simple");
    });
  });

  describe("regex patterns", () => {
    it("detects simple regex", () => {
      expect(detectConditionType("/inflation/")).toBe("regex");
    });

    it("detects regex with flags", () => {
      expect(detectConditionType("/target/i")).toBe("regex");
    });

    it("detects regex with multiple flags", () => {
      expect(detectConditionType("/pattern.*/gim")).toBe("regex");
    });

    it("detects complex regex", () => {
      expect(detectConditionType("/inflation.*below.*target/i")).toBe("regex");
    });
  });

  describe("natural language (LLM)", () => {
    it("detects natural language sentences", () => {
      expect(detectConditionType("Article confirms Fed will cut rates")).toBe("llm");
    });

    it("detects questions", () => {
      expect(detectConditionType("Is inflation above target?")).toBe("llm");
    });

    it("detects simple phrases", () => {
      expect(detectConditionType("positive sentiment")).toBe("llm");
    });

    it("detects multi-word conditions", () => {
      expect(detectConditionType("The data shows growth")).toBe("llm");
    });
  });
});

// ============================================================================
// parseRegex Tests
// ============================================================================

describe("parseRegex", () => {
  it("parses simple regex", () => {
    const regex = parseRegex("/hello/");
    expect(regex).not.toBeNull();
    expect(regex!.test("hello world")).toBe(true);
  });

  it("parses regex with i flag", () => {
    const regex = parseRegex("/HELLO/i");
    expect(regex).not.toBeNull();
    expect(regex!.test("hello")).toBe(true);
  });

  it("parses regex with g flag", () => {
    const regex = parseRegex("/o/g");
    expect(regex).not.toBeNull();
    expect("hello".match(regex!)?.length).toBe(1);
  });

  it("parses regex with multiple flags", () => {
    const regex = parseRegex("/pattern/gim");
    expect(regex).not.toBeNull();
    expect(regex!.flags).toBe("gim");
  });

  it("parses complex pattern", () => {
    const regex = parseRegex("/inflation.*target/i");
    expect(regex).not.toBeNull();
    expect(regex!.test("Inflation remains below target")).toBe(true);
  });

  it("returns null for invalid regex", () => {
    expect(parseRegex("hello")).toBeNull();
    expect(parseRegex("/hello")).toBeNull();
    expect(parseRegex("hello/")).toBeNull();
  });

  it("returns null for invalid regex pattern", () => {
    // Unclosed group
    expect(parseRegex("/(/")).toBeNull();
  });
});

// ============================================================================
// evaluateRegex Tests
// ============================================================================

describe("evaluateRegex", () => {
  it("returns passed true when pattern matches", () => {
    const result = evaluateRegex("/inflation/i", "Core inflation is low");
    expect(result.passed).toBe(true);
    expect(result.type).toBe("regex");
  });

  it("returns passed false when pattern does not match", () => {
    const result = evaluateRegex("/deflation/i", "Core inflation is low");
    expect(result.passed).toBe(false);
    expect(result.type).toBe("regex");
  });

  it("handles complex patterns", () => {
    const result = evaluateRegex(
      "/inflation.*below.*target/i",
      "Core inflation remains below the 2% target"
    );
    expect(result.passed).toBe(true);
  });

  it("handles invalid regex gracefully", () => {
    const result = evaluateRegex("not a regex", "some content");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Invalid regex");
  });
});

// ============================================================================
// evaluateExpect Tests
// ============================================================================

describe("evaluateExpect", () => {
  describe("simple conditions", () => {
    it("evaluates simple condition (pass)", async () => {
      const result = await evaluateExpect({
        expect: "value < 2.5",
        data: [{ value: 2.3 }],
      });
      expect(result.passed).toBe(true);
      expect(result.type).toBe("simple");
    });

    it("evaluates simple condition (fail)", async () => {
      const result = await evaluateExpect({
        expect: "value < 2.5",
        data: [{ value: 2.7 }],
      });
      expect(result.passed).toBe(false);
      expect(result.type).toBe("simple");
    });
  });

  describe("regex patterns", () => {
    it("evaluates regex against content field", async () => {
      const result = await evaluateExpect({
        expect: "/inflation.*target/i",
        data: [{ content: "Inflation is below target" }],
      });
      expect(result.passed).toBe(true);
      expect(result.type).toBe("regex");
    });

    it("falls back to stringified data when no content field", async () => {
      const result = await evaluateExpect({
        expect: "/value.*42/",
        data: [{ value: 42, name: "test" }],
      });
      expect(result.passed).toBe(true);
      expect(result.type).toBe("regex");
    });
  });

  describe("LLM evaluation", () => {
    it("returns failure when no LLM evaluator provided", async () => {
      const result = await evaluateExpect({
        expect: "Article confirms positive outlook",
        data: [{ content: "The market looks great" }],
      });
      expect(result.passed).toBe(false);
      expect(result.type).toBe("llm");
      expect(result.reason).toContain("LLM evaluator not available");
    });

    it("uses LLM evaluator when provided", async () => {
      const mockLlmEvaluator: LLMEvaluator = async (content, condition) => {
        return {
          passed: content.includes("great"),
          reason: "Evaluated with mock LLM",
        };
      };

      const result = await evaluateExpect({
        expect: "Article is positive",
        data: [{ content: "The outlook is great" }],
        llmEvaluator: mockLlmEvaluator,
      });
      expect(result.passed).toBe(true);
      expect(result.type).toBe("llm");
      expect(result.reason).toBe("Evaluated with mock LLM");
    });

    it("handles LLM evaluator errors", async () => {
      const mockLlmEvaluator: LLMEvaluator = async () => {
        throw new Error("API rate limit");
      };

      const result = await evaluateExpect({
        expect: "Article is positive",
        data: [{ content: "Some content" }],
        llmEvaluator: mockLlmEvaluator,
      });
      expect(result.passed).toBe(false);
      expect(result.type).toBe("llm");
      expect(result.reason).toContain("API rate limit");
    });
  });

  describe("edge cases", () => {
    it("returns failure for empty expect", async () => {
      const result = await evaluateExpect({
        expect: "",
        data: [{ value: 1 }],
      });
      expect(result.passed).toBe(false);
    });

    it("returns failure for null data", async () => {
      const result = await evaluateExpect({
        expect: "value < 2.5",
        data: null,
      });
      expect(result.passed).toBe(false);
    });

    it("returns failure for empty data array", async () => {
      const result = await evaluateExpect({
        expect: "value < 2.5",
        data: [],
      });
      expect(result.passed).toBe(false);
    });
  });
});
