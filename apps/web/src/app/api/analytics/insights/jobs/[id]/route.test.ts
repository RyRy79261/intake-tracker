/**
 * Tests for GET /api/analytics/insights/jobs/:id — polling endpoint for
 * the async deep-research batch.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware with a fixed user.
 *   - Mock @/lib/server/insight-job-service so the test controls the row
 *     state and captures completeInsightJob / failInsightJob calls.
 *   - Mock @/app/api/ai/_shared/claude-client so batches.retrieve and
 *     batches.results are deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Controllable stubs ───────────────────────────────────────────────────

interface MockJobRow {
  id: string;
  userId: string;
  batchId: string | null;
  status: "pending" | "completed" | "failed" | "expired";
  requestPayload: unknown;
  resultReportId: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

const PAYLOAD = {
  range: { start: 1_700_000_000_000 - 30 * 86_400_000, end: 1_700_000_000_000 },
  metrics: { intake: { avgWaterMl: 1800, avgSodiumMg: 2100, avgSugarG: 40 } },
};

let mockJob: MockJobRow | null = null;
let mockReport: { narrative: string; observations: string[]; generatedAt: number } | null = null;
// Override completeInsightJob's return value to simulate the CAS-loss path
// (another concurrent poller already finalised the job).
let completionReturn: { reportId: string } | null = { reportId: "report-test-1" };
// Optional override for the SECOND getInsightJob call (used after a CAS
// loss). When null the second call returns mockJob unchanged.
let mockJobAfterCas: MockJobRow | null = null;
let getJobCalls = 0;
let batchProcessingStatus: "in_progress" | "ended" = "in_progress";
let batchResults: Array<{
  custom_id: string;
  result:
    | {
        type: "succeeded";
        message: {
          content: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
          stop_reason: string;
          usage: { input_tokens: number; output_tokens: number };
        };
      }
    | { type: "errored"; error: { error: { type: string; message: string } } }
    | { type: "expired" }
    | { type: "canceled" };
}> = [];

const completeCalls: unknown[] = [];
const failCalls: unknown[] = [];
const expireCalls: unknown[] = [];

function resetState() {
  mockJob = null;
  mockReport = null;
  completionReturn = { reportId: "report-test-1" };
  mockJobAfterCas = null;
  getJobCalls = 0;
  batchProcessingStatus = "in_progress";
  batchResults = [];
  completeCalls.length = 0;
  failCalls.length = 0;
  expireCalls.length = 0;
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
  WEB_SEARCH_TOOL: { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  getClaudeClientForUser: async () => ({
    client: {
      messages: {
        batches: {
          retrieve: async () => ({
            id: "msgbatch_test_123",
            processing_status: batchProcessingStatus,
          }),
          results: async () => ({
            async *[Symbol.asyncIterator]() {
              for (const entry of batchResults) yield entry;
            },
          }),
        },
      },
    },
    resolved: { keyOwnerId: "user-test", source: "env" },
  }),
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: () => undefined,
  tokensFromAnthropic: () => ({ inputTokens: 20, outputTokens: 10 }),
}));

vi.mock("@/lib/server/insight-job-service", () => ({
  getInsightJob: async (jobId: string, userId: string) => {
    getJobCalls += 1;
    // Second call after a CAS loss may return a different (winner's) row.
    const row = getJobCalls > 1 && mockJobAfterCas ? mockJobAfterCas : mockJob;
    if (!row || row.id !== jobId || row.userId !== userId) {
      return null;
    }
    return row;
  },
  completeInsightJob: async (jobId: string, report: unknown) => {
    completeCalls.push({ jobId, report });
    // Mirrors the real CAS return: null when the caller lost the race.
    return completionReturn;
  },
  failInsightJob: async (jobId: string, error: string) => {
    failCalls.push({ jobId, error });
    return true;
  },
  expireInsightJob: async (jobId: string) => {
    expireCalls.push({ jobId });
    return true;
  },
  getReportForJob: async () => mockReport,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(jobId: string): NextRequest {
  return new NextRequest(
    `https://example.test/api/analytics/insights/jobs/${jobId}`,
    { method: "GET" },
  );
}

function succeededResult(input: unknown, stopReason: string = "tool_use") {
  return {
    type: "succeeded" as const,
    message: {
      content: [
        { type: "tool_use", name: "analytics_insight", input },
      ],
      stop_reason: stopReason,
      usage: { input_tokens: 20, output_tokens: 10 },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("GET /api/analytics/insights/jobs/:id", () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when the job is not found", async () => {
    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("missing"));
    expect(res.status).toBe(404);
  });

  it("returns status=pending while the batch is still in progress", async () => {
    mockJob = {
      id: "job-1",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "in_progress";

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; startedAt: number };
    expect(body.status).toBe("pending");
    expect(typeof body.startedAt).toBe("number");
    expect(completeCalls).toHaveLength(0);
    expect(failCalls).toHaveLength(0);
  });

  it("finalises and returns the result when the batch ended and the tool output is valid", async () => {
    mockJob = {
      id: "job-2",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 5 * 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: succeededResult({
          summary: "Sodium averaged 2100 mg against a 2300 mg limit.",
          observations: [
            "Water averaged 1800 ml — 700 ml below the 2500 ml goal.",
          ],
        }),
      },
    ];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-2"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      narrative: string;
      observations: string[];
    };
    expect(body.status).toBe("completed");
    expect(body.narrative).toContain("2100 mg");
    expect(body.observations).toHaveLength(1);
    expect(completeCalls).toHaveLength(1);
    expect(failCalls).toHaveLength(0);
  });

  it("flips the job to failed when the model truncated at max_tokens", async () => {
    mockJob = {
      id: "job-3",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: succeededResult(
          { summary: "Comparison started but was cut off…" },
          "max_tokens",
        ),
      },
    ];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-3"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/cut off/i);
    expect(failCalls).toHaveLength(1);
    expect(completeCalls).toHaveLength(0);
  });

  it("flips the job to failed when Anthropic returns an errored individual result", async () => {
    mockJob = {
      id: "job-4",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: {
          type: "errored",
          error: { error: { type: "overloaded", message: "service overloaded" } },
        },
      },
    ];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-4"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(failCalls).toHaveLength(1);
  });

  it("flips the job to expired when it has been pending past the 24h SLA", async () => {
    const SLA_MS = 24 * 60 * 60 * 1000;
    mockJob = {
      id: "job-5",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - SLA_MS - 60_000,
      completedAt: null,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-5"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("expired");
    expect(expireCalls).toHaveLength(1);
  });

  it("flips the job to failed when the tool output fails InsightResponseSchema validation", async () => {
    mockJob = {
      id: "job-7",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    // Missing the required `observations` array — Zod rejects it.
    batchResults = [
      {
        custom_id: "insight-1",
        result: succeededResult({ summary: "Partial answer only." }),
      },
    ];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-7"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/structural validation/i);
    expect(failCalls).toHaveLength(1);
    expect(completeCalls).toHaveLength(0);
  });

  it("flips the job to failed when the model returned only plain text (no tool call)", async () => {
    mockJob = {
      id: "job-8",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 60_000,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: {
          type: "succeeded" as const,
          message: {
            content: [{ type: "text", text: "Here is a plain prose reply." }],
            stop_reason: "end_turn",
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        },
      },
    ];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-8"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/no tool call/i);
    expect(failCalls).toHaveLength(1);
    expect(completeCalls).toHaveLength(0);
  });

  it("returns status=pending when the row's batch_id has not been attached yet", async () => {
    // Transient state right after the route reserves the slot but before
    // attachBatchToJob lands — must not call Anthropic.
    mockJob = {
      id: "job-9",
      userId: "user-test",
      batchId: null,
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: Date.now() - 1_000,
      completedAt: null,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-9"));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(failCalls).toHaveLength(0);
    expect(expireCalls).toHaveLength(0);
  });

  it("propagates the winner's failed state when completeInsightJob loses the CAS race to a failure", async () => {
    // Two pollers race; the winning poller had already flipped the job to
    // "failed" by the time this one tried to complete it. The losing
    // poller MUST surface the persisted failure, not its own synthesised
    // "completed" payload — otherwise the client gets contradictory
    // status across pollers.
    const startedAt = Date.now() - 60_000;
    mockJob = {
      id: "job-cas-fail",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: startedAt,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: succeededResult({
          summary: "Loser-pol summary",
          observations: ["Loser-pol observation."],
        }),
      },
    ];
    completionReturn = null;
    mockJobAfterCas = {
      ...mockJob,
      status: "failed",
      error: "Winner flipped this to failed.",
      completedAt: startedAt + 30_000,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-cas-fail"));
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(body.error).toBe("Winner flipped this to failed.");
  });

  it("echoes the winning poller's persisted result when completeInsightJob loses the CAS race", async () => {
    // Two pollers reach the finalisation step concurrently. This one loses
    // the conditional update — completeInsightJob returns null — and must
    // NOT respond with its own synthesised payload. Instead it should
    // re-read the job (now flipped to completed by the winner) and echo
    // the persisted result so both clients see the same data.
    const startedAt = Date.now() - 60_000;
    mockJob = {
      id: "job-cas",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "pending",
      requestPayload: PAYLOAD,
      resultReportId: null,
      error: null,
      createdAt: startedAt,
      completedAt: null,
    };
    batchProcessingStatus = "ended";
    batchResults = [
      {
        custom_id: "insight-1",
        result: succeededResult({
          summary: "Loser-pol summary, should NOT be returned.",
          observations: ["Loser-pol observation."],
        }),
      },
    ];
    completionReturn = null; // Lost the race.
    // The second getInsightJob call (after CAS loss) sees the winning
    // poller's terminal state — status=completed with a result row.
    mockJobAfterCas = {
      ...mockJob,
      status: "completed",
      resultReportId: "report-winner",
      completedAt: startedAt + 30_000,
    };
    mockReport = {
      narrative: "Winner-pol summary.",
      observations: ["Winner-pol observation."],
      generatedAt: startedAt + 30_000,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-cas"));
    const body = (await res.json()) as {
      status: string;
      narrative: string;
      observations: string[];
    };
    expect(body.status).toBe("completed");
    expect(body.narrative).toBe("Winner-pol summary.");
    expect(body.observations).toEqual(["Winner-pol observation."]);
  });

  it("echoes the cached result when the job is already completed", async () => {
    mockJob = {
      id: "job-6",
      userId: "user-test",
      batchId: "msgbatch_test_123",
      status: "completed",
      requestPayload: PAYLOAD,
      resultReportId: "report-test-1",
      error: null,
      createdAt: Date.now() - 60 * 60_000,
      completedAt: Date.now() - 30 * 60_000,
    };
    mockReport = {
      narrative: "Cached deep summary.",
      observations: ["One observation."],
      generatedAt: Date.now() - 30 * 60_000,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-6"));
    const body = (await res.json()) as {
      status: string;
      narrative: string;
      observations: string[];
    };
    expect(body.status).toBe("completed");
    expect(body.narrative).toBe("Cached deep summary.");
    expect(body.observations).toEqual(["One observation."]);
  });
});
