/**
 * Tests for POST /api/ai/medicine-search — AI pharmaceutical lookup.
 *
 * Strategy mirrors src/app/api/ai/parse/route.test.ts: withAuth is a
 * pass-through HOF, the Claude client and usage tracker are mocked, and the
 * route module is imported dynamically after the mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

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

/** A minimal valid medicine_search_result tool input. The route's Zod schema
 *  applies defaults, so an empty object is actually valid. */
function fullToolInput(overrides: Record<string, unknown> = {}) {
  return {
    brandNames: ["Lipitor"],
    localAlternatives: [],
    genericName: "atorvastatin",
    dosageStrengths: ["10 mg", "20 mg"],
    activeIngredients: ["Atorvastatin"],
    strengthOptions: [{ label: "10 mg", compounds: [{ name: "Atorvastatin", strength: 10 }] }],
    commonIndications: ["high cholesterol"],
    foodInstruction: "none",
    pillColor: "white",
    pillShape: "oval",
    pillDescription: "white oval tablet",
    drugClass: "statin",
    contraindications: [],
    warnings: [],
    isGenericFallback: false,
    ...overrides,
  };
}

function toolResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "medicine_search_result", id: "t1", input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/medicine-search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ai/medicine-search", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: valid tool result → 200 with parsed body", async () => {
    messagesCreate.mockResolvedValueOnce(toolResponse(fullToolInput()));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "atorvastatin" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      genericName: string;
      brandNames: string[];
      foodInstruction: string;
      strengthOptions: { label: string }[];
    };
    expect(body.genericName).toBe("atorvastatin");
    expect(body.brandNames).toEqual(["Lipitor"]);
    expect(body.foodInstruction).toBe("none");
    expect(body.strengthOptions[0]?.label).toBe("10 mg");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("happy path: country is accepted and request still succeeds", async () => {
    messagesCreate.mockResolvedValueOnce(toolResponse(fullToolInput()));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "paracetamol", country: "South Africa" }));

    expect(res.status).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    // The country must reach the prompt sent to Claude.
    const promptArg = messagesCreate.mock.calls[0]?.[0] as {
      messages: { content: string }[];
    };
    expect(promptArg.messages[0]?.content).toContain("South Africa");
  });

  it("Zod defaults: a sparse tool result is filled in, not rejected", async () => {
    // The response schema gives every field a default, so {} validates.
    messagesCreate.mockResolvedValueOnce(toolResponse({}));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "ibuprofen" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      brandNames: string[];
      genericName: string;
      foodInstruction: string;
      isGenericFallback: boolean;
    };
    expect(body.brandNames).toEqual([]);
    expect(body.genericName).toBe("");
    expect(body.foodInstruction).toBe("none");
    expect(body.isGenericFallback).toBe(false);
  });

  it("input validation: empty query → 400, AI never called", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "" }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: query over 200-char .max() → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "x".repeat(201) }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("input validation: missing query field → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ country: "UK" }));

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("AI-failure: messages.create throws → graceful 502", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("upstream exploded"));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "aspirin" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to process request");
  });

  it("AI-failure: no tool_use block → 422 fallbackToManual", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "prose only, no tool call" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "aspirin" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
  });

  it("AI-failure: tool result violates schema (bad foodInstruction enum) → 422", async () => {
    messagesCreate.mockResolvedValueOnce(
      toolResponse(fullToolInput({ foodInstruction: "sometimes" })),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "aspirin" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; fallbackToManual: boolean };
    expect(body.error).toBe("AI response format invalid");
    expect(body.fallbackToManual).toBe(true);
  });
});
