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
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
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

/** The client's clock every request carries: 2026-09-30 14:00 in Johannesburg. */
const NOW = {
  localDateTime: "2026-09-30T14:00",
  timeZone: "Africa/Johannesburg",
  utcOffsetMinutes: 120,
};

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
    const res = await POST(makeRequest({ now: NOW, transcript: "drank a glass of water, BP 120 over 80" }));

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
    const res = await POST(makeRequest({ now: NOW, transcript }));

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
    const res = await POST(makeRequest({ now: NOW, transcript: "y".repeat(3000) }));

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
    const res = await POST(makeRequest({ now: NOW, transcript: "x".repeat(8001) }));

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
    const res = await POST(makeRequest({ now: NOW, transcript: "water and a coffee" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; dropped?: number };
    expect(body.items).toHaveLength(1);
    expect(body.dropped).toBe(1);
  });

  it("rejects an empty transcript with 400 (min(1))", async () => {
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when the tool output has no usable items", async () => {
    // items present but every one fails Zod validation.
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ items: [{ kind: "blood_pressure" }] }),
    );

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "garbled audio" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI response format invalid");
  });

  it("AI-failure path: a thrown error from Claude yields a graceful 502, not a crash", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "had some water" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to parse transcript");
  });

  it("returns 504 when the Claude request times out", async () => {
    // The real SDK error: its `name` is plain "Error", so a name check never
    // matched and a timeout fell through to the generic 502.
    messagesCreate.mockRejectedValueOnce(new APIConnectionTimeoutError());

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "had some water" }));

    expect(res.status).toBe(504);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("AI_TIMEOUT");
  });

  // ai-routes-models#19: the route branches on stop_reason via the shared
  // claude-call helpers instead of treating every non-tool reply as bad format.
  it("maps a refusal to 422 AI_REFUSED without retrying", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [],
      stop_reason: "refusal",
      stop_details: { category: "cyber" },
      usage: { input_tokens: 10, output_tokens: 1 },
    });

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "had some water" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("AI_REFUSED");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("retries a max_tokens cut-off with a larger budget", async () => {
    messagesCreate
      .mockResolvedValueOnce({
        content: [],
        stop_reason: "max_tokens",
        usage: { input_tokens: 10, output_tokens: 4096 },
      })
      .mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));

    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "had some water" }));

    expect(res.status).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    const first = messagesCreate.mock.calls[0]![0] as { max_tokens: number };
    const second = messagesCreate.mock.calls[1]![0] as { max_tokens: number };
    expect(second.max_tokens).toBeGreaterThan(first.max_tokens);
  });

  it("does not let the SDK retry a timed-out call more than once", async () => {
    // The SDK default of 2 retries turned a 60 s budget into ~180 s of waiting.
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    await POST(makeRequest({ now: NOW, transcript: "had some water" }));

    const options = messagesCreate.mock.calls[0]![1] as { maxRetries?: number };
    expect(options.maxRetries).toBeDefined();
    expect(options.maxRetries).toBeLessThanOrEqual(1);
  });
});

// ai-routes-models#21: the limiter is keyed on the signed-in user, so rotating
// x-forwarded-for does not reset the cap on someone's (possibly shared) key.
describe("voice-parse rate limit", () => {
  it("counts every request from one user whatever IP it claims", async () => {
    vi.resetModules();
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");

    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const req = new NextRequest("https://example.test/api/ai/voice-parse", {
        method: "POST",
        body: JSON.stringify({ now: NOW, transcript: "water" }),
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}` },
      });
      statuses.push((await POST(req)).status);
    }

    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

// Its own module instance: the route's rate limiter is per module, and the
// handler suite above already spends most of one window.
describe("voice-parse spoken times", () => {
  beforeAll(() => {
    vi.resetModules();
  });
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  const sentence =
    "I had a beer yesterday evening at 8pm, a bagel right now and 100mls of water an hour ago";

  it("tells the model the client's local time, zone and yesterday's date", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 100 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: sentence }));

    expect(res.status).toBe(200);
    const sent = messagesCreate.mock.calls[0]![0] as {
      system: string;
      tool_choice?: unknown;
      messages: { role: string; content: string }[];
    };
    expect(sent.messages).toHaveLength(1);
    const content = sent.messages[0]!.content;
    expect(content).toContain(
      "Current local time: Wednesday 2026-09-30 14:00 (Africa/Johannesburg, UTC+02:00). Yesterday was Tuesday 2026-09-29.",
    );
    expect(content).toContain(sentence);
    // The prompt carries the defaults for vague words and the null rule.
    expect(sent.system).toContain("evening 19:00");
    expect(sent.system).toContain("when: null");
    // Claude Sonnet 5.5 rejects a forced tool_choice: the first turn never forces.
    expect(sent.tool_choice).toBeUndefined();
  });

  it("works out yesterday across a month end, and a zone west of UTC", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 100 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    await POST(
      makeRequest({
        transcript: "water",
        now: {
          localDateTime: "2026-03-01T00:20",
          timeZone: "America/St_Johns",
          utcOffsetMinutes: -210,
        },
      }),
    );
    const sent = messagesCreate.mock.calls[0]![0] as { messages: { content: string }[] };
    expect(sent.messages[0]!.content).toContain(
      "Current local time: Sunday 2026-03-01 00:20 (America/St_Johns, UTC-03:30). Yesterday was Saturday 2026-02-28.",
    );
  });

  it("sends nothing about the device beyond the clock", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 100 }] }));
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    await POST(
      makeRequest({
        now: { ...NOW, deviceId: "pixel-9", locale: "en-ZA" },
        transcript: "water, call me on 082 555 0199 or ryan@example.test",
        userAgent: "Mozilla/5.0",
      }),
    );
    const sent = JSON.stringify(messagesCreate.mock.calls[0]![0]);
    expect(sent).not.toContain("pixel-9");
    expect(sent).not.toContain("en-ZA");
    expect(sent).not.toContain("Mozilla");
    // The transcript is still sanitised.
    expect(sent).not.toContain("ryan@example.test");
  });

  it("returns each item's validated time", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        items: [
          {
            kind: "alcohol",
            description: "beer",
            abvPercent: 5,
            volumeMl: 330,
            when: { kind: "absolute", localDateTime: "2026-09-29T20:00" },
          },
          { kind: "food", description: "bagel", when: null },
          { kind: "water", ml: 100, when: { kind: "relative", minutesAgo: 60 } },
        ],
      }),
    );
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: sentence }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[]; dropped?: number };
    expect(body.items).toHaveLength(3);
    expect(body.items[0]!.when).toEqual({ kind: "absolute", localDateTime: "2026-09-29T20:00" });
    expect(body.items[1]).not.toHaveProperty("when");
    expect(body.items[2]!.when).toEqual({ kind: "relative", minutesAgo: 60 });
    expect(body.dropped).toBeUndefined();
  });

  it("keeps an item whose time is nonsense, without the time", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        items: [
          { kind: "water", ml: 100, when: { kind: "absolute", localDateTime: "last Tuesday" } },
          { kind: "water", ml: 200, when: { kind: "relative", minutesAgo: -15 } },
          { kind: "water", ml: 300, when: "20:00" },
        ],
      }),
    );
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    const res = await POST(makeRequest({ now: NOW, transcript: "water three times" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[]; dropped?: number };
    expect(body.items).toEqual([
      { kind: "water", ml: 100 },
      { kind: "water", ml: 200 },
      { kind: "water", ml: 300 },
    ]);
    expect(body.dropped).toBeUndefined();
  });

  describe("a cached client that sends no clock", () => {
    it("still returns 200 with the items", async () => {
      messagesCreate.mockResolvedValueOnce(
        toolUseResponse({
          items: [
            { kind: "water", ml: 250 },
            { kind: "blood_pressure", systolic: 120, diastolic: 80 },
          ],
        }),
      );
      const { POST } = await import("@/app/api/ai/voice-parse/route");
      // Exactly what the client sent before the clock existed.
      const res = await POST(makeRequest({ transcript: "a glass of water, BP 120 over 80" }));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Record<string, unknown>[] };
      expect(body.items).toEqual([
        { kind: "water", ml: 250 },
        { kind: "blood_pressure", systolic: 120, diastolic: 80 },
      ]);
    });

    it("states no current time and asks for relative times only", async () => {
      messagesCreate.mockResolvedValueOnce(toolUseResponse({ items: [{ kind: "water", ml: 250 }] }));
      const { POST } = await import("@/app/api/ai/voice-parse/route");
      await POST(makeRequest({ transcript: "water an hour ago" }));

      const sent = messagesCreate.mock.calls[0]![0] as {
        tool_choice?: unknown;
        messages: { content: string }[];
      };
      const content = sent.messages[0]!.content;
      expect(content).not.toContain("Current local time");
      expect(content).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(content).not.toContain("Yesterday was");
      expect(content).toContain("The current local date and time are not known");
      expect(content).toContain('Return "when" only as {"kind": "relative", "minutesAgo": N}');
      expect(content).toContain("Do not return an absolute date-time.");
      expect(content).toContain("water an hour ago");
      expect(sent.tool_choice).toBeUndefined();
    });

    it("strips an absolute time the model returned anyway, and keeps a relative one", async () => {
      messagesCreate.mockResolvedValueOnce(
        toolUseResponse({
          items: [
            {
              kind: "alcohol",
              description: "beer",
              abvPercent: 5,
              volumeMl: 330,
              when: { kind: "absolute", localDateTime: "2026-09-29T20:00" },
            },
            { kind: "water", ml: 100, when: { kind: "relative", minutesAgo: 60 } },
          ],
        }),
      );
      const { POST } = await import("@/app/api/ai/voice-parse/route");
      const res = await POST(makeRequest({ transcript: "a beer yesterday at 8pm, water an hour ago" }));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Record<string, unknown>[]; dropped?: number };
      expect(body.items).toEqual([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 330 },
        { kind: "water", ml: 100, when: { kind: "relative", minutesAgo: 60 } },
      ]);
      expect(body.dropped).toBeUndefined();
    });
  });

  it("rejects a request with a malformed clock, without calling the model", async () => {
    const { POST } = await import("@/app/api/ai/voice-parse/route");
    for (const body of [
      { transcript: "water", now: { localDateTime: NOW.localDateTime } },
      { transcript: "water", now: { ...NOW, timeZone: "Not/A_Zone" } },
      { transcript: "water", now: { ...NOW, localDateTime: "2026-09-30T14:00Z" } },
      { transcript: "water", now: { ...NOW, utcOffsetMinutes: 5000 } },
    ]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    }
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
