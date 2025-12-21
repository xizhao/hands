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
   * Port of the runtime server to connect to.
   * All block/RSC requests go through the runtime (55000) which proxies to Vite internally.
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
