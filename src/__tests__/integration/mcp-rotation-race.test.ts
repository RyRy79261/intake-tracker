/**
 * Refresh-token rotation under concurrent use — real Postgres only.
 *
 * The atomic guard in `rotateRefreshToken` is
 *
 *     UPDATE mcp_access_tokens
 *        SET revoked_at = $now
 *      WHERE refresh_token_hash = $hash
 *        AND revoked_at IS NULL
 *      RETURNING *
 *
 * Postgres row-level locking guarantees exactly one concurrent caller
 * sees the row in its pre-update state and gets the RETURNING payload;
 * everyone else gets zero rows back and returns `invalid_grant`. An
 * in-memory JS stub does NOT model that — only a real Postgres can.
 *
 * Property under test (docs/TESTING_STRATEGY.md §2.5):
 *
 *     For any sequence of N parallel rotation attempts against the
 *     same refresh token, exactly ONE succeeds.
 *
 * That single-winner property is what stops a leaked refresh token
 * from being usable twice in a refresh-token-replay attack.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fc from "fast-check";
import {
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";

let ctx: TestDbContext;
let oauth: typeof import("@/lib/mcp/oauth");

beforeAll(async () => {
  ctx = await setupTestDb();
  vi.mock("@/lib/drizzle", () => ({ db: ctx.db }));
  oauth = await import("@/lib/mcp/oauth");
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  await ctx.db.delete(schema.mcpAccessTokens);
  await ctx.db.delete(schema.mcpOauthClients);
});

async function freshClient() {
  return oauth.registerClient({
    clientName: "claude.ai",
    redirectUris: ["https://claude.ai/cb"],
    tokenEndpointAuthMethod: "none",
  });
}

describe("MCP refresh-token rotation race (real Postgres)", () => {
  it("two parallel rotations of the same refresh token: exactly one wins", async () => {
    const client = await freshClient();
    const issued = await oauth.issueAccessToken({
      clientId: client.clientId,
      userId: ctx.testUserId,
      scope: "intake-tracker:read",
    });

    const [a, b] = await Promise.all([
      oauth.rotateRefreshToken(issued.refreshToken, client.clientId),
      oauth.rotateRefreshToken(issued.refreshToken, client.clientId),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });

  it(
    "N parallel rotations of the same refresh token: exactly one wins (property)",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (n) => {
          await ctx.db.delete(schema.mcpAccessTokens);
          const client = await freshClient();
          const issued = await oauth.issueAccessToken({
            clientId: client.clientId,
            userId: ctx.testUserId,
            scope: "intake-tracker:read",
          });
          const results = await Promise.all(
            Array.from({ length: n }, () =>
              oauth.rotateRefreshToken(issued.refreshToken, client.clientId),
            ),
          );
          const winners = results.filter((r) => r.ok).length;
          expect(winners).toBe(1);
          expect(results.length - winners).toBe(n - 1);
        }),
        { numRuns: 5 },
      );
    },
    30_000,
  );

  it("after a successful rotation, the old refresh token is permanently dead", async () => {
    const client = await freshClient();
    const issued = await oauth.issueAccessToken({
      clientId: client.clientId,
      userId: ctx.testUserId,
      scope: "intake-tracker:read",
    });
    const first = await oauth.rotateRefreshToken(
      issued.refreshToken,
      client.clientId,
    );
    expect(first.ok).toBe(true);

    // Replay the original token a few more times — must always fail.
    for (let i = 0; i < 3; i++) {
      const replay = await oauth.rotateRefreshToken(
        issued.refreshToken,
        client.clientId,
      );
      expect(replay.ok).toBe(false);
    }
  });

  it("the NEW refresh token returned by rotation is usable exactly once", async () => {
    const client = await freshClient();
    const issued = await oauth.issueAccessToken({
      clientId: client.clientId,
      userId: ctx.testUserId,
      scope: "intake-tracker:read",
    });
    const first = await oauth.rotateRefreshToken(
      issued.refreshToken,
      client.clientId,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    const second = await oauth.rotateRefreshToken(
      first.tokens.refreshToken,
      client.clientId,
    );
    expect(second.ok).toBe(true);

    const replay = await oauth.rotateRefreshToken(
      first.tokens.refreshToken,
      client.clientId,
    );
    expect(replay.ok).toBe(false);
  });

  it("rotating with the wrong client_id fails even if refresh token matches", async () => {
    const a = await freshClient();
    const b = await freshClient();
    const issued = await oauth.issueAccessToken({
      clientId: a.clientId,
      userId: ctx.testUserId,
      scope: "intake-tracker:read",
    });
    const result = await oauth.rotateRefreshToken(
      issued.refreshToken,
      b.clientId,
    );
    expect(result.ok).toBe(false);
  });
});
