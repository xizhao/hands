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

export { integrationsRouter } from "./router";
export { OAUTH_PROVIDERS, getProviderConfig } from "./providers";
export { getClientId, getClientSecret, exchangeCode, refreshToken, getAccountInfo } from "./client";
export * from "./types";
