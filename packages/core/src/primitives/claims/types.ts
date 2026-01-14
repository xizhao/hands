/**
 * Claims Knowledge Graph Types
 *
 * Re-exports from core types + additional utilities.
 */

import type { ClaimEvidence as ClaimEvidenceType, ClaimStatus } from "../../types";

export type {
  ClaimEvidence,
  ClaimStatus,
  EvidenceVerdict,
  TClaimElement,
  TEvidenceElement,
} from "../../types";

export { CLAIM_KEY, EVIDENCE_KEY } from "../../types";

/**
 * Flattened claim for easier processing.
 * Used when traversing the claim tree.
 */
export interface FlatClaim {
  id: string;
  text: string;
  parentId?: string;
  evidence: ClaimEvidenceType[];
  derivation: "and" | "or";
  hasAction: boolean;
  actionId?: string;
}

/**
 * Claim tree node with resolved children and computed status.
 */
export interface ClaimTreeNode {
  id: string;
  text: string;
  evidence: ClaimEvidenceType[];
  derivation: "and" | "or";
  status: ClaimStatus;
  children: ClaimTreeNode[];
  actionId?: string;
  actionPending?: boolean;
}
