/**
 * Tests for POST /api/ai/substance-enrich — AI caffeine / alcohol enrichment.
 *
 * Strategy mirrors src/app/api/ai/parse/route.test.ts: withAuth is a
 * pass-through HOF, the Claude client and usage tracker are mocked, and the
 * route module is imported dynamically after the mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// ── helpers ────────────────────────────────────────────────────────────────

function toolResponse(name: string, input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name, id: "t1", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function textResponse() {
  return {
    content: [{ type: "text", text: "prose only, no tool call" }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/substance-enrich", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ai/substance-enrich", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path (caffeine): valid tool result → 200 with parsed body", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse("caffeine_enrichment", {
        caffeineMg: 95,
        volumeMl: 240,
        reasoning: "A standard cup of drip coffee.",
      }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "cup of coffee", type: "caffeine" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      caffeineMg: number;
      volumeMl: number;
      reasoning?: string;
    };
    expect(body.caffeineMg).toBe(95);
    expect(body.volumeMl).toBe(240);
    expect(body.reasoning).toBe("A standard cup of drip coffee.");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("happy path (alcohol): route converts ABV+volume to standard drinks & ethanol grams", async () => {
    // 500 ml at 5% ABV → ethanol = 500 * 0.05 * 0.789 = 19.725 g
    //                 → standard drinks = 19.725 / 10 = 1.9725 → rounded 2.0
    messagesCreate.mockResolvedValueOnce(
      toolResponse("alcohol_enrichment", {
        abvPercent: 5,
        volumeMl: 500,
        reasoning: "A 500 ml pint of lager.",
      }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "pint of lager", type: "alcohol" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      standardDrinks: number;
      volumeMl: number;
      abvPercent: number;
      ethanolGrams: number;
    };
    expect(body.abvPercent).toBe(5);
    expect(body.volumeMl).toBe(500);
    expect(body.ethanolGrams).toBe(19.7);
    expect(body.standardDrinks).toBe(2);
  });

  it("input validation: empty description → 400, AI never called", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "", type: "caffeine" }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: description over 500-char .max() → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "x".repeat(501), type: "caffeine" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: invalid type enum → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "coke", type: "sugar" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: missing type field → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "coffee" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("AI-failure: messages.create throws → graceful 502", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "coffee", type: "caffeine" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to process request");
  });

  it("AI-failure: no tool block on either turn → 422 fallbackToManual", async () => {
    // First turn text-only → follow-up turn text-only → route gives up.
    messagesCreate.mockResolvedValueOnce(textResponse());
    messagesCreate.mockResolvedValueOnce(textResponse());

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "coffee", type: "caffeine" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });

  it("AI-failure: caffeine tool result out of range (caffeineMg > 2000) → 422", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse("caffeine_enrichment", { caffeineMg: 99999, volumeMl: 240, reasoning: "bad" }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "coffee", type: "caffeine" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
  });

  it("AI-failure: alcohol tool result out of range (abvPercent > 95) → 422", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse("alcohol_enrichment", { abvPercent: 200, volumeMl: 500, reasoning: "bad" }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "spirit", type: "alcohol" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
  });

  it("follow-up recovery: text first turn then a valid tool turn → 200", async () => {
    messagesCreate.mockResolvedValueOnce(textResponse());
    messagesCreate.mockResolvedValueOnce(
      toolResponse("caffeine_enrichment", { caffeineMg: 60, volumeMl: 30, reasoning: "espresso" }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "single espresso", type: "caffeine" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { caffeineMg: number };
    expect(body.caffeineMg).toBe(60);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });
});
