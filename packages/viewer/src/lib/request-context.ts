/**
 * Request-scoped context for viewer
 * Stores data that needs to be shared across modules during a single request
 */

interface ViewerEnv {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ASSETS: Fetcher;
}

interface NavPage {
  id: string;
  path: string;
  title: string;
}

// Module-level storage for request context
let currentEnv: ViewerEnv | null = null;
let currentNavPages: NavPage[] = [];
let currentWorkbookTitle: string = "";

export function setEnv(env: ViewerEnv | null) {
  currentEnv = env;
}

export function getEnv(): ViewerEnv {
  if (!currentEnv) {
    throw new Error("Env not available - request not in progress");
  }
  return currentEnv;
}

export function setNavPages(pages: NavPage[]) {
  currentNavPages = pages;
}

export function getNavPages(): NavPage[] {
  return currentNavPages;
}

export function setWorkbookTitle(title: string) {
  currentWorkbookTitle = title;
}

export function getWorkbookTitle(): string {
  return currentWorkbookTitle;
}

export function clearContext() {
  currentEnv = null;
  currentNavPages = [];
  currentWorkbookTitle = "";
}
