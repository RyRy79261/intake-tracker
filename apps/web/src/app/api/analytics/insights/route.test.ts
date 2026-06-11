/**
 * Tests for POST /api/analytics/insights handler.
 *
 * The route validates a numeric analytics snapshot, calls Claude to turn it
 * into a narrative, validates the tool response, and returns it.
 *
 * Strategy (mirrors sync-push-route.test.ts):
 *   - Mock @/lib/auth-middleware so withAuth injects a fixed auth context.
 *   - Mock the Claude client factory so the model call is deterministic; it
 *     can also be made to throw NoAiKeyError / Anthropic.AuthenticationError
 *     to exercise the aiErrorResponse mapping.
 *   - Mock the usage-tracker so telemetry never touches a real store.
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { NoAiKeyError } from "@/lib/ai-key-resolver";
import Anthropic from "@anthropic-ai/sdk";

// ── Controllable stubs ───────────────────────────────────────────────────

let aiContent: unknown[] = [];
let aiStopReason: string = "tool_use";
let aiThrows: Error | null = null;
let claudeClientThrows: Error | null = null;
const messagesCreateCalls: unknown[] = [];

function resetState() {
  aiContent = [];
  aiStopReason = "tool_use";
  aiThrows = null;
  claudeClientThrows = null;
  messagesCreateCalls.length = 0;
}

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

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  CLAUDE_MODELS: { fast: "claude-haiku-test", quality: "claude-sonnet-test" },
  getClaudeClientForUser: async () => {
    if (claudeClientThrows) throw claudeClientThrows;
    return {
      client: {
        messages: {
          create: async (params: unknown) => {
            messagesCreateCalls.push(params);
            if (aiThrows) throw aiThrows;
            return {
              content: aiContent,
              stop_reason: aiStopReason,
              usage: { input_tokens: 20, output_tokens: 10 },
            };
          },
        },
      },
      resolved: { keyOwnerId: "user-test", source: "env" },
    };
  },
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: () => undefined,
  tokensFromAnthropic: () => ({ inputTokens: 20, outputTokens: 10 }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/analytics/insights", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  const now = 1_700_000_000_000;
  return {
    range: { start: now - 7 * 86_400_000, end: now },
    metrics: {
      intake: {
        avgWaterMl: 1800,
        avgSodiumMg: 2100,
        avgSugarG: 40,
        avgPotassiumMg: 2800,
        waterGoalMl: 2500,
        sodiumLimitMg: 2300,
        sugarLimitG: 50,
        potassiumLimitMg: 3500,
      },
    },
    ...overrides,
  };
}

function insightToolBlock(input: unknown) {
  return { type: "tool_use", name: "analytics_insight", input };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/analytics/insights", () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the AI narrative and observations on the happy path", async () => {
    aiContent = [
      insightToolBlock({
        summary: "Water intake averaged 1800 ml against a 2500 ml goal.",
        observations: [
          "Water was 700 ml below goal on average.",
          "Sodium stayed close to the 2300 mg limit.",
        ],
      }),
    ];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      narrative: string;
      observations: string[];
      generatedAt: number;
    };
    expect(body.narrative).toBe(
      "Water intake averaged 1800 ml against a 2500 ml goal.",
    );
    expect(body.observations).toHaveLength(2);
    expect(typeof body.generatedAt).toBe("number");
    expect(messagesCreateCalls).toHaveLength(1);
  });

  it("returns 400 when the analytics payload fails schema validation", async () => {
    const { POST } = await import("@/app/api/analytics/insights/route");
    // metrics is empty — the schema's refine requires at least one group.
    const res = await POST(
      makeRequest({
        range: { start: 1, end: 2 },
        metrics: {},
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    // The model must not be called on an invalid payload.
    expect(messagesCreateCalls).toHaveLength(0);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest("}{ broken"));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
  });

  it("returns 402 / NO_AI_KEY when the caller has no key configured", async () => {
    claudeClientThrows = new NoAiKeyError("anthropic");

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; provider: string };
    expect(body.code).toBe("NO_AI_KEY");
    expect(body.provider).toBe("anthropic");
  });

  it("returns 400 / INVALID_KEY when Anthropic rejects the key", async () => {
    claudeClientThrows = new Anthropic.AuthenticationError(
      401,
      { error: { message: "invalid x-api-key" } },
      "invalid x-api-key",
      new Headers(),
    );

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_KEY");
  });

  it("returns 502 when the model does not call the insight tool", async () => {
    aiContent = [{ type: "text", text: "Here is a plain prose reply." }];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI response format invalid");
  });

  it("returns 502 when the tool output fails response-schema validation", async () => {
    // `observations` must be an array of non-empty strings; empty summary fails.
    aiContent = [insightToolBlock({ summary: "", observations: [] })];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI response format invalid");
  });

  it("returns a clear 502 / RESPONSE_TRUNCATED when stop_reason is max_tokens", async () => {
    // When the model hits max_tokens it still emits a tool_use block, but
    // the JSON in `input` is truncated mid-object — schema validation would
    // otherwise hide this behind the generic "format invalid" message.
    aiStopReason = "max_tokens";
    aiContent = [
      insightToolBlock({
        summary: "Comparison against the previous month shows",
        // observations field never finished streaming
      }),
    ];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("RESPONSE_TRUNCATED");
    expect(body.error).toMatch(/cut off/i);
  });

  it("requests enough tokens to fit a comparison summary", async () => {
    aiContent = [
      insightToolBlock({
        summary: "ok",
        observations: ["ok"],
      }),
    ];

    const { POST } = await import("@/app/api/analytics/insights/route");
    await POST(makeRequest(validBody()));

    expect(messagesCreateCalls).toHaveLength(1);
    const params = messagesCreateCalls[0] as { max_tokens: number };
    // 1024 truncates comparison output mid-JSON when priorAssessments is
    // included; the cap needs enough headroom for the full tool response.
    expect(params.max_tokens).toBeGreaterThanOrEqual(2048);
  });

  it("returns a generic 502 when the model call throws an unmapped error", async () => {
    aiThrows = new Error("anthropic 529 overloaded SECRET_TRACE_ID=xyz");

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to generate insights");
    // Raw provider error detail must not leak to the client.
    expect(JSON.stringify(body)).not.toContain("SECRET_TRACE_ID");
  });
});
