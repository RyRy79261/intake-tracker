/**
 * Tests the priority chain in ai-key-resolver.
 *   1. Own stored key.
 *   2. Shared key from another user.
 *   3. Env-var key if email is whitelisted.
 *   4. Otherwise NoAiKeyError.
 *
 * Mocks `@/lib/drizzle` so no real database is touched; each test stubs the
 * select chain to return the rows that simulate the desired DB state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Mock drizzle. The resolver chains: .select().from().where().limit() — and
// for shares, .select({...}).from().where().limit(). We model both with a
// single fluent helper that returns whatever the test sets via the shared
// `mockState` module (hoist-safe: factory references the import directly).

vi.mock("@/lib/__tests__/ai-key-resolver-mock-state", () => ({
  mockState: { rowsByCall: [] as Array<Record<string, unknown>[]>, idx: 0 },
}));

vi.mock("@/lib/drizzle", async () => {
  const { mockState } = await import("@/lib/__tests__/ai-key-resolver-mock-state");
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const rows = mockState.rowsByCall[mockState.idx] ?? [];
              mockState.idx += 1;
              return rows;
            },
          }),
        }),
      }),
    },
  };
});

import { mockState } from "@/lib/__tests__/ai-key-resolver-mock-state";
import { resolveAiKey, NoAiKeyError } from "@/lib/ai-key-resolver";
import { encryptKey } from "@/lib/key-vault";

type MockRow = Record<string, unknown>;
const mockRowsByCall = mockState.rowsByCall;

const ORIGINAL_ENV = {
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,
};

describe("resolveAiKey priority chain", () => {
  beforeEach(() => {
    mockState.rowsByCall.length = 0;
    mockState.idx = 0;
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
    delete process.env.ALLOWED_EMAILS;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function setOwnRow(userId: string, anthropicPlain?: string, groqPlain?: string) {
    const row: MockRow = { userId };
    if (anthropicPlain) {
      row.anthropicKeyEncrypted = encryptKey(anthropicPlain, {
        userId,
        provider: "anthropic",
      });
    }
    if (groqPlain) {
      row.groqKeyEncrypted = encryptKey(groqPlain, { userId, provider: "groq" });
    }
    mockRowsByCall[0] = [row];
  }

  function setNoOwnRow() {
    mockRowsByCall[0] = [];
  }

  function setShareRows(grantorIds: string[]) {
    mockRowsByCall[1] = grantorIds.map((grantorId) => ({ grantorId }));
  }

  function setGrantorKey(
    callOffset: number,
    grantorId: string,
    provider: "anthropic" | "groq",
    plain?: string,
  ) {
    mockRowsByCall[callOffset] = plain
      ? [{ encrypted: encryptKey(plain, { userId: grantorId, provider }) }]
      : [];
  }

  it("returns own stored key when present", async () => {
    setOwnRow("alice", "sk-ant-alice-key");
    const result = await resolveAiKey("alice", "alice@example.com", "anthropic");
    expect(result).toEqual({
      apiKey: "sk-ant-alice-key",
      source: "own_stored",
      keyOwnerId: "alice",
    });
  });

  it("returns shared key when own key is missing", async () => {
    setNoOwnRow();
    setShareRows(["bob"]);
    setGrantorKey(2, "bob", "anthropic", "sk-ant-bob-shared");
    const result = await resolveAiKey("alice", "alice@example.com", "anthropic");
    expect(result).toEqual({
      apiKey: "sk-ant-bob-shared",
      source: "shared_from",
      keyOwnerId: "bob",
    });
  });

  it("skips a share whose grantor has no stored key, falls to next", async () => {
    setNoOwnRow();
    setShareRows(["bob", "carol"]);
    setGrantorKey(2, "bob", "anthropic"); // bob has no key
    setGrantorKey(3, "carol", "anthropic", "sk-ant-carol-key");
    const result = await resolveAiKey("alice", "alice@example.com", "anthropic");
    expect(result.apiKey).toBe("sk-ant-carol-key");
    expect(result.keyOwnerId).toBe("carol");
  });

  it("falls back to env var only when email is whitelisted", async () => {
    setNoOwnRow();
    setShareRows([]);
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-fallback";
    process.env.ALLOWED_EMAILS = "alice@example.com,owner@example.com";

    const result = await resolveAiKey("alice", "alice@example.com", "anthropic");
    expect(result).toEqual({
      apiKey: "sk-ant-env-fallback",
      source: "env_var",
      keyOwnerId: null,
    });
  });

  it("throws NoAiKeyError when nothing resolves", async () => {
    setNoOwnRow();
    setShareRows([]);
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-fallback";
    process.env.ALLOWED_EMAILS = "other@example.com";

    await expect(
      resolveAiKey("alice", "alice@example.com", "anthropic"),
    ).rejects.toBeInstanceOf(NoAiKeyError);
  });

  it("does not fall back to env var when ALLOWED_EMAILS is empty", async () => {
    setNoOwnRow();
    setShareRows([]);
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-fallback";
    // no ALLOWED_EMAILS — must not use env-var

    await expect(
      resolveAiKey("alice", "alice@example.com", "anthropic"),
    ).rejects.toBeInstanceOf(NoAiKeyError);
  });

  it("resolves Groq independently of Anthropic", async () => {
    setOwnRow("alice", undefined, "gsk_alice_groq");
    const result = await resolveAiKey("alice", "alice@example.com", "groq");
    expect(result.apiKey).toBe("gsk_alice_groq");
    expect(result.source).toBe("own_stored");
  });
});
