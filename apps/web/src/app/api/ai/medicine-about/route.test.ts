/**
 * Tests for POST /api/ai/medicine-about — the route handler.
 *
 * Mirrors interaction-check/route.test.ts: pass-through withAuth, a
 * controllable mocked Anthropic client, and a no-op usage-tracker. Covers the
 * happy path, input validation, sanitising, the AI-format failures, the
 * request parameters, retry, refusal, rate limit and the AI-throws path.
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
    content: [{ type: "tool_use", name: "medicine_about_result", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

// beforeEach resets the module registry, handing each test a fresh route
// module (and rate limiter). Distinct IPs show the limiter is user-keyed.
let ipCounter = 0;
function makeRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("https://example.test/api/ai/medicine-about", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.1.${ipCounter}`,
    },
  });
}

const okResult = {
  drugClass: "ACE inhibitor (a medicine that makes blood vessels wider).",
  compounds: [
    {
      name: "Ramipril",
      drugClass: "ACE inhibitor (a medicine that makes blood vessels wider)",
      forText: "High blood pressure and heart failure.",
      howItWorks: "It relaxes your blood vessels. Your blood pressure goes down.",
      sideEffects: ["Dry cough", "Dizziness"],
    },
  ],
  warnings: [{ risk: "Your face or throat can swell.", whatToDo: "Get emergency help immediately." }],
  contraindications: ["Do not take it if you are pregnant."],
  foodInstruction: "none",
  foodNote: "You can take it with or without food.",
  pillDescription: "Capsule or tablet.",
  visualIdentification: "",
};

describe("medicine-about route handler", () => {
  beforeEach(() => {
    vi.resetModules();
    messagesCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: returns 200 with the validated information", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof okResult;
    expect(body.compounds).toHaveLength(1);
    expect(body.compounds[0]!.sideEffects).toEqual(["Dry cough", "Dizziness"]);
    expect(body.warnings[0]!.whatToDo).toMatch(/emergency/);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("sends the name and the compound names only", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    await POST(
      makeRequest({
        genericName: "Sacubitril/Valsartan",
        compounds: ["Sacubitril", "Valsartan"],
      }),
    );

    const params = messagesCreate.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const content = params.messages[0]!.content;
    expect(content).toContain("Medicine: Sacubitril/Valsartan");
    expect(content).toContain("Active ingredients: Sacubitril, Valsartan");
  });

  it("strips PII from the name before it reaches the model", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    await POST(makeRequest({ genericName: "Ramipril for jane.doe@example.com" }));

    const params = messagesCreate.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(params.messages[0]!.content).not.toContain("jane.doe@example.com");
  });

  it("fills missing optional fields with defaults", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ drugClass: "Diuretic (a water pill).", compounds: [{ name: "Furosemide" }] }),
    );

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Furosemide" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof okResult;
    expect(body.compounds[0]).toEqual({
      name: "Furosemide",
      drugClass: "",
      forText: "",
      howItWorks: "",
      sideEffects: [],
    });
    expect(body.warnings).toEqual([]);
    expect(body.foodInstruction).toBe("none");
  });

  it("rejects a missing or blank name with 400", async () => {
    const { POST } = await import("@/app/api/ai/medicine-about/route");
    expect((await POST(makeRequest({}))).status).toBe(400);
    expect((await POST(makeRequest({ genericName: "   " }))).status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 404 NOT_FOUND when the model has nothing for the name", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ ...okResult, drugClass: "", compounds: [] }),
    );

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Notamedicine" }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 502 when the model returns no tool_use block, even after the retry", async () => {
    const prose = {
      content: [{ type: "text", text: "I cannot use a tool right now." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    messagesCreate.mockResolvedValueOnce(prose).mockResolvedValueOnce(prose);

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI service unavailable");
  });

  it("returns 502 when the tool output fails response-schema validation", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ ...okResult, foodInstruction: "with lunch" }),
    );

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(502);
  });

  it("request: premium model, auto tool_choice, a strict result tool and explicit effort", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    await POST(makeRequest({ genericName: "Ramipril" }));

    const params = messagesCreate.mock.calls[0]?.[0] as {
      model: string;
      tool_choice?: { type: string };
      tools: { name: string; strict?: boolean }[];
      output_config?: { effort: string };
    };
    expect(params.model).toBe("claude-opus-test");
    expect(params.tool_choice?.type ?? "auto").toBe("auto");
    expect(params.tools).toHaveLength(1);
    expect(params.tools[0]?.name).toBe("medicine_about_result");
    expect(params.tools[0]?.strict).toBe(true);
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("temperature");
  });

  it("retry: a prose first turn gets one unforced retry that recovers", async () => {
    messagesCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Looking." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(200);
    const retry = messagesCreate.mock.calls[1]?.[0] as { tool_choice: { type: string } };
    expect(retry.tool_choice).toEqual({ type: "auto" });
  });

  it("refusal: stop_reason refusal → 422 AI_REFUSED", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "bio", explanation: null },
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("AI_REFUSED");
  });

  it("rate limit: keyed on the user, so rotating x-forwarded-for doesn't reset it", async () => {
    messagesCreate.mockResolvedValue(toolUseResponse(okResult));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await POST(makeRequest({ genericName: "Ramipril" }))).status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("AI-failure path: a thrown error from Claude yields a graceful 500", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("@/app/api/ai/medicine-about/route");
    const res = await POST(makeRequest({ genericName: "Ramipril" }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to look up the medicine");
  });
});
