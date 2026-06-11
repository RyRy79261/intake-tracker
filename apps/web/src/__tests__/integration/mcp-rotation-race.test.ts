/**
 * Refresh-endpoint behaviour under concurrent use — real Postgres only.
 *
 * The refresh path issues a fresh access token while keeping the refresh
 * token stable for its full refresh-expiry window. Two properties matter:
 *
 *   1. The same refresh token can be exchanged many times. There is no
 *      single-use rotation, so a network blip or duplicate refresh from
 *      the client never permanently locks the user out.
 *   2. Concurrent refreshes both succeed. At minimum, the row's
 *      `token_hash` after the dust settles matches one of the access
 *      tokens that was returned to a caller, so at least one client
 *      reply remains usable.
 *
 * Client-scoping and refresh-expiry are still enforced.
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
import * as schema from "@intake/db/schema";

let ctx: TestDbContext;
let oauth: typeof import("@/lib/mcp/oauth");

beforeAll(async () => {
  ctx = await setupTestDb();
  vi.mock("@intake/db/client", () => ({ db: ctx.db }));
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

describe("MCP refresh endpoint (real Postgres)", () => {
  it("two parallel refreshes both succeed and at least one access token is live", async () => {
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

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("unreachable");

    const liveA = await oauth.lookupAccessToken(a.tokens.accessToken);
    const liveB = await oauth.lookupAccessToken(b.tokens.accessToken);
    // The last writer's token wins the row, but at least one must be live.
    expect(Boolean(liveA) || Boolean(liveB)).toBe(true);
  });

  it(
    "N parallel refreshes all succeed (property)",
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
          expect(results.every((r) => r.ok)).toBe(true);
        }),
        { numRuns: 5 },
      );
    },
    30_000,
  );

  it("the same refresh token can be exchanged many times sequentially", async () => {
    const client = await freshClient();
    const issued = await oauth.issueAccessToken({
      clientId: client.clientId,
      userId: ctx.testUserId,
      scope: "intake-tracker:read",
    });

    let lastAccess = issued.accessToken;
    for (let i = 0; i < 5; i++) {
      const r = await oauth.rotateRefreshToken(
        issued.refreshToken,
        client.clientId,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.tokens.refreshToken).toBe(issued.refreshToken);
      expect(r.tokens.accessToken).not.toBe(lastAccess);
      lastAccess = r.tokens.accessToken;
      // The newly issued access token must be usable.
      const live = await oauth.lookupAccessToken(r.tokens.accessToken);
      expect(live).not.toBeNull();
    }
  });

  it("refreshing with the wrong client_id fails even if refresh token matches", async () => {
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
