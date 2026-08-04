/**
 * Tests for POST /api/ai/substance-lookup — the caffeine search gate.
 *
 * Issue #262: the model returns an incorrect caffeine figure when it answers
 * from recall, because recalled values collapse onto one remembered number per
 * category. The prompt now mandates a web search on every caffeine query, but
 * a prompt is an instruction and not a guarantee — so the route verifies a
 * search actually completed before it will return a caffeine value.
 *
 * Strategy mirrors medicine-search/route.test.ts: withAuth is a pass-through,
 * the Claude client and usage tracker are mocked, and the route module is
 * imported dynamically after the mocks are registered.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const messagesCreate = vi.fn();

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string; email: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      });
  },
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: vi.fn(),
  tokensFromAnthropic: () => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
  }),
}));

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  CLAUDE_MODELS: { fast: "fast", quality: "quality", premium: "premium" },
  WEB_SEARCH_TOOL: { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  getClaudeClientForUser: vi.fn(async () => ({
    client: { messages: { create: messagesCreate } },
    resolved: { apiKey: "k", source: "env", keyOwnerId: null },
  })),
}));

const usage = { input_tokens: 10, output_tokens: 5 };

/** A well-formed substance_lookup_result the schema will accept. */
function resultBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: "tool_use",
    name: "substance_lookup_result",
    id: "t1",
    input: {
      substancePer100ml: 55,
      defaultVolumeMl: 250,
      beverageName: "Pour-over coffee",
      reasoning: "USDA FoodData Central",
      waterContentPercent: 99,
      ...overrides,
    },
  };
}

/** A completed search: a result block carrying actual results. */
function searchResultBlock() {
  return {
    type: "web_search_tool_result",
    tool_use_id: "srv1",
    content: [
      {
        type: "web_search_result",
        title: "Caffeine content of brewed coffee",
        url: "https://fdc.nal.usda.gov/",
        encrypted_content: "x",
      },
    ],
  };
}

/** A search that ran but errored — nothing to source from. */
function searchErrorBlock() {
  return {
    type: "web_search_tool_result",
    tool_use_id: "srv1",
    content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new NextRequest("http://localhost/api/ai/substance-lookup", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("caffeine lookups must be sourced by a completed web search", () => {
  it("rejects a caffeine value the model produced without searching", async () => {
    // Both the first call and the search-nudge retry answer straight from recall.
    messagesCreate.mockResolvedValue({ content: [resultBlock()], usage });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("SEARCH_REQUIRED");
    // It must not leak the unsourced number through in any form.
    expect(JSON.stringify(json)).not.toContain("55");
  });

  it("retries with a search nudge before giving up", async () => {
    messagesCreate.mockResolvedValue({ content: [resultBlock()], usage });

    await post({ query: "pour over coffee", type: "caffeine" });

    expect(messagesCreate).toHaveBeenCalledTimes(2);
    const retry = messagesCreate.mock.calls[1]?.[0];
    expect(retry).toBeDefined();
    expect(JSON.stringify(retry.messages)).toMatch(/must call the web_search tool/i);
    // Forcing the structured tool would prevent the search we are asking for.
    expect(retry.tool_choice).toBeUndefined();
  });

  it("sends the retry as a fresh turn, never replaying the unpaired tool_use", async () => {
    messagesCreate.mockResolvedValue({ content: [resultBlock()], usage });

    await post({ query: "pour over coffee", type: "caffeine" });

    const retry = messagesCreate.mock.calls[1]?.[0];
    // The Messages API requires every assistant tool_use to be followed by a
    // matching tool_result. Replaying the rejected answer would be malformed,
    // and the mock here would not catch that - the real API would 400.
    expect(retry.messages).toHaveLength(1);
    expect(retry.messages[0].role).toBe("user");
    expect(
      retry.messages.some(
        (m: { role: string }) => m.role === "assistant",
      ),
      "retry must not replay the assistant turn",
    ).toBe(false);
  });

  it("never reuses the unsourced first value when the retry searches but returns no result", async () => {
    // The dangerous shape: the retry satisfies the search gate but produces no
    // structured block. Falling back to the first answer would pair "searched"
    // with the 999 the gate exists to reject, so the handler must go to the
    // forcing step for a value derived from the search instead.
    messagesCreate
      .mockResolvedValueOnce({
        content: [resultBlock({ substancePer100ml: 999 })],
        usage,
      })
      .mockResolvedValueOnce({ content: [searchResultBlock()], usage })
      .mockResolvedValueOnce({
        content: [resultBlock({ substancePer100ml: 55 })],
        usage,
      });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.substancePer100ml).toBe(55);
    expect(json.substancePer100ml).not.toBe(999);
    expect(messagesCreate).toHaveBeenCalledTimes(3);
  });

  it("accepts a caffeine value when a search completed", async () => {
    messagesCreate.mockResolvedValue({
      content: [searchResultBlock(), resultBlock()],
      usage,
    });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.substancePer100ml).toBe(55);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("accepts it when only the retry manages to search", async () => {
    messagesCreate
      .mockResolvedValueOnce({ content: [resultBlock()], usage })
      .mockResolvedValueOnce({ content: [searchResultBlock(), resultBlock()], usage });

    const res = await post({ query: "pour over coffee", type: "caffeine" });

    expect(res.status).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });

  it("does not count a search that errored", async () => {
    messagesCreate.mockResolvedValue({
      content: [searchErrorBlock(), resultBlock()],
      usage,
    });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("SEARCH_REQUIRED");
  });

  it("does not gate alcohol lookups - ABV is a label value, not a measurement", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        resultBlock({ substancePer100ml: 5, beverageName: "Lager", reasoning: "label" }),
      ],
      usage,
    });

    const res = await post({ query: "lager", type: "alcohol" });

    expect(res.status).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });
});
