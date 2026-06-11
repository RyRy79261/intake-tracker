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

// The route's in-process rate limiter (5 req/IP/min) keeps module-level
// state that survives across tests in this file. Hand each request a
// unique IP so the limiter never trips and tests stay independent.
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

describe("interaction-check route handler", () => {
  beforeEach(() => {
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

  it("returns 502 when the model returns no tool_use block", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot use a tool right now." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

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
