/**
 * Agent Ready Context
 *
 * Provides a platform-agnostic way to check if the AI agent is ready.
 * - Desktop: Always ready (uses OpenCode server)
 * - Web: Ready when tool context is set up by AgentProvider
 */

import { createContext, useContext, type ReactNode } from "react";

// ============================================================================
// Context
// ============================================================================

const AgentReadyContext = createContext<boolean>(true);

// ============================================================================
// Provider
// ============================================================================

interface AgentReadyProviderProps {
  isReady: boolean;
  children: ReactNode;
}

/**
 * Provider for agent readiness state.
 * Desktop apps don't need this (defaults to always ready).
 * Web apps should wrap with this and pass isReady from AgentProvider.
 */
export function AgentReadyProvider({ isReady, children }: AgentReadyProviderProps) {
  return (
    <AgentReadyContext.Provider value={isReady}>
      {children}
    </AgentReadyContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Check if the AI agent is ready to accept prompts.
 * Returns true by default (for desktop mode).
 */
export function useAgentReady(): boolean {
  return useContext(AgentReadyContext);
}
