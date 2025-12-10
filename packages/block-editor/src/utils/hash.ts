/**
 * Hashing utilities
 */

import { createHash } from "crypto"

/**
 * Hash a string with MD5
 */
export function hashString(str: string): string {
  return createHash("md5").update(str).digest("hex")
}

/**
 * Hash an object by JSON stringifying
 */
export function hashObject(obj: unknown): string {
  return hashString(JSON.stringify(obj))
}
