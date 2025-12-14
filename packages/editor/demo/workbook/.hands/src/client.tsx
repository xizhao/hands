// Client entry for RSC hydration
// This handles consuming Flight streams and hydrating client components

import { initClient } from "rwsdk/client";

initClient();

// Export utility for consuming Flight streams from blocks
export async function createBlockFromStream(blockId: string, props: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    searchParams.set(key, String(value));
  }

  const response = await fetch(`/blocks/${blockId}/rsc?${searchParams}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch block: ${response.statusText}`);
  }

  // Return the stream for React to consume
  return response.body;
}
