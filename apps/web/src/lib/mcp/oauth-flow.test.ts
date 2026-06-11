/**
 * Integration-style tests for the OAuth code-exchange + refresh-token
 * rotation flow.
 *
 * We mock `@/lib/drizzle` with an in-memory table store so we can drive the
 * full code-issue / consume / refresh path against the same `db` object the
 * production code uses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

// ────────────────────────────────────────────────────────────────────────
// In-memory db stub
// ────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const tables = new Map<unknown, Row[]>();
const tableRefs: Record<string, unknown> = {};

function tableFor(ref: unknown): Row[] {
  if (!tables.has(ref)) tables.set(ref, []);
  return tables.get(ref)!;
}

function matchesAll(row: Row, conds: Array<(r: Row) => boolean>): boolean {
  return conds.every((c) => c(row));
}

interface Where {
  __conds: Array<(r: Row) => boolean>;
}

// Sentinel objects representing each "and/eq/isNull" predicate. The
// drizzle-orm mock just records the predicate as a function; the test
// doesn't care about the SQL shape.
vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (column: { name?: string; _key?: string }, value: unknown) => ({
      __pred: (r: Row) => r[(column._key as string) ?? column.name!] === value,
    }),
    isNull: (column: { name?: string; _key?: string }) => ({
      __pred: (r: Row) => r[(column._key as string) ?? column.name!] == null,
    }),
    and: (...preds: Array<{ __pred: (r: Row) => boolean }>) => ({
      __pred: (r: Row) => preds.every((p) => p.__pred(r)),
    }),
    lt: (column: { name?: string; _key?: string }, value: number) => ({
      __pred: (r: Row) =>
        (r[(column._key as string) ?? column.name!] as number) < value,
    }),
    gte: (column: { name?: string; _key?: string }, value: number) => ({
      __pred: (r: Row) =>
        (r[(column._key as string) ?? column.name!] as number) >= value,
    }),
  };
});

vi.mock("@/db/schema", async () => {
  // Build per-column markers so eq/isNull above can resolve column → row key.
  const mark = (table: string, keys: string[]) => {
    const t: Record<string, { name: string; _key: string }> = {};
    for (const k of keys) t[k] = { name: k, _key: k };
    tableRefs[table] = t;
    return t;
  };
  return {
    mcpOauthClients: mark("mcpOauthClients", [
      "clientId",
      "clientSecretHash",
      "clientName",
      "redirectUris",
      "tokenEndpointAuthMethod",
      "scope",
      "createdAt",
      "lastUsedAt",
    ]),
    mcpAuthCodes: mark("mcpAuthCodes", [
      "code",
      "clientId",
      "userId",
      "redirectUri",
      "codeChallenge",
      "codeChallengeMethod",
      "scope",
      "expiresAt",
      "consumedAt",
      "createdAt",
    ]),
    mcpAccessTokens: mark("mcpAccessTokens", [
      "tokenHash",
      "refreshTokenHash",
      "clientId",
      "userId",
      "scope",
      "expiresAt",
      "refreshExpiresAt",
      "revokedAt",
      "createdAt",
      "lastUsedAt",
    ]),
    mcpAuditLog: mark("mcpAuditLog", ["id"]),
    usersSync: mark("usersSync", ["id", "email"]),
  };
});

vi.mock("@/lib/drizzle", () => {
  // The transaction stub is degenerate — there is no real isolation in the
  // in-memory map, so commits are immediate and rollback on a thrown error
  // is best-effort (we don't try to undo prior mutations). That's fine for
  // these tests: rotation-race behaviour and atomicity are covered by the
  // real-Postgres integration suite (src/__tests__/integration/mcp-rotation-race.test.ts).
  const db: Record<string, unknown> = {
    transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
      return fn(db);
    },
    insert(table: unknown) {
      return {
        values(row: Row | Row[]) {
          const rows = Array.isArray(row) ? row : [row];
          tableFor(table).push(...rows);
          return {
            returning: async () => rows,
            then: (resolve: (v?: unknown) => unknown) => resolve(),
            catch: () => {},
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(patch: Row) {
          return {
            where(where: { __pred: (r: Row) => boolean }) {
              return {
                returning: async () => {
                  const rows = tableFor(table);
                  const matched: Row[] = [];
                  for (const r of rows) {
                    if (where.__pred(r)) {
                      Object.assign(r, patch);
                      matched.push({ ...r });
                    }
                  }
                  return matched;
                },
              };
            },
          };
        },
      };
    },
    select(_proj?: Row) {
      return {
        from(table: unknown) {
          return {
            where(where: { __pred: (r: Row) => boolean }) {
              return {
                limit: async (_n: number) => {
                  return tableFor(table)
                    .filter((r) => where.__pred(r))
                    .slice(0, _n);
                },
              };
            },
            limit: async (_n: number) => tableFor(table).slice(0, _n),
          };
        },
      };
    },
    delete(table: unknown) {
      return {
        where(where: { __pred: (r: Row) => boolean }) {
          const rows = tableFor(table);
          const remaining = rows.filter((r) => !where.__pred(r));
          tables.set(table, remaining);
          return Promise.resolve();
        },
      };
    },
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Now import the SUT (after mocks).
// ────────────────────────────────────────────────────────────────────────

let oauth: typeof import("@/lib/mcp/oauth");

beforeEach(async () => {
  tables.clear();
  oauth = await import("@/lib/mcp/oauth");
});

function pkce(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("OAuth code-grant flow", () => {
  it("registers a public client, issues a code, exchanges it for tokens", async () => {
    const client = await oauth.registerClient({
      clientName: "claude.ai",
      redirectUris: ["https://claude.ai/cb"],
      tokenEndpointAuthMethod: "none",
    });
    expect(client.clientId).toMatch(/^mcp_client_/);
    expect(client.clientSecret).toBeUndefined();

    const verifier = "v".repeat(64);
    const challenge = pkce(verifier);

    const code = await oauth.issueAuthCode({
      clientId: client.clientId,
      userId: "user-1",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      scope: "intake-tracker:read",
    });
    expect(code).toMatch(/^mcp_ac_/);

    const consumed = await oauth.consumeAuthCode({
      code,
      clientId: client.clientId,
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(consumed.ok).toBe(true);
    if (consumed.ok) {
      expect(consumed.userId).toBe("user-1");
      expect(consumed.scope).toBe("intake-tracker:read");
    }
  });

  it("rejects a second use of the same authorization code", async () => {
    const client = await oauth.registerClient({
      clientName: "claude.ai",
      redirectUris: ["https://claude.ai/cb"],
      tokenEndpointAuthMethod: "none",
    });
    const verifier = "v".repeat(64);
    const code = await oauth.issueAuthCode({
      clientId: client.clientId,
      userId: "user-1",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: pkce(verifier),
      codeChallengeMethod: "S256",
      scope: "intake-tracker:read",
    });
    const first = await oauth.consumeAuthCode({
      code,
      clientId: client.clientId,
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(first.ok).toBe(true);

    const second = await oauth.consumeAuthCode({
      code,
      clientId: client.clientId,
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(second.ok).toBe(false);
  });

  it("rejects a code redeemed by a different client", async () => {
    const client = await oauth.registerClient({
      clientName: "claude.ai",
      redirectUris: ["https://claude.ai/cb"],
      tokenEndpointAuthMethod: "none",
    });
    const verifier = "v".repeat(64);
    const code = await oauth.issueAuthCode({
      clientId: client.clientId,
      userId: "user-1",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: pkce(verifier),
      codeChallengeMethod: "S256",
      scope: "intake-tracker:read",
    });
    const result = await oauth.consumeAuthCode({
      code,
      clientId: "mcp_client_evil",
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a code with the wrong PKCE verifier", async () => {
    const client = await oauth.registerClient({
      clientName: "claude.ai",
      redirectUris: ["https://claude.ai/cb"],
      tokenEndpointAuthMethod: "none",
    });
    const code = await oauth.issueAuthCode({
      clientId: client.clientId,
      userId: "user-1",
      redirectUri: "https://claude.ai/cb",
      codeChallenge: pkce("real-verifier-".repeat(4)),
      codeChallengeMethod: "S256",
      scope: "intake-tracker:read",
    });
    const result = await oauth.consumeAuthCode({
      code,
      clientId: client.clientId,
      redirectUri: "https://claude.ai/cb",
      codeVerifier: "wrong-verifier".repeat(4),
    });
    expect(result.ok).toBe(false);
  });

  it("issues a fresh access token while keeping the refresh token stable", async () => {
    const client = await oauth.registerClient({
      clientName: "claude.ai",
      redirectUris: ["https://claude.ai/cb"],
      tokenEndpointAuthMethod: "none",
    });
    const issued = await oauth.issueAccessToken({
      clientId: client.clientId,
      userId: "user-1",
      scope: "intake-tracker:read",
    });
    const refreshed = await oauth.rotateRefreshToken(
      issued.refreshToken,
      client.clientId,
    );
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.tokens.refreshToken).toBe(issued.refreshToken);
      expect(refreshed.tokens.accessToken).not.toBe(issued.accessToken);
    }
    // Same refresh token must keep working — no single-use rotation.
    const again = await oauth.rotateRefreshToken(
      issued.refreshToken,
      client.clientId,
    );
    expect(again.ok).toBe(true);
  });

  it("rejects DCR for a non-allowlisted redirect URI", async () => {
    await expect(
      oauth.registerClient({
        clientName: "evil",
        redirectUris: ["https://evil.example.com/cb"],
        tokenEndpointAuthMethod: "none",
      }),
    ).rejects.toThrow(/redirect_uri not allowed/);
  });
});
