/**
 * Component Metadata for Validation
 *
 * Defines structural rules for stdlib components that
 * are collected by the doc generator and used for linting.
 */

/**
 * Structural constraints for a component.
 */
export interface ComponentConstraints {
  /** Component must be inside one of these parent components */
  requireParent?: string[];
  /** Component must contain at least one of these child components */
  requireChild?: string[];
  /** Component cannot be inside these parent components */
  forbidParent?: string[];
  /** Component cannot contain these child components */
  forbidChild?: string[];
}

/**
 * Property validation rules.
 */
export interface PropRule {
  /** Allowed values for enum-like props */
  enum?: readonly string[];
  /** Prop is required */
  required?: boolean;
  /** Prop type hint for validation */
  type?: "string" | "number" | "boolean" | "array" | "object" | "sql";
}

/**
 * Component metadata for validation and documentation.
 * Co-located with each component and collected by doc generator.
 */
export interface ComponentMeta {
  /** Component category */
  category: "view" | "action" | "data";
  /** Required props */
  requiredProps?: string[];
  /** Prop validation rules */
  propRules?: Record<string, PropRule>;
  /** Structural constraints */
  constraints?: ComponentConstraints;
}

/**
 * Generated schema for all components - output of doc generator.
 */
export type ComponentSchema = Record<string, ComponentMeta>;
