/**
 * Tests for POST /api/ai/titration-warnings — the route handler.
 *
 * Strategy mirrors voice-parse/route.test.ts: pass-through withAuth, a
 * controllable mocked Anthropic client, and a no-op usage-tracker. Covers the
 * happy path, input validation (empty prescriptions / over-long title), the
 * AI-format failure, and the AI-throws path.
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
    content: [{ type: "tool_use", name: "titration_warnings_result", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/titration-warnings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  prescriptions: [
    {
      genericName: "sertraline",
      currentDosage: "50mg",
      newTotalDaily: "100mg",
      frequency: "once daily",
    },
  ],
};

describe("titration-warnings route handler", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: returns 200 with the warnings list from the tool output", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        warnings: [
          "Watch for increased anxiety in the first week.",
          "Report any worsening insomnia.",
        ],
      }),
    );

    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { warnings: string[] };
    expect(body.warnings).toHaveLength(2);
    expect(body.warnings[0]).toContain("anxiety");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("happy path: includes an optional title and otherMedications without error", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ warnings: ["Stay hydrated."] }));

    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(
      makeRequest({
        ...validBody,
        title: "Spring titration plan",
        otherMedications: [{ genericName: "metformin" }],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { warnings: string[] };
    expect(body.warnings).toEqual(["Stay hydrated."]);
  });

  it("rejects an empty prescriptions array with 400 (min(1))", async () => {
    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest({ prescriptions: [] }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("rejects a title over the 200-char .max() with 400", async () => {
    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest({ ...validBody, title: "t".repeat(201) }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when the model returns no tool_use block", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "no tool" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI service unavailable");
  });

  it("returns 502 when the tool output fails response-schema validation", async () => {
    // `warnings` should be an array of strings.
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ warnings: "not an array" }));

    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI service unavailable");
  });

  it("AI-failure path: a thrown error from Claude yields a graceful 500, not a crash", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("@/app/api/ai/titration-warnings/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to generate warnings");
  });
});
