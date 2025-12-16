/**
 * RSC Directive Validation (CLI version)
 *
 * Validates that blocks have "use server" and UI components have "use client".
 */

export interface RSCValidationResult {
  valid: boolean;
  errors: RSCValidationError[];
  warnings: RSCValidationWarning[];
}

export interface RSCValidationError {
  file: string;
  type: "missing-use-server" | "missing-use-client" | "client-code-in-server";
  message: string;
  line?: number;
}

export interface RSCValidationWarning {
  file: string;
  type: "client-pattern-detected";
  message: string;
  pattern: string;
  line: number;
}

// Client-side patterns that indicate code should be in /ui
const CLIENT_PATTERNS = [
  { pattern: /\buseState\s*[(<]/, name: "useState" },
  { pattern: /\buseEffect\s*\(/, name: "useEffect" },
  { pattern: /\buseCallback\s*\(/, name: "useCallback" },
  { pattern: /\buseMemo\s*\(/, name: "useMemo" },
  { pattern: /\buseRef\s*[(<]/, name: "useRef" },
  { pattern: /\buseReducer\s*[(<]/, name: "useReducer" },
  { pattern: /\buseContext\s*\(/, name: "useContext" },
  { pattern: /\bonClick\s*=/, name: "onClick" },
  { pattern: /\bonChange\s*=/, name: "onChange" },
  { pattern: /\bonSubmit\s*=/, name: "onSubmit" },
  { pattern: /\bonKeyDown\s*=/, name: "onKeyDown" },
  { pattern: /\bonKeyUp\s*=/, name: "onKeyUp" },
  { pattern: /\bonFocus\s*=/, name: "onFocus" },
  { pattern: /\bonBlur\s*=/, name: "onBlur" },
  { pattern: /\baddEventListener\s*\(/, name: "addEventListener" },
  { pattern: /\bdocument\./, name: "document" },
  { pattern: /\bwindow\./, name: "window" },
];

/**
 * Check if content has "use server" directive at the top
 */
export function hasUseServerDirective(content: string): boolean {
  return /^(?:\s*\/\/[^\n]*\n)*\s*["']use server["'];?\s*$/m.test(content.slice(0, 500));
}

/**
 * Check if content has "use client" directive at the top
 */
export function hasUseClientDirective(content: string): boolean {
  return /^(?:\s*\/\/[^\n]*\n)*\s*["']use client["'];?\s*$/m.test(content.slice(0, 500));
}

/**
 * Detect client-side patterns in code
 */
export function detectClientPatterns(content: string): { pattern: string; line: number }[] {
  const lines = content.split("\n");
  const detected: { pattern: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("import ")) continue;

    for (const { pattern, name } of CLIENT_PATTERNS) {
      if (pattern.test(line)) {
        detected.push({ pattern: name, line: i + 1 });
      }
    }
  }
  return detected;
}

/**
 * Validate a block file has "use server" and no client patterns
 */
export function validateBlock(filePath: string, content: string): RSCValidationResult {
  const errors: RSCValidationError[] = [];
  const warnings: RSCValidationWarning[] = [];

  if (!hasUseServerDirective(content)) {
    errors.push({
      file: filePath,
      type: "missing-use-server",
      message: 'Block must have "use server" directive at the top',
    });
  }

  if (hasUseClientDirective(content)) {
    errors.push({
      file: filePath,
      type: "client-code-in-server",
      message: 'Blocks cannot have "use client" - move client code to /ui',
    });
  }

  const clientPatterns = detectClientPatterns(content);
  for (const { pattern, line } of clientPatterns) {
    warnings.push({
      file: filePath,
      type: "client-pattern-detected",
      message: `Found "${pattern}" - this requires "use client", consider moving to /ui`,
      pattern,
      line,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a UI component has "use client"
 */
export function validateUIComponent(filePath: string, content: string): RSCValidationResult {
  const errors: RSCValidationError[] = [];
  const warnings: RSCValidationWarning[] = [];

  if (!hasUseClientDirective(content)) {
    errors.push({
      file: filePath,
      type: "missing-use-client",
      message: 'UI component should have "use client" directive at the top',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
