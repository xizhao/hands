import type { AIEnv, AIGatewayMetadata, AIRequestOptions } from "./types";

/**
 * Build CF AI Gateway URL
 * Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}/{endpoint}
 */
export function buildGatewayUrl(
  env: AIEnv,
  provider: string,
  endpoint: string
): string {
  return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${provider}/${endpoint}`;
}

/**
 * Create request headers with AI Gateway metadata
 */
export function createGatewayHeaders(
  originalHeaders: Headers,
  metadata: AIGatewayMetadata
): Headers {
  const headers = new Headers(originalHeaders);
  headers.set("cf-aig-metadata", JSON.stringify(metadata));
  return headers;
}

/**
 * Forward request to AI Gateway
 */
export async function forwardToGateway(
  env: AIEnv,
  options: AIRequestOptions,
  originalHeaders: Headers
): Promise<Response> {
  const url = buildGatewayUrl(env, options.provider, options.endpoint);

  const headers = createGatewayHeaders(
    originalHeaders,
    options.metadata ?? { userId: "anonymous" }
  );

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body),
  });

  return response;
}

/**
 * Stream-aware proxy for AI Gateway
 */
export async function proxyToGateway(
  env: AIEnv,
  request: Request,
  path: string,
  metadata: AIGatewayMetadata
): Promise<Response> {
  // Remove /ai prefix from path
  const cleanPath = path.startsWith("/ai") ? path.slice(3) : path;

  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}${cleanPath}`;

  const headers = new Headers(request.headers);
  headers.set("cf-aig-metadata", JSON.stringify(metadata));

  const response = await fetch(gatewayUrl, {
    method: request.method,
    headers,
    body: request.method !== "GET" ? request.body : undefined,
  } as RequestInit);

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
