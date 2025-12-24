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

  // AWS SES (secrets)
  AWS_SES_ACCESS_KEY: string;
  AWS_SES_SECRET_KEY: string;
  AWS_SES_REGION?: string; // defaults to us-east-1
  EMAIL_FROM?: string; // defaults to hello@hands.app

  // Slack notifications
  SLACK_WEBHOOK_URL?: string;
  SLACK_BOT_TOKEN?: string;

  // Dev bypass (development only)
  DEV_BYPASS_TOKEN?: string;

  // Integration OAuth credentials
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SALESFORCE_CLIENT_ID?: string;
  SALESFORCE_CLIENT_SECRET?: string;
  QUICKBOOKS_CLIENT_ID?: string;
  QUICKBOOKS_CLIENT_SECRET?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
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
