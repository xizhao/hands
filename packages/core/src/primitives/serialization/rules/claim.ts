/**
 * Claim Component Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for:
 * - Claim (assertion node in CKG tree)
 * - Evidence (proof supporting/refuting a claim)
 */

import type { TElement, TText } from "platejs";
import { parseAttributes, serializeAttributes, serializeChildren } from "../helpers";
import type { MdxSerializationRule } from "../types";
import {
  CLAIM_KEY,
  EVIDENCE_KEY,
  type TClaimElement,
  type TEvidenceElement,
} from "../../../types";

// ============================================================================
// Helper: Flatten paragraphs containing nested Claims
// ============================================================================

/**
 * When MDX parses `<Claim>text<Claim>nested</Claim></Claim>`, the remark parser
 * wraps mixed content in a paragraph: `claim > p > [text, claim]`.
 * This violates Slate's block-in-inline rules and causes nested Claims to be stripped.
 *
 * This function unwraps such paragraphs, lifting their children to be direct
 * children of the parent Claim: `claim > [text, claim]`.
 */
function flattenNestedClaimParagraphs(
  children: (TElement | TText)[],
): (TElement | TText)[] {
  const result: (TElement | TText)[] = [];

  for (const child of children) {
    // Check if this is a paragraph containing nested Claims
    if (
      "type" in child &&
      child.type === "p" &&
      "children" in child &&
      Array.isArray(child.children)
    ) {
      const hasNestedClaim = child.children.some(
        (c: any) => c.type === CLAIM_KEY
      );
      if (hasNestedClaim) {
        // Unwrap: add paragraph children directly to result
        result.push(...(child.children as (TElement | TText)[]));
        continue;
      }
    }
    // Keep non-paragraph children as-is
    result.push(child);
  }

  return result;
}

// ============================================================================
// Claim
// ============================================================================

/**
 * Claim serialization rule.
 *
 * Claims are assertions that can be verified with evidence.
 * They can nest to form assumption trees (CKG).
 *
 * MDX Examples:
 * ```mdx
 * // Simple claim with source
 * <Claim source="https://fred.stlouisfed.org/series/PCEPILFE">
 *   Core PCE fell to 2.4% in December 2024
 * </Claim>
 *
 * // Claim with nested sub-claims
 * <Claim>
 *   Fed will cut rates 4+ times in 2025
 *   <Claim source="https://fred...">Inflation below target</Claim>
 *   <Claim action="check-labor-data">Labor market softens</Claim>
 * </Claim>
 *
 * // Claim with OR derivation (any child verified = parent verified)
 * <Claim derivation="or">
 *   Market expects rate cuts
 *   <Claim source="https://cme...">Futures price in 4 cuts</Claim>
 *   <Claim>Dot plot shows cuts</Claim>
 * </Claim>
 *
 * // Data-driven claim inside LiveValue
 * <LiveValue query="SELECT value FROM pce ORDER BY date DESC LIMIT 1">
 *   <Claim expect="value < 2.5">Core PCE is below target</Claim>
 * </LiveValue>
 * ```
 */
export const claimRule: MdxSerializationRule<TClaimElement> = {
  tagName: "Claim",
  key: CLAIM_KEY,

  deserialize: (node, _deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (text + nested claims + evidence)
    let children: TClaimElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        // Fix: Unwrap paragraphs that contain nested Claims
        // The MDX parser wraps mixed content (text + block elements) in paragraphs,
        // but we need Claims to be direct children for proper tree structure
        children = flattenNestedClaimParagraphs(converted);
      }
    }

    return {
      type: CLAIM_KEY,
      // Shorthand evidence props
      source: props.source as string | undefined,
      sources: props.sources as string[] | undefined,
      refutes: props.refutes as string | undefined,
      action: props.action as string | undefined,
      // Derivation logic
      derivation: props.derivation as "and" | "or" | undefined,
      // Data-driven evidence (when nested in LiveValue)
      expect: props.expect as string | undefined,
      // Children
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    // Build attributes, excluding children and type
    const attrs = serializeAttributes(
      {
        source: element.source,
        sources: element.sources,
        refutes: element.refutes,
        action: element.action,
        derivation: element.derivation,
        expect: element.expect,
      },
      {
        // Don't serialize defaults
        defaults: {
          derivation: "and",
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Claim",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Evidence
// ============================================================================

/**
 * Evidence serialization rule.
 *
 * Evidence provides proof that supports or refutes a claim.
 * Usually nested inside a Claim element.
 *
 * MDX Examples:
 * ```mdx
 * // Source evidence
 * <Evidence type="source" url="https://fred..." verdict="supports" />
 *
 * // Source with quote
 * <Evidence
 *   type="source"
 *   url="https://cme..."
 *   verdict="supports"
 *   quote="Markets pricing 4.2 cuts by Dec 2025"
 * />
 *
 * // Action evidence
 * <Evidence type="action" actionId="check-data" verdict="supports" />
 *
 * // LLM evidence
 * <Evidence
 *   type="llm"
 *   verdict="supports"
 *   confidence={0.7}
 *   reasoning="Historical pattern suggests..."
 * />
 * ```
 */
export const evidenceRule: MdxSerializationRule<TEvidenceElement> = {
  tagName: "Evidence",
  key: EVIDENCE_KEY,

  deserialize: (node, _deco, _options) => {
    const props = parseAttributes(node);

    return {
      type: EVIDENCE_KEY,
      // Evidence type
      evidenceType: (props.type as "source" | "action" | "llm") ?? "source",
      // Source fields
      url: props.url as string | undefined,
      quote: props.quote as string | undefined,
      // Action fields
      actionId: props.actionId as string | undefined,
      output: props.output,
      // LLM fields
      reasoning: props.reasoning as string | undefined,
      confidence: props.confidence as number | undefined,
      model: props.model as string | undefined,
      // Common fields
      verdict: (props.verdict as "supports" | "refutes") ?? "supports",
      timestamp: props.timestamp as string | undefined,
      // Void element
      children: [{ text: "" }],
    };
  },

  serialize: (element, _options) => {
    // Build attributes based on evidence type
    const baseAttrs: Record<string, unknown> = {
      type: element.evidenceType,
      verdict: element.verdict,
    };

    // Add type-specific attrs
    switch (element.evidenceType) {
      case "source":
        if (element.url) baseAttrs.url = element.url;
        if (element.quote) baseAttrs.quote = element.quote;
        break;
      case "action":
        if (element.actionId) baseAttrs.actionId = element.actionId;
        if (element.output !== undefined) baseAttrs.output = element.output;
        break;
      case "llm":
        if (element.reasoning) baseAttrs.reasoning = element.reasoning;
        if (element.confidence !== undefined) baseAttrs.confidence = element.confidence;
        if (element.model) baseAttrs.model = element.model;
        break;
    }

    // Add timestamp if present
    if (element.timestamp) baseAttrs.timestamp = element.timestamp;

    const attrs = serializeAttributes(baseAttrs, {
      defaults: {
        verdict: "supports",
      },
    });

    // Evidence is a void element (self-closing)
    return {
      type: "mdxJsxFlowElement",
      name: "Evidence",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const claimRules = [claimRule, evidenceRule];
