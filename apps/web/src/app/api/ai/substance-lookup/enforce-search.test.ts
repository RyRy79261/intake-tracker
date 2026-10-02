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
    // Forcing the structured tool would prevent the search we are asking for
    // (and Claude Sonnet 5.5 rejects a forced tool_choice outright).
    expect(retry.tool_choice).toEqual({ type: "auto" });
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

  // Claude Sonnet 5.5 signs each thinking block over the conversation before
  // it. The follow-up replays the search-nudge turn, so it has to send that
  // turn's own user message — the original prompt under it is an edit to
  // earlier history, which can be a 400.
  it("replays the turn it continues under that turn's own user message", async () => {
    const searched = [
      { type: "thinking", thinking: "", signature: "sig" },
      searchResultBlock(),
      { type: "text", text: "About 55 mg per 100 ml." },
    ];
    messagesCreate
      .mockResolvedValueOnce({ content: [resultBlock({ substancePer100ml: 999 })], usage })
      .mockResolvedValueOnce({ content: searched, usage })
      .mockResolvedValueOnce({ content: [resultBlock()], usage });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    expect(res.status).toBe(200);

    const nudge = messagesCreate.mock.calls[1]?.[0];
    const followup = messagesCreate.mock.calls[2]?.[0];
    expect(followup.system).toBe(nudge.system);
    expect(followup.tools).toEqual(nudge.tools);
    expect(followup.messages).toHaveLength(3);
    expect(followup.messages[0]).toEqual(nudge.messages[0]);
    expect(followup.messages[1].role).toBe("assistant");
    expect(followup.messages[1].content).toBe(searched);
    expect(followup.messages[2].role).toBe("user");
  });

  it("continues the first turn under the original prompt when no nudge ran", async () => {
    const prose = [searchResultBlock(), { type: "text", text: "About 55 mg per 100 ml." }];
    messagesCreate
      .mockResolvedValueOnce({ content: prose, usage })
      .mockResolvedValueOnce({ content: [resultBlock()], usage });

    const res = await post({ query: "pour over coffee", type: "caffeine" });
    expect(res.status).toBe(200);

    const first = messagesCreate.mock.calls[0]?.[0];
    const followup = messagesCreate.mock.calls[1]?.[0];
    expect(followup.messages[0]).toEqual(first.messages[0]);
    expect(followup.messages[1].content).toBe(prose);
  });

  // Every request the route can make: a forced tool_choice, a sampling
  // parameter or a disabled-thinking setting is a 400 on Claude Sonnet 5.5,
  // and its effort default is high.
  it("sends tool_choice auto, a strict tool and medium effort on all three requests", async () => {
    messagesCreate
      .mockResolvedValueOnce({ content: [resultBlock()], usage })
      .mockResolvedValueOnce({ content: [searchResultBlock()], usage })
      .mockResolvedValueOnce({ content: [resultBlock()], usage });

    await post({ query: "pour over coffee", type: "caffeine" });

    expect(messagesCreate).toHaveBeenCalledTimes(3);
    for (const [params] of messagesCreate.mock.calls) {
      expect(params.tool_choice).toEqual({ type: "auto" });
      expect(params.output_config).toEqual({ effort: "medium" });
      expect(params).not.toHaveProperty("temperature");
      expect(params).not.toHaveProperty("top_p");
      expect(params).not.toHaveProperty("top_k");
      expect(params).not.toHaveProperty("thinking");
      const tool = params.tools.find(
        (t: { name: string }) => t.name === "substance_lookup_result",
      );
      expect(tool.strict).toBe(true);
    }
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

// ai-routes-models#19/#21: stop_reason handling through the shared helpers,
// and a limiter keyed on the user rather than a spoofable IP.
describe("substance-lookup stop_reason and rate limit", () => {
  it("maps a refusal to 422 AI_REFUSED without retrying or searching again", async () => {
    messagesCreate.mockResolvedValue({
      content: [],
      stop_reason: "refusal",
      stop_details: null,
      usage,
    });

    const res = await post({ query: "lager", type: "alcohol" });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("AI_REFUSED");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused web-search turn instead of treating it as no answer", async () => {
    messagesCreate
      .mockResolvedValueOnce({ content: [searchResultBlock()], stop_reason: "pause_turn", usage })
      .mockResolvedValueOnce({ content: [resultBlock()], stop_reason: "tool_use", usage });

    const res = await post({ query: "pour over coffee", type: "caffeine" });

    expect(res.status).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    const resumed = messagesCreate.mock.calls[1]?.[0];
    expect(resumed.messages.at(-1).role).toBe("assistant");
  });

  it("counts every request from one user whatever IP it claims", async () => {
    messagesCreate.mockResolvedValue({ content: [resultBlock({ substancePer100ml: 5 })], usage });
    const { POST } = await import("./route");

    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await POST(
        new NextRequest("http://localhost/api/ai/substance-lookup", {
          method: "POST",
          body: JSON.stringify({ query: "lager", type: "alcohol" }),
          headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}` },
        }),
      );
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 15).every((s) => s === 200)).toBe(true);
    expect(statuses[15]).toBe(429);
  });
});
