/**
 * Theme Provider and Hook
 *
 * Shared theming system for all packages.
 * Uses the theme definitions from theme.ts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getTheme,
  getThemeList,
  initTheme,
  setTheme as setThemeImpl,
  THEMES,
  type Theme,
} from "./theme";

// ============================================================================
// Types
// ============================================================================

type ThemeMode = "light" | "dark" | "system" | string;

interface ThemeContextValue {
  /** Current theme mode (light, dark, system, or named theme) */
  mode: ThemeMode;
  /** Resolved theme object with colors */
  theme: Theme;
  /** Whether current resolved theme is dark */
  isDark: boolean;
  /** Set theme mode */
  setTheme: (mode: ThemeMode) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** List of all available themes */
  themes: ReturnType<typeof getThemeList>;
}

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ThemeProviderProps {
  children: ReactNode;
  /** Default theme mode if none stored */
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = "light" }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Get stored theme or use default
    const stored = getTheme();
    return stored === "system" && defaultMode !== "system" ? defaultMode : stored;
  });

  // Resolve theme from mode
  const theme = useMemo(() => {
    if (mode === "system") {
      const systemPref =
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      return THEMES[systemPref] ?? THEMES.light;
    }
    if (mode === "light-mode" || mode === "light") {
      return THEMES.light;
    }
    if (mode === "dark-mode" || mode === "dark") {
      return THEMES.dark;
    }
    return THEMES[mode] ?? THEMES.light;
  }, [mode]);

  const isDark = theme.isDark;

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  // Apply theme when mode changes
  useEffect(() => {
    setThemeImpl(mode);
  }, [mode]);

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Force re-render to pick up new system preference
      setThemeImpl("system");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mode]);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((current) => {
      if (current === "dark" || (current === "system" && isDark)) {
        return "light";
      }
      return "dark";
    });
  }, [isDark]);

  const themes = useMemo(() => getThemeList(), []);

  const value = useMemo(
    () => ({ mode, theme, isDark, setTheme, toggleTheme, themes }),
    [mode, theme, isDark, setTheme, toggleTheme, themes]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Safe version that returns defaults if not in provider
 * (useful for components that may render outside provider)
 */
export function useThemeSafe(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      mode: "light",
      theme: THEMES.light,
      isDark: false,
      setTheme: () => {},
      toggleTheme: () => {},
      themes: [],
    };
  }
  return context;
}
