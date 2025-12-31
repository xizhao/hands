import {
  EditorProvider,
  type EditorTrpcClient,
  type GenerateMdxBlockInput,
  type GenerateMdxInput,
  type GenerateMdxOutput,
} from "@hands/editor";
import type { ReactNode } from "react";
import { BrowserSqlProvider } from "./BrowserSqlProvider";

// ============================================================================
// Types
// ============================================================================

interface SiteEditorProviderProps {
  children: ReactNode;
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Fetch wrapper for the AI edge function
 */
async function generateMdxFromApi(
  input: GenerateMdxInput | GenerateMdxBlockInput,
): Promise<GenerateMdxOutput> {
  const response = await fetch("/api/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI generation failed: ${error}`);
  }

  return response.json();
}

/**
 * Mock tRPC client that proxies to the edge function
 */
const mockTrpcClient: EditorTrpcClient = {
  ai: {
    generateMdx: {
      mutate: generateMdxFromApi,
    },
    generateMdxBlock: {
      mutate: generateMdxFromApi,
    },
    generateHint: {
      mutate: async () => ({ hint: "", cached: false }),
    },
    generateHintsBatch: {
      mutate: async () => ({ hints: [] }),
    },
  },
};

// ============================================================================
// Tables Schema
// ============================================================================

/**
 * Demo database schema for AI context
 * Includes RevOps, Forms, Alerts, and Onboarding data
 */
const demoTables = [
  // RevOps / Sales
  {
    name: "deals",
    columns: [
      "id",
      "company",
      "owner",
      "stage",
      "amount",
      "probability",
      "status",
      "close_date",
      "sales_cycle_days",
    ],
  },
  {
    name: "revenue_monthly",
    columns: ["id", "month", "revenue", "target", "new_arr", "churn"],
  },
  {
    name: "sales_metrics",
    columns: ["id", "month", "win_rate", "avg_deal_size", "meetings_booked", "demos_completed"],
  },
  {
    name: "rep_performance",
    columns: ["id", "rep_name", "closed_revenue", "quota", "deals_won", "pipeline_value"],
  },
  // Team Survey / Forms
  {
    name: "survey_responses",
    columns: ["id", "submitted_at", "mood", "workload", "blockers", "wins", "suggestions"],
  },
  // Operations Alerts
  {
    name: "alerts",
    columns: [
      "id",
      "severity",
      "system",
      "message",
      "status",
      "triggered_at",
      "acknowledged_by",
      "resolved_at",
    ],
  },
  {
    name: "system_health",
    columns: [
      "id",
      "timestamp",
      "system",
      "uptime_pct",
      "error_rate",
      "latency_p50",
      "latency_p95",
    ],
  },
  {
    name: "api_metrics",
    columns: ["id", "timestamp", "system", "latency_p95", "requests_per_sec", "error_count"],
  },
  {
    name: "incident_notes",
    columns: ["id", "alert_id", "note", "created_by", "created_at"],
  },
  // Customer Onboarding
  {
    name: "customers",
    columns: ["id", "name", "csm_name", "target_go_live", "plan", "arr", "signed_at"],
  },
  {
    name: "onboarding_progress",
    columns: ["id", "customer_id", "completed", "total", "days_elapsed"],
  },
  {
    name: "onboarding_tasks",
    columns: ["id", "customer_id", "phase", "task", "owner", "status", "due_date", "completed_at"],
  },
  {
    name: "customer_notes",
    columns: ["id", "customer_id", "note", "created_by", "created_at"],
  },
];

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Combined provider for the site demo.
 *
 * Wraps:
 * - BrowserSqlProvider: In-browser SQLite via sql.js
 * - EditorProvider: AI features via edge function
 */
export function SiteEditorProvider({ children }: SiteEditorProviderProps) {
  return (
    <BrowserSqlProvider>
      <EditorProvider trpc={mockTrpcClient} tables={demoTables}>
        {children}
      </EditorProvider>
    </BrowserSqlProvider>
  );
}
