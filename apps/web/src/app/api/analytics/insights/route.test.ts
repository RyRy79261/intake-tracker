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
/** Replies for successive calls; once it runs out, `aiContent` is used. */
let aiReplies: Array<{ content: unknown[]; stop_reason: string; stop_details?: unknown }> = [];
let aiStopReason: string = "tool_use";
let aiThrows: Error | null = null;
let claudeClientThrows: Error | null = null;
const messagesCreateCalls: unknown[] = [];

function resetState() {
  aiContent = [];
  aiReplies = [];
  aiStopReason = "tool_use";
  aiThrows = null;
  claudeClientThrows = null;
  messagesCreateCalls.length = 0;
}

let authUserId = "user-test";
let authUserCounter = 0;

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
        auth: { success: true, userId: authUserId, email: "test@example.test" },
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
            const next = aiReplies.shift();
            return {
              content: next ? next.content : aiContent,
              stop_reason: next ? next.stop_reason : aiStopReason,
              stop_details: next?.stop_details ?? null,
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
    // The limiter is keyed on the user (ai-routes-models#21) and is shared
    // across this file, so each test signs in as its own user.
    authUserId = `user-test-${++authUserCounter}`;
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

  it("returns 502 when the model does not call the insight tool on either turn", async () => {
    aiContent = [{ type: "text", text: "Here is a plain prose reply." }];
    aiStopReason = "end_turn";

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI response format invalid");
    // One unforced retry, then give up.
    expect(messagesCreateCalls).toHaveLength(2);
  });

  // Claude Sonnet 5.5 rejects a forced tool_choice (this route used to send
  // one), a sampling parameter and a disabled-thinking setting with a 400.
  it("request: tool_choice auto, a strict tool, explicit high effort, no sampling", async () => {
    aiContent = [insightToolBlock({ summary: "ok", observations: ["ok"] })];

    const { POST } = await import("@/app/api/analytics/insights/route");
    await POST(makeRequest(validBody()));

    const params = messagesCreateCalls[0] as Record<string, unknown>;
    expect(params.tool_choice).toEqual({ type: "auto" });
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params).not.toHaveProperty("top_k");
    expect(params).not.toHaveProperty("thinking");
    const tools = params.tools as Array<{
      name: string;
      strict?: boolean;
      input_schema: { properties: Record<string, unknown>; additionalProperties: unknown };
    }>;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("analytics_insight");
    expect(tools[0]!.strict).toBe(true);
    expect(tools[0]!.input_schema.additionalProperties).toBe(false);
    // Strict mode has no `maxItems`, which the deep tool's `sources` carries.
    expect(Object.keys(tools[0]!.input_schema.properties)).toEqual(["summary", "observations"]);
  });

  it("asks again on an unforced, append-only turn when the reply is prose", async () => {
    const prose = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Water averaged 1800 ml." },
    ];
    aiReplies = [{ content: prose, stop_reason: "end_turn" }];
    aiContent = [insightToolBlock({ summary: "ok", observations: ["ok"] })];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    expect(messagesCreateCalls).toHaveLength(2);
    const first = messagesCreateCalls[0] as Record<string, unknown>;
    const retry = messagesCreateCalls[1] as Record<string, unknown> & {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(retry.tool_choice).toEqual({ type: "auto" });
    expect(retry.output_config).toEqual({ effort: "high" });
    expect(retry.system).toBe(first.system);
    expect(retry.tools).toBe(first.tools);
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[0]).toBe((first.messages as unknown[])[0]);
    expect(retry.messages[1]!.role).toBe("assistant");
    expect(retry.messages[1]!.content).toBe(prose);
    expect(retry.messages[2]!.role).toBe("user");
  });

  it("returns a clean 422 / AI_REFUSED when the model declines, without retrying", async () => {
    aiReplies = [
      {
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "general_harms", explanation: null },
      },
    ];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("AI_REFUSED");
    expect(body.error).toBe("The AI declined to summarise this data.");
    expect(messagesCreateCalls).toHaveLength(1);
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
    expect(body.error).toMatch(/previous summary/i);
    // The shared call retried once with a larger budget before giving up.
    expect(messagesCreateCalls).toHaveLength(2);
    const [first, second] = messagesCreateCalls as Array<{ max_tokens: number }>;
    expect(second!.max_tokens).toBeGreaterThan(first!.max_tokens);
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

  it("redacts incidental PII from conditions and prior summaries before prompting", async () => {
    aiContent = [insightToolBlock({ summary: "ok", observations: ["ok"] })];

    const { POST } = await import("@/app/api/analytics/insights/route");
    const req = makeRequest(
      validBody({
        profile: { conditions: ["CKD stage 3 - Dr Smith 082-555-1234"] },
        priorAssessments: [
          {
            generatedAt: 1,
            rangeStart: 0,
            rangeEnd: 1,
            summary: "Sent to me@example.test last time.",
            observations: ["ok"],
          },
        ],
      }),
    );
    await POST(req);

    const params = messagesCreateCalls[0] as {
      messages: Array<{ content: string }>;
    };
    const prompt = params.messages[0]!.content;
    expect(prompt).toContain("CKD stage 3 - Dr Smith [phone]");
    expect(prompt).not.toContain("082-555-1234");
    expect(prompt).not.toContain("me@example.test");
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

  it("rate-limits per user, not per claimed IP (ai-routes-models#21)", async () => {
    aiThrows = new Error("not reached past the limiter");
    const { POST } = await import("@/app/api/analytics/insights/route");

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const req = makeRequest(validBody());
      req.headers.set("x-forwarded-for", `198.51.100.${i}`);
      statuses.push((await POST(req)).status);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
