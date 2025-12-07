import { createSignal, createMemo, type Accessor } from "solid-js"
import { createSimpleContext } from "./helper.js"

// Claude Code inspired theme - clean, professional, high contrast
export const HANDS_THEME = {
  // Brand colors
  primary: "#4da7ff",      // Bright cyan-blue (like claude code)
  secondary: "#c084fc",    // Purple accent
  accent: "#fdb714",       // Yellow/gold

  // Status colors
  success: "#2ed573",
  warning: "#ffa502",
  error: "#ff4757",
  info: "#4da7ff",

  // Text colors
  text: "#f0f0f0",
  textMuted: "#8892b0",
  textSubtle: "#5c6370",

  // Background colors
  background: "#0a0e27",           // Very dark blue
  backgroundPanel: "#151a30",      // Slightly lighter
  backgroundElement: "#1e2545",    // Element backgrounds
  backgroundMenu: "#151a30",
  backgroundHover: "#252d4a",

  // Border colors
  border: "#2a3458",
  borderActive: "#4da7ff",
  borderSubtle: "#1e2545",

  // Diff colors
  diffAdded: "#2ed573",
  diffRemoved: "#ff4757",
  diffContext: "#5c6370",
  diffHunkHeader: "#4da7ff",

  // Selection
  selectedListItemText: "#0a0e27",
  selectedListItemBg: "#4da7ff",

  // Markdown
  markdownText: "#f0f0f0",
  markdownHeading: "#4da7ff",
  markdownLink: "#c084fc",
  markdownCode: "#e2e8f0",
  markdownCodeBg: "#151a30",

  // Syntax highlighting
  syntaxComment: "#5c6370",
  syntaxKeyword: "#c084fc",
  syntaxFunction: "#4da7ff",
  syntaxVariable: "#f0f0f0",
  syntaxString: "#2ed573",
  syntaxNumber: "#fdb714",
  syntaxOperator: "#8892b0",
  syntaxType: "#ff6b9d",

  // Agent colors
  agent: "#4da7ff",
  user: "#c084fc",
}

export const HANDS_THEME_LIGHT = {
  ...HANDS_THEME,
  text: "#1a1a2e",
  textMuted: "#4a5568",
  textSubtle: "#718096",
  background: "#f7fafc",
  backgroundPanel: "#edf2f7",
  backgroundElement: "#e2e8f0",
  backgroundMenu: "#edf2f7",
  backgroundHover: "#e2e8f0",
  border: "#cbd5e0",
  borderSubtle: "#e2e8f0",
  selectedListItemText: "#f7fafc",
  markdownText: "#1a1a2e",
  markdownCode: "#2d3748",
  markdownCodeBg: "#edf2f7",
  syntaxVariable: "#1a1a2e",
}

export type ThemeColors = typeof HANDS_THEME

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { mode?: "dark" | "light" }) => {
    const [mode, setMode] = createSignal<"dark" | "light">(props.mode || "dark")

    const theme = createMemo(() => {
      return mode() === "dark" ? HANDS_THEME : HANDS_THEME_LIGHT
    })

    return {
      get theme() {
        return theme()
      },
      mode: mode as Accessor<"dark" | "light">,
      setMode,
    }
  },
})
