/**
 * Standard Prompts - Centralized prompt templates for common actions
 *
 * These prompts are:
 * 1. Used when triggering actions programmatically
 * 2. Matched in the UI to display friendly action chips instead of raw text
 */

import { Bug, Database, FileText, type LucideIcon, Upload, Wand2 } from "lucide-react";

// Template literal type for prompts with variables
type PromptTemplate<T extends string = string> = T & { __brand: "PromptTemplate" };

// Create a template from a string
function template<T extends string>(str: T): PromptTemplate<T> {
  return str as PromptTemplate<T>;
}

// Standard prompt definitions
// NOTE: Template curly syntax is intentional - these are string patterns for matching
export const PROMPTS = {
  // File import - matches the first line of the import prompt
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional template pattern
  IMPORT_FILE: template("Import and integrate this data file: ${filePath}"),

  // Block error fix - has variable
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional template pattern
  FIX_BLOCK_ERROR: template('Fix the error in block "${blockId}": ${errorContext}'),

  // Page context
  ANALYZE_PAGE: template("Analyze this page and suggest improvements"),

  // Data operations
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional template pattern
  QUERY_DATA: template("Query this data: ${query}"),

  // General
  EXPLAIN: template("Explain this"),
} as const;

// Metadata for each prompt - icon, label, description
export type PromptKey = keyof typeof PROMPTS;

interface PromptMeta {
  icon: LucideIcon;
  label: string;
  description?: string;
  color?: string; // Tailwind color class
}

export const PROMPT_META: Record<PromptKey, PromptMeta> = {
  IMPORT_FILE: {
    icon: Upload,
    label: "Import data",
    description: "Importing and processing file",
    color: "text-blue-500",
  },
  FIX_BLOCK_ERROR: {
    icon: Bug,
    label: "Fix error",
    description: "Debugging block error",
    color: "text-red-500",
  },
  ANALYZE_PAGE: {
    icon: FileText,
    label: "Analyze page",
    description: "Analyzing page content",
    color: "text-purple-500",
  },
  QUERY_DATA: {
    icon: Database,
    label: "Query data",
    description: "Running data query",
    color: "text-green-500",
  },
  EXPLAIN: {
    icon: Wand2,
    label: "Explain",
    description: "Explaining content",
    color: "text-amber-500",
  },
};

// Escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert template to regex pattern
function templateToRegex(template: string): RegExp {
  // Escape the template, then convert ${...} placeholders to capture groups
  const escaped = escapeRegex(template);
  const pattern = escaped.replace(/\\\$\\\{(\w+)\\\}/g, "(.+)");
  return new RegExp(`^${pattern}$`);
}

// Extract variable names from template
function getTemplateVars(template: string): string[] {
  const matches = template.matchAll(/\$\{(\w+)\}/g);
  return Array.from(matches, (m) => m[1]);
}

// Match result with extracted variables
export interface PromptMatch {
  key: PromptKey;
  meta: PromptMeta;
  variables: Record<string, string>;
}

// Try to match a message against all standard prompts
export function matchPrompt(message: string): PromptMatch | null {
  for (const [key, template] of Object.entries(PROMPTS)) {
    const regex = templateToRegex(template);
    const match = message.match(regex);

    if (match) {
      const varNames = getTemplateVars(template);
      const variables: Record<string, string> = {};

      varNames.forEach((name, idx) => {
        variables[name] = match[idx + 1] || "";
      });

      return {
        key: key as PromptKey,
        meta: PROMPT_META[key as PromptKey],
        variables,
      };
    }
  }

  return null;
}

// Fill a template with variables
export function fillTemplate<K extends PromptKey>(
  key: K,
  variables?: Record<string, string>,
): string {
  let result: string = PROMPTS[key];

  if (variables) {
    for (const [name, value] of Object.entries(variables)) {
      result = result.replace(`\${${name}}`, value);
    }
  }

  return result;
}

// Helper to check if a message is a standard prompt
export function isStandardPrompt(message: string): boolean {
  return matchPrompt(message) !== null;
}
