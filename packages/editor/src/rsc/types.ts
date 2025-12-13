/**
 * RSC Types
 */

import type { ReactNode } from "react";

/** RSC render result */
export interface RscRenderResult {
  element: ReactNode | null;
  error?: string;
}

/** RSC context configuration */
export interface RscConfig {
  /**
   * Port of the server to connect to.
   * - 55000: Runtime API (recommended, proxies /rsc/* to Vite worker)
   * - 55200: Vite worker directly (for debugging)
   */
  port: number;
  /** Whether RSC is enabled */
  enabled: boolean;
  /** Base URL override (default: http://localhost:{port}) */
  baseUrl?: string;
}

/** Component render request */
export interface RscComponentRequest {
  /** Component tag name (e.g., "Card", "Button") */
  tagName: string;
  /** Component props */
  props: Record<string, unknown>;
  /** Children JSX (serialized) */
  children?: string;
  /** Unique element ID from AST */
  elementId?: string;
}
