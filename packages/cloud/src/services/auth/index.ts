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

export {
  exchangeGoogleCode,
  generateCodeChallenge,
  generateCodeVerifier,
  getGoogleAuthUrl,
  getGoogleUserInfo,
  signToken,
  verifyCodeChallenge,
  verifyToken,
} from "./client";
export { authRouter } from "./router";
export * from "./types";
