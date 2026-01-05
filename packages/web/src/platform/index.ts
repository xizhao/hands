/**
 * Platform Adapters
 *
 * Cloud: Uses api.hands.app backend
 * Local: Fully in-browser with BYOK
 */

export { createCloudPlatformAdapter, handleOAuthCallback } from "./CloudAdapter";
export {
  createLocalPlatformAdapter,
  getApiKey,
  setApiKey,
  listPages,
  getPage,
  savePage,
  deletePage,
} from "./LocalAdapter";
