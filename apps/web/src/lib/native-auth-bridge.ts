/**
 * Native (Capacitor) Google sign-in bridge — one-time code store.
 *
 * The OAuth round-trip runs in the system-browser Custom Tab on our own origin
 * (so Google permits it and the PKCE challenge cookie is local). Once Neon Auth
 * has minted a session there, the /native-auth/bridge page calls
 * {@link mintNativeAuthCode} and hands ONLY the resulting code back to the app
 * via a verified HTTPS App Link — never the session token in a URL. The app then
 * POSTs the code to /api/native-auth/claim, which calls
 * {@link claimNativeAuthCode} to atomically trade it for the session token (for
 * the app's existing Authorization: Bearer path).
 *
 * Security posture: the session token is stored only for the ~60s claim window
 * and the row is DELETED the instant it is claimed (single-use). Backed by the
 * server-only `native_auth_codes` table (see @intake/db/schema) — modelled on
 * the MCP OAuth `mcp_auth_codes` flow.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@intake/db/client";
import { nativeAuthCodes } from "@intake/db/schema";

// The app claims the code immediately on the App Link return, so the window is
// deliberately short to minimise the at-rest exposure of the session token.
export const NATIVE_CODE_TTL_MS = 60_000;

/**
 * Mint a single-use code bound to a Neon session token. The code is a 256-bit
 * URL-safe random string. Opportunistically prunes expired rows so the table
 * stays tiny without a separate cron.
 */
export async function mintNativeAuthCode(input: {
  sessionToken: string;
  userId: string;
}): Promise<string> {
  const now = Date.now();
  const code = randomBytes(32).toString("base64url");

  await db.insert(nativeAuthCodes).values({
    code,
    sessionToken: input.sessionToken,
    userId: input.userId,
    expiresAt: now + NATIVE_CODE_TTL_MS,
    createdAt: now,
  });

  // Best-effort cleanup of already-expired rows; never fail the mint over it.
  try {
    await db.delete(nativeAuthCodes).where(lt(nativeAuthCodes.expiresAt, now));
  } catch {
    // ignore — expiry filtering in claim is the real guard
  }

  return code;
}

/**
 * Atomically claim a code: deletes the row and returns its session token, but
 * only if the code exists and has not expired. Single-use — a replay finds the
 * row already gone and returns null. Returns null for unknown/expired codes.
 */
export async function claimNativeAuthCode(code: string): Promise<string | null> {
  const now = Date.now();
  const deleted = await db
    .delete(nativeAuthCodes)
    .where(and(eq(nativeAuthCodes.code, code), gte(nativeAuthCodes.expiresAt, now)))
    .returning({ sessionToken: nativeAuthCodes.sessionToken });
  return deleted[0]?.sessionToken ?? null;
}
