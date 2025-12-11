'use client';

/**
 * Props Panel - Inline editor for component props
 *
 * Shows a floating panel for editing props of stdlib components.
 * Auto-detects prop types and renders appropriate editors.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import {
  StringPropEditor,
  NumberPropEditor,
  BooleanPropEditor,
  SelectPropEditor,
  ArrayPropEditor,
  ObjectPropEditor,
} from './PropEditors';

interface PropsPanelProps {
  /** Component name for display */
  componentName: string;
  /** Current prop values */
  props: Record<string, unknown>;
  /** Called when props change */
  onPropsChange: (props: Record<string, unknown>) => void;
  /** Called when panel should close */
  onClose: () => void;
  /** Anchor element for positioning (optional) */
  anchorRef?: React.RefObject<HTMLElement>;
  /** Additional class names */
  className?: string;
}

/**
 * Detect the type of a prop value
 */
function detectPropType(
  value: unknown
): 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown' {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Get a friendly label for a prop name
 */
function getPropLabel(key: string): string {
  // Convert camelCase to Title Case with spaces
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export function PropsPanel({
  componentName,
  props,
  onPropsChange,
  onClose,
  anchorRef,
  className,
}: PropsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        (!anchorRef?.current || !anchorRef.current.contains(event.target as Node))
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Update a single prop
  const updateProp = useCallback(
    (key: string, value: unknown) => {
      onPropsChange({ ...props, [key]: value });
    },
    [props, onPropsChange]
  );

  // Remove a prop
  const removeProp = useCallback(
    (key: string) => {
      const newProps = { ...props };
      delete newProps[key];
      onPropsChange(newProps);
    },
    [props, onPropsChange]
  );

  // Get sorted prop entries
  const propEntries = Object.entries(props).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      ref={panelRef}
      className={cn(
        'min-w-[300px] max-w-[400px] p-4 rounded-lg',
        'bg-popover border border-border shadow-lg',
        'z-50',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
        <div>
          <h4 className="text-sm font-medium">{componentName}</h4>
          <p className="text-xs text-muted-foreground">Edit properties</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Props list */}
      <div className="space-y-4">
        {propEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No properties to edit
          </p>
        ) : (
          propEntries.map(([key, value]) => {
            const type = detectPropType(value);
            const label = getPropLabel(key);

            return (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>{label}</span>
                  <span className="text-[10px] opacity-50">{type}</span>
                </label>

                {type === 'string' && (
                  <StringPropEditor
                    value={value as string}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}

                {type === 'number' && (
                  <NumberPropEditor
                    value={value as number}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}

                {type === 'boolean' && (
                  <BooleanPropEditor
                    value={value as boolean}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}

                {type === 'array' && (
                  <ArrayPropEditor
                    value={value as unknown[]}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}

                {type === 'object' && (
                  <ObjectPropEditor
                    value={value as Record<string, unknown>}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}

                {type === 'unknown' && (
                  <StringPropEditor
                    value={String(value ?? '')}
                    onChange={(v) => updateProp(key, v)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="mt-4 pt-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center">
          Changes auto-save
        </p>
      </div>
    </div>
  );
}
