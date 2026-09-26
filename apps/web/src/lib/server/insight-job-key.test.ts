/**
 * Tests the pinned-key resolver the deep-insight poller uses. A batch lives in
 * the Anthropic org of the key that created it, so polling must use exactly
 * that key — not whatever the caller's key resolves to now.
 *
 * Mocks `@intake/db/client` with a queue of result sets, one per
 * `.select().from().where().limit()` chain, in call order.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

const state = vi.hoisted(() => ({
  rowsByCall: [] as Array<Array<Record<string, unknown>>>,
  idx: 0,
  currentKeyCalls: 0,
}));

vi.mock("@intake/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const rows = state.rowsByCall[state.idx] ?? [];
            state.idx += 1;
            return rows;
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  getClaudeClientForUser: async () => {
    state.currentKeyCalls += 1;
    return {
      client: { marker: "current-key-client" },
      resolved: { apiKey: "sk-current", source: "own_stored", keyOwnerId: "user-1" },
    };
  },
}));

import { encryptKey } from "@/lib/key-vault";
import {
  getClaudeClientForJob,
  resolvePinnedAnthropicKey,
} from "@/lib/server/insight-job-key";
import {
  buildJobPayload,
  PinnedKeyUnavailableError,
} from "@/lib/server/insight-job-payload";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";

const REQUEST = {
  range: { start: 1, end: 2 },
  metrics: { intake: { avgWaterMl: 1, avgSodiumMg: 1, waterGoalMl: 1, sodiumLimitMg: 1 } },
} as AnalyticsInsightsRequest;

const ORIGINAL_ENV = {
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,
};

function stored(owner: string, plain: string) {
  return {
    encrypted: encryptKey(plain, { userId: owner, provider: "anthropic" }),
  };
}

describe("resolvePinnedAnthropicKey", () => {
  beforeEach(() => {
    state.rowsByCall.length = 0;
    state.idx = 0;
    state.currentKeyCalls = 0;
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
    delete process.env.ALLOWED_EMAILS;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("keeps using the grantor's shared key while the share stands", async () => {
    state.rowsByCall.push([{ grantorId: "grantor-1" }], [stored("grantor-1", "sk-grantor")]);
    const resolved = await resolvePinnedAnthropicKey("user-1", undefined, {
      keySource: "shared_from",
      keyOwnerId: "grantor-1",
    });
    expect(resolved).toEqual({
      apiKey: "sk-grantor",
      source: "shared_from",
      keyOwnerId: "grantor-1",
    });
  });

  it("refuses a revoked share instead of silently switching org", async () => {
    state.rowsByCall.push([]);
    await expect(
      resolvePinnedAnthropicKey("user-1", undefined, {
        keySource: "shared_from",
        keyOwnerId: "grantor-1",
      }),
    ).rejects.toBeInstanceOf(PinnedKeyUnavailableError);
  });

  it("uses the env key for an env-submitted job even after the user saved their own key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-env";
    process.env.ALLOWED_EMAILS = "owner@example.test";
    const resolved = await resolvePinnedAnthropicKey("user-1", "Owner@example.test", {
      keySource: "env_var",
      keyOwnerId: null,
    });
    expect(resolved.apiKey).toBe("sk-env");
    // No DB lookup: the user's own stored key is irrelevant to this batch.
    expect(state.idx).toBe(0);
  });

  it("refuses the env key once the caller is off the whitelist", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-env";
    process.env.ALLOWED_EMAILS = "someone-else@example.test";
    await expect(
      resolvePinnedAnthropicKey("user-1", "owner@example.test", {
        keySource: "env_var",
        keyOwnerId: null,
      }),
    ).rejects.toBeInstanceOf(PinnedKeyUnavailableError);
  });

  it("refuses an own-stored pin that belongs to someone else", async () => {
    await expect(
      resolvePinnedAnthropicKey("user-1", undefined, {
        keySource: "own_stored",
        keyOwnerId: "user-2",
      }),
    ).rejects.toBeInstanceOf(PinnedKeyUnavailableError);
  });

  it("refuses an own-stored pin once the key was deleted", async () => {
    state.rowsByCall.push([]);
    await expect(
      resolvePinnedAnthropicKey("user-1", undefined, {
        keySource: "own_stored",
        keyOwnerId: "user-1",
      }),
    ).rejects.toBeInstanceOf(PinnedKeyUnavailableError);
  });
});

describe("getClaudeClientForJob", () => {
  beforeEach(() => {
    state.rowsByCall.length = 0;
    state.idx = 0;
    state.currentKeyCalls = 0;
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
  });

  it("falls back to the caller's current key for a legacy job with no pinned key", async () => {
    const { resolved } = await getClaudeClientForJob(REQUEST, "user-1", undefined);
    expect(state.currentKeyCalls).toBe(1);
    expect(resolved.apiKey).toBe("sk-current");
  });

  it("resolves the pinned key, not the current one, for an enveloped job", async () => {
    state.rowsByCall.push([stored("user-1", "sk-pinned")]);
    const payload = buildJobPayload(REQUEST, {
      keySource: "own_stored",
      keyOwnerId: "user-1",
    });
    const { resolved } = await getClaudeClientForJob(payload, "user-1", undefined);
    expect(state.currentKeyCalls).toBe(0);
    expect(resolved.apiKey).toBe("sk-pinned");
  });
});
