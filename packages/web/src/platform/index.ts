/**
 * Platform Adapters
 *
 * Cloud: Uses api.hands.app backend
 * Local: Fully in-browser with BYOK
 *
 * NOTE: API key storage is handled by @hands/agent/browser
 * Use getStoredConfig/setStoredConfig from there for API keys
 *
 * NOTE: Page storage is handled by SQLite via @hands/agent/browser/pages-storage
 * Pages are stored in the _pages internal table.
 */

export { createCloudPlatformAdapter, handleOAuthCallback } from "./CloudAdapter";
export { createLocalPlatformAdapter } from "./LocalAdapter";
