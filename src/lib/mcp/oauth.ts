/**
 * OAuth 2.1 + DCR primitives for the MCP custom connector.
 *
 * Implements the slices of RFC 6749 / RFC 7591 / RFC 7636 needed by
 * claude.ai's connector UI. Identity is delegated to Neon Auth — this
 * module mints and validates tokens scoped to a userId that the
 * authorize-endpoint has already verified via session cookie.
 */
import { eq, and, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import {
  mcpAccessTokens,
  mcpAuthCodes,
  mcpOauthClients,
} from "@/db/schema";
import {
  generateOpaqueToken,
  hashToken,
  hashesEqual,
  TOKEN_PREFIX,
  TOKEN_TTL,
  verifyPkceS256,
} from "@/lib/mcp/tokens";

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  scope: string | null;
  createdAt: number;
}

export interface RegisterInput {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  scope?: string | undefined;
}

/**
 * Allow only redirect URIs that claude.ai is known to use, or localhost for
 * local development / debugging. Tightens DCR against a malicious actor
 * harvesting auth codes by registering their own redirect URI.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    const isLoopback =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "[::1]";

    if (isLoopback) {
      // Local dev only — http or https both fine on loopback.
      return u.protocol === "http:" || u.protocol === "https:";
    }

    // Public hosts require https. Anything else (http, ftp, etc.) is rejected.
    if (u.protocol !== "https:") return false;

    if (u.hostname === "claude.ai") return true;
    if (u.hostname.endsWith(".claude.ai")) return true;
    if (u.hostname === "anthropic.com") return true;
    if (u.hostname.endsWith(".anthropic.com")) return true;
    return false;
  } catch {
    return false;
  }
}

export async function registerClient(
  input: RegisterInput,
): Promise<RegisteredClient> {
  for (const uri of input.redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new Error(`redirect_uri not allowed: ${uri}`);
    }
  }

  const clientId = generateOpaqueToken(TOKEN_PREFIX.CLIENT_ID, 16);
  const isConfidential = input.tokenEndpointAuthMethod !== "none";
  const clientSecret = isConfidential
    ? generateOpaqueToken(TOKEN_PREFIX.CLIENT_SECRET, 32)
    : undefined;

  const now = Date.now();
  await db.insert(mcpOauthClients).values({
    clientId,
    clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    scope: input.scope ?? null,
    createdAt: now,
  });

  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    scope: input.scope ?? null,
    createdAt: now,
  };
}

export async function getClient(clientId: string) {
  const rows = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

export async function verifyClientCredentials(
  clientId: string,
  clientSecret: string | undefined,
): Promise<{ valid: boolean; client: typeof mcpOauthClients.$inferSelect | null }> {
  const client = await getClient(clientId);
  if (!client) return { valid: false, client: null };

  if (client.tokenEndpointAuthMethod === "none") {
    return { valid: true, client };
  }
  if (!clientSecret || !client.clientSecretHash) {
    return { valid: false, client };
  }
  const provided = hashToken(clientSecret);
  return {
    valid: hashesEqual(provided, client.clientSecretHash),
    client,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Authorization codes
// ─────────────────────────────────────────────────────────────────────────

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  // Issuance is locked to S256. The authorize route's Zod schema enforces
  // z.literal("S256"), and the OAuth metadata advertises
  // code_challenge_methods_supported: ["S256"], so "plain" can never reach
  // this code path. The DB column's CHECK still allows both values for
  // backwards compatibility with any historical row.
  codeChallengeMethod: "S256";
  scope: string;
}

export async function issueAuthCode(input: IssueCodeInput): Promise<string> {
  const code = generateOpaqueToken(TOKEN_PREFIX.AUTH_CODE, 24);
  const now = Date.now();
  await db.insert(mcpAuthCodes).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    expiresAt: now + TOKEN_TTL.AUTH_CODE_MS,
    createdAt: now,
  });
  return code;
}

export interface ConsumeCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export async function consumeAuthCode(input: ConsumeCodeInput): Promise<
  | { ok: true; userId: string; scope: string }
  | { ok: false; reason: string }
> {
  const now = Date.now();

  // Atomic guard — the row is only marked consumed if EVERY one of these
  // matches: code present, not yet consumed, correct client, correct
  // redirect_uri, not expired. This means a malformed exchange attempt
  // (wrong client or expired) does NOT burn the code, so the legitimate
  // client can still complete the flow if it retries with correct values.
  // PKCE verification still happens AFTER the consume — if it fails the
  // code is already burned, which is correct: a PKCE mismatch means an
  // attacker likely intercepted the code, so we don't want a retry path.
  const consumed = await db
    .update(mcpAuthCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(mcpAuthCodes.code, input.code),
        isNull(mcpAuthCodes.consumedAt),
        eq(mcpAuthCodes.clientId, input.clientId),
        eq(mcpAuthCodes.redirectUri, input.redirectUri),
        gte(mcpAuthCodes.expiresAt, now),
      ),
    )
    .returning();

  if (consumed.length === 0) {
    return {
      ok: false,
      reason: "code not found, already consumed, expired, or client/redirect mismatch",
    };
  }

  const row = consumed[0]!;

  if (row.codeChallengeMethod === "S256") {
    if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) {
      return { ok: false, reason: "PKCE verifier mismatch" };
    }
  } else {
    // RFC 7636 allows "plain" only when explicitly registered. We accept it
    // for compatibility but strongly prefer S256.
    if (input.codeVerifier !== row.codeChallenge) {
      return { ok: false, reason: "PKCE verifier mismatch" };
    }
  }

  return { ok: true, userId: row.userId, scope: row.scope };
}

// ─────────────────────────────────────────────────────────────────────────
// Access + refresh tokens
// ─────────────────────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export async function issueAccessToken(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const accessToken = generateOpaqueToken(TOKEN_PREFIX.ACCESS, 32);
  const refreshToken = generateOpaqueToken(TOKEN_PREFIX.REFRESH, 32);
  const now = Date.now();
  await db.insert(mcpAccessTokens).values({
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    expiresAt: now + TOKEN_TTL.ACCESS_TOKEN_MS,
    refreshExpiresAt: now + TOKEN_TTL.REFRESH_TOKEN_MS,
    createdAt: now,
  });
  // Best-effort last-used touch on the client; ignore failures.
  void db
    .update(mcpOauthClients)
    .set({ lastUsedAt: now })
    .where(eq(mcpOauthClients.clientId, input.clientId))
    .catch(() => {});
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: Math.floor(TOKEN_TTL.ACCESS_TOKEN_MS / 1000),
  };
}

export async function rotateRefreshToken(
  refreshTokenPlain: string,
  clientId: string,
): Promise<
  { ok: true; tokens: IssuedTokens; userId: string; scope: string }
  | { ok: false; reason: string }
> {
  const refreshHash = hashToken(refreshTokenPlain);
  const now = Date.now();

  // Refresh token is stable for the full refreshExpiresAt window — we issue
  // a fresh access token and swap it into the existing row in place. The
  // returned refresh_token is identical to what the caller sent.
  //
  // Why no rotation: strict single-use refresh-token rotation locked the
  // single legitimate client out whenever its parallel/retried refresh
  // request raced or a response was lost mid-flight. For a single-user PWA
  // (see CLAUDE.md), the marginal forensic benefit of refresh-token
  // rotation does not justify forcing daily re-auth.
  //
  // All validation predicates (client_id, revokedAt, refresh_expires_at)
  // are in the WHERE clause so a wrong client or expired token simply
  // leaves the existing row untouched.
  //
  // Residual race: under truly concurrent refresh, both callers UPDATE
  // the same row and last-writer-wins on `tokenHash`. The "loser" caller
  // walks away with an access token whose hash is no longer in the DB,
  // so its next API call gets 401 and the client refreshes again. This
  // self-heals at the cost of one extra round trip and never locks the
  // user out (which is what the previous single-use rotation did). The
  // structurally clean fix — separate access-token rows per refresh —
  // requires dropping the UNIQUE constraint on refresh_token_hash; we
  // defer that until contention is observed in practice.
  try {
    const accessToken = generateOpaqueToken(TOKEN_PREFIX.ACCESS, 32);
    const updated = await db
      .update(mcpAccessTokens)
      .set({
        tokenHash: hashToken(accessToken),
        expiresAt: now + TOKEN_TTL.ACCESS_TOKEN_MS,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(mcpAccessTokens.refreshTokenHash, refreshHash),
          eq(mcpAccessTokens.clientId, clientId),
          isNull(mcpAccessTokens.revokedAt),
          gte(mcpAccessTokens.refreshExpiresAt, now),
        ),
      )
      .returning();

    if (updated.length === 0) {
      return {
        ok: false,
        reason:
          "refresh token not found, revoked, expired, or client mismatch",
      };
    }
    const row = updated[0]!;

    // Best-effort last-used touch on the client; ignore failures.
    void db
      .update(mcpOauthClients)
      .set({ lastUsedAt: now })
      .where(eq(mcpOauthClients.clientId, clientId))
      .catch(() => {});

    return {
      ok: true,
      tokens: {
        accessToken,
        refreshToken: refreshTokenPlain,
        accessExpiresIn: Math.floor(TOKEN_TTL.ACCESS_TOKEN_MS / 1000),
      },
      userId: row.userId,
      scope: row.scope,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "refresh failed",
    };
  }
}

export async function lookupAccessToken(accessTokenPlain: string): Promise<
  | { userId: string; clientId: string; scope: string; expiresAt: number }
  | null
> {
  const hash = hashToken(accessTokenPlain);
  const rows = await db
    .select({
      userId: mcpAccessTokens.userId,
      clientId: mcpAccessTokens.clientId,
      scope: mcpAccessTokens.scope,
      expiresAt: mcpAccessTokens.expiresAt,
      revokedAt: mcpAccessTokens.revokedAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt < Date.now()) return null;
  // Best-effort last-used touch; ignore failures.
  void db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(mcpAccessTokens.tokenHash, hash))
    .catch(() => {});
  return {
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    expiresAt: row.expiresAt,
  };
}

/**
 * Periodic cleanup helper — not wired to a cron, but exposed so a future
 * job can purge expired auth codes and tokens whose refresh has also
 * expired. We DON'T delete by `expiresAt` (access-token TTL) because the
 * row still carries a usable refresh token until `refreshExpiresAt` —
 * dropping it would force users back to re-authorize daily.
 */
export async function purgeExpired(): Promise<void> {
  const now = Date.now();
  await db.delete(mcpAuthCodes).where(lt(mcpAuthCodes.expiresAt, now));
  await db
    .delete(mcpAccessTokens)
    .where(lt(mcpAccessTokens.refreshExpiresAt, now));
}
