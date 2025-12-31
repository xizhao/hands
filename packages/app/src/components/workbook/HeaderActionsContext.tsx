/**
 * HeaderActionsContext - Allows routes to inject actions into the content header
 *
 * Routes can use <HeaderActions> to render their own header controls
 * (like Preview for pages, or nothing for tables).
 *
 * Also provides SpecBarSlot/SpecBarPortal for domain pages to show
 * the spec input connected to the page tab.
 */

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useCallback,
} from "react";
import { createPortal } from "react-dom";

// ============================================================================
// Context
// ============================================================================

interface HeaderActionsContextValue {
  portalTarget: HTMLDivElement | null;
  setPortalTarget: (target: HTMLDivElement | null) => void;
  specBarTarget: HTMLDivElement | null;
  setSpecBarTarget: (target: HTMLDivElement | null) => void;
  syncStatusTarget: HTMLSpanElement | null;
  setSyncStatusTarget: (target: HTMLSpanElement | null) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(
  null
);

// ============================================================================
// Provider
// ============================================================================

interface HeaderActionsProviderProps {
  children: ReactNode;
}

export function HeaderActionsProvider({ children }: HeaderActionsProviderProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [specBarTarget, setSpecBarTarget] = useState<HTMLDivElement | null>(null);
  const [syncStatusTarget, setSyncStatusTarget] = useState<HTMLSpanElement | null>(null);

  return (
    <HeaderActionsContext.Provider value={{
      portalTarget, setPortalTarget,
      specBarTarget, setSpecBarTarget,
      syncStatusTarget, setSyncStatusTarget
    }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

// ============================================================================
// Slot (rendered in ContentHeader)
// ============================================================================

export function HeaderActionsSlot() {
  const context = useContext(HeaderActionsContext);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      context?.setPortalTarget(node);
    },
    [context]
  );

  return <div ref={ref} className="flex items-center gap-2" />;
}

// ============================================================================
// Portal (used by routes to inject actions)
// ============================================================================

interface HeaderActionsProps {
  children: ReactNode;
}

export function HeaderActions({ children }: HeaderActionsProps) {
  const context = useContext(HeaderActionsContext);

  if (!context?.portalTarget) {
    return null;
  }

  return createPortal(children, context.portalTarget);
}

// ============================================================================
// SpecBar Slot (rendered in ContentHeader, below page tab)
// ============================================================================

export function SpecBarSlot() {
  const context = useContext(HeaderActionsContext);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      context?.setSpecBarTarget(node);
    },
    [context]
  );

  // Container that will hold the portaled SpecBar content
  return <div ref={ref} />;
}

// ============================================================================
// SpecBar Portal (used by PageEditor to inject spec bar into header)
// ============================================================================

interface SpecBarPortalProps {
  children: ReactNode;
}

export function SpecBarPortal({ children }: SpecBarPortalProps) {
  const context = useContext(HeaderActionsContext);

  if (!context?.specBarTarget) {
    return null;
  }

  return createPortal(children, context.specBarTarget);
}

// ============================================================================
// Sync Status Slot (rendered in page tab, next to title)
// ============================================================================

export function SyncStatusSlot() {
  const context = useContext(HeaderActionsContext);

  const ref = useCallback(
    (node: HTMLSpanElement | null) => {
      context?.setSyncStatusTarget(node);
    },
    [context]
  );

  return <span ref={ref} className="inline-flex items-center" />;
}

// ============================================================================
// Sync Status Portal (used by PageEditor to show sync status in tab)
// ============================================================================

interface SyncStatusPortalProps {
  children: ReactNode;
}

export function SyncStatusPortal({ children }: SyncStatusPortalProps) {
  const context = useContext(HeaderActionsContext);

  if (!context?.syncStatusTarget) {
    return null;
  }

  return createPortal(children, context.syncStatusTarget);
}
