import { type ReactNode } from "react";
import {
  EditorProvider,
  type EditorTrpcClient,
  type GenerateMdxInput,
  type GenerateMdxBlockInput,
  type GenerateMdxOutput,
} from "@hands/editor";
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
  input: GenerateMdxInput | GenerateMdxBlockInput
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
  },
};

// ============================================================================
// Tables Schema
// ============================================================================

/**
 * Demo database schema for AI context
 */
const demoTables = [
  {
    name: "users",
    columns: ["id", "name", "email", "created_at"],
  },
  {
    name: "products",
    columns: ["id", "name", "price", "category", "in_stock"],
  },
  {
    name: "orders",
    columns: [
      "id",
      "user_id",
      "product_id",
      "quantity",
      "amount",
      "status",
      "created_at",
    ],
  },
  {
    name: "tasks",
    columns: ["id", "title", "status", "priority", "assigned_to", "created_at"],
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
