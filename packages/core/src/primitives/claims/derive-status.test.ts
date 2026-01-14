/**
 * Status Derivation Tests
 *
 * Tests for the claim status derivation logic.
 * Status is always derived from evidence - never stored.
 */

import { describe, expect, it } from "vitest";
import {
  collectEvidence,
  defaultClaimActionContext,
  deriveOwnStatus,
  deriveStatus,
  getChildClaims,
  getClaimText,
  getEvidenceElements,
  getEvidenceIcon,
  getStatusColor,
  getStatusIcon,
  type ClaimActionContext,
} from "./derive-status";
import { CLAIM_KEY, EVIDENCE_KEY, type TClaimElement, type TEvidenceElement } from "../../types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a simple claim element for testing.
 */
function createClaim(
  text: string,
  options?: {
    source?: string;
    sources?: string[];
    refutes?: string;
    action?: string;
    derivation?: "and" | "or";
    children?: (TClaimElement | TEvidenceElement | { text: string })[];
  }
): TClaimElement {
  const textChildren = options?.children ?? [{ text }];
  return {
    type: CLAIM_KEY,
    source: options?.source,
    sources: options?.sources,
    refutes: options?.refutes,
    action: options?.action,
    derivation: options?.derivation,
    children: textChildren,
  };
}

/**
 * Create an evidence element for testing.
 */
function createEvidence(options: {
  evidenceType: "source" | "action" | "llm";
  verdict?: "supports" | "refutes";
  url?: string;
  quote?: string;
  actionId?: string;
  reasoning?: string;
  confidence?: number;
}): TEvidenceElement {
  return {
    type: EVIDENCE_KEY,
    evidenceType: options.evidenceType,
    verdict: options.verdict ?? "supports",
    url: options.url,
    quote: options.quote,
    actionId: options.actionId,
    reasoning: options.reasoning,
    confidence: options.confidence,
    children: [{ text: "" }],
  };
}

/**
 * Create a mock action context for testing.
 */
function createMockActionContext(options?: {
  pending?: Set<string>;
  results?: Map<string, { verdict: "supports" | "refutes"; output?: unknown }>;
}): ClaimActionContext {
  const pending = options?.pending ?? new Set();
  const results = options?.results ?? new Map();

  return {
    isPending: (actionId: string) => pending.has(actionId),
    getResult: (actionId: string) => results.get(actionId) ?? null,
  };
}

// ============================================================================
// getClaimText Tests
// ============================================================================

describe("getClaimText", () => {
  it("extracts text from simple claim", () => {
    const claim = createClaim("Inflation returns to target");
    expect(getClaimText(claim)).toBe("Inflation returns to target");
  });

  it("extracts text from claim with multiple text nodes", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [{ text: "Part one " }, { text: "and part two" }],
    };
    expect(getClaimText(claim)).toBe("Part one and part two");
  });

  it("ignores non-text children", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [
        { text: "Main claim" },
        createClaim("Nested claim"),
        { text: " with more text" },
      ],
    };
    expect(getClaimText(claim)).toBe("Main claim with more text");
  });

  it("returns empty string for claim with no text", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [createClaim("Only nested")],
    };
    expect(getClaimText(claim)).toBe("");
  });

  it("trims whitespace", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [{ text: "  spaced text  " }],
    };
    expect(getClaimText(claim)).toBe("spaced text");
  });
});

// ============================================================================
// getChildClaims Tests
// ============================================================================

describe("getChildClaims", () => {
  it("extracts nested claims", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [
        { text: "Parent" },
        createClaim("Child 1"),
        createClaim("Child 2"),
      ],
    };
    const children = getChildClaims(claim);

    expect(children).toHaveLength(2);
    expect(getClaimText(children[0])).toBe("Child 1");
    expect(getClaimText(children[1])).toBe("Child 2");
  });

  it("returns empty array when no nested claims", () => {
    const claim = createClaim("Leaf claim");
    expect(getChildClaims(claim)).toEqual([]);
  });

  it("ignores evidence elements", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [
        { text: "Claim" },
        createEvidence({ evidenceType: "source", url: "https://example.com" }),
      ],
    };
    expect(getChildClaims(claim)).toEqual([]);
  });
});

// ============================================================================
// getEvidenceElements Tests
// ============================================================================

describe("getEvidenceElements", () => {
  it("extracts evidence elements", () => {
    const evidence = createEvidence({
      evidenceType: "source",
      url: "https://fred.stlouisfed.org",
    });
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [{ text: "Claim" }, evidence],
    };

    const extracted = getEvidenceElements(claim);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].evidenceType).toBe("source");
  });

  it("returns empty array when no evidence", () => {
    const claim = createClaim("No evidence claim");
    expect(getEvidenceElements(claim)).toEqual([]);
  });

  it("ignores nested claims", () => {
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [{ text: "Parent" }, createClaim("Child")],
    };
    expect(getEvidenceElements(claim)).toEqual([]);
  });
});

// ============================================================================
// collectEvidence Tests
// ============================================================================

describe("collectEvidence", () => {
  it("collects evidence from source prop", () => {
    const claim = createClaim("With source", {
      source: "https://fred.stlouisfed.org/data",
    });
    const evidence = collectEvidence(claim);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].type).toBe("source");
    expect(evidence[0].verdict).toBe("supports");
    if (evidence[0].type === "source") {
      expect(evidence[0].url).toBe("https://fred.stlouisfed.org/data");
    }
  });

  it("collects evidence from sources prop array", () => {
    const claim = createClaim("Multiple sources", {
      sources: ["https://source1.com", "https://source2.com"],
    });
    const evidence = collectEvidence(claim);

    expect(evidence).toHaveLength(2);
    expect(evidence[0].type).toBe("source");
    expect(evidence[1].type).toBe("source");
  });

  it("collects evidence from refutes prop", () => {
    const claim = createClaim("Refuted", {
      refutes: "https://counter.example.com",
    });
    const evidence = collectEvidence(claim);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].type).toBe("source");
    expect(evidence[0].verdict).toBe("refutes");
  });

  it("collects evidence from action prop when result available", () => {
    const claim = createClaim("Action claim", {
      action: "verify-data",
    });
    const actionCtx = createMockActionContext({
      results: new Map([["verify-data", { verdict: "supports" }]]),
    });
    const evidence = collectEvidence(claim, { actionCtx });

    expect(evidence).toHaveLength(1);
    expect(evidence[0].type).toBe("action");
    expect(evidence[0].verdict).toBe("supports");
  });

  it("does not collect action evidence when result not available", () => {
    const claim = createClaim("Action claim", {
      action: "verify-data",
    });
    const evidence = collectEvidence(claim, {});

    expect(evidence).toHaveLength(0);
  });

  it("collects evidence from Evidence children", () => {
    const evidenceEl = createEvidence({
      evidenceType: "llm",
      confidence: 0.8,
      reasoning: "Analysis complete",
    });
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      children: [{ text: "Claim" }, evidenceEl],
    };
    const evidence = collectEvidence(claim);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].type).toBe("llm");
    if (evidence[0].type === "llm") {
      expect(evidence[0].confidence).toBe(0.8);
    }
  });

  it("combines all evidence sources", () => {
    const evidenceEl = createEvidence({
      evidenceType: "llm",
      confidence: 0.7,
    });
    const claim: TClaimElement = {
      type: CLAIM_KEY,
      source: "https://primary.com",
      sources: ["https://secondary.com"],
      action: "check",
      children: [{ text: "Full claim" }, evidenceEl],
    };
    const actionCtx = createMockActionContext({
      results: new Map([["check", { verdict: "supports" }]]),
    });
    const evidence = collectEvidence(claim, { actionCtx });

    // source + 1 from sources + action + llm evidence = 4
    expect(evidence).toHaveLength(4);
  });
});

// ============================================================================
// deriveOwnStatus Tests
// ============================================================================

describe("deriveOwnStatus", () => {
  it("returns unverified when no evidence", () => {
    const claim = createClaim("No evidence");
    expect(deriveOwnStatus(claim)).toBe("unverified");
  });

  it("returns verified when has supporting source", () => {
    const claim = createClaim("With source", {
      source: "https://example.com",
    });
    expect(deriveOwnStatus(claim)).toBe("verified");
  });

  it("returns refuted when has refuting source", () => {
    const claim = createClaim("Refuted", {
      refutes: "https://counter.com",
    });
    expect(deriveOwnStatus(claim)).toBe("refuted");
  });

  it("returns pending when action is pending", () => {
    const claim = createClaim("Action pending", {
      action: "check-data",
    });
    const actionCtx = createMockActionContext({
      pending: new Set(["check-data"]),
    });
    expect(deriveOwnStatus(claim, { actionCtx })).toBe("pending");
  });

  it("returns verified when action result supports", () => {
    const claim = createClaim("Action verified", {
      action: "check-data",
    });
    const actionCtx = createMockActionContext({
      results: new Map([["check-data", { verdict: "supports" }]]),
    });
    expect(deriveOwnStatus(claim, { actionCtx })).toBe("verified");
  });

  it("returns refuted when action result refutes", () => {
    const claim = createClaim("Action refuted", {
      action: "check-data",
    });
    const actionCtx = createMockActionContext({
      results: new Map([["check-data", { verdict: "refutes" }]]),
    });
    expect(deriveOwnStatus(claim, { actionCtx })).toBe("refuted");
  });

  it("refuted takes precedence over supports", () => {
    const claim = createClaim("Mixed evidence", {
      source: "https://supporting.com",
      refutes: "https://refuting.com",
    });
    expect(deriveOwnStatus(claim)).toBe("refuted");
  });
});

// ============================================================================
// deriveStatus Tests (recursive)
// ============================================================================

describe("deriveStatus", () => {
  describe("leaf claims (no children)", () => {
    it("returns unverified when no evidence", () => {
      const claim = createClaim("Leaf");
      expect(deriveStatus(claim)).toBe("unverified");
    });

    it("returns verified when has source", () => {
      const claim = createClaim("Verified leaf", {
        source: "https://example.com",
      });
      expect(deriveStatus(claim)).toBe("verified");
    });

    it("returns refuted when has refutes", () => {
      const claim = createClaim("Refuted leaf", {
        refutes: "https://counter.com",
      });
      expect(deriveStatus(claim)).toBe("refuted");
    });

    it("returns pending when action pending", () => {
      const claim = createClaim("Pending leaf", { action: "check" });
      const actionCtx = createMockActionContext({
        pending: new Set(["check"]),
      });
      expect(deriveStatus(claim, { actionCtx })).toBe("pending");
    });
  });

  describe("AND derivation (default)", () => {
    it("returns verified when all children verified", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Parent" },
          createClaim("Child 1", { source: "https://a.com" }),
          createClaim("Child 2", { source: "https://b.com" }),
        ],
      };
      expect(deriveStatus(claim)).toBe("verified");
    });

    it("returns refuted when any child refuted", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Parent" },
          createClaim("Child 1", { source: "https://a.com" }),
          createClaim("Child 2", { refutes: "https://counter.com" }),
        ],
      };
      expect(deriveStatus(claim)).toBe("refuted");
    });

    it("returns partial when some children verified", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Parent" },
          createClaim("Verified child", { source: "https://a.com" }),
          createClaim("Unverified child"),
        ],
      };
      expect(deriveStatus(claim)).toBe("partial");
    });

    it("returns unverified when no children verified", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Parent" },
          createClaim("Unverified 1"),
          createClaim("Unverified 2"),
        ],
      };
      expect(deriveStatus(claim)).toBe("unverified");
    });

    it("returns pending when any child pending", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Parent" },
          createClaim("Verified", { source: "https://a.com" }),
          createClaim("Pending", { action: "check" }),
        ],
      };
      const actionCtx = createMockActionContext({
        pending: new Set(["check"]),
      });
      expect(deriveStatus(claim, { actionCtx })).toBe("pending");
    });

    it("own refuting evidence overrides children", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        refutes: "https://counter.com",
        children: [
          { text: "Parent" },
          createClaim("Verified child", { source: "https://a.com" }),
        ],
      };
      expect(deriveStatus(claim)).toBe("refuted");
    });
  });

  describe("OR derivation", () => {
    it("returns verified when any child verified", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        derivation: "or",
        children: [
          { text: "Parent" },
          createClaim("Verified", { source: "https://a.com" }),
          createClaim("Unverified"),
        ],
      };
      expect(deriveStatus(claim)).toBe("verified");
    });

    it("returns refuted when all children refuted", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        derivation: "or",
        children: [
          { text: "Parent" },
          createClaim("Refuted 1", { refutes: "https://a.com" }),
          createClaim("Refuted 2", { refutes: "https://b.com" }),
        ],
      };
      expect(deriveStatus(claim)).toBe("refuted");
    });

    it("returns unverified when no children verified and not all refuted", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        derivation: "or",
        children: [
          { text: "Parent" },
          createClaim("Unverified 1"),
          createClaim("Unverified 2"),
        ],
      };
      expect(deriveStatus(claim)).toBe("unverified");
    });
  });

  describe("deep nesting", () => {
    it("propagates status through multiple levels", () => {
      // Grandparent -> Parent -> Child (all verified)
      const grandchild = createClaim("Grandchild", {
        source: "https://data.gov",
      });
      const child: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Child" }, grandchild],
      };
      const parent: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Parent" }, child],
      };

      expect(deriveStatus(parent)).toBe("verified");
    });

    it("refuted deep child propagates up", () => {
      const grandchild = createClaim("Refuted grandchild", {
        refutes: "https://counter.com",
      });
      const child: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Child" }, grandchild],
      };
      const parent: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Parent" }, child],
      };

      expect(deriveStatus(parent)).toBe("refuted");
    });

    it("partial child does not make parent partial (only verified children count)", () => {
      const verifiedGrandchild = createClaim("Verified", {
        source: "https://a.com",
      });
      const unverifiedGrandchild = createClaim("Unverified");
      const child: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Child" }, verifiedGrandchild, unverifiedGrandchild],
      };
      const parent: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Parent" }, child],
      };

      // Child is partial because not all grandchildren verified
      // Parent sees child as not-verified (partial != verified)
      // So parent is unverified (no fully verified children)
      expect(deriveStatus(child)).toBe("partial");
      expect(deriveStatus(parent)).toBe("unverified");
    });

    it("parent is partial when it has one verified and one partial child", () => {
      const verifiedChild = createClaim("Fully verified", {
        source: "https://verified.com",
      });
      const partialChild: TClaimElement = {
        type: CLAIM_KEY,
        children: [
          { text: "Partial" },
          createClaim("Verified sub", { source: "https://a.com" }),
          createClaim("Unverified sub"),
        ],
      };
      const parent: TClaimElement = {
        type: CLAIM_KEY,
        children: [{ text: "Parent" }, verifiedChild, partialChild],
      };

      // One child is verified, one is partial - parent is partial
      expect(deriveStatus(parent)).toBe("partial");
    });
  });

  describe("combined own evidence and children", () => {
    it("verified when own evidence supports and all children verified", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        source: "https://primary.com",
        children: [
          { text: "Parent" },
          createClaim("Child", { source: "https://child.com" }),
        ],
      };
      expect(deriveStatus(claim)).toBe("verified");
    });

    it("parent pending takes priority over children", () => {
      const claim: TClaimElement = {
        type: CLAIM_KEY,
        action: "parent-check",
        children: [
          { text: "Parent" },
          createClaim("Child", { source: "https://verified.com" }),
        ],
      };
      const actionCtx = createMockActionContext({
        pending: new Set(["parent-check"]),
      });
      expect(deriveStatus(claim, { actionCtx })).toBe("pending");
    });
  });
});

// ============================================================================
// Status Display Helpers
// ============================================================================

describe("getStatusIcon", () => {
  it("returns correct icons", () => {
    expect(getStatusIcon("verified")).toBe("✓");
    expect(getStatusIcon("refuted")).toBe("✗");
    expect(getStatusIcon("partial")).toBe("◐");
    expect(getStatusIcon("pending")).toBe("⏳");
    expect(getStatusIcon("unverified")).toBe("○");
  });
});

describe("getStatusColor", () => {
  it("returns color classes for each status", () => {
    expect(getStatusColor("verified")).toContain("green");
    expect(getStatusColor("refuted")).toContain("red");
    expect(getStatusColor("partial")).toContain("yellow");
    expect(getStatusColor("pending")).toContain("blue");
    expect(getStatusColor("unverified")).toContain("muted");
  });
});

describe("getEvidenceIcon", () => {
  it("returns correct icons for evidence types", () => {
    expect(getEvidenceIcon("source")).toBe("📎");
    expect(getEvidenceIcon("action")).toBe("⚙️");
    expect(getEvidenceIcon("llm")).toBe("🤖");
  });
});

// ============================================================================
// defaultClaimActionContext Tests
// ============================================================================

describe("defaultClaimActionContext", () => {
  it("always returns false for isPending", () => {
    expect(defaultClaimActionContext.isPending("any-action")).toBe(false);
    expect(defaultClaimActionContext.isPending("")).toBe(false);
  });

  it("always returns null for getResult", () => {
    expect(defaultClaimActionContext.getResult("any-action")).toBe(null);
    expect(defaultClaimActionContext.getResult("")).toBe(null);
  });
});
