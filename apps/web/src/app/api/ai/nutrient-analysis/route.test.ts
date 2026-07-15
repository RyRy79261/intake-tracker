/**
 * Tests for POST /api/ai/nutrient-analysis — AI nutrient-bias scan of the
 * user's food log.
 *
 * Strategy mirrors parse/route.test.ts: mock withAuth into a pass-through,
 * mock the Claude client factory so messages.create is a controllable
 * vi.fn(), no-op the usage tracker, and import the route after mocks.
 *
 * The request-cap tests pin the contract the client relies on: the card
 * clamps foods to MAX_FOOD_DESCRIPTION_CHARS / MAX_FOOD_GRAMS /
 * MAX_FOOD_ENTRIES before sending, so payloads at those bounds must pass
 * validation (a production bug shipped when the server capped descriptions
 * below what the client sent).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  MAX_FOOD_DESCRIPTION_CHARS,
  MAX_FOOD_ENTRIES,
} from "@intake/ai-prompts/nutrient-analysis";

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

/** Fake Anthropic Message with a report_nutrient_analysis tool_use block. */
function toolResponse(input: Record<string, unknown>) {
  return {
    content: [
      { type: "tool_use", name: "report_nutrient_analysis", id: "t1", input },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

const validResult = {
  summary: "Your log leans on potassium-rich foods.",
  findings: [
    {
      nutrient: "Potassium",
      status: "high",
      detail: "Bananas and potatoes appear daily.",
      exampleFoods: ["banana", "baked potato"],
    },
  ],
  caveats: ["Portions are missing for most entries."],
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/ai/nutrient-analysis", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const baseBody = {
  windowDays: 30,
  foods: [{ description: "banana" }, { description: "baked potato", grams: 200 }],
};

describe("POST /api/ai/nutrient-analysis", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: valid tool result → 200 with findings", async () => {
    messagesCreate.mockResolvedValueOnce(toolResponse(validResult));

    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(makeRequest(baseBody));

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof validResult;
    expect(body.summary).toBe(validResult.summary);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0]!.status).toBe("high");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("accepts a description at exactly the shared max length", async () => {
    messagesCreate.mockResolvedValueOnce(toolResponse(validResult));

    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        foods: [{ description: "x".repeat(MAX_FOOD_DESCRIPTION_CHARS) }],
      }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects a description over the shared max → 400, AI never called", async () => {
    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        foods: [
          { description: "banana" },
          { description: "x".repeat(MAX_FOOD_DESCRIPTION_CHARS + 1) },
        ],
      }),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid request",
    );
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("rejects more than MAX_FOOD_ENTRIES foods → 400", async () => {
    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        foods: Array.from({ length: MAX_FOOD_ENTRIES + 1 }, () => ({
          description: "banana",
        })),
      }),
    );

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("accepts the medication shape buildMedicationSummary produces", async () => {
    messagesCreate.mockResolvedValueOnce(toolResponse(validResult));

    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        conditions: ["HFrEF"],
        medications: [
          {
            name: "Bisoprolol",
            phaseType: "titration",
            dose: "2.5 mg, 5 mg",
            frequency: "twice daily",
            daysOnPhase: 14,
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects a medication with an empty name → 400", async () => {
    const { POST } = await import("@/app/api/ai/nutrient-analysis/route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        medications: [
          {
            name: "",
            phaseType: "maintenance",
            dose: "5 mg",
            frequency: "once daily",
            daysOnPhase: 3,
          },
        ],
      }),
    );

    expect(res.status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
