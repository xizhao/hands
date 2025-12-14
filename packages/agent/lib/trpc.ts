/**
 * Shared tRPC client for agent tools
 */
import type { AppRouter } from "@hands/runtime/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

// Default runtime port (matches packages/runtime/src/ports.ts)
const DEFAULT_RUNTIME_PORT = 55000;

export function getRuntimePort(): number {
  const envPort = process.env.HANDS_RUNTIME_PORT;
  if (envPort) {
    return parseInt(envPort, 10);
  }
  return DEFAULT_RUNTIME_PORT;
}

let client: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let currentPort: number | null = null;

export function getTRPCClient() {
  const port = getRuntimePort();

  if (client && currentPort === port) {
    return client;
  }

  client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
      }),
    ],
  });
  currentPort = port;

  return client;
}
