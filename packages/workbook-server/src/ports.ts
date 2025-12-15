/**
 * Centralized port configuration for Hands services
 *
 * All ports use a 5-digit scheme with configurable prefix.
 * Default prefix is 55xxx.
 *
 * Port layout:
 * - ${PREFIX}000: Runtime API server
 * - ${PREFIX}100: PostgreSQL database
 * - ${PREFIX}200: Worker (Vite RSC dev server)
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

  /** Worker/Vite RSC dev server (default: 55200) */
  WORKER: getPort(200),

  /** OpenCode AI server (default: 55300) */
  OPENCODE: getPort(300),

  /** Editor sandbox Vite dev server (default: 55400) */
  EDITOR: getPort(400),
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

/**
 * Check if a port is currently in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require("node:net");
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Kill any process listening on a port (macOS/Linux)
 */
export async function killProcessOnPort(port: number): Promise<void> {
  const { exec } = require("node:child_process");
  return new Promise((resolve) => {
    // Use lsof to find PIDs, then kill them
    // Note: xargs -r doesn't exist on macOS, so we use a shell conditional
    exec(`pids=$(lsof -ti :${port} 2>/dev/null) && [ -n "$pids" ] && kill -9 $pids || true`, () => {
      resolve();
    });
  });
}

/**
 * Wait for a port to become available, killing any existing process if needed
 * @param port The port to wait for
 * @param maxWaitMs Maximum time to wait (default: 5000ms)
 * @param killExisting Whether to kill existing processes on the port (default: true)
 */
export async function waitForPortFree(
  port: number,
  maxWaitMs = 5000,
  killExisting = true,
): Promise<boolean> {
  const startTime = Date.now();

  // First check if port is already free
  if (!(await isPortInUse(port))) {
    return true;
  }

  // Port is in use - try to kill the existing process
  if (killExisting) {
    console.log(`[ports] Port ${port} in use, killing existing process...`);
    await killProcessOnPort(port);
    // Wait a bit for the port to be released
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Poll until port is free or timeout
  while (Date.now() - startTime < maxWaitMs) {
    if (!(await isPortInUse(port))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return false;
}
