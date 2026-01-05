/**
 * Platform Adapters
 *
 * Cloud: Uses api.hands.app backend
 * Local: Fully in-browser with BYOK
 *
 * NOTE: API key storage is handled by @hands/agent/browser
 * Use getStoredConfig/setStoredConfig from there for API keys
 */

export { createCloudPlatformAdapter, handleOAuthCallback } from "./CloudAdapter";
export {
  createLocalPlatformAdapter,
  listPages,
  getPage,
  savePage,
  deletePage,
} from "./LocalAdapter";
