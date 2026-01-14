"use client";

/**
 * @component Claim
 * @category static
 * @description An assertion that can be verified with evidence.
 * Claims can nest to form assumption trees (CKG - Claims Knowledge Graph).
 * Status is derived from evidence and children - never stored explicitly.
 *
 * UI: Toggle-style collapsible list with colored status dot indicator.
 * - Click caret to collapse/expand nested claims
 * - Hover status dot for details (sources, action status)
 * - Status shown as colored circle: green=verified, red=refuted, yellow=partial
 *
 * @keywords claim, evidence, assertion, knowledge graph, verification, CKG
 * @example
 * <Claim source="https://fred.stlouisfed.org/series/PCEPILFE">
 *   Core PCE fell to 2.4% in December 2024
 * </Claim>
 * @example
 * <Claim>
 *   Fed will cut rates 4+ times in 2025
 *   <Claim source="https://fred...">Inflation below target</Claim>
 *   <Claim action="check-labor-data">Labor market softens</Claim>
 * </Claim>
 */

import { ChevronRight, ExternalLink } from "lucide-react";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  usePath,
  useSelected,
} from "platejs/react";
import { createContext, memo, useContext, useMemo, useState } from "react";

import {
  CLAIM_KEY,
  type ClaimStatus,
  EVIDENCE_KEY,
  type TClaimElement,
  type TEvidenceElement,
} from "../../types";
import {
  type ClaimActionContext,
  type CollectEvidenceOptions,
  defaultClaimActionContext,
  deriveStatus,
  evaluateCondition,
  collectEvidence,
} from "../../primitives/claims";
import { cn } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/tooltip";
import { useLiveValueData } from "./charts/context";

// ============================================================================
// Context for Action State
// ============================================================================

/**
 * Context for providing action state to claims.
 * Allows claims to check if actions are pending or have results.
 */
export const ClaimActionContextProvider = createContext<ClaimActionContext>(defaultClaimActionContext);

export function useClaimActionContext(): ClaimActionContext {
  return useContext(ClaimActionContextProvider);
}

// ============================================================================
// Status Dot Component
// ============================================================================

interface StatusDotProps {
  status: ClaimStatus;
  sources?: string[];
  refutes?: string;
  action?: string;
  isPending?: boolean;
  derivation?: "and" | "or";
  childCount?: number;
  verifiedCount?: number;
}

function StatusDot({
  status,
  sources,
  refutes,
  action,
  isPending,
  derivation,
  childCount,
  verifiedCount,
}: StatusDotProps) {
  const dotColor = {
    verified: "bg-green-500",
    refuted: "bg-red-500",
    partial: "bg-yellow-500",
    pending: "bg-blue-500 animate-pulse",
    unverified: "bg-muted-foreground/40",
  }[status];

  const statusLabel = {
    verified: "Verified",
    refuted: "Refuted",
    partial: "Partial",
    pending: "Pending",
    unverified: "Unverified",
  }[status];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block size-2 rounded-full shrink-0 cursor-default",
              dotColor
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs p-2">
          <div className="text-xs space-y-1">
            {/* Status header */}
            <div className="font-semibold">{statusLabel}</div>

            {/* Evidence breakdown */}
            {sources && sources.length > 0 && (
              <div className="text-green-600 dark:text-green-400">
                ✓ {sources.length} source{sources.length > 1 ? "s" : ""}
                <div className="pl-2 opacity-70">
                  {sources.map((s, i) => {
                    try {
                      return <div key={i}>{new URL(s).hostname.replace("www.", "")}</div>;
                    } catch {
                      return <div key={i}>{s.slice(0, 30)}</div>;
                    }
                  })}
                </div>
              </div>
            )}

            {refutes && (
              <div className="text-red-600 dark:text-red-400">
                ✗ Refuted by:{" "}
                {(() => {
                  try {
                    return new URL(refutes).hostname.replace("www.", "");
                  } catch {
                    return refutes.slice(0, 30);
                  }
                })()}
              </div>
            )}

            {action && (
              <div className={isPending ? "text-blue-600" : "text-muted-foreground"}>
                {isPending ? "⏳ Running: " : "⚙️ Action: "}
                {action}
              </div>
            )}

            {/* Child derivation */}
            {childCount !== undefined && childCount > 0 && (
              <div className="border-t border-border/50 pt-1 mt-1">
                <div className="text-muted-foreground">
                  {verifiedCount ?? 0}/{childCount} sub-claims verified
                  {derivation === "or" && " (OR logic)"}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Standalone Components
// ============================================================================

export interface ClaimProps {
  /** Claim content (text + nested claims) */
  children: React.ReactNode;
  /** Source URL (shorthand for single supporting source) */
  source?: string;
  /** Multiple source URLs */
  sources?: string[];
  /** Source that refutes this claim */
  refutes?: string;
  /** Action ID to run for verification */
  action?: string;
  /** How to combine child statuses ("and" | "or") */
  derivation?: "and" | "or";
  /**
   * Condition to evaluate against parent LiveValue data.
   * Examples: "value < 2.5", "count > 0", "status == 'active'"
   * When inside LiveValue, evaluates condition against query result.
   */
  expect?: string;
  /** Explicitly provide status (for standalone use) */
  status?: ClaimStatus;
  /** Additional CSS classes */
  className?: string;
  /** Nesting depth (used for indentation) */
  depth?: number;
}

/**
 * Standalone Claim component for use outside Plate editor.
 */
export function Claim({
  children,
  source,
  sources,
  refutes,
  action,
  derivation = "and",
  expect: expectCondition,
  status: providedStatus,
  className,
  depth = 0,
}: ClaimProps) {
  const actionCtx = useClaimActionContext();
  const [open, setOpen] = useState(true);

  // Get data from LiveValue context if available
  const liveValueCtx = useLiveValueData();
  const data = liveValueCtx?.data;

  // Evaluate expect condition against LiveValue data
  const { dataVerdict, dataRow } = useMemo(() => {
    if (!expectCondition || !data || data.length === 0) {
      return { dataVerdict: null, dataRow: undefined };
    }

    // Use first row for single-value queries
    const row = data[0];
    const passes = evaluateCondition(expectCondition, row);

    return {
      dataVerdict: passes ? ("supports" as const) : ("refutes" as const),
      dataRow: row,
    };
  }, [expectCondition, data]);

  // Build options for status derivation
  const collectOptions: CollectEvidenceOptions = useMemo(
    () => ({
      actionCtx,
      dataVerdict,
      dataRow,
    }),
    [actionCtx, dataVerdict, dataRow]
  );

  // Derive status from evidence if not provided
  const status = useMemo(() => {
    if (providedStatus) return providedStatus;

    const pseudoElement: TClaimElement = {
      type: CLAIM_KEY,
      source,
      sources,
      refutes,
      action,
      derivation,
      expect: expectCondition,
      children: [{ text: "" }],
    };

    return deriveStatus(pseudoElement, collectOptions);
  }, [
    providedStatus,
    source,
    sources,
    refutes,
    action,
    derivation,
    expectCondition,
    collectOptions,
  ]);

  // Collect all sources for tooltip
  const allSources = useMemo(() => {
    const srcs: string[] = [];
    if (source) srcs.push(source);
    if (sources) srcs.push(...sources);
    if (refutes) srcs.push(refutes);
    return srcs;
  }, [source, sources, refutes]);

  const isPending = action ? actionCtx.isPending(action) : false;

  return (
    <div className={cn("relative py-0.5 pl-4", className)}>
      {/* Status dot */}
      <span className="absolute left-1 top-1" contentEditable={false}>
        <StatusDot
          status={status}
          sources={allSources}
          action={action}
          isPending={isPending}
        />
      </span>

      {/* Content */}
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ============================================================================
// Evidence Component
// ============================================================================

export interface EvidenceProps {
  /** Type of evidence */
  type: "source" | "action" | "llm";
  /** URL for source evidence */
  url?: string;
  /** Quote from source */
  quote?: string;
  /** Action ID for action evidence */
  actionId?: string;
  /** LLM reasoning */
  reasoning?: string;
  /** LLM confidence 0-1 */
  confidence?: number;
  /** Whether this evidence supports or refutes */
  verdict?: "supports" | "refutes";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Evidence component - inline badge style.
 */
export function Evidence({
  type,
  url,
  actionId,
  confidence,
  verdict = "supports",
  className,
}: EvidenceProps) {
  const icon = type === "source" ? "📎" : type === "action" ? "⚙️" : "🤖";
  const verdictColor = verdict === "refutes" ? "text-red-600" : "text-green-600";

  let label = "";
  if (type === "source" && url) {
    try {
      label = new URL(url).hostname.replace("www.", "");
    } catch {
      label = url.slice(0, 30);
    }
  } else if (type === "action" && actionId) {
    label = actionId;
  } else if (type === "llm" && confidence) {
    label = `${Math.round(confidence * 100)}%`;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5",
        verdict === "refutes" ? "bg-red-500/10" : "bg-green-500/10",
        verdictColor,
        className
      )}
    >
      <span>{icon}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

// ============================================================================
// Plate Plugins
// ============================================================================

function ClaimElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement<TClaimElement>();
  const path = usePath();
  const selected = useSelected();
  const actionCtx = useClaimActionContext();

  // Collapsed state is stored on the element, not local React state
  const isOpen = !element.collapsed;

  // Toggle collapsed state via Plate transform
  const toggleCollapsed = () => {
    editor.tf.setNodes(
      { collapsed: !element.collapsed },
      { at: path }
    );
  };

  // Get data from LiveValue context if available
  const liveValueCtx = useLiveValueData();
  const data = liveValueCtx?.data;

  // Evaluate expect condition against LiveValue data
  const { dataVerdict, dataRow } = useMemo(() => {
    if (!element.expect || !data || data.length === 0) {
      return { dataVerdict: null, dataRow: undefined };
    }
    const row = data[0];
    const passes = evaluateCondition(element.expect, row);
    return {
      dataVerdict: passes ? ("supports" as const) : ("refutes" as const),
      dataRow: row,
    };
  }, [element.expect, data]);

  // Derive status
  const collectOptions: CollectEvidenceOptions = useMemo(
    () => ({ actionCtx, dataVerdict, dataRow }),
    [actionCtx, dataVerdict, dataRow]
  );
  const status = deriveStatus(element, collectOptions);

  // Collect all sources for tooltip
  const allSources = useMemo(() => {
    const srcs: string[] = [];
    if (element.source) srcs.push(element.source);
    if (element.sources) srcs.push(...element.sources);
    return srcs;
  }, [element.source, element.sources]);

  const isPending = element.action ? actionCtx.isPending(element.action) : false;
  const hasSource = allSources.length > 0 || element.refutes;

  // Check if has nested claims and count them
  const { hasNestedClaims, childCount, verifiedCount } = useMemo(() => {
    const nestedClaims = element.children.filter(
      (child): child is TClaimElement =>
        typeof child === "object" && "type" in child && child.type === CLAIM_KEY
    );

    const verified = nestedClaims.filter((child) => {
      const childStatus = deriveStatus(child, collectOptions);
      return childStatus === "verified";
    }).length;

    return {
      hasNestedClaims: nestedClaims.length > 0,
      childCount: nestedClaims.length,
      verifiedCount: verified,
    };
  }, [element.children, collectOptions]);

  return (
    <PlateElement
      {...props}
      className={cn(
        "claim-element relative py-0.5 pl-5",
        selected && "bg-primary/5 rounded"
      )}
      data-claim-id={element.id}
    >
      {/* Caret toggle (only if has nested claims) */}
      {hasNestedClaims && (
        <span
          className="absolute left-0 top-0.5 flex cursor-pointer select-none items-center justify-center rounded-sm hover:bg-muted z-10"
          contentEditable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCollapsed();
          }}
        >
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-75",
              isOpen ? "rotate-90" : "rotate-0"
            )}
          />
        </span>
      )}

      {/* Status dot with optional source link */}
      <span
        className={cn(
          "absolute top-1",
          hasNestedClaims ? "left-3.5" : "left-0.5"
        )}
        contentEditable={false}
      >
        <StatusDot
          status={status}
          sources={allSources}
          refutes={element.refutes}
          action={element.action}
          isPending={isPending}
          derivation={element.derivation}
          childCount={childCount}
          verifiedCount={verifiedCount}
        />
      </span>

      {/* Source link icon */}
      {hasSource && (
        <a
          href={allSources[0] || element.refutes}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "absolute top-0.5 right-0 opacity-40 hover:opacity-100",
            element.refutes && !allSources.length
              ? "text-red-500"
              : "text-green-500"
          )}
          contentEditable={false}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3" />
        </a>
      )}

      {/* Content */}
      <div className={cn("claim-content", !isOpen && hasNestedClaims && "claim-collapsed")}>
        {props.children}
      </div>
    </PlateElement>
  );
}

function EvidenceElement(props: PlateElementProps) {
  const element = useElement<TEvidenceElement>();
  const selected = useSelected();

  const verdictColor =
    element.verdict === "refutes" ? "text-red-600" : "text-green-600";
  const icon =
    element.evidenceType === "source"
      ? "📎"
      : element.evidenceType === "action"
        ? "⚙️"
        : "🤖";

  let label = "";
  if (element.evidenceType === "source" && element.url) {
    try {
      label = new URL(element.url).hostname.replace("www.", "");
    } catch {
      label = element.url.slice(0, 30);
    }
  } else if (element.evidenceType === "action" && element.actionId) {
    label = element.actionId;
  } else if (element.evidenceType === "llm" && element.confidence) {
    label = `${Math.round(element.confidence * 100)}%`;
  }

  return (
    <PlateElement
      {...props}
      as="span"
      className={cn(
        "inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 mx-0.5",
        element.verdict === "refutes" ? "bg-red-500/10" : "bg-green-500/10",
        verdictColor,
        selected && "ring-1 ring-primary"
      )}
    >
      <span>{icon}</span>
      {element.url ? (
        <a
          href={element.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          contentEditable={false}
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </PlateElement>
  );
}

/**
 * Claim Plugin - assertion node in CKG.
 * Marked as container so nested claims can be dragged.
 */
export const ClaimPlugin = createPlatePlugin({
  key: CLAIM_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    isContainer: true,
    component: memo(ClaimElement),
  },
});

/**
 * Evidence Plugin - inline badge showing proof.
 */
export const EvidencePlugin = createPlatePlugin({
  key: EVIDENCE_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(EvidenceElement),
  },
});

// ============================================================================
// Element Factories
// ============================================================================

/**
 * Create a Claim element for insertion into editor.
 */
export function createClaimElement(
  text: string,
  options?: {
    source?: string;
    sources?: string[];
    refutes?: string;
    action?: string;
    derivation?: "and" | "or";
    expect?: string;
  }
): TClaimElement {
  return {
    type: CLAIM_KEY,
    source: options?.source,
    sources: options?.sources,
    refutes: options?.refutes,
    action: options?.action,
    derivation: options?.derivation,
    expect: options?.expect,
    children: [{ text }],
  };
}

/**
 * Create an Evidence element for insertion into editor.
 */
export function createEvidenceElement(options: {
  evidenceType: "source" | "action" | "llm";
  verdict: "supports" | "refutes";
  url?: string;
  quote?: string;
  actionId?: string;
  reasoning?: string;
  confidence?: number;
}): TEvidenceElement {
  return {
    type: EVIDENCE_KEY,
    evidenceType: options.evidenceType,
    verdict: options.verdict,
    url: options.url,
    quote: options.quote,
    actionId: options.actionId,
    reasoning: options.reasoning,
    confidence: options.confidence,
    children: [{ text: "" }],
  };
}

export { CLAIM_KEY, EVIDENCE_KEY };
