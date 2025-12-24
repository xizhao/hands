import type { OAuthProviderConfig, OAuthProviderType } from "./types";

export const OAUTH_PROVIDERS: Record<OAuthProviderType, OAuthProviderConfig> = {
  google: {
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  },
  github: {
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email", "repo"],
    userInfoUrl: "https://api.github.com/user",
  },
  slack: {
    name: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "chat:write", "users:read"],
  },
  salesforce: {
    name: "Salesforce",
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token"],
    userInfoUrl: "https://login.salesforce.com/services/oauth2/userinfo",
  },
  quickbooks: {
    name: "QuickBooks",
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"],
    userInfoUrl: "https://accounts.platform.intuit.com/v1/openid_connect/userinfo",
  },
  shopify: {
    name: "Shopify",
    authUrl: "https://{shop}/admin/oauth/authorize",
    tokenUrl: "https://{shop}/admin/oauth/access_token",
    scopes: ["read_products", "read_orders", "read_customers"],
  },
};

export function getProviderConfig(provider: OAuthProviderType): OAuthProviderConfig {
  return OAUTH_PROVIDERS[provider];
}
