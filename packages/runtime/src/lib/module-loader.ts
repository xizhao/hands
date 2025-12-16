/**
 * Shared utilities for loading modules with retry logic
 * Used by both blocks and pages renderers
 */

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

/**
 * Check if error is a Vite pre-bundle invalidation (retryable)
 */
export function isPreBundleError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes("new version of the pre-bundle");
  }
  return false;
}

/**
 * Sleep for given ms
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load a module with retry logic for Vite pre-bundle invalidation
 */
export async function loadModuleWithRetry<T>(
  loader: () => Promise<T>,
  moduleName: string,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (isPreBundleError(err) && retries > 0) {
      console.log(
        `[worker] Pre-bundle invalidated for ${moduleName}, retrying... (${retries} left)`
      );
      await sleep(RETRY_DELAY_MS);
      return loadModuleWithRetry(loader, moduleName, retries - 1);
    }
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[worker] Failed to load ${moduleName}:`, error);
    throw error;
  }
}

/**
 * Create a registry map from glob results
 */
export function createRegistry<T>(
  globResults: Record<string, () => Promise<T>>,
  pattern: RegExp
): Map<string, () => Promise<T>> {
  const registry = new Map<string, () => Promise<T>>();

  for (const [path, loader] of Object.entries(globResults)) {
    const match = path.match(pattern);
    if (match && match[1] && loader) {
      registry.set(match[1], loader);
    }
  }

  return registry;
}
