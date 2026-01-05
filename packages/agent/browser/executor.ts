/**
 * Agent Executor - Abstraction layer for browser/server execution
 *
 * NOTE: This is a simplified abstraction layer. The main implementation
 * is in agent.ts which handles the full multi-turn loop with tool execution.
 * This file provides the browser/server switching abstraction.
 */

import type { ToolSet } from "ai";
import type { AgentConfig, Session, MessageWithParts, AgentEvent } from "../core";
import { runAgent } from "./agent";
import type { ToolContext, ToolId } from "./tools";

// ============================================================================
// Types
// ============================================================================

export interface ExecutorConfig {
  mode: "browser" | "server";
  serverUrl?: string; // For server mode
}

export interface StreamOptions {
  session: Session;
  messages: MessageWithParts[];
  agent: AgentConfig;
  toolContext: ToolContext;
  enabledTools?: ToolId[];
  abortSignal?: AbortSignal;
}

export interface ExecutorResult {
  stream: AsyncIterable<AgentEvent>;
  abort: () => void;
}

// ============================================================================
// Browser Executor
// ============================================================================

/**
 * Execute agent in browser using AI SDK directly.
 * Delegates to the main agent loop in agent.ts.
 */
function executeBrowser(options: StreamOptions): ExecutorResult {
  const result = runAgent({
    session: options.session,
    messages: options.messages,
    agent: options.agent,
    toolContext: options.toolContext,
    enabledTools: options.enabledTools,
    abortSignal: options.abortSignal,
  });

  return {
    stream: result.events,
    abort: result.abort,
  };
}

// ============================================================================
// Server Executor (Future)
// ============================================================================

/**
 * Execute agent via server API route.
 * Placeholder for future server-side migration.
 */
async function* executeServer(_options: StreamOptions, _serverUrl: string): AsyncGenerator<AgentEvent> {
  yield {
    type: "error",
    error: { type: "not_implemented", message: "Server execution not yet implemented" },
  };

  // Future implementation:
  // const response = await fetch(`${serverUrl}/api/agent/stream`, {
  //   method: "POST",
  //   body: JSON.stringify({ session, messages, agent }),
  //   signal: options.abortSignal,
  // });
  // for await (const chunk of parseSSE(response.body)) {
  //   yield chunk;
  // }
}

// ============================================================================
// Unified Executor
// ============================================================================

const defaultConfig: ExecutorConfig = { mode: "browser" };

/**
 * Create an executor with the given configuration.
 * Returns a function that streams agent events.
 */
export function createExecutor(config: ExecutorConfig = defaultConfig) {
  return function execute(options: StreamOptions): ExecutorResult {
    if (config.mode === "browser") {
      return executeBrowser(options);
    }

    // Server mode
    const abortController = new AbortController();
    return {
      stream: executeServer({ ...options, abortSignal: abortController.signal }, config.serverUrl || ""),
      abort: () => abortController.abort(),
    };
  };
}
