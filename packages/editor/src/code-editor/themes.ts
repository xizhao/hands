/**
 * Monaco Editor Themes
 *
 * Dynamic theme that reads from Tailwind CSS variables to match the app's design system.
 * Uses a single theme that gets re-defined when the app theme changes.
 */

import type { Monaco } from "@monaco-editor/react";

/**
 * Convert HSL string to hex color.
 * Handles formats like "0 0% 100%" or "222.2 84% 4.9%"
 */
function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return "#888888";

  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Get a CSS variable value and convert to hex.
 */
function getCssVar(name: string): string {
  if (typeof window === "undefined") return "#888888";

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!value) return "#888888";
  return hslToHex(value);
}

/**
 * Check if we're currently in dark mode by checking the luminance of --background
 */
function detectDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  const bg = getCssVar("--background");
  // Parse hex and check luminance
  const r = parseInt(bg.slice(1, 3), 16) / 255;
  const g = parseInt(bg.slice(3, 5), 16) / 255;
  const b = parseInt(bg.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.5;
}

/**
 * Define the Monaco editor theme using current CSS variables.
 * Call this when the app theme changes.
 */
export function defineEditorThemes(monaco: Monaco) {
  const isDark = detectDarkMode();

  // Read current CSS variable values
  const colors = {
    background: getCssVar("--background"),
    foreground: getCssVar("--foreground"),
    card: getCssVar("--card"),
    cardForeground: getCssVar("--card-foreground"),
    primary: getCssVar("--primary"),
    primaryForeground: getCssVar("--primary-foreground"),
    secondary: getCssVar("--secondary"),
    secondaryForeground: getCssVar("--secondary-foreground"),
    muted: getCssVar("--muted"),
    mutedForeground: getCssVar("--muted-foreground"),
    accent: getCssVar("--accent"),
    accentForeground: getCssVar("--accent-foreground"),
    border: getCssVar("--border"),
    destructive: getCssVar("--destructive"),
    success: getCssVar("--success"),
    warning: getCssVar("--warning"),
    info: getCssVar("--info"),
  };

  // Syntax highlighting colors - semantic colors from theme
  const syntax = {
    string: colors.success,
    number: colors.warning,
    keyword: colors.info,
    comment: colors.mutedForeground,
    tag: colors.info,
    attribute: colors.primary,
    variable: colors.destructive,
  };

  // Define the theme
  monaco.editor.defineTheme("hands", {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      // Markdown
      { token: "heading", foreground: colors.foreground.slice(1), fontStyle: "bold" },
      { token: "strong", fontStyle: "bold" },
      { token: "emphasis", fontStyle: "italic" },
      // JSX/MDX components
      { token: "tag", foreground: syntax.tag.slice(1) },
      { token: "tag.component", foreground: syntax.keyword.slice(1) },
      { token: "delimiter.tag", foreground: colors.mutedForeground.slice(1) },
      { token: "attribute.name", foreground: syntax.attribute.slice(1) },
      { token: "attribute.value", foreground: syntax.string.slice(1) },
      // Code
      { token: "string", foreground: syntax.string.slice(1) },
      { token: "number", foreground: syntax.number.slice(1) },
      { token: "comment", foreground: syntax.comment.slice(1), fontStyle: "italic" },
      { token: "variable", foreground: syntax.variable.slice(1) },
      { token: "keyword", foreground: syntax.keyword.slice(1) },
      { token: "type", foreground: syntax.tag.slice(1) },
      // Frontmatter
      { token: "meta.separator", foreground: colors.mutedForeground.slice(1) },
    ],
    colors: {
      // Editor chrome
      "editor.background": colors.background,
      "editor.foreground": colors.foreground,
      "editorCursor.foreground": colors.foreground,

      // Line highlight
      "editor.lineHighlightBackground": colors.muted,
      "editor.lineHighlightBorder": "#00000000",

      // Selection
      "editor.selectionBackground": colors.accent,
      "editor.inactiveSelectionBackground": colors.secondary,
      "editor.selectionHighlightBackground": colors.accent + "40",

      // Line numbers
      "editorLineNumber.foreground": colors.mutedForeground,
      "editorLineNumber.activeForeground": colors.foreground,

      // Indent guides
      "editorIndentGuide.background": colors.border,
      "editorIndentGuide.activeBackground": colors.mutedForeground,

      // Whitespace
      "editorWhitespace.foreground": colors.border,

      // Scrollbar
      "scrollbarSlider.background": colors.muted,
      "scrollbarSlider.hoverBackground": colors.accent,
      "scrollbarSlider.activeBackground": colors.accent,

      // Overview ruler (right edge)
      "editorOverviewRuler.border": "#00000000",

      // Bracket matching
      "editorBracketMatch.background": colors.accent,
      "editorBracketMatch.border": colors.mutedForeground,

      // Find/replace
      "editor.findMatchBackground": colors.warning + "40",
      "editor.findMatchHighlightBackground": colors.warning + "20",

      // Errors/warnings (for diagnostics)
      "editorError.foreground": colors.destructive,
      "editorWarning.foreground": colors.warning,
      "editorInfo.foreground": colors.info,
    },
  });
}

/**
 * Re-define themes when CSS variables change (e.g., theme toggle).
 */
export function updateEditorThemes(monaco: Monaco) {
  defineEditorThemes(monaco);
}

/**
 * Get the theme name - always "hands" now since we use a single dynamic theme.
 */
export function getThemeName(
  _theme: "light" | "dark" | "auto",
  _isDarkMode: boolean
): string {
  return "hands";
}
