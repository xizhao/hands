export interface UsageEnv {
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  AI_GATEWAY_ID?: string;
}

export interface UsageSummary {
  billingPeriod: string;
  tokens: {
    used: number;
    limit: number;
    percentage: number;
  };
  requests: number;
  cost: {
    cents: number;
    dollars: string;
  };
  plan: string;
}

export interface DailyUsage {
  date: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  requests: number;
  costCents: number;
}

export interface MonthlyUsage {
  period: string;
  tokens: number;
  requests: number;
  costDollars: string;
}

export interface AIGatewayLogEntry {
  metadata?: {
    userId?: string;
    workbookId?: string;
  };
  model?: string;
  provider?: string;
  request_tokens?: number;
  response_tokens?: number;
  timestamp?: string;
  success?: boolean;
}
