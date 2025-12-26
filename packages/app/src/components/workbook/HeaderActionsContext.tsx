/**
 * HeaderActionsContext - Allows routes to inject actions into the content header
 *
 * Routes can use <HeaderActions> to render their own header controls
 * (like Preview for pages, or nothing for tables).
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

  return (
    <HeaderActionsContext.Provider value={{ portalTarget, setPortalTarget }}>
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
