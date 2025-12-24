export interface AIEnv {
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  AUTH_SECRET: string;
  APP_URL: string;
}

export interface AIGatewayMetadata {
  userId: string;
  email?: string;
  workbookId?: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  currentTokens: number;
  includedTokens: number;
  plan: string;
  isOverage: boolean;
  overageTokens?: number;
  overageCostCents?: number;
}

export type AIProvider = "anthropic" | "openai" | "google" | "workers-ai";

export interface AIRequestOptions {
  provider: AIProvider;
  endpoint: string;
  body: unknown;
  metadata?: AIGatewayMetadata;
}
