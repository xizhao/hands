export interface IntegrationsEnv {
  ENCRYPTION_KEY: string;
  API_URL: string;
  // Provider credentials (dynamic based on provider)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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

export type OAuthProviderType =
  | "google"
  | "github"
  | "slack"
  | "salesforce"
  | "quickbooks"
  | "shopify";

export interface OAuthProviderConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  userInfoUrl?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface UserInfo {
  id: string;
  email: string;
}

export interface OAuthConnection {
  id: string;
  provider: string;
  providerName: string;
  accountEmail: string | null;
  scopes: string[];
  connectedAt: Date;
}
