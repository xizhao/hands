/**
 * Theme system for sandbox - mirrors desktop theme definitions
 * Applies CSS variables to match parent app theme
 */

interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

interface Theme {
  isDark: boolean;
  colors: ThemeColors;
}

// Theme definitions - must match desktop/src/lib/theme.ts
const THEMES: Record<string, Theme> = {
  light: {
    isDark: false,
    colors: {
      background: "0 0% 100%",
      foreground: "220 9% 12%",
      card: "0 0% 100%",
      cardForeground: "220 9% 12%",
      popover: "0 0% 100%",
      popoverForeground: "220 9% 12%",
      primary: "220 9% 12%",
      primaryForeground: "0 0% 100%",
      secondary: "220 14% 96%",
      secondaryForeground: "220 9% 12%",
      muted: "220 14% 96%",
      mutedForeground: "220 9% 46%",
      accent: "220 14% 96%",
      accentForeground: "220 9% 12%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "220 13% 91%",
      input: "220 13% 91%",
      ring: "220 9% 12%",
    },
  },
  dark: {
    isDark: true,
    colors: {
      background: "224 10% 10%",
      foreground: "210 20% 98%",
      card: "224 10% 12%",
      cardForeground: "210 20% 98%",
      popover: "224 10% 12%",
      popoverForeground: "210 20% 98%",
      primary: "210 20% 98%",
      primaryForeground: "224 10% 10%",
      secondary: "224 10% 16%",
      secondaryForeground: "210 20% 98%",
      muted: "224 10% 16%",
      mutedForeground: "215 16% 57%",
      accent: "224 10% 18%",
      accentForeground: "210 20% 98%",
      destructive: "0 62% 50%",
      destructiveForeground: "0 0% 100%",
      border: "224 10% 20%",
      input: "224 10% 20%",
      ring: "215 16% 57%",
    },
  },
  "tokyo-night": {
    isDark: true,
    colors: {
      background: "235 21% 13%",
      foreground: "226 64% 88%",
      card: "235 21% 15%",
      cardForeground: "226 64% 88%",
      popover: "235 21% 15%",
      popoverForeground: "226 64% 88%",
      primary: "220 95% 76%",
      primaryForeground: "235 21% 13%",
      secondary: "235 21% 20%",
      secondaryForeground: "226 64% 88%",
      muted: "235 21% 18%",
      mutedForeground: "226 30% 55%",
      accent: "267 84% 81%",
      accentForeground: "235 21% 13%",
      destructive: "0 72% 65%",
      destructiveForeground: "0 0% 100%",
      border: "235 21% 22%",
      input: "235 21% 22%",
      ring: "220 95% 76%",
    },
  },
  catppuccin: {
    isDark: true,
    colors: {
      background: "240 21% 12%",
      foreground: "227 68% 88%",
      card: "240 21% 14%",
      cardForeground: "227 68% 88%",
      popover: "240 21% 14%",
      popoverForeground: "227 68% 88%",
      primary: "267 84% 81%",
      primaryForeground: "240 21% 12%",
      secondary: "240 21% 18%",
      secondaryForeground: "227 68% 88%",
      muted: "240 21% 16%",
      mutedForeground: "228 24% 60%",
      accent: "189 71% 73%",
      accentForeground: "240 21% 12%",
      destructive: "347 87% 68%",
      destructiveForeground: "0 0% 100%",
      border: "240 21% 20%",
      input: "240 21% 20%",
      ring: "267 84% 81%",
    },
  },
  dracula: {
    isDark: true,
    colors: {
      background: "231 15% 18%",
      foreground: "60 30% 96%",
      card: "231 15% 20%",
      cardForeground: "60 30% 96%",
      popover: "231 15% 20%",
      popoverForeground: "60 30% 96%",
      primary: "265 89% 78%",
      primaryForeground: "231 15% 18%",
      secondary: "231 15% 25%",
      secondaryForeground: "60 30% 96%",
      muted: "231 15% 22%",
      mutedForeground: "230 8% 60%",
      accent: "135 94% 65%",
      accentForeground: "231 15% 18%",
      destructive: "0 100% 67%",
      destructiveForeground: "0 0% 100%",
      border: "231 15% 26%",
      input: "231 15% 26%",
      ring: "265 89% 78%",
    },
  },
  nord: {
    isDark: true,
    colors: {
      background: "220 16% 22%",
      foreground: "218 27% 92%",
      card: "220 16% 25%",
      cardForeground: "218 27% 92%",
      popover: "220 16% 25%",
      popoverForeground: "218 27% 92%",
      primary: "213 32% 52%",
      primaryForeground: "0 0% 100%",
      secondary: "220 16% 28%",
      secondaryForeground: "218 27% 92%",
      muted: "220 16% 26%",
      mutedForeground: "219 14% 60%",
      accent: "179 25% 65%",
      accentForeground: "220 16% 22%",
      destructive: "354 42% 56%",
      destructiveForeground: "0 0% 100%",
      border: "220 16% 30%",
      input: "220 16% 30%",
      ring: "213 32% 52%",
    },
  },
  gruvbox: {
    isDark: true,
    colors: {
      background: "0 0% 16%",
      foreground: "40 16% 76%",
      card: "0 0% 18%",
      cardForeground: "40 16% 76%",
      popover: "0 0% 18%",
      popoverForeground: "40 16% 76%",
      primary: "43 59% 52%",
      primaryForeground: "0 0% 16%",
      secondary: "0 0% 22%",
      secondaryForeground: "40 16% 76%",
      muted: "0 0% 20%",
      mutedForeground: "40 8% 55%",
      accent: "104 35% 52%",
      accentForeground: "0 0% 16%",
      destructive: "6 96% 59%",
      destructiveForeground: "0 0% 100%",
      border: "0 0% 24%",
      input: "0 0% 24%",
      ring: "43 59% 52%",
    },
  },
  "one-dark": {
    isDark: true,
    colors: {
      background: "220 13% 18%",
      foreground: "219 14% 76%",
      card: "220 13% 20%",
      cardForeground: "219 14% 76%",
      popover: "220 13% 20%",
      popoverForeground: "219 14% 76%",
      primary: "207 82% 66%",
      primaryForeground: "220 13% 18%",
      secondary: "220 13% 24%",
      secondaryForeground: "219 14% 76%",
      muted: "220 13% 22%",
      mutedForeground: "219 10% 53%",
      accent: "286 60% 67%",
      accentForeground: "220 13% 18%",
      destructive: "355 65% 65%",
      destructiveForeground: "0 0% 100%",
      border: "220 13% 26%",
      input: "220 13% 26%",
      ring: "207 82% 66%",
    },
  },
  "github-dark": {
    isDark: true,
    colors: {
      background: "220 13% 9%",
      foreground: "210 17% 82%",
      card: "220 13% 12%",
      cardForeground: "210 17% 82%",
      popover: "220 13% 12%",
      popoverForeground: "210 17% 82%",
      primary: "212 92% 55%",
      primaryForeground: "0 0% 100%",
      secondary: "220 13% 16%",
      secondaryForeground: "210 17% 82%",
      muted: "220 13% 14%",
      mutedForeground: "210 10% 50%",
      accent: "212 92% 18%",
      accentForeground: "212 92% 75%",
      destructive: "0 72% 51%",
      destructiveForeground: "0 0% 100%",
      border: "220 13% 20%",
      input: "220 13% 20%",
      ring: "212 92% 55%",
    },
  },
  "github-light": {
    isDark: false,
    colors: {
      background: "0 0% 100%",
      foreground: "210 12% 16%",
      card: "210 17% 98%",
      cardForeground: "210 12% 16%",
      popover: "0 0% 100%",
      popoverForeground: "210 12% 16%",
      primary: "212 92% 45%",
      primaryForeground: "0 0% 100%",
      secondary: "210 17% 95%",
      secondaryForeground: "210 12% 16%",
      muted: "210 17% 95%",
      mutedForeground: "210 10% 40%",
      accent: "212 92% 95%",
      accentForeground: "212 92% 35%",
      destructive: "0 72% 51%",
      destructiveForeground: "0 0% 100%",
      border: "210 18% 87%",
      input: "210 18% 87%",
      ring: "212 92% 45%",
    },
  },
};

/**
 * Get system color scheme preference
 */
function getSystemPreference(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

/**
 * Resolve theme name to theme object
 */
function resolveTheme(themeName: string): Theme {
  if (themeName === "system") {
    const systemPref = getSystemPreference();
    return THEMES[systemPref] ?? THEMES.dark;
  }
  if (themeName === "light-mode") {
    return THEMES.light;
  }
  if (themeName === "dark-mode") {
    return THEMES.dark;
  }
  return THEMES[themeName] ?? THEMES.dark;
}

/**
 * Apply theme to document
 */
export function applyTheme(themeName: string) {
  const theme = resolveTheme(themeName);
  const root = document.documentElement;

  if (theme.isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  Object.entries(theme.colors).forEach(([key, value]) => {
    const cssVar = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    root.style.setProperty(`--${cssVar}`, value);
  });
}
