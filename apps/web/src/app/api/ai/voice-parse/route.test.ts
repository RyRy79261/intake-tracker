/**
 * Tests for POST /api/ai/voice-parse — the route HANDLER.
 *
 * The pure extraction logic (extractVoiceItems / PARSE_TOOL) is covered by
 * schema.test.ts. Here we exercise the handler: auth pass-through, input
 * validation, the happy path (mocked Claude tool_use → 200 + items), and the
 * AI-failure path (Claude throws → graceful 502, not a crash).
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through HOF
 *     injecting a fixed auth context.
 *   - Mock @/app/api/ai/_shared/claude-client so getClaudeClientForUser
 *     returns a stub Anthropic client whose messages.create is controllable
 *     per test (the route believes a key is configured).
 *   - Mock the usage-tracker so recordUsage never touches the DB.
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";

// withAuth → pass-through HOF injecting a fixed authenticated context.
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

// Controllable Anthropic client stub.
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

// Usage tracking must not hit the DB.
vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: vi.fn(),
  tokensFromAnthropic: vi.fn(() => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
  })),
}));

/** Build an Anthropic-shaped Message whose content contains a tool_use block. */
function toolUseResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "parse_voice_log", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/voice-parse", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("voice-parse route handler", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: returns 200 with the extracted items from the tool output", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        items: [
          { kind: "water", ml: 250 },
          { kind: "blood_pressure", systolic: 120, diastolic: 80, heartRate: 70 },
        ],
        reasoning: "extracted two items",
      }),
    );

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "drank a glass of water, BP 120 over 80" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { kind: string }[];
      reasoning?: string;
    };
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i) => i.kind)).toEqual(["water", "blood_pressure"]);
    expect(body.reasoning).toBe("extracted two items");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("sends a transcript longer than 500 chars to the model intact", async () => {
    // sanitizeForAI used to hard-cut every input to 500 chars, so anything
    // said after ~30 s of dictation was never parsed.
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
    const transcript = "water ".repeat(250).trim(); // ~1500 chars
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript }));

    expect(res.status).toBe(200);
    const sent = messagesCreate.mock.calls[0]![0] as {
      messages: { content: string }[];
    };
    expect(sent.messages[0]!.content).toContain(transcript);
    const body = (await res.json()) as { transcriptTruncated?: boolean };
    expect(body.transcriptTruncated).toBeUndefined();
  });

  it("parses the first 2000 chars of an over-long transcript and says so", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "y".repeat(3000) }));

    expect(res.status).toBe(200);
    const sent = messagesCreate.mock.calls[0]![0] as {
      messages: { content: string }[];
    };
    expect(sent.messages[0]!.content).toContain("y".repeat(2000));
    expect(sent.messages[0]!.content).not.toContain("y".repeat(2001));
    const body = (await res.json()) as { transcriptTruncated?: boolean };
    expect(body.transcriptTruncated).toBe(true);
  });

  it("rejects an absurdly long transcript with 400", async () => {
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "x".repeat(8001) }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    // The AI must never be called for an invalid request.
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns how many items were dropped as malformed", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        items: [
          { kind: "water", ml: 250 },
          // caffeine without caffeineMg fails validation.
          { kind: "caffeine", description: "coffee" },
        ],
      }),
    );
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "water and a coffee" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; dropped?: number };
    expect(body.items).toHaveLength(1);
    expect(body.dropped).toBe(1);
  });

  it("rejects an empty transcript with 400 (min(1))", async () => {
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when the tool output has no usable items", async () => {
    // items present but every one fails Zod validation.
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ items: [{ kind: "blood_pressure" }] }),
    );

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "garbled audio" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI response format invalid");
  });

  it("AI-failure path: a thrown error from Claude yields a graceful 502, not a crash", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "had some water" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to parse transcript");
  });

  it("returns 504 when the Claude request times out", async () => {
    // The real SDK error: its `name` is plain "Error", so a name check never
    // matched and a timeout fell through to the generic 502.
    messagesCreate.mockRejectedValueOnce(new APIConnectionTimeoutError());

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ transcript: "had some water" }));

    expect(res.status).toBe(504);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI request timed out");
  });

  it("does not let the SDK retry a timed-out call more than once", async () => {
    // The SDK default of 2 retries turned a 60 s budget into ~180 s of waiting.
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    await POST(makeRequest({ transcript: "had some water" }));

    const options = messagesCreate.mock.calls[0]![1] as { maxRetries?: number };
    expect(options.maxRetries).toBeDefined();
    expect(options.maxRetries).toBeLessThanOrEqual(1);
  });
});
