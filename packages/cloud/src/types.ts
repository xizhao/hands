import type { Hyperdrive, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  // Hyperdrive Postgres binding
  DB: Hyperdrive;

  // KV namespaces
  AUTH_STATE: KVNamespace; // OAuth state storage (replaces in-memory Map)
  RATE_LIMIT: KVNamespace; // Rate limiting counters

  // AI binding (for Workers AI, but we use AI Gateway directly)
  AI: unknown;

  // App URLs
  APP_URL: string;
  API_URL: string;

  // AI Gateway config
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;

  // Auth (secrets)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_SECRET: string;

  // Encryption (secrets)
  ENCRYPTION_KEY: string; // For OAuth token encryption

  // Stripe (secrets)
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // CF Account ID (for API calls)
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

// Auth state stored in KV
export interface AuthState {
  codeChallenge: string;
  redirectUri: string;
  createdAt: number;
}

// Rate limit entry in KV
export interface RateLimitEntry {
  count: number;
  resetAt: number;
}
