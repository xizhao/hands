"use client";

/**
 * LocalState - Page-level ephemeral state for component binding.
 *
 * Provides a React state context that action components can write to
 * and view components can read from, without going through SQL.
 *
 * This is automatically provided at the page level, so users don't
 * need to wrap their content - they just use `name` on inputs and
 * `{{name}}` bindings in other components.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// ============================================================================
// Context Types
// ============================================================================

export interface LocalStateContextValue {
  /** Current state values */
  values: Record<string, unknown>;
  /** Set a value by name */
  setValue: (name: string, value: unknown) => void;
  /** Get a value by name */
  getValue: (name: string) => unknown;
  /** Register a field (for imperative access like LiveAction) */
  registerField: (name: string, getValue: () => unknown) => void;
  /** Unregister a field */
  unregisterField: (name: string) => void;
}

// ============================================================================
// Context
// ============================================================================

export const LocalStateContext = createContext<LocalStateContextValue | null>(null);

/**
 * Hook to access LocalState context.
 * Returns null if not within a LocalStateProvider.
 */
export function useLocalState(): LocalStateContextValue | null {
  return useContext(LocalStateContext);
}

/**
 * Hook to get a specific value from LocalState.
 * Returns undefined if not in context or value not set.
 */
export function useLocalStateValue<T = unknown>(name: string): T | undefined {
  const ctx = useContext(LocalStateContext);
  return ctx?.values[name] as T | undefined;
}

// ============================================================================
// Binding Resolution
// ============================================================================

/**
 * Resolve {{name}} bindings in a string using LocalState values.
 * Returns the resolved string, or the original if no bindings found.
 */
export function resolveBindings(
  template: string | undefined,
  values: Record<string, unknown>,
): string | undefined {
  if (!template) return template;
  if (!template.includes("{{")) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = values[name];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * Resolve a value that may be a binding string or a direct value.
 * If it's a string with {{name}}, resolves from LocalState.
 * Otherwise returns the value as-is.
 */
export function resolveValue<T>(
  value: T | string | undefined,
  values: Record<string, unknown>,
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;

  // Check if it's a simple binding like "{{year}}"
  const bindingMatch = value.match(/^\{\{(\w+)\}\}$/);
  if (bindingMatch) {
    return values[bindingMatch[1]] as T | undefined;
  }

  // If it contains bindings but isn't a simple one, resolve as string
  if (value.includes("{{")) {
    return resolveBindings(value, values) as T | undefined;
  }

  return value as T | undefined;
}

/**
 * Hook to resolve a value that may contain {{bindings}}.
 */
export function useResolvedValue<T>(value: T | string | undefined): T | undefined {
  const ctx = useContext(LocalStateContext);
  const values = ctx?.values ?? {};
  return useMemo(() => resolveValue(value, values), [value, values]);
}

// ============================================================================
// Provider Component
// ============================================================================

export interface LocalStateProviderProps {
  /** Initial state values */
  defaults?: Record<string, unknown>;
  /** Children */
  children: React.ReactNode;
}

/**
 * Provides page-level ephemeral state for component binding.
 *
 * Action components (Select, Input, etc.) write to this state via their `name` prop.
 * View components can read via {{name}} bindings.
 *
 * This is automatically wrapped around MDX page content.
 */
export function LocalStateProvider({ defaults, children }: LocalStateProviderProps) {
  const [values, setValues] = useState<Record<string, unknown>>(defaults ?? {});
  const fieldsRef = useRef<Map<string, () => unknown>>(new Map());

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const getValue = useCallback(
    (name: string) => {
      return values[name];
    },
    [values],
  );

  const registerField = useCallback((name: string, getValueFn: () => unknown) => {
    fieldsRef.current.set(name, getValueFn);
  }, []);

  const unregisterField = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const contextValue = useMemo<LocalStateContextValue>(
    () => ({
      values,
      setValue,
      getValue,
      registerField,
      unregisterField,
    }),
    [values, setValue, getValue, registerField, unregisterField],
  );

  return <LocalStateContext.Provider value={contextValue}>{children}</LocalStateContext.Provider>;
}
