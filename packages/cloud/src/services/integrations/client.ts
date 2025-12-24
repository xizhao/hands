import type { IntegrationsEnv, TokenResponse, UserInfo, OAuthProviderType } from "./types";
import { OAUTH_PROVIDERS } from "./providers";

/**
 * Get client ID for a provider from environment
 */
export function getClientId(provider: string, env: IntegrationsEnv): string {
  const envRecord = env as unknown as Record<string, string>;
  const key = `${provider.toUpperCase()}_CLIENT_ID`;
  return envRecord[key] ?? "";
}

/**
 * Get client secret for a provider from environment
 */
export function getClientSecret(provider: string, env: IntegrationsEnv): string {
  const envRecord = env as unknown as Record<string, string>;
  const key = `${provider.toUpperCase()}_CLIENT_SECRET`;
  return envRecord[key] ?? "";
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(
  provider: OAuthProviderType,
  code: string,
  redirectUri: string,
  env: IntegrationsEnv,
  shopDomain?: string
): Promise<TokenResponse> {
  const providerConfig = OAUTH_PROVIDERS[provider];
  let tokenUrl = providerConfig.tokenUrl;

  if (provider === "shopify" && shopDomain) {
    tokenUrl = tokenUrl.replace("{shop}", shopDomain);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: getClientId(provider, env),
      client_secret: getClientSecret(provider, env),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Refresh an access token
 */
export async function refreshToken(
  provider: OAuthProviderType,
  refreshTokenValue: string,
  env: IntegrationsEnv
): Promise<TokenResponse> {
  const providerConfig = OAUTH_PROVIDERS[provider];

  const response = await fetch(providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: getClientId(provider, env),
      client_secret: getClientSecret(provider, env),
      refresh_token: refreshTokenValue,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Get account info from provider
 */
export async function getAccountInfo(
  provider: OAuthProviderType,
  accessToken: string
): Promise<UserInfo> {
  switch (provider) {
    case "google": {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Google user info failed: ${res.status}`);
      const data = (await res.json()) as { sub: string; email: string };
      return { id: data.sub, email: data.email };
    }

    case "github": {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error(`GitHub user info failed: ${res.status}`);
      const data = (await res.json()) as { id: number; email: string | null };

      let email = data.email;
      if (!email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean }>;
          email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;
        }
      }
      if (!email) throw new Error("GitHub user has no accessible email");
      return { id: String(data.id), email };
    }

    case "slack": {
      const res = await fetch("https://slack.com/api/users.identity", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Slack user info failed: ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        user?: { id: string; email: string };
        error?: string;
      };
      if (!data.ok || !data.user) throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
      return { id: data.user.id, email: data.user.email };
    }

    case "salesforce": {
      const res = await fetch("https://login.salesforce.com/services/oauth2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Salesforce user info failed: ${res.status}`);
      const data = (await res.json()) as { user_id: string; email: string };
      return { id: data.user_id, email: data.email };
    }

    case "quickbooks": {
      const res = await fetch("https://accounts.platform.intuit.com/v1/openid_connect/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`QuickBooks user info failed: ${res.status}`);
      const data = (await res.json()) as { sub: string; email: string };
      return { id: data.sub, email: data.email };
    }

    case "shopify": {
      // Shopify tokens are shop-scoped
      return { id: "shop", email: "shop@shopify.com" };
    }

    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}
