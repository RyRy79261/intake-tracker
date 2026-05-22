/**
 * Tests for POST /api/ai/parse — server-side AI food/drink nutrition parsing.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through HOF that
 *     injects a fixed authenticated context.
 *   - Mock @/app/api/ai/_shared/claude-client so getClaudeClientForUser
 *     returns a client whose messages.create is a controllable vi.fn(). This
 *     avoids the real Anthropic SDK / key-resolution machinery while still
 *     exercising the route's tool-block parsing and validation logic.
 *   - Mock @/app/api/ai/_shared/usage-tracker so recordUsage is a no-op
 *     (the real one imports drizzle/Neon Postgres).
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── messages.create mock — tests push responses / errors onto it ───────────
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

/** Build a fake Anthropic Message whose content holds a parse_food_result tool_use block. */
function toolResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "parse_food_result", id: "t1", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

/** A response with only a text block — forces the route's follow-up turn. */
function textResponse() {
  return {
    content: [{ type: "text", text: "here is some prose, no tool" }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/parse", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ai/parse", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: valid tool result → 200 with mapped body", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse({
        water_ml: 250,
        sodium_mg: 12,
        sugar_g: 22,
        reasoning: "A 250 ml glass of orange juice.",
      }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "glass of orange juice" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      water: number;
      salt: number;
      measurement_type: string;
      sugar: number;
      reasoning?: string;
    };
    // Route renames sodium_mg → salt and stamps measurement_type.
    expect(body.water).toBe(250);
    expect(body.salt).toBe(12);
    expect(body.measurement_type).toBe("sodium");
    expect(body.sugar).toBe(22);
    expect(body.reasoning).toBe("A 250 ml glass of orange juice.");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("passes through null AI values without error", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse({ water_ml: null, sodium_mg: null, sugar_g: null, reasoning: "Unknown." }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "mystery item" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { water: number | null; salt: number | null; sugar: number | null };
    expect(body.water).toBeNull();
    expect(body.salt).toBeNull();
    expect(body.sugar).toBeNull();
  });

  it("input validation: empty input → 400, AI never called", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "" }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: input over 500-char .max() → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "x".repeat(501) }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: missing input field → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ notInput: "abc" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("AI-failure: messages.create throws → graceful 502, not a crash", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "coffee" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to process request");
  });

  it("AI-failure: no tool block on either turn → graceful 422 fallbackToManual", async () => {
    // First turn returns text only → route runs a forced follow-up turn,
    // which also returns text only → route gives up with a 422.
    messagesCreate.mockResolvedValueOnce(textResponse());
    messagesCreate.mockResolvedValueOnce(textResponse());

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "coffee" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });

  it("AI-failure: tool result violates output schema (water out of range) → 422", async () => {
    // 99999 exceeds AIParseResponseSchema's water max of 10000.
    messagesCreate.mockResolvedValueOnce(
      toolResponse({ water_ml: 99999, sodium_mg: 0, sugar_g: 0, reasoning: "bad" }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "water" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
  });

  it("follow-up recovery: text first turn then a valid tool turn → 200", async () => {
    messagesCreate.mockResolvedValueOnce(textResponse());
    messagesCreate.mockResolvedValueOnce(
      toolResponse({ water_ml: 100, sodium_mg: 1, sugar_g: 0, reasoning: "plain water" }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ input: "water" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { water: number };
    expect(body.water).toBe(100);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });
});
