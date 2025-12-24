/**
 * Cloud tRPC Client
 *
 * Creates a type-safe tRPC client that connects to the @hands/cloud backend.
 */

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@hands/cloud/trpc";

// Create the tRPC React hooks
export const cloud = createTRPCReact<AppRouter>();

/**
 * Create a tRPC client for the cloud API
 */
export function createCloudTrpcClient(
  apiUrl: string,
  getToken: () => string | null,
) {
  return cloud.createClient({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        headers: () => {
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

/**
 * Storage keys for auth tokens
 */
export const AUTH_TOKEN_KEY = "hands_access_token";
export const REFRESH_TOKEN_KEY = "hands_refresh_token";

/**
 * Get the stored access token
 */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Set the access token
 */
export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

/**
 * Get the stored refresh token
 */
export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Set the refresh token
 */
export function setStoredRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

/**
 * Clear all auth tokens
 */
export function clearAuthTokens(): void {
  setStoredToken(null);
  setStoredRefreshToken(null);
}
