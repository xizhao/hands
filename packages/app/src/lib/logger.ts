/**
 * Simple logger with log levels
 *
 * Set LOG_LEVEL env var or localStorage to control verbosity:
 * - "debug": all logs
 * - "info": info, warn, error (default in dev)
 * - "warn": warn, error only
 * - "error": errors only
 * - "silent": no logs (default in prod)
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getLogLevel(): LogLevel {
  // Check localStorage first (allows runtime override)
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("LOG_LEVEL") as LogLevel | null;
    if (stored && stored in LEVELS) return stored;
  }
  // Default: warn (use localStorage.setItem("LOG_LEVEL", "debug") for verbose)
  return "warn";
}

let currentLevel = getLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (shouldLog("debug")) console.log(`[${tag}]`, ...args);
  },
  info: (tag: string, ...args: unknown[]) => {
    if (shouldLog("info")) console.log(`[${tag}]`, ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(`[${tag}]`, ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    if (shouldLog("error")) console.error(`[${tag}]`, ...args);
  },
  setLevel: (level: LogLevel) => {
    currentLevel = level;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("LOG_LEVEL", level);
    }
  },
  getLevel: () => currentLevel,
};

export type { LogLevel };
