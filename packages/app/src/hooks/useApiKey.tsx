/**
 * API Key Context
 *
 * Provides API key management for chat components.
 * The web package provides the actual implementation via this context.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface ApiKeyContextValue {
  /** Whether an API key is configured */
  hasApiKey: boolean;
  /** Save an API key */
  saveApiKey: (key: string) => void;
  /** Callback after key is saved (e.g., to retry a message) */
  onApiKeySaved?: () => void;
  /** The failed message content to retry after saving key */
  pendingRetryContent?: string;
  /** Set the pending retry content */
  setPendingRetryContent?: (content: string | undefined) => void;
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

export function ApiKeyProvider({
  value,
  children,
}: {
  value: ApiKeyContextValue;
  children: ReactNode;
}) {
  return (
    <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
  );
}

export function useApiKey(): ApiKeyContextValue | null {
  return useContext(ApiKeyContext);
}
