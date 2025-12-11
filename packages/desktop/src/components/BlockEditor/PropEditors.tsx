'use client';

/**
 * Prop Editors - Type-specific input components for editing props
 *
 * Each editor handles a specific JavaScript type with appropriate UI.
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react';

// Common input styles
const inputClassName = cn(
  'w-full px-2 py-1.5 rounded-md text-sm',
  'bg-background border border-input',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'placeholder:text-muted-foreground'
);

/**
 * String prop editor - text input
 */
interface StringPropEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

export function StringPropEditor({
  value,
  onChange,
  placeholder,
  multiline = false,
}: StringPropEditorProps) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cn(inputClassName, 'resize-y min-h-[60px]')}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClassName}
    />
  );
}

/**
 * Number prop editor - number input with stepper
 */
interface NumberPropEditorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberPropEditor({
  value,
  onChange,
  min,
  max,
  step = 1,
}: NumberPropEditorProps) {
  const increment = useCallback(() => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  }, [value, step, max, onChange]);

  const decrement = useCallback(() => {
    const newValue = value - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  }, [value, step, min, onChange]);

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className={cn(inputClassName, 'flex-1')}
      />
      <div className="flex flex-col">
        <button
          onClick={increment}
          className="p-0.5 hover:bg-muted rounded-t border border-input border-b-0"
          type="button"
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={decrement}
          className="p-0.5 hover:bg-muted rounded-b border border-input"
          type="button"
        >
          <Minus className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

/**
 * Boolean prop editor - toggle switch
 */
interface BooleanPropEditorProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}

export function BooleanPropEditor({
  value,
  onChange,
  label,
}: BooleanPropEditorProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          value ? 'bg-primary' : 'bg-input'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

/**
 * Select prop editor - dropdown for enum/union types
 */
interface SelectPropEditorProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}

export function SelectPropEditor({
  value,
  onChange,
  options,
}: SelectPropEditorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClassName, 'appearance-none cursor-pointer')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Array prop editor - list with add/remove
 */
interface ArrayPropEditorProps {
  value: unknown[];
  onChange: (value: unknown[]) => void;
}

export function ArrayPropEditor({ value, onChange }: ArrayPropEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jsonInput, setJsonInput] = useState(JSON.stringify(value, null, 2));
  const [hasError, setHasError] = useState(false);

  const handleJsonChange = useCallback(
    (input: string) => {
      setJsonInput(input);
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          onChange(parsed);
          setHasError(false);
        } else {
          setHasError(true);
        }
      } catch {
        setHasError(true);
      }
    },
    [onChange]
  );

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>Array ({value.length} items)</span>
      </button>

      {isExpanded && (
        <textarea
          value={jsonInput}
          onChange={(e) => handleJsonChange(e.target.value)}
          rows={Math.min(10, Math.max(3, value.length + 2))}
          className={cn(
            inputClassName,
            'font-mono text-xs resize-y',
            hasError && 'border-destructive focus:ring-destructive'
          )}
          spellCheck={false}
        />
      )}

      {hasError && (
        <p className="text-xs text-destructive">Invalid JSON array</p>
      )}
    </div>
  );
}

/**
 * Object prop editor - collapsible JSON editor
 */
interface ObjectPropEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

export function ObjectPropEditor({ value, onChange }: ObjectPropEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jsonInput, setJsonInput] = useState(JSON.stringify(value, null, 2));
  const [hasError, setHasError] = useState(false);

  const handleJsonChange = useCallback(
    (input: string) => {
      setJsonInput(input);
      try {
        const parsed = JSON.parse(input);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          onChange(parsed);
          setHasError(false);
        } else {
          setHasError(true);
        }
      } catch {
        setHasError(true);
      }
    },
    [onChange]
  );

  const keyCount = Object.keys(value).length;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>Object ({keyCount} keys)</span>
      </button>

      {isExpanded && (
        <textarea
          value={jsonInput}
          onChange={(e) => handleJsonChange(e.target.value)}
          rows={Math.min(10, Math.max(3, keyCount + 2))}
          className={cn(
            inputClassName,
            'font-mono text-xs resize-y',
            hasError && 'border-destructive focus:ring-destructive'
          )}
          spellCheck={false}
        />
      )}

      {hasError && (
        <p className="text-xs text-destructive">Invalid JSON object</p>
      )}
    </div>
  );
}

/**
 * Code/Expression prop editor - for dynamic values
 */
interface CodePropEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}

export function CodePropEditor({
  value,
  onChange,
  language = 'javascript',
}: CodePropEditorProps) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={cn(
          inputClassName,
          'font-mono text-xs resize-y',
          'bg-muted/50'
        )}
        spellCheck={false}
      />
      <span className="absolute top-1 right-2 text-[9px] text-muted-foreground uppercase">
        {language}
      </span>
    </div>
  );
}
