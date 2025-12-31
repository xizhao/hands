"use client";

/**
 * @component LiveAction
 * @category action
 * @description Container that wraps form controls and executes SQL mutations on submit.
 * Children can use {{fieldName}} bindings in the SQL that get replaced with form values.
 * @keywords form, action, mutation, sql, update, insert, delete, submit
 * @example
 * <LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
 *   <Select name="status" options={[{value: "done", label: "Done"}]} />
 *   <Button>Update</Button>
 * </LiveAction>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { createContext, memo, useCallback, useContext, useMemo, useRef, useState } from "react";

import {
  type ComponentMeta,
  LIVE_ACTION_KEY,
  type LiveActionContextValue,
  type TLiveActionElement,
} from "../../types";
import { extractTableName, LiveControlsMenu, LiveQueryEditor } from "../livecontrol";
import { useLiveMutation } from "../query-provider";

// ============================================================================
// Context
// ============================================================================

export const LiveActionContext = createContext<LiveActionContextValue | null>(null);

/**
 * Hook to access the parent LiveAction context.
 * Must be used within a LiveAction element.
 */
export function useLiveAction(): LiveActionContextValue {
  const ctx = useContext(LiveActionContext);
  if (!ctx) {
    throw new Error("useLiveAction must be used within a LiveAction element");
  }
  return ctx;
}

/**
 * Hook to optionally access LiveAction context.
 * Returns null if not within a LiveAction.
 */
export function useLiveActionOptional(): LiveActionContextValue | null {
  return useContext(LiveActionContext);
}

// ============================================================================
// Form Binding Substitution
// ============================================================================

/**
 * Substitute {{field}} bindings in SQL with form values.
 * Values are properly escaped for SQL.
 */
export function substituteFormBindings(sql: string, formValues: Record<string, unknown>): string {
  return sql.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    if (!(field in formValues)) {
      console.warn(`[LiveAction] Form field {{${field}}} not found`);
      return "NULL";
    }

    const value = formValues[field];

    // SQL value formatting
    if (value === null || value === undefined || value === "") return "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number") return String(value);

    // String: escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  });
}

// ============================================================================
// Component Props
// ============================================================================

export interface LiveActionProps {
  /** SQL statement with {{field}} bindings */
  sql?: string;
  /** Execute the SQL mutation */
  onExecute: (sql: string, params?: unknown[]) => Promise<void>;
  /** Children containing form controls */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone LiveAction component for use outside Plate editor.
 */
export function LiveAction({ sql, onExecute, children, className }: LiveActionProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fieldsRef = useRef<Map<string, () => unknown>>(new Map());

  const registerField = useCallback((name: string, getValue: () => unknown) => {
    fieldsRef.current.set(name, getValue);
  }, []);

  const unregisterField = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const getAllFormValues = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const [name, getValue] of fieldsRef.current) {
      values[name] = getValue();
    }
    return values;
  }, []);

  const trigger = useCallback(async () => {
    if (!sql) {
      console.error("No SQL configured for this action");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const formValues = getAllFormValues();
      const substitutedSql = substituteFormBindings(sql, formValues);
      await onExecute(substitutedSql);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsPending(false);
    }
  }, [sql, onExecute, getAllFormValues]);

  const contextValue = useMemo<LiveActionContextValue>(
    () => ({ trigger, isPending, error, registerField, unregisterField }),
    [trigger, isPending, error, registerField, unregisterField],
  );

  // Invisible container - no added styling/padding
  return <LiveActionContext.Provider value={contextValue}>{children}</LiveActionContext.Provider>;
}

// ============================================================================
// Plate Plugin
// ============================================================================

/**
 * LiveAction Plate element component.
 * Uses LiveQueryProvider for mutation execution.
 * Shows LiveControlsMenu on hover with action info and controls.
 */
function LiveActionElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement<TLiveActionElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();
  const [editorOpen, setEditorOpen] = useState(false);
  const fieldsRef = useRef<Map<string, () => unknown>>(new Map());

  const { sql } = element;
  const tableName = sql ? extractTableName(sql, "action") : null;

  // Get mutation function from provider
  const { mutate, isPending, error } = useLiveMutation();

  const registerField = useCallback((name: string, getValue: () => unknown) => {
    fieldsRef.current.set(name, getValue);
  }, []);

  const unregisterField = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const getAllFormValues = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const [name, getValue] of fieldsRef.current) {
      values[name] = getValue();
    }
    return values;
  }, []);

  const trigger = useCallback(async () => {
    if (!sql) {
      console.error("No SQL configured for this action");
      return;
    }

    const formValues = getAllFormValues();
    const substitutedSql = substituteFormBindings(sql, formValues);
    await mutate(substitutedSql);
  }, [sql, getAllFormValues, mutate]);

  const contextValue = useMemo<LiveActionContextValue>(
    () => ({ trigger, isPending, error, registerField, unregisterField }),
    [trigger, isPending, error, registerField, unregisterField],
  );

  const handleEdit = () => {
    setEditorOpen(true);
  };

  const handleApplySql = useCallback(
    (newSql: string) => {
      try {
        const path = editor.api.findPath(element);
        if (path) {
          editor.tf.setNodes({ sql: newSql } as Partial<TLiveActionElement>, { at: path });
        }
      } catch (e) {
        console.error("Failed to update action SQL:", e);
      }
    },
    [editor, element],
  );

  return (
    <PlateElement {...props}>
      <LiveActionContext.Provider value={contextValue}>
        <LiveControlsMenu
          type="action"
          sql={sql}
          tableName={tableName ?? undefined}
          onEdit={handleEdit}
          inline
          selected={selected}
          readOnly={readOnly}
        >
          {props.children}
        </LiveControlsMenu>

        <LiveQueryEditor
          initialQuery={sql ?? ""}
          type="action"
          onApply={handleApplySql}
          onCancel={() => {}}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      </LiveActionContext.Provider>
    </PlateElement>
  );
}

/**
 * LiveAction Plugin - container for form controls that execute SQL mutations.
 */
export const LiveActionPlugin = createPlatePlugin({
  key: LIVE_ACTION_KEY,
  node: {
    isElement: true,
    isVoid: false,
    isContainer: true,
    component: memo(LiveActionElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a LiveAction element for insertion into editor.
 */
export function createLiveActionElement(
  sql: string,
  options?: {
    src?: string;
    params?: Record<string, unknown>;
  },
): TLiveActionElement {
  return {
    type: LIVE_ACTION_KEY,
    sql,
    src: options?.src,
    params: options?.params,
    children: [{ text: "" }],
  };
}

export { LIVE_ACTION_KEY };

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const LiveActionMeta: ComponentMeta = {
  category: "action",
  requiredProps: [],
  propRules: {
    sql: { type: "sql" },
  },
  constraints: {
    requireChild: ["Button"],
  },
};
