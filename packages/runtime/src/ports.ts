/**
 * Centralized port configuration for Hands services
 *
 * All ports use a 5-digit scheme with configurable prefix.
 * Default prefix is 55xxx.
 *
 * Port layout:
 * - ${PREFIX}000: Runtime API server
 * - ${PREFIX}100: PostgreSQL database
 * - ${PREFIX}200: Worker (Miniflare/Wrangler dev server)
 * - ${PREFIX}300: OpenCode AI server
 */

// Read prefix from environment or use default
const PORT_PREFIX = parseInt(process.env.HANDS_PORT_PREFIX || "55", 10);

/**
 * Get the base port for a service offset
 */
function getPort(offset: number): number {
  return PORT_PREFIX * 1000 + offset;
}

/**
 * Port configuration - all services use these constants
 */
export const PORTS = {
  /** Runtime API server (default: 55000) */
  RUNTIME: getPort(0),

  /** PostgreSQL database (default: 55100) */
  POSTGRES: getPort(100),

  /** Worker/Miniflare dev server (default: 55200) */
  WORKER: getPort(200),

  /** OpenCode AI server (default: 55300) */
  OPENCODE: getPort(300),
} as const;

/**
 * Get the configured port prefix (e.g., 55 for 55xxx ports)
 */
export function getPortPrefix(): number {
  return PORT_PREFIX;
}

/**
 * Get all ports as an object (useful for logging)
 */
export function getAllPorts(): typeof PORTS {
  return PORTS;
}

/**
 * Check if a port is within our configured range
 */
export function isHandsPort(port: number): boolean {
  const base = PORT_PREFIX * 1000;
  return port >= base && port < base + 1000;
}
