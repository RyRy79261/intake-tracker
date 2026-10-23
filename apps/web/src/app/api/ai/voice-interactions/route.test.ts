/**
 * Tests for POST /api/ai/voice-interactions — the route handler.
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
    content: [{ type: "tool_use", name: "voice_interactions_result", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/voice-interactions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  transcript: "Look up the interactions of sudo fed rin and Nurofen",
  medications: ["Bisoprolol", "Furosemide"],
};

const sub = (heard: string, name: string, brand = "", unsure = false) => ({ heard, name, brand, unsure });

describe("voice-interactions route handler", () => {
  beforeEach(() => {
    vi.resetModules();
    messagesCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the corrected names, with a brand only when one was said", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        substances: [sub("sudo fed rin", "Pseudoephedrine", "", true), sub("Nurofen", "Ibuprofen", "Nurofen")],
        note: "",
      }),
    );
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      substances: [
        { heard: "sudo fed rin", name: "Pseudoephedrine", unsure: true },
        { heard: "Nurofen", name: "Ibuprofen", brand: "Nurofen", unsure: false },
      ],
    });
  });

  it("sends the user's medicines and the transcript to the model", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ substances: [], note: "" }));
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    await POST(makeRequest(validBody));

    const params = messagesCreate.mock.calls[0]?.[0] as { messages: { content: unknown }[] };
    const user = JSON.stringify(params.messages[0]?.content);
    expect(user).toContain("Bisoprolol");
    expect(user).toContain("sudo fed rin");
  });

  it("drops a repeated name and cuts the list at five", async () => {
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({
        substances: [sub("a", "A"), sub("a again", "a"), ...names.slice(1).map((n) => sub(n, n))],
        note: "",
      }),
    );
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const body = (await (await POST(makeRequest(validBody))).json()) as {
      substances: { name: string }[];
      overCap?: number;
    };

    expect(body.substances.map((s) => s.name)).toEqual(["A", "B", "C", "D", "E"]);
    expect(body.overCap).toBe(2);
  });

  it("an empty list (a general question) keeps its note", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ substances: [], note: "You named no medicine." }),
    );
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const body = await (await POST(makeRequest(validBody))).json();

    expect(body).toEqual({ substances: [], note: "You named no medicine." });
  });

  it("capitalises names and drops the user's own medicine when something else was named", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse({ substances: [sub("alcohol", "alcohol"), sub("bisso thing", "bisoprolol")], note: "" }),
    );
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const body = (await (await POST(makeRequest({ transcript: "Can I mix alcohol and bisso?", medications: ["Bisoprolol"] }))).json()) as {
      substances: { name: string }[];
    };

    expect(body.substances.map((s) => s.name)).toEqual(["Alcohol"]);
  });

  it("keeps the user's own medicine when it is the only thing named", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ substances: [sub("bisoprolol", "Bisoprolol")], note: "" }));
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const body = (await (await POST(makeRequest({ transcript: "Interactions of bisoprolol", medications: ["Bisoprolol"] }))).json()) as {
      substances: { name: string }[];
    };

    expect(body.substances.map((s) => s.name)).toEqual(["Bisoprolol"]);
  });

  it("rejects an empty transcript with 400", async () => {
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const res = await POST(makeRequest({ transcript: "" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when the tool output is malformed", async () => {
    messagesCreate.mockResolvedValueOnce(toolUseResponse({ substances: "pseudoephedrine" }));
    const { POST } = await import("@/app/api/ai/voice-interactions/route");
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(502);
  });
});
