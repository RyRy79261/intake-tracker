import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import {
  INSIGHT_TOOL,
  InsightResponseSchema,
  type AnalyticsInsightsRequest,
} from "@/lib/analytics-insights";
import {
  getClaudeClientForUser,
  CLAUDE_MODELS,
} from "@/app/api/ai/_shared/claude-client";
import {
  recordUsage,
  tokensFromAnthropic,
} from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import {
  getInsightJob,
  completeInsightJob,
  failInsightJob,
  expireInsightJob,
  getReportForJob,
  type InsightJobRow,
} from "@/lib/server/insight-job-service";

/**
 * Poll a deep-research insight job.
 *
 *   GET /api/analytics/insights/jobs/:id
 *
 * Response shape (status code is always 200; the body's `status` field is the
 * thing the client switches on):
 *
 *   { status: "pending",   startedAt }                              — still in flight
 *   { status: "completed", narrative, observations, generatedAt }   — done
 *   { status: "failed",    error }                                  — terminal error
 *   { status: "expired",   error }                                  — 24h SLA blown
 *
 * The route is the only place that mutates job state after creation. When
 * Anthropic reports the batch ended we fetch the results stream, validate
 * the tool output against `InsightResponseSchema`, persist a row to
 * `insight_reports` (with `mode: "deep"`), and flip the job to "completed"
 * — all from this single GET. That keeps the server stateless between polls
 * (no background worker, no cron) while still making the result durable as
 * soon as it's available.
 */

export const runtime = "nodejs";

// Mirrors the docs SLA. Pending jobs older than this are reported as expired
// — the client treats this terminally so the pending indicator can clear.
const BATCH_SLA_MS = 24 * 60 * 60 * 1000;

type ToolUseBlock = Extract<
  Anthropic.Messages.ContentBlock,
  { type: "tool_use" }
>;

export const GET = withAuth(async ({ request, auth }) => {
  // Next 14 App Router exposes [id] via the URL pathname; we don't get a
  // `params` arg from `withAuth`'s wrapper, so parse it manually.
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const jobId = segments[segments.length - 1];
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const job = await getInsightJob(jobId, auth.userId!);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "completed") {
    return respondCompleted(job);
  }
  if (job.status === "failed" || job.status === "expired") {
    return NextResponse.json({
      status: job.status,
      error: job.error ?? "Deep analysis did not complete.",
      startedAt: job.createdAt,
    });
  }

  // Pending — ask Anthropic for the batch status, finalise if we can.
  if (Date.now() - job.createdAt > BATCH_SLA_MS) {
    await expireInsightJob(job.id);
    return NextResponse.json({
      status: "expired",
      error: "Batch exceeded the 24-hour SLA without completing.",
      startedAt: job.createdAt,
    });
  }

  // Submission is still in flight — the reservation insert won the unique
  // index but the batch_id hasn't been attached yet. Tell the client to
  // keep polling; we'll have a batch to query on the next tick.
  if (!job.batchId) {
    return NextResponse.json({
      status: "pending" as const,
      startedAt: job.createdAt,
    });
  }

  let client;
  let resolved;
  try {
    ({ client, resolved } = await getClaudeClientForUser(
      auth.userId!,
      auth.email,
    ));
  } catch (e) {
    const mapped = aiErrorResponse(e);
    if (mapped) return mapped;
    throw e;
  }

  let batch;
  try {
    batch = await client.messages.batches.retrieve(job.batchId);
  } catch (e) {
    const mapped = aiErrorResponse(e);
    if (mapped) return mapped;
    console.error("[analytics/insights/jobs] batch retrieve failed:", e);
    return NextResponse.json(
      { error: "Failed to check deep-analysis status" },
      { status: 502 },
    );
  }

  if (batch.processing_status !== "ended") {
    return NextResponse.json({
      status: "pending" as const,
      startedAt: job.createdAt,
    });
  }

  // The batch has ended. Stream the results and find the entry matching our
  // single submission's custom_id.
  let individual:
    | Anthropic.Messages.Batches.MessageBatchIndividualResponse
    | undefined;
  try {
    const stream = await client.messages.batches.results(job.batchId);
    for await (const entry of stream) {
      // We submit one request per batch, so the first entry is ours — but
      // matching by id is more honest if that ever changes.
      individual = entry;
      break;
    }
  } catch (e) {
    console.error("[analytics/insights/jobs] results stream failed:", e);
    await failInsightJob(
      job.id,
      "Could not retrieve batch results from Anthropic.",
    );
    return NextResponse.json({
      status: "failed",
      error: "Could not retrieve batch results from Anthropic.",
      startedAt: job.createdAt,
    });
  }

  if (!individual) {
    await failInsightJob(job.id, "Batch ended but contained no results.");
    return NextResponse.json({
      status: "failed",
      error: "Batch ended but contained no results.",
      startedAt: job.createdAt,
    });
  }

  const r = individual.result;
  if (r.type !== "succeeded") {
    const errMsg =
      r.type === "errored"
        ? `Anthropic reported an error during deep analysis (${r.error?.error?.type ?? "unknown"}).`
        : r.type === "expired"
          ? "Anthropic expired the deep-analysis request before it ran."
          : "Deep analysis was canceled before it could finish.";
    await failInsightJob(job.id, errMsg);
    return NextResponse.json({
      status: "failed",
      error: errMsg,
      startedAt: job.createdAt,
    });
  }

  const message = r.message;
  // Record usage AFTER the model actually produced output, against the
  // user's resolved key — same pattern as the fast route.
  try {
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.premium,
      route: "/api/analytics/insights/deep",
      status: "success",
      durationMs: Date.now() - job.createdAt,
      ...tokensFromAnthropic(message.usage),
    });
  } catch (usageError) {
    console.error(
      "[analytics/insights/jobs] usage recording failed:",
      usageError,
    );
  }

  const toolBlock = message.content.find(
    (b): b is ToolUseBlock =>
      b.type === "tool_use" && b.name === INSIGHT_TOOL.name,
  );
  if (message.stop_reason === "max_tokens") {
    const err =
      "Deep analysis was cut off before the model could finish. Try again.";
    await failInsightJob(job.id, err);
    return NextResponse.json({
      status: "failed",
      error: err,
      startedAt: job.createdAt,
    });
  }
  if (!toolBlock) {
    const err = "Deep analysis returned a malformed response (no tool call).";
    console.error(
      "[analytics/insights/jobs] model did not call insight tool",
      { stopReason: message.stop_reason },
    );
    await failInsightJob(job.id, err);
    return NextResponse.json({
      status: "failed",
      error: err,
      startedAt: job.createdAt,
    });
  }

  const validated = InsightResponseSchema.safeParse(toolBlock.input);
  if (!validated.success) {
    const err =
      "Deep analysis returned a response that failed structural validation.";
    // Inline counts so the per-request log line in Vercel's UI surfaces the
    // diagnostic detail directly (it only shows the first console.error
    // arg). flatten() then ships the per-field zod errors for the full log.
    const raw = toolBlock.input as { summary?: unknown; observations?: unknown };
    const summaryLen =
      typeof raw.summary === "string" ? raw.summary.length : -1;
    const obsCount = Array.isArray(raw.observations)
      ? raw.observations.length
      : -1;
    const obsMaxLen = Array.isArray(raw.observations)
      ? raw.observations.reduce(
          (max, o) =>
            Math.max(max, typeof o === "string" ? o.length : 0),
          0,
        )
      : -1;
    console.error(
      `[analytics/insights/jobs] response validation failed: summaryLen=${summaryLen} obsCount=${obsCount} obsMaxLen=${obsMaxLen} fields=${JSON.stringify(validated.error.flatten().fieldErrors)}`,
    );
    await failInsightJob(job.id, err);
    return NextResponse.json({
      status: "failed",
      error: err,
      startedAt: job.createdAt,
    });
  }

  const generatedAt = Date.now();
  // The submitted payload defines the analysis window and personalisation —
  // pull it back out of the saved request_payload rather than trusting
  // client-supplied values on the poll.
  const submitted = job.requestPayload as AnalyticsInsightsRequest;
  const personalised =
    Boolean(
      submitted.profile?.conditions && submitted.profile.conditions.length > 0,
    ) ||
    Boolean(
      submitted.profile?.medications &&
        submitted.profile.medications.length > 0,
    );

  const sources =
    validated.data.sources && validated.data.sources.length > 0
      ? validated.data.sources
      : null;
  const completion = await completeInsightJob(job.id, {
    userId: auth.userId!,
    generatedAt,
    rangeStart: submitted.range.start,
    rangeEnd: submitted.range.end,
    narrative: validated.data.summary,
    observations: validated.data.observations,
    sources,
    personalised,
  });

  if (completion === null) {
    // Lost the CAS race — another concurrent poller already finalised this
    // job. Echo whatever that winning poller persisted so the client sees
    // a consistent view (matching id, matching generatedAt) instead of our
    // synthesised one. The winning row's status drives the response.
    const winning = await getInsightJob(job.id, auth.userId!);
    if (winning && winning.status === "completed") {
      return respondCompleted(winning);
    }
    if (
      winning &&
      (winning.status === "failed" || winning.status === "expired")
    ) {
      // Propagate the winner's terminal state instead of pretending we're
      // still pending — otherwise the client polls forever for a job the
      // other branch already marked failed/expired.
      return NextResponse.json({
        status: winning.status,
        error: winning.error ?? "Deep analysis did not complete.",
        startedAt: job.createdAt,
      });
    }
    // Defensive: winning row disappeared (extremely rare). Tell the client
    // to poll again rather than asserting a synthetic outcome.
    return NextResponse.json({
      status: "pending" as const,
      startedAt: job.createdAt,
    });
  }

  return NextResponse.json({
    status: "completed" as const,
    narrative: validated.data.summary,
    observations: validated.data.observations,
    sources: sources ?? undefined,
    generatedAt,
    startedAt: job.createdAt,
  });
});

async function respondCompleted(job: InsightJobRow) {
  if (!job.resultReportId) {
    return NextResponse.json({
      status: "failed",
      error: "Job marked completed but has no result reference.",
      startedAt: job.createdAt,
    });
  }
  const report = await getReportForJob(job.resultReportId, job.userId);
  if (!report) {
    return NextResponse.json({
      status: "failed",
      error: "Cached result for this job is no longer available.",
      startedAt: job.createdAt,
    });
  }
  return NextResponse.json({
    status: "completed" as const,
    narrative: report.narrative,
    observations: report.observations,
    sources: report.sources ?? undefined,
    generatedAt: report.generatedAt,
    startedAt: job.createdAt,
  });
}
