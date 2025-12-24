/**
 * Cloud Platform Adapter
 *
 * Platform adapter for web deployment using @hands/cloud backend.
 * Provides authentication, workbook management via cloud APIs.
 */

import type {
  PlatformAdapter,
  Workbook,
  RuntimeConnection,
  RuntimeStatus,
  User,
} from "@hands/app/platform";
import {
  getStoredToken,
  setStoredToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearAuthTokens,
} from "../lib/cloud-trpc";

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface CloudAdapterOptions {
  apiUrl: string;
}

// Storage for code verifier during OAuth flow
const CODE_VERIFIER_KEY = "hands_code_verifier";

/**
 * Create a Cloud Platform Adapter for web deployment
 */
export function createCloudPlatformAdapter(
  options: CloudAdapterOptions,
): PlatformAdapter {
  const { apiUrl } = options;

  /**
   * Fetch with authorization header
   */
  const fetchWithAuth = async (
    path: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = getStoredToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    };

    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers,
    });

    // Handle token refresh if needed
    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Retry with new token
        const newToken = getStoredToken();
        return fetch(`${apiUrl}${path}`, {
          ...init,
          headers: {
            ...headers,
            Authorization: `Bearer ${newToken}`,
          },
        });
      }
    }

    return response;
  };

  /**
   * Try to refresh the access token
   */
  const tryRefreshToken = async (): Promise<boolean> => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${apiUrl}/trpc/auth.refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearAuthTokens();
        return false;
      }

      const data = await res.json();
      setStoredToken(data.result.data.accessToken);
      return true;
    } catch {
      clearAuthTokens();
      return false;
    }
  };

  /**
   * tRPC-style call helper
   */
  const trpcCall = async <T>(
    procedure: string,
    input?: unknown,
    method: "query" | "mutation" = "query",
  ): Promise<T> => {
    const path =
      method === "query"
        ? `/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`
        : `/trpc/${procedure}`;

    const res = await fetchWithAuth(path, {
      method: method === "query" ? "GET" : "POST",
      ...(method === "mutation" && input
        ? { body: JSON.stringify(input) }
        : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }

    const json = await res.json();
    return json.result?.data as T;
  };

  return {
    auth: {
      getUser: async (): Promise<User | null> => {
        const token = getStoredToken();
        if (!token) return null;

        try {
          const user = await trpcCall<User>("auth.me");
          return user;
        } catch {
          return null;
        }
      },

      startOAuth: async (provider: string): Promise<void> => {
        if (provider !== "google") {
          throw new Error(`Provider ${provider} not supported`);
        }

        // Generate PKCE code verifier and challenge
        const codeVerifier = await generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store verifier for later
        localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

        // Get redirect URI (current page or callback page)
        const redirectUri = `${window.location.origin}/auth/callback`;

        // Start OAuth flow
        const result = await trpcCall<{ authUrl: string; state: string }>(
          "auth.startOAuth",
          { codeChallenge, redirectUri },
          "mutation",
        );

        // Store state for verification
        localStorage.setItem("hands_oauth_state", result.state);

        // Redirect to Google
        window.location.href = result.authUrl;
      },

      logout: async (): Promise<void> => {
        const refreshToken = getStoredRefreshToken();
        try {
          await trpcCall("auth.logout", { refreshToken }, "mutation");
        } catch {
          // Ignore errors, clear tokens anyway
        }
        clearAuthTokens();
        localStorage.removeItem(CODE_VERIFIER_KEY);
        localStorage.removeItem("hands_oauth_state");
      },

      getToken: () => getStoredToken(),
    },

    workbook: {
      list: async (): Promise<Workbook[]> => {
        // TODO: Implement cloud workbooks endpoint
        // For now, return empty array (workbooks stored in cloud)
        try {
          return await trpcCall<Workbook[]>("workbooks.list");
        } catch {
          // Endpoint may not exist yet
          console.warn("workbooks.list not implemented on cloud");
          return [];
        }
      },

      create: async (name: string, template?: string): Promise<Workbook> => {
        // TODO: Implement cloud workbooks endpoint
        try {
          return await trpcCall<Workbook>(
            "workbooks.create",
            { name, template },
            "mutation",
          );
        } catch (e) {
          console.warn("workbooks.create not implemented on cloud");
          // Return a temporary local workbook
          const id = `wb_${Date.now().toString(36)}`;
          return {
            id,
            name,
            created_at: Date.now(),
            updated_at: Date.now(),
            last_opened_at: Date.now(),
          };
        }
      },

      open: async (workbook: Workbook): Promise<RuntimeConnection> => {
        // TODO: Implement cloud runtime endpoint
        try {
          const result = await trpcCall<{ tRpcUrl: string }>(
            "runtime.start",
            { workbookId: workbook.id },
            "mutation",
          );
          return {
            workbookId: workbook.id,
            port: 0, // Cloud uses URL, not port
            tRpcUrl: result.tRpcUrl,
            status: "running",
          };
        } catch {
          console.warn("runtime.start not implemented on cloud");
          // Return a placeholder connection
          return {
            workbookId: workbook.id,
            port: 0,
            tRpcUrl: "",
            status: "error",
          };
        }
      },

      delete: async (id: string): Promise<void> => {
        // TODO: Implement cloud workbooks endpoint
        try {
          await trpcCall("workbooks.delete", { id }, "mutation");
        } catch {
          console.warn("workbooks.delete not implemented on cloud");
        }
      },
    },

    runtime: {
      getStatus: async (): Promise<RuntimeStatus | null> => {
        // TODO: Implement cloud runtime endpoint
        try {
          return await trpcCall<RuntimeStatus | null>("runtime.status");
        } catch {
          console.warn("runtime.status not implemented on cloud");
          return null;
        }
      },

      stop: async (workbookId: string): Promise<void> => {
        // TODO: Implement cloud runtime endpoint
        try {
          await trpcCall("runtime.stop", { workbookId }, "mutation");
        } catch {
          console.warn("runtime.stop not implemented on cloud");
        }
      },

      eval: async (workbookId: string): Promise<unknown> => {
        // TODO: Implement cloud runtime endpoint
        try {
          return await trpcCall("runtime.eval", { workbookId }, "mutation");
        } catch {
          console.warn("runtime.eval not implemented on cloud");
          return null;
        }
      },
    },

    // Storage using localStorage on web
    storage: {
      get: async <T>(key: string): Promise<T | null> => {
        const value = localStorage.getItem(`hands_${key}`);
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      },

      set: async <T>(key: string, value: T): Promise<void> => {
        localStorage.setItem(`hands_${key}`, JSON.stringify(value));
      },

      delete: async (key: string): Promise<void> => {
        localStorage.removeItem(`hands_${key}`);
      },
    },

    // No local file system on web
    fs: undefined,

    // No native window management on web
    window: undefined,

    // No window events on web (could add resize listener if needed)
    windowEvents: undefined,

    // No server management on web
    server: undefined,

    ai: {
      // AI requests go through cloud AI gateway
      getOpenCodeUrl: () => `${apiUrl}/ai`,
    },

    platform: "web",
    capabilities: {
      localFiles: false,
      nativeMenus: false,
      offlineSupport: false,
      cloudSync: true,
      authentication: true,
    },
  };
}

/**
 * Handle OAuth callback
 * Call this from the /auth/callback page
 */
export async function handleOAuthCallback(
  apiUrl: string,
  code: string,
  state: string,
): Promise<User> {
  const codeVerifier = localStorage.getItem(CODE_VERIFIER_KEY);
  const storedState = localStorage.getItem("hands_oauth_state");

  if (!codeVerifier) {
    throw new Error("Missing code verifier");
  }

  if (state !== storedState) {
    throw new Error("State mismatch");
  }

  // Exchange code for tokens
  const res = await fetch(`${apiUrl}/trpc/auth.exchangeCode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state, codeVerifier }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const json = await res.json();
  const data = json.result?.data;

  // Store tokens
  setStoredToken(data.accessToken);
  setStoredRefreshToken(data.refreshToken);

  // Clean up
  localStorage.removeItem(CODE_VERIFIER_KEY);
  localStorage.removeItem("hands_oauth_state");

  return data.user;
}
