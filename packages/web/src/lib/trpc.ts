/**
 * tRPC Client for Web
 *
 * This provides the same tRPC interface as the desktop app
 * but routes calls through our local tRPC provider.
 */

import { createTRPCReact } from "@trpc/react-query";

// Create a local tRPC client without workbook-server types
// Our local router implements the same API shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc = createTRPCReact<any>();
