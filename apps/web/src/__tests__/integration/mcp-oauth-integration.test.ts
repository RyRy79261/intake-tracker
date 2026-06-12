/**
 * Integration tests for the MCP OAuth flow against a real Postgres
 * database.
 *
 * Catches the class of bugs that unit tests with a mocked Drizzle stub
 * cannot: CHECK constraints, FK cascades, real atomicity of single-use
 * code consumption, real uniqueness on refresh_token_hash. The companion
 * unit tests in `src/lib/mcp/oauth-flow.test.ts` cover happy-path logic
 * with an in-memory stub; this file is the safety net for everything
 * that depends on Postgres semantics.
 *
 * Pattern mirrors `src/__tests__/integration/sync-push-integration.test.ts`.
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
import { eq, sql } from "drizzle-orm";
import {
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";

let ctx: TestDbContext;
let oauth: typeof import("@/lib/mcp/oauth");
let tokens: typeof import("@/lib/mcp/tokens");

beforeAll(async () => {
  ctx = await setupTestDb();

  // Swap the drizzle module so the SUT writes through to the testcontainer.
  vi.mock("@intake/db/client", () => ({ db: ctx.db }));

  oauth = await import("@/lib/mcp/oauth");
  tokens = await import("@/lib/mcp/tokens");
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  // Clean MCP tables between tests; preserve the seeded user.
  await ctx.db.delete(schema.mcpAccessTokens);
  await ctx.db.delete(schema.mcpAuthCodes);
  await ctx.db.delete(schema.mcpAuditLog);
  await ctx.db.delete(schema.mcpOauthClients);
});

describe("MCP OAuth integration (real Postgres)", () => {
  describe("Schema constraints", () => {
    it("CHECK rejects an unknown token_endpoint_auth_method", async () => {
      await expect(
        ctx.db.insert(schema.mcpOauthClients).values({
          clientId: "x",
          clientName: "x",
          redirectUris: ["https://claude.ai/cb"],
          tokenEndpointAuthMethod: "not_a_method",
          createdAt: Date.now(),
        }),
      ).rejects.toThrow();
    });

    it("CHECK rejects an unknown code_challenge_method", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      await expect(
        ctx.db.insert(schema.mcpAuthCodes).values({
          code: "c1",
          clientId: client.clientId,
          userId: ctx.testUserId,
          redirectUri: "https://claude.ai/cb",
          codeChallenge: "x",
          codeChallengeMethod: "rot13",
          scope: "intake-tracker:read",
          expiresAt: Date.now() + 60_000,
          createdAt: Date.now(),
        }),
      ).rejects.toThrow();
    });

    it("UNIQUE on refresh_token_hash rejects collisions", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      const now = Date.now();
      await ctx.db.insert(schema.mcpAccessTokens).values({
        tokenHash: "h1",
        refreshTokenHash: "shared",
        clientId: client.clientId,
        userId: ctx.testUserId,
        scope: "intake-tracker:read",
        expiresAt: now + 60_000,
        refreshExpiresAt: now + 60_000,
        createdAt: now,
      });
      await expect(
        ctx.db.insert(schema.mcpAccessTokens).values({
          tokenHash: "h2",
          refreshTokenHash: "shared",
          clientId: client.clientId,
          userId: ctx.testUserId,
          scope: "intake-tracker:read",
          expiresAt: now + 60_000,
          refreshExpiresAt: now + 60_000,
          createdAt: now,
        }),
      ).rejects.toThrow();
    });
  });

  describe("FK cascade", () => {
    it("deleting a user cascades to their tokens", async () => {
      const userId = `cascade-user-${Date.now()}`;
      await ctx.pool.query(
        `INSERT INTO neon_auth.users_sync (id) VALUES ($1)`,
        [userId],
      );
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      await oauth.issueAccessToken({
        clientId: client.clientId,
        userId,
        scope: "intake-tracker:read",
      });

      await ctx.pool.query(`DELETE FROM neon_auth.users_sync WHERE id = $1`, [
        userId,
      ]);

      const remaining = await ctx.db
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.mcpAccessTokens)
        .where(eq(schema.mcpAccessTokens.userId, userId));
      expect(remaining[0]?.c).toBe(0);
    });

    it("deleting a client cascades to its codes and tokens", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      await oauth.issueAuthCode({
        clientId: client.clientId,
        userId: ctx.testUserId,
        redirectUri: "https://claude.ai/cb",
        codeChallenge: "c",
        codeChallengeMethod: "S256",
        scope: "intake-tracker:read",
      });
      await oauth.issueAccessToken({
        clientId: client.clientId,
        userId: ctx.testUserId,
        scope: "intake-tracker:read",
      });

      await ctx.db
        .delete(schema.mcpOauthClients)
        .where(eq(schema.mcpOauthClients.clientId, client.clientId));

      const codes = await ctx.db
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.mcpAuthCodes)
        .where(eq(schema.mcpAuthCodes.clientId, client.clientId));
      const toks = await ctx.db
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.mcpAccessTokens)
        .where(eq(schema.mcpAccessTokens.clientId, client.clientId));
      expect(codes[0]?.c).toBe(0);
      expect(toks[0]?.c).toBe(0);
    });
  });

  describe("End-to-end OAuth flow", () => {
    it("register → authorize → token exchange → tool-call bearer lookup", async () => {
      const client = await oauth.registerClient({
        clientName: "claude.ai",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      expect(client.clientId).toMatch(/^mcp_client_/);

      // Authorize: mint a code as the authorize handler would.
      const verifier = "v".repeat(64);
      const challenge = require("node:crypto")
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const code = await oauth.issueAuthCode({
        clientId: client.clientId,
        userId: ctx.testUserId,
        redirectUri: "https://claude.ai/cb",
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        scope: "intake-tracker:read",
      });

      // Token exchange: consume the code, issue tokens.
      const consumed = await oauth.consumeAuthCode({
        code,
        clientId: client.clientId,
        redirectUri: "https://claude.ai/cb",
        codeVerifier: verifier,
      });
      expect(consumed.ok).toBe(true);
      if (!consumed.ok) throw new Error("unreachable");

      const issued = await oauth.issueAccessToken({
        clientId: client.clientId,
        userId: consumed.userId,
        scope: consumed.scope,
      });

      // Tool-call: bearer lookup returns the same userId.
      const looked = await oauth.lookupAccessToken(issued.accessToken);
      expect(looked).not.toBeNull();
      expect(looked?.userId).toBe(ctx.testUserId);
      expect(looked?.clientId).toBe(client.clientId);
      expect(looked?.scope).toBe("intake-tracker:read");
    });

    it("revoked access tokens are not returned by lookupAccessToken", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      const issued = await oauth.issueAccessToken({
        clientId: client.clientId,
        userId: ctx.testUserId,
        scope: "intake-tracker:read",
      });

      await ctx.db
        .update(schema.mcpAccessTokens)
        .set({ revokedAt: Date.now() })
        .where(
          eq(schema.mcpAccessTokens.tokenHash, tokens.hashToken(issued.accessToken)),
        );

      expect(await oauth.lookupAccessToken(issued.accessToken)).toBeNull();
    });

    it("expired access tokens are not returned by lookupAccessToken", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      const issued = await oauth.issueAccessToken({
        clientId: client.clientId,
        userId: ctx.testUserId,
        scope: "intake-tracker:read",
      });
      await ctx.db
        .update(schema.mcpAccessTokens)
        .set({ expiresAt: Date.now() - 1000 })
        .where(
          eq(schema.mcpAccessTokens.tokenHash, tokens.hashToken(issued.accessToken)),
        );
      expect(await oauth.lookupAccessToken(issued.accessToken)).toBeNull();
    });
  });

  describe("Auth code single-use enforcement", () => {
    it("second consumeAuthCode call returns invalid_grant", async () => {
      const client = await oauth.registerClient({
        clientName: "x",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
      });
      const verifier = "v".repeat(64);
      const challenge = require("node:crypto")
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const code = await oauth.issueAuthCode({
        clientId: client.clientId,
        userId: ctx.testUserId,
        redirectUri: "https://claude.ai/cb",
        codeChallenge: challenge,
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
  });
});
