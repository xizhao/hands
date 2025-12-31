"use client";

/**
 * Platform Context
 *
 * Provides the platform adapter to all components via React context.
 * Components use usePlatform() to access platform-specific functionality.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { PlatformAdapter, PlatformCapabilities } from "./types";

// ============================================================================
// Context
// ============================================================================

const PlatformContext = createContext<PlatformAdapter | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface PlatformProviderProps {
  adapter: PlatformAdapter;
  children: ReactNode;
}

/**
 * Provides the platform adapter to the entire app.
 * Must wrap the application at the root level.
 *
 * @example
 * ```tsx
 * // Desktop entry
 * <PlatformProvider adapter={TauriPlatformAdapter}>
 *   <App />
 * </PlatformProvider>
 *
 * // Web entry
 * <PlatformProvider adapter={createCloudPlatformAdapter(options)}>
 *   <App />
 * </PlatformProvider>
 * ```
 */
export function PlatformProvider({ adapter, children }: PlatformProviderProps) {
  return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the platform adapter.
 * Must be used within a PlatformProvider.
 *
 * @throws Error if used outside PlatformProvider
 */
export function usePlatform(): PlatformAdapter {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return ctx;
}

/**
 * Check if running on desktop.
 */
export function useIsDesktop(): boolean {
  const platform = usePlatform();
  return platform.platform === "desktop";
}

/**
 * Check if running on web.
 */
export function useIsWeb(): boolean {
  const platform = usePlatform();
  return platform.platform === "web";
}

/**
 * Check if a specific capability is available.
 */
export function useCapability(cap: keyof PlatformCapabilities): boolean {
  const platform = usePlatform();
  return platform.capabilities[cap];
}

/**
 * Get the platform capabilities object.
 */
export function useCapabilities(): PlatformCapabilities {
  const platform = usePlatform();
  return platform.capabilities;
}

/**
 * Get the authentication interface (web only).
 * Returns undefined on desktop.
 */
export function useAuth() {
  const platform = usePlatform();
  return platform.auth;
}

/**
 * Get the window management interface (desktop only).
 * Returns undefined on web.
 */
export function useWindow() {
  const platform = usePlatform();
  return platform.window;
}

/**
 * Get the file system interface (desktop only).
 * Returns undefined on web.
 */
export function useFileSystem() {
  const platform = usePlatform();
  return platform.fs;
}

/**
 * Get the storage interface.
 * Returns undefined if storage is not available.
 */
export function useStorage() {
  const platform = usePlatform();
  return platform.storage;
}

/**
 * Get the server management interface (desktop only).
 * Returns undefined on web.
 */
export function useServer() {
  const platform = usePlatform();
  return platform.server;
}

/**
 * Get the window events interface (desktop only).
 * Returns undefined on web.
 */
export function useWindowEvents() {
  const platform = usePlatform();
  return platform.windowEvents;
}
