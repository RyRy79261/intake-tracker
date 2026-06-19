/**
 * Integration tests for the native Google sign-in bridge against real Postgres.
 *
 * Verifies the Postgres-dependent semantics a mocked stub can't: the atomic
 * single-use claim (DELETE ... RETURNING), expiry filtering, and the users_sync
 * FK. Mirrors src/__tests__/integration/mcp-oauth-integration.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";
import type * as BridgeMod from "@/lib/native-auth-bridge";

let ctx: TestDbContext;
let bridge: typeof BridgeMod;

beforeAll(async () => {
  ctx = await setupTestDb();
  vi.mock("@intake/db/client", () => ({ db: ctx.db }));
  bridge = await import("@/lib/native-auth-bridge");
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  await ctx.db.delete(schema.nativeAuthCodes);
});

describe("native-auth-bridge (integration)", () => {
  it("mints a code that claims back the exact session token", async () => {
    const code = await bridge.mintNativeAuthCode({
      sessionToken: "sess-abc",
      userId: ctx.testUserId,
    });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await bridge.claimNativeAuthCode(code)).toBe("sess-abc");
  });

  it("is single-use — a second claim returns null", async () => {
    const code = await bridge.mintNativeAuthCode({
      sessionToken: "sess-1",
      userId: ctx.testUserId,
    });
    expect(await bridge.claimNativeAuthCode(code)).toBe("sess-1");
    expect(await bridge.claimNativeAuthCode(code)).toBeNull();
  });

  it("returns null for an unknown code", async () => {
    expect(await bridge.claimNativeAuthCode("does-not-exist")).toBeNull();
  });

  it("will not claim an expired code", async () => {
    const code = await bridge.mintNativeAuthCode({
      sessionToken: "sess-exp",
      userId: ctx.testUserId,
    });
    await ctx.db
      .update(schema.nativeAuthCodes)
      .set({ expiresAt: Date.now() - 1_000 })
      .where(eq(schema.nativeAuthCodes.code, code));
    expect(await bridge.claimNativeAuthCode(code)).toBeNull();
  });

  it("mint prunes already-expired rows", async () => {
    const stale = await bridge.mintNativeAuthCode({
      sessionToken: "stale",
      userId: ctx.testUserId,
    });
    await ctx.db
      .update(schema.nativeAuthCodes)
      .set({ expiresAt: Date.now() - 1_000 })
      .where(eq(schema.nativeAuthCodes.code, stale));
    // Minting a fresh code triggers opportunistic cleanup of expired rows.
    await bridge.mintNativeAuthCode({ sessionToken: "fresh", userId: ctx.testUserId });
    const remaining = await ctx.db.select().from(schema.nativeAuthCodes);
    expect(remaining.map((r) => r.sessionToken)).toEqual(["fresh"]);
  });
});
