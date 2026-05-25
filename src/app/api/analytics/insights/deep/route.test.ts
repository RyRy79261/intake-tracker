/**
 * Tests for POST /api/analytics/insights/deep — async deep-research batch
 * submission.
 *
 * Strategy mirrors the fast route's test setup:
 *   - Mock @/lib/auth-middleware as a pass-through with a fixed user.
 *   - Mock the Claude client so `messages.batches.create` is deterministic
 *     and we can assert the params it was called with (Opus + web search +
 *     tool_choice auto).
 *   - Mock the server-side job service so we don't touch Postgres; the test
 *     captures what was persisted instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { NoAiKeyError } from "@/lib/ai-key-resolver";

// ── Controllable stubs ───────────────────────────────────────────────────

let claudeClientThrows: Error | null = null;
let batchesCreateThrows: Error | null = null;
let batchId = "msgbatch_test_123";

let jobServiceThrows: Error | null = null;
const batchesCreateCalls: unknown[] = [];
const createJobCalls: unknown[] = [];

function resetState() {
  claudeClientThrows = null;
  batchesCreateThrows = null;
  batchId = "msgbatch_test_123";
  jobServiceThrows = null;
  batchesCreateCalls.length = 0;
  createJobCalls.length = 0;
}

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

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  CLAUDE_MODELS: {
    fast: "claude-haiku-test",
    quality: "claude-sonnet-test",
    premium: "claude-opus-test",
  },
  WEB_SEARCH_TOOL: {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 5,
  },
  getClaudeClientForUser: async () => {
    if (claudeClientThrows) throw claudeClientThrows;
    return {
      client: {
        messages: {
          batches: {
            create: async (params: unknown) => {
              batchesCreateCalls.push(params);
              if (batchesCreateThrows) throw batchesCreateThrows;
              return { id: batchId, processing_status: "in_progress" };
            },
          },
        },
      },
      resolved: { keyOwnerId: "user-test", source: "env" },
    };
  },
}));

vi.mock("@/lib/server/insight-job-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/insight-job-service")
  >("@/lib/server/insight-job-service");
  return {
    ...actual,
    createInsightJob: async (input: unknown) => {
      createJobCalls.push(input);
      if (jobServiceThrows) throw jobServiceThrows;
      return {
        id: "job-test-1",
        userId: "user-test",
        batchId,
        status: "pending" as const,
        requestPayload: (input as { requestPayload: unknown }).requestPayload,
        resultReportId: null,
        error: null,
        createdAt: 1_700_000_000_000,
        completedAt: null,
      };
    },
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/analytics/insights/deep", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  const now = 1_700_000_000_000;
  return {
    range: { start: now - 30 * 86_400_000, end: now },
    metrics: {
      intake: {
        avgWaterMl: 1800,
        avgSodiumMg: 2100,
        avgSugarG: 40,
        waterGoalMl: 2500,
        sodiumLimitMg: 2300,
        sugarLimitG: 50,
      },
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/analytics/insights/deep", () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the batch with Opus + web search + analytics_insight + tool_choice auto and returns 202", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      jobId: string;
      status: string;
      startedAt: number;
    };
    expect(body.jobId).toBe("job-test-1");
    expect(body.status).toBe("pending");

    expect(batchesCreateCalls).toHaveLength(1);
    const params = batchesCreateCalls[0] as {
      requests: Array<{
        params: {
          model: string;
          max_tokens: number;
          tools: Array<{ name: string; type?: string; max_uses?: number }>;
          tool_choice: { type: string };
        };
      }>;
    };
    expect(params.requests).toHaveLength(1);
    const requestParams = params.requests[0]!.params;
    expect(requestParams.model).toBe("claude-opus-test");
    // Web search must be present (the whole point of deep mode) AND the
    // structured insight tool must remain available for the final answer.
    const toolNames = requestParams.tools.map((t) => t.name);
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("analytics_insight");
    // tool_choice MUST be "auto" so the model can run searches before the
    // structured response; forcing analytics_insight would block them.
    expect(requestParams.tool_choice.type).toBe("auto");
    // Web search needs a higher max_uses than the default to support deep
    // research across the snapshot's multiple metric domains.
    const webSearch = requestParams.tools.find((t) => t.name === "web_search");
    expect(webSearch?.max_uses).toBeGreaterThanOrEqual(10);
  });

  it("persists the validated request payload alongside the job for later audit/re-run", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest(validBody()));

    expect(createJobCalls).toHaveLength(1);
    const call = createJobCalls[0] as {
      userId: string;
      batchId: string;
      requestPayload: unknown;
    };
    expect(call.userId).toBe("user-test");
    expect(call.batchId).toBe("msgbatch_test_123");
    expect(call.requestPayload).toMatchObject({
      range: { start: expect.any(Number), end: expect.any(Number) },
      metrics: { intake: expect.any(Object) },
    });
  });

  it("returns 409 / PENDING_JOB_EXISTS when the user already has a pending deep job", async () => {
    const { PendingJobConflictError } = await import(
      "@/lib/server/insight-job-service"
    );
    jobServiceThrows = new PendingJobConflictError();

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("PENDING_JOB_EXISTS");
  });

  it("returns 400 when the analytics payload fails schema validation", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ range: { start: 1, end: 2 }, metrics: {} }),
    );

    expect(res.status).toBe(400);
    expect(batchesCreateCalls).toHaveLength(0);
  });

  it("returns 402 / NO_AI_KEY when the caller has no key configured", async () => {
    claudeClientThrows = new NoAiKeyError("anthropic");

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_AI_KEY");
  });
});
