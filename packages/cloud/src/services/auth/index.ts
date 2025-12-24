/**
 * Auth Service
 *
 * Google OAuth + JWT + PKCE authentication.
 *
 * Usage:
 *   cloud.auth.startOAuth({ codeChallenge, redirectUri })
 *   cloud.auth.exchangeCode({ code, state, codeVerifier })
 *   cloud.auth.refresh({ refreshToken })
 *   cloud.auth.me()
 *   cloud.auth.logout()
 *   cloud.auth.sessions()
 */

export { authRouter } from "./router";
export {
  signToken,
  verifyToken,
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
} from "./client";
export * from "./types";
