/**
 * Tests for POST /api/ai/interaction-check — the route handler.
 *
 * Strategy mirrors voice-parse/route.test.ts: pass-through withAuth, a
 * controllable mocked Anthropic client, and a no-op usage-tracker. Covers the
 * happy path, discriminated-union input validation, the AI-format failure
 * (no tool_use block / bad tool output), and the AI-throws path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

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

const messagesCreate = vi.fn();

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  CLAUDE_MODELS: {
    fast: "claude-haiku-test",
    quality: "claude-sonnet-test",
    premium: "claude-opus-test",
  },
  getClaudeClientForUser: vi.fn(async () => ({
    client: { messages: { create: messagesCreate } },
    resolved: { apiKey: "sk-test", source: "env_var", keyOwnerId: null },
  })),
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: vi.fn(),
  tokensFromAnthropic: vi.fn(() => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
  })),
}));

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "interaction_check_result", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

// The route's in-process rate limiter is keyed on the user, so every test
// here shares one bucket. beforeEach resets the module registry, handing
// each test a fresh route module (and limiter). Distinct IPs stay so the
// rate-limit test can show rotating x-forwarded-for doesn't dodge it.
let ipCounter = 0;
function makeRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("https://example.test/api/ai/interaction-check", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
  });
}

const lookupBody = {
  mode: "lookup",
  substance: "coffee",
  activePrescriptions: [{ genericName: "lisinopril" }],
};

const okResult = {
  interactions: [
    { substance: "coffee", medication: "lisinopril", severity: "OK", description: "Fine." },
  ],
  drugClass: "",
  summary: "No issue.",
};

describe("interaction-check route handler", () => {
  beforeEach(() => {
    vi.resetModules();
    messagesCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path (conflict mode): returns 200 with validated interaction analysis", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        interactions: [
          {
            substance: "ibuprofen",
            medication: "lisinopril",
            severity: "CAUTION",
            description: "NSAIDs may reduce the antihypertensive effect.",
          },
        ],
        drugClass: "NSAID",
        summary: "Use with caution.",
      }),
    );

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "conflict",
        newMedication: "ibuprofen",
        activePrescriptions: [{ genericName: "lisinopril", drugClass: "ACE inhibitor" }],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      interactions: { severity: string }[];
      drugClass?: string;
      summary?: string;
    };
    expect(body.interactions).toHaveLength(1);
    expect(body.interactions[0]!.severity).toBe("CAUTION");
    expect(body.drugClass).toBe("NSAID");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("happy path (lookup mode): returns 200 with the analysis", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        interactions: [
          {
            substance: "grapefruit",
            medication: "atorvastatin",
            severity: "AVOID",
            description: "Grapefruit raises statin levels.",
          },
        ],
        drugClass: "Food",
        summary: "Avoid grapefruit.",
      }),
    );

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "lookup",
        substance: "grapefruit",
        activePrescriptions: [{ genericName: "atorvastatin" }],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { interactions: { severity: string }[] };
    expect(body.interactions[0]!.severity).toBe("AVOID");
  });

  it("adds a 'Not assessed' row for any requested medication the model skipped", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        interactions: [
          {
            substance: "St John's Wort",
            medication: "Bisoprolol (Concor)",
            severity: "OK",
            description: "No significant interaction.",
          },
        ],
        drugClass: "Herbal",
        summary: "No significant interactions.",
      }),
    );

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "lookup",
        substance: "St John's Wort",
        activePrescriptions: [
          { genericName: "bisoprolol" },
          { genericName: "Sertraline" },
          { genericName: "sertraline" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      interactions: { medication: string; severity: string; description: string }[];
    };
    // bisoprolol matched case-insensitively; sertraline (listed twice) was
    // skipped, so exactly one non-OK placeholder row is added for it.
    expect(body.interactions).toHaveLength(2);
    const gap = body.interactions[1]!;
    expect(gap.medication).toBe("Sertraline");
    expect(gap.severity).toBe("CAUTION");
    expect(gap.description).toMatch(/Not assessed/);
  });

  it("rejects an invalid mode with 400 (discriminated union has no match)", async () => {
    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "nonsense",
        substance: "x",
        activePrescriptions: [{ genericName: "lisinopril" }],
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty activePrescriptions array with 400 (min(1))", async () => {
    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({ mode: "lookup", substance: "coffee", activePrescriptions: [] }),
    );

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when the model returns no tool_use block, even after the retry", async () => {
    const prose = {
      content: [{ type: "text", text: "I cannot use a tool right now." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    messagesCreate.mockResolvedValueOnce(prose).mockResolvedValueOnce(prose);

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "lookup",
        substance: "coffee",
        activePrescriptions: [{ genericName: "lisinopril" }],
      }),
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI service unavailable");
  });

  it("returns 502 when the tool output fails response-schema validation", async () => {
    // `severity` is not one of AVOID/CAUTION/OK.
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        interactions: [
          {
            substance: "coffee",
            medication: "lisinopril",
            severity: "MAYBE",
            description: "?",
          },
        ],
      }),
    );

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "lookup",
        substance: "coffee",
        activePrescriptions: [{ genericName: "lisinopril" }],
      }),
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI service unavailable");
  });

  it("request: auto tool_choice, a strict result tool and explicit effort (Opus 5.5 400s on a forced tool)", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    await POST(makeRequest(lookupBody));

    const params = messagesCreate.mock.calls[0]?.[0] as {
      tool_choice?: { type: string };
      tools: { name: string; strict?: boolean }[];
      output_config?: { effort: string };
    };
    expect(params.tool_choice?.type ?? "auto").toBe("auto");
    expect(params.tools[0]?.strict).toBe(true);
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("temperature");
  });

  it("retry: a prose first turn gets one unforced retry that recovers", async () => {
    messagesCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Checking." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(makeRequest(lookupBody));

    expect(res.status).toBe(200);
    const retry = messagesCreate.mock.calls[1]?.[0] as { tool_choice: { type: string } };
    expect(retry.tool_choice).toEqual({ type: "auto" });
  });

  it("refusal: stop_reason refusal → 422 AI_REFUSED, not 'AI service unavailable'", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "bio", explanation: null },
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(makeRequest(lookupBody));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("AI_REFUSED");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("rate limit: keyed on the user, so rotating x-forwarded-for doesn't reset it", async () => {
    messagesCreate.mockResolvedValue(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const statuses: number[] = [];
    // makeRequest hands every request a fresh IP.
    for (let i = 0; i < 6; i++) statuses.push((await POST(makeRequest(lookupBody))).status);

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("AI-failure path: a thrown error from Claude yields a graceful 500, not a crash", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("@/app/api/ai/interaction-check/route");
    const res = await POST(
      makeRequest({
        mode: "lookup",
        substance: "coffee",
        activePrescriptions: [{ genericName: "lisinopril" }],
      }),
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to check interactions");
  });
});

describe("withUnassessedMedications", () => {
  it("flags a skipped medication whose name has no ASCII letters", async () => {
    const { withUnassessedMedications } = await import(
      "@intake/ai-prompts/interaction-check"
    );
    const rows = withUnassessedMedications(
      [
        {
          substance: "grapefruit",
          medication: "Amlodipine",
          severity: "CAUTION" as const,
          description: "CYP3A4.",
        },
      ],
      ["Amlodipine", "ワルファリン"],
      "grapefruit",
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ medication: "ワルファリン", severity: "CAUTION" });
  });

  it("matches a returned non-ASCII name to the requested one", async () => {
    const { withUnassessedMedications } = await import(
      "@intake/ai-prompts/interaction-check"
    );
    const rows = withUnassessedMedications(
      [
        {
          substance: "grapefruit",
          medication: "Warfarin (ワルファリン)",
          severity: "AVOID" as const,
          description: "Bleeding.",
        },
      ],
      ["ワルファリン"],
      "grapefruit",
    );

    expect(rows).toHaveLength(1);
  });
});
