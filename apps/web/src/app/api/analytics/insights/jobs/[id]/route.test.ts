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
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";
import {
  buildJobPayload,
  PinnedKeyUnavailableError,
} from "@/lib/server/insight-job-payload";

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
let mockReport: {
  narrative: string;
  observations: string[];
  generatedAt: number;
  rangeStart?: number;
  rangeEnd?: number;
  personalised?: boolean;
} | null = null;
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
// Continuation submissions made while resuming a paused turn.
const batchesCreateCalls: Array<Record<string, unknown>> = [];
const batchesCancelCalls: string[] = [];
const attachCalls: Array<{
  jobId: string;
  batchId: string;
  expectedBatchId: string | undefined;
}> = [];
let attachReturn = true;
// What getClaudeClientForJob was handed (the row's request_payload), and an
// optional error it throws instead of resolving a client.
const jobKeyCalls: unknown[] = [];
let jobKeyThrows: Error | null = null;
let retrieveThrows: Error | null = null;

function resetState() {
  jobKeyCalls.length = 0;
  jobKeyThrows = null;
  retrieveThrows = null;
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
  batchesCreateCalls.length = 0;
  batchesCancelCalls.length = 0;
  attachCalls.length = 0;
  attachReturn = true;
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
          retrieve: async () => {
            if (retrieveThrows) throw retrieveThrows;
            return {
              id: "msgbatch_test_123",
              processing_status: batchProcessingStatus,
            };
          },
          create: async (params: Record<string, unknown>) => {
            batchesCreateCalls.push(params);
            return { id: `msgbatch_continuation_${batchesCreateCalls.length}` };
          },
          cancel: async (id: string) => {
            batchesCancelCalls.push(id);
            return { id };
          },
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

// Polling resolves the key the job was submitted with. The stub hands back
// the same fake client, recording which payload it was asked to resolve.
vi.mock("@/lib/server/insight-job-key", () => ({
  getClaudeClientForJob: async (requestPayload: unknown) => {
    jobKeyCalls.push(requestPayload);
    if (jobKeyThrows) throw jobKeyThrows;
    const { getClaudeClientForUser } = await import(
      "@/app/api/ai/_shared/claude-client"
    );
    return getClaudeClientForUser("user-test", "test@example.test");
  },
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
  attachBatchToJob: async (
    jobId: string,
    batchId: string,
    expectedBatchId?: string,
  ) => {
    attachCalls.push({ jobId, batchId, expectedBatchId });
    return attachReturn;
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

/**
 * What Anthropic returns when the server-side tool loop hits its per-turn
 * iteration limit: real work done, no answer yet, no tool call.
 */
function pausedResult(customId: string) {
  return {
    custom_id: customId,
    result: {
      type: "succeeded" as const,
      message: {
        content: [
          { type: "text", text: "Checking published targets for this metric." },
          {
            type: "server_tool_use",
            name: "web_search",
            input: { query: "sodium target heart failure" },
          },
        ],
        stop_reason: "pause_turn",
        usage: { input_tokens: 900, output_tokens: 120 },
      },
    },
  };
}

function pendingJob(id: string): MockJobRow {
  return {
    id,
    userId: "user-test",
    batchId: "msgbatch_test_123",
    status: "pending",
    requestPayload: PAYLOAD,
    resultReportId: null,
    error: null,
    createdAt: Date.now() - 5 * 60_000,
    completedAt: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("GET /api/analytics/insights/jobs/:id", () => {
  // Pay the route's cold import once, outside any single test's timeout.
  beforeAll(async () => {
    await import("@/app/api/analytics/insights/jobs/[id]/route");
  }, 30_000);

  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resumes a paused turn instead of failing the job", async () => {
    // pause_turn means the loop ran out of iterations, not that the model
    // produced garbage. Failing here threw away paid research and reported
    // deep analysis as broken.
    mockJob = pendingJob("job-paused");
    batchProcessingStatus = "ended";
    batchResults = [pausedResult("insight-job-paused")];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-paused"));

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(failCalls).toHaveLength(0);
    expect(completeCalls).toHaveLength(0);

    // A continuation batch was submitted and the job now points at it.
    expect(batchesCreateCalls).toHaveLength(1);
    // Attached as a compare-and-swap against the batch this poll read, so a
    // concurrent poll on the same paused batch can't silently overwrite it.
    expect(attachCalls).toEqual([
      {
        jobId: "job-paused",
        batchId: "msgbatch_continuation_1",
        expectedBatchId: "msgbatch_test_123",
      },
    ]);
  });

  it("carries the paused content and the same tools into the continuation", async () => {
    mockJob = pendingJob("job-paused-2");
    batchProcessingStatus = "ended";
    batchResults = [pausedResult("insight-job-paused-2")];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    await GET(makeRequest("job-paused-2"));

    const submitted = batchesCreateCalls[0] as {
      requests: Array<{
        custom_id: string;
        params: {
          tools: Array<{ name: string }>;
          messages: Array<{ role: string; content: unknown }>;
        };
      }>;
    };
    const request = submitted.requests[0]!;
    // Depth is encoded in the custom_id so the next poll can tell this is
    // already a resumption.
    expect(request.custom_id).toBe("insight-job-paused-2-c1");

    // The paused assistant turn goes back verbatim...
    const messages = request.params.messages;
    expect(messages[0]!.role).toBe("user");
    expect(messages[1]!.role).toBe("assistant");
    expect(messages[1]!.content).toEqual(
      pausedResult("x").result.message.content,
    );
    // ...and the tools it was still mid-way through must be re-declared, or
    // the API rejects the resume outright.
    const toolNames = request.params.tools.map((t) => t.name);
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("analytics_insight");
  });

  it("gives up honestly once a resumed turn pauses again", async () => {
    mockJob = pendingJob("job-paused-3");
    batchProcessingStatus = "ended";
    // Already a continuation (depth 1) and still paused.
    batchResults = [pausedResult("insight-job-paused-3-c1")];

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-paused-3"));

    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/pausing/i);
    // No unbounded chain of paid batches.
    expect(batchesCreateCalls).toHaveLength(0);
    expect(failCalls).toHaveLength(1);
  });

  it("cancels its own continuation when a concurrent poll wins the swap", async () => {
    mockJob = pendingJob("job-paused-4");
    batchProcessingStatus = "ended";
    batchResults = [pausedResult("insight-job-paused-4")];
    // The compare-and-swap fails: another poll already moved the job on.
    attachReturn = false;

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    await GET(makeRequest("job-paused-4"));

    // Nothing would ever poll that batch — don't leave it running.
    expect(batchesCancelCalls).toEqual(["msgbatch_continuation_1"]);
  });

  it("keeps a continuation the job already references when the swap's ack was lost", async () => {
    mockJob = pendingJob("job-paused-5");
    batchProcessingStatus = "ended";
    batchResults = [pausedResult("insight-job-paused-5")];
    // The update committed but its response never came back, so the route
    // sees a failed swap over a row that already points at our batch.
    attachReturn = false;
    mockJobAfterCas = {
      ...pendingJob("job-paused-5"),
      batchId: "msgbatch_continuation_1",
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const res = await GET(makeRequest("job-paused-5"));

    // Cancelling here would kill the batch the job is now polling, and the
    // next poll would fail the job on a canceled batch.
    expect(batchesCancelCalls).toEqual([]);
    expect(((await res.json()) as { status: string }).status).toBe("pending");
    expect(failCalls).toHaveLength(0);
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

  it("echoes the persisted report's identity so the client can cache it locally", async () => {
    mockJob = {
      ...pendingJob("job-cached-id"),
      status: "completed",
      resultReportId: "report-abc",
    };
    mockReport = {
      narrative: "Cached deep summary.",
      observations: ["One observation."],
      generatedAt: 5_000,
      rangeStart: PAYLOAD.range.start,
      rangeEnd: PAYLOAD.range.end,
      personalised: true,
    };

    const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
    const body = (await (await GET(makeRequest("job-cached-id"))).json()) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: "completed",
      reportId: "report-abc",
      rangeStart: PAYLOAD.range.start,
      rangeEnd: PAYLOAD.range.end,
      personalised: true,
    });
  });

  describe("key pinning and stuck jobs", () => {
    it("polls with the key recorded on the job, not the caller's current key", async () => {
      const envelope = buildJobPayload(PAYLOAD as AnalyticsInsightsRequest, {
        keySource: "shared_from",
        keyOwnerId: "grantor-1",
      });
      mockJob = { ...pendingJob("job-pinned"), requestPayload: envelope };

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      await GET(makeRequest("job-pinned"));

      expect(jobKeyCalls).toEqual([envelope]);
    });

    it("fails the job and releases the lock when the pinned key is gone", async () => {
      mockJob = pendingJob("job-revoked");
      jobKeyThrows = new PinnedKeyUnavailableError("shared_from");

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const res = await GET(makeRequest("job-revoked"));
      const body = (await res.json()) as { status: string; error: string };

      // A 402 here would be read as transient and polled for 24h while the
      // one-pending-job index blocks every new deep run.
      expect(res.status).toBe(200);
      expect(body.status).toBe("failed");
      expect(body.error).toMatch(/no longer available/i);
      expect(failCalls).toHaveLength(1);
    });

    it("treats a batch Anthropic no longer knows as a terminal failure", async () => {
      mockJob = pendingJob("job-404");
      retrieveThrows = Anthropic.APIError.generate(
        404,
        { type: "error", error: { type: "not_found_error", message: "not found" } },
        "not found",
        new Headers(),
      );

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const res = await GET(makeRequest("job-404"));
      const body = (await res.json()) as { status: string };

      expect(body.status).toBe("failed");
      expect(failCalls).toHaveLength(1);
    });

    it("keeps a transient retrieve failure pending-retryable (502), without failing the job", async () => {
      mockJob = pendingJob("job-blip");
      retrieveThrows = new Error("socket hang up");

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const res = await GET(makeRequest("job-blip"));

      expect(res.status).toBe(502);
      expect(failCalls).toHaveLength(0);
    });

    it("fails a reservation whose batch was never attached once submission has clearly died", async () => {
      // The submitting request was killed between batches.create and
      // attachBatchToJob. Nothing will ever attach a batch now.
      mockJob = {
        ...pendingJob("job-orphan"),
        batchId: null,
        createdAt: Date.now() - 30 * 60_000,
      };

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const body = (await (await GET(makeRequest("job-orphan"))).json()) as {
        status: string;
      };

      expect(body.status).toBe("failed");
      expect(failCalls).toHaveLength(1);
      expect(jobKeyCalls).toHaveLength(0);
    });

    it("finalises an enveloped job using the request inside the envelope", async () => {
      const request = {
        ...PAYLOAD,
        profile: { conditions: ["HFrEF"] },
      } as AnalyticsInsightsRequest;
      mockJob = {
        ...pendingJob("job-envelope"),
        requestPayload: buildJobPayload(request, {
          keySource: "own_stored",
          keyOwnerId: "user-test",
        }),
      };
      batchProcessingStatus = "ended";
      batchResults = [
        {
          custom_id: "insight-job-envelope",
          result: succeededResult({ summary: "Summary.", observations: ["One."] }),
        },
      ];

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const body = (await (await GET(makeRequest("job-envelope"))).json()) as Record<
        string,
        unknown
      >;

      expect(body).toMatchObject({
        status: "completed",
        reportId: "report-test-1",
        rangeStart: PAYLOAD.range.start,
        rangeEnd: PAYLOAD.range.end,
        personalised: true,
      });
      const { report } = completeCalls[0] as {
        report: { rangeStart: number; personalised: boolean };
      };
      expect(report.rangeStart).toBe(PAYLOAD.range.start);
      expect(report.personalised).toBe(true);
    });
  });

  describe("source list coercion", () => {
    it("keeps the report when the model lists a non-URL or more than 30 sources", async () => {
      mockJob = pendingJob("job-sources");
      batchProcessingStatus = "ended";
      const urls = Array.from(
        { length: 34 },
        (_, i) => `https://example.test/ref-${i}`,
      );
      batchResults = [
        {
          custom_id: "insight-job-sources",
          result: succeededResult({
            summary: "Researched summary.",
            observations: ["Grounded observation."],
            sources: ["AHA 2025 guideline", ...urls],
          }),
        },
      ];

      const { GET } = await import("@/app/api/analytics/insights/jobs/[id]/route");
      const body = (await (await GET(makeRequest("job-sources"))).json()) as {
        status: string;
        sources: string[];
      };

      expect(body.status).toBe("completed");
      expect(body.sources).toHaveLength(30);
      expect(body.sources).not.toContain("AHA 2025 guideline");
      expect(failCalls).toHaveLength(0);
    });
  });
});
