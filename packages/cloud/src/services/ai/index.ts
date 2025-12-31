/**
 * AI Service
 *
 * Cloudflare AI Gateway proxy with quota management.
 *
 * The AI gateway is mounted as a Hono sub-app at /ai,
 * not as a tRPC router (streaming requires raw HTTP).
 *
 * Usage:
 *   POST /ai/anthropic/v1/messages
 *   POST /ai/openai/v1/chat/completions
 *
 * Headers:
 *   Authorization: Bearer <jwt>
 *
 * Response headers (when over quota):
 *   X-Usage-Warning: overage
 *   X-Usage-Current: 150000
 *   X-Usage-Included: 100000
 *   X-Usage-Overage-Tokens: 50000
 *   X-Usage-Overage-Cost-Cents: 50
 */

export { buildGatewayUrl, createGatewayHeaders, forwardToGateway, proxyToGateway } from "./client";
export { aiGateway } from "./gateway";
export * from "./types";
