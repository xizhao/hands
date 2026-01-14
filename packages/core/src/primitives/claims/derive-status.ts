/**
 * Status Derivation for Claims
 *
 * Pure functions to compute claim status from evidence and children.
 * Status is never stored - always derived at render time.
 */

import type { TElement } from "platejs";
import type {
  ClaimEvidence,
  ClaimStatus,
  TClaimElement,
  TEvidenceElement,
} from "../../types";
import { CLAIM_KEY, EVIDENCE_KEY } from "../../types";

/**
 * Context for pending actions (injected from runtime).
 * Maps action ID to whether it's currently running.
 */
export interface ClaimActionContext {
  isPending: (actionId: string) => boolean;
  getResult: (actionId: string) => { verdict: "supports" | "refutes"; output?: unknown } | null;
}

/**
 * Default action context (no actions pending).
 */
export const defaultClaimActionContext: ClaimActionContext = {
  isPending: () => false,
  getResult: () => null,
};

/**
 * Extract text content from a claim element's children.
 */
export function getClaimText(claim: TClaimElement): string {
  const textParts: string[] = [];

  for (const child of claim.children) {
    if ("text" in child && typeof child.text === "string") {
      textParts.push(child.text);
    }
  }

  return textParts.join("").trim();
}

/**
 * Extract child claims from a claim element.
 */
export function getChildClaims(claim: TClaimElement): TClaimElement[] {
  return claim.children.filter(
    (child): child is TClaimElement =>
      typeof child === "object" && "type" in child && child.type === CLAIM_KEY
  );
}

/**
 * Extract evidence elements from a claim element.
 */
export function getEvidenceElements(claim: TClaimElement): TEvidenceElement[] {
  return claim.children.filter(
    (child): child is TEvidenceElement =>
      typeof child === "object" && "type" in child && child.type === EVIDENCE_KEY
  );
}

/**
 * Convert Evidence element to ClaimEvidence object.
 */
export function evidenceElementToEvidence(el: TEvidenceElement): ClaimEvidence {
  switch (el.evidenceType) {
    case "source":
      return {
        type: "source",
        url: el.url ?? "",
        quote: el.quote,
        verdict: el.verdict,
        accessedAt: el.timestamp,
      };
    case "action":
      return {
        type: "action",
        actionId: el.actionId ?? "",
        output: el.output,
        verdict: el.verdict,
        ranAt: el.timestamp,
      };
    case "llm":
      return {
        type: "llm",
        reasoning: el.reasoning ?? "",
        confidence: el.confidence ?? 0,
        verdict: el.verdict,
        model: el.model,
      };
  }
}

/**
 * Options for collecting evidence, including runtime data.
 */
export interface CollectEvidenceOptions {
  /** Action context for pending/completed actions */
  actionCtx?: ClaimActionContext;
  /** Data verdict from evaluating `expect` condition against LiveValue data */
  dataVerdict?: "supports" | "refutes" | null;
  /** The data row that was evaluated (for display purposes) */
  dataRow?: Record<string, unknown>;
}

/**
 * Collect all evidence for a claim (from shorthand props + Evidence children + data).
 */
export function collectEvidence(
  claim: TClaimElement,
  options: CollectEvidenceOptions = {}
): ClaimEvidence[] {
  const { actionCtx = defaultClaimActionContext, dataVerdict, dataRow } = options;
  const evidence: ClaimEvidence[] = [];

  // Shorthand: source prop
  if (claim.source) {
    evidence.push({
      type: "source",
      url: claim.source,
      verdict: "supports",
    });
  }

  // Shorthand: sources prop (array)
  if (claim.sources) {
    for (const url of claim.sources) {
      evidence.push({
        type: "source",
        url,
        verdict: "supports",
      });
    }
  }

  // Shorthand: refutes prop
  if (claim.refutes) {
    evidence.push({
      type: "source",
      url: claim.refutes,
      verdict: "refutes",
    });
  }

  // Shorthand: action prop (check if result available)
  if (claim.action) {
    const result = actionCtx.getResult(claim.action);
    if (result) {
      evidence.push({
        type: "action",
        actionId: claim.action,
        verdict: result.verdict,
        output: result.output,
      });
    }
  }

  // Data-driven evidence (from parent LiveValue + expect condition)
  if (claim.expect && dataVerdict) {
    evidence.push({
      type: "action",
      actionId: `data:${claim.expect}`,
      verdict: dataVerdict,
      output: dataRow,
    });
  }

  // Evidence children
  const evidenceElements = getEvidenceElements(claim);
  for (const el of evidenceElements) {
    evidence.push(evidenceElementToEvidence(el));
  }

  return evidence;
}

/**
 * Derive status for a single claim (not considering children).
 */
export function deriveOwnStatus(
  claim: TClaimElement,
  options: CollectEvidenceOptions = {}
): ClaimStatus {
  const { actionCtx = defaultClaimActionContext } = options;

  // Check for pending action
  if (claim.action && actionCtx.isPending(claim.action)) {
    return "pending";
  }

  const evidence = collectEvidence(claim, options);

  // No evidence = unverified
  if (evidence.length === 0) {
    return "unverified";
  }

  const verdicts = evidence.map((e) => e.verdict);

  // Any refutation = refuted
  if (verdicts.includes("refutes")) {
    return "refuted";
  }

  // All support = verified
  if (verdicts.every((v) => v === "supports")) {
    return "verified";
  }

  return "unverified";
}

/**
 * Derive status for a claim including its children (recursive).
 *
 * Rules:
 * - If claim has pending action → pending
 * - If claim's own evidence refutes → refuted
 * - For children:
 *   - AND logic (default): ALL children must be verified, ANY refuted = refuted
 *   - OR logic: ANY child verified = verified, ALL refuted = refuted
 * - If some children verified but not all → partial
 * - If no evidence and no children → unverified
 */
export function deriveStatus(
  claim: TClaimElement,
  options: CollectEvidenceOptions = {}
): ClaimStatus {
  const { actionCtx = defaultClaimActionContext } = options;

  // Check for pending action first
  if (claim.action && actionCtx.isPending(claim.action)) {
    return "pending";
  }

  // Get own evidence (including data verdict if provided)
  const evidence = collectEvidence(claim, options);
  const ownVerdicts = evidence.map((e) => e.verdict);

  // Own evidence refutes = refuted (regardless of children)
  if (ownVerdicts.includes("refutes")) {
    return "refuted";
  }

  // Get children
  const children = getChildClaims(claim);

  // Leaf node - derive from own evidence only
  if (children.length === 0) {
    if (evidence.length === 0) {
      return "unverified";
    }
    return ownVerdicts.every((v) => v === "supports") ? "verified" : "unverified";
  }

  // Recurse into children (without passing data verdict - that's only for this claim)
  const childOptions: CollectEvidenceOptions = { actionCtx };
  const childStatuses = children.map((child) => deriveStatus(child, childOptions));

  // Check derivation mode
  const derivation = claim.derivation ?? "and";

  if (derivation === "or") {
    // OR logic: any verified = verified
    if (childStatuses.some((s) => s === "verified")) {
      // If own evidence also supports, verified
      if (evidence.length === 0 || ownVerdicts.every((v) => v === "supports")) {
        return "verified";
      }
    }
    // All refuted = refuted
    if (childStatuses.every((s) => s === "refuted")) {
      return "refuted";
    }
  } else {
    // AND logic (default): all must be verified
    if (childStatuses.some((s) => s === "refuted")) {
      return "refuted";
    }
    if (childStatuses.every((s) => s === "verified")) {
      // If own evidence also supports (or no own evidence), verified
      if (evidence.length === 0 || ownVerdicts.every((v) => v === "supports")) {
        return "verified";
      }
    }
  }

  // Check for pending
  if (childStatuses.some((s) => s === "pending")) {
    return "pending";
  }

  // Partial if some verified
  if (childStatuses.some((s) => s === "verified")) {
    return "partial";
  }

  return "unverified";
}

/**
 * Get status icon for display.
 */
export function getStatusIcon(status: ClaimStatus): string {
  switch (status) {
    case "verified":
      return "✓";
    case "refuted":
      return "✗";
    case "partial":
      return "◐";
    case "pending":
      return "⏳";
    case "unverified":
    default:
      return "○";
  }
}

/**
 * Get status color class for styling.
 */
export function getStatusColor(status: ClaimStatus): string {
  switch (status) {
    case "verified":
      return "text-green-600 dark:text-green-400";
    case "refuted":
      return "text-red-600 dark:text-red-400";
    case "partial":
      return "text-yellow-600 dark:text-yellow-400";
    case "pending":
      return "text-blue-600 dark:text-blue-400";
    case "unverified":
    default:
      return "text-muted-foreground";
  }
}

/**
 * Get evidence icon for display.
 */
export function getEvidenceIcon(type: ClaimEvidence["type"]): string {
  switch (type) {
    case "source":
      return "📎";
    case "action":
      return "⚙️";
    case "llm":
      return "🤖";
  }
}
