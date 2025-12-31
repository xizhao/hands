/**
 * Integrations Service
 *
 * OAuth broker for third-party data connectors.
 *
 * Supported providers:
 *   - Google (Drive, Sheets, Gmail, Calendar)
 *   - GitHub (repos, issues)
 *   - Slack (channels, messages)
 *   - Salesforce (CRM data)
 *   - QuickBooks (accounting)
 *   - Shopify (e-commerce)
 *
 * Usage:
 *   cloud.integrations.providers()
 *   cloud.integrations.connections()
 *   cloud.integrations.connect({ provider: "google" })
 *   cloud.integrations.completeConnect({ provider, code, state })
 *   cloud.integrations.disconnect({ id })
 *   cloud.integrations.getToken({ provider: "google" })
 */

export { exchangeCode, getAccountInfo, getClientId, getClientSecret, refreshToken } from "./client";
export { getProviderConfig, OAUTH_PROVIDERS } from "./providers";
export { integrationsRouter } from "./router";
export * from "./types";
