/**
 * Token helpers for the MCP OAuth flow.
 *
 * Tokens (auth codes, access tokens, refresh tokens, client secrets) are
 * opaque random strings. We persist only SHA-256 hashes — the plaintext
 * lives in the response body to the OAuth client and in subsequent
 * Authorization headers, never on disk.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOpaqueToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time hash comparison. Both inputs must be hex strings of the
 * same length (sha256 → 64 hex chars).
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * PKCE S256 verifier check.
 * code_challenge = base64url(sha256(code_verifier))
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const bufComputed = Buffer.from(computed);
  const bufChallenge = Buffer.from(challenge);
  if (bufComputed.length !== bufChallenge.length) return false;
  return timingSafeEqual(bufComputed, bufChallenge);
}

export const TOKEN_PREFIX = {
  ACCESS: "mcp_at",
  REFRESH: "mcp_rt",
  AUTH_CODE: "mcp_ac",
  CLIENT_ID: "mcp_client",
  CLIENT_SECRET: "mcp_secret",
} as const;

// TTLs in milliseconds.
export const TOKEN_TTL = {
  AUTH_CODE_MS: 10 * 60_000,
  ACCESS_TOKEN_MS: 15 * 60_000,
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60_000,
} as const;
