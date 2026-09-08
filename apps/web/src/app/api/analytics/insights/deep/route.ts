import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { AnalyticsInsightsRequestSchema } from "@intake/ai-prompts/analytics-insights";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { getClaudeClientForUser } from "@/app/api/ai/_shared/claude-client";
import {
  buildDeepBatchParams,
  deepCustomId,
} from "@/lib/server/deep-insight-request";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import {
  createInsightJob,
  attachBatchToJob,
  deletePendingJob,
  PendingJobConflictError,
} from "@/lib/server/insight-job-service";

/**
 * Async deep-research analytics insights — submits an Anthropic Message Batch
 * with Opus 4.6 and the web-search tool, returns immediately with a jobId the
 * client can poll. See ./jobs/[id]/route.ts for the polling endpoint.
 *
 * Why a batch and not a streaming long-running call:
 *   - Batches survive client disconnect, browser close, and Vercel timeouts.
 *   - Anthropic charges batches at 50% of standard pricing.
 *   - The 24h SLA is well above typical deep-research completion (<10 min).
 *
 * The request body is the same `AnalyticsInsightsRequest` as the fast route,
 * so the client can submit either with the same payload — only the button
 * routes to a different endpoint.
 */

export const runtime = "nodejs";

// Throttle the SUBMISSION side; the polling endpoint is intentionally cheap
// and not rate-limited. One pending job per user (enforced by a DB unique
// index) handles abuse on the long-running side.
const rateLimiter = createRateLimiter(10);

// Model, token budget, tools and message shape live in
// @/lib/server/deep-insight-request — the polling endpoint resumes a paused
// turn with the same values, and a resume that disagrees is rejected.

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);
    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;

    const parsed = AnalyticsInsightsRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Invalid analytics payload", parsed.error);
    }

    let client;
    try {
      ({ client } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    console.log(
      `[AUDIT] analytics insights DEEP submit from user: ${auth.userId}`,
    );

    // Reserve the pending-job slot BEFORE submitting to Anthropic. Doing it
    // in the other order can leak a paid batch when a concurrent submission
    // races: both calls succeed at Anthropic, but only one wins the unique
    // index and the other batch becomes an orphan we can't reconcile.
    let job;
    try {
      job = await createInsightJob({
        userId: auth.userId!,
        requestPayload: parsed.data,
      });
    } catch (e) {
      if (e instanceof PendingJobConflictError) {
        return NextResponse.json(
          {
            error: e.message,
            code: "PENDING_JOB_EXISTS",
          },
          { status: 409 },
        );
      }
      throw e;
    }

    // The batch carries exactly one request. We use a stable custom_id so
    // the results stream is easy to match later (only one entry anyway, but
    // belts-and-braces if Anthropic ever bundles concurrent submissions).
    // It also encodes how many times this turn has been resumed — depth 0
    // here, bumped by the polling endpoint when it continues a paused turn.
    const customId = deepCustomId(job.id);

    let batch;
    try {
      batch = await client.messages.batches.create({
        requests: [
          {
            custom_id: customId,
            params: buildDeepBatchParams(parsed.data),
          },
        ],
      });
    } catch (e) {
      // Batch submission failed before any external state was created.
      // Release the unique-index lock so the user can retry immediately.
      console.error(
        "[analytics/insights/deep] batches.create failed:",
        e instanceof Error ? `${e.name}: ${e.message}` : e,
      );
      await deletePendingJob(job.id, auth.userId!).catch((cleanupErr) =>
        console.error(
          "[analytics/insights/deep] failed to release pending job after batch error:",
          cleanupErr,
        ),
      );
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    // Attach the real batch_id to the reserved row. If this fails, we have
    // a paid batch with no DB record — cancel the batch so we don't keep
    // racking up cost on something nothing will ever poll.
    let attached = false;
    try {
      attached = await attachBatchToJob(job.id, batch.id);
    } catch (attachErr) {
      console.error(
        "[analytics/insights/deep] attachBatchToJob threw:",
        attachErr instanceof Error
          ? `${attachErr.name}: ${attachErr.message}`
          : attachErr,
      );
    }
    if (!attached) {
      console.error(
        `[analytics/insights/deep] attach returned false for job=${job.id} batch=${batch.id} — cancelling orphan`,
      );
      await client.messages.batches.cancel(batch.id).catch((cancelErr) =>
        console.error(
          "[analytics/insights/deep] failed to cancel orphaned batch:",
          cancelErr,
        ),
      );
      await deletePendingJob(job.id, auth.userId!).catch(() => undefined);
      return NextResponse.json(
        { error: "Failed to start deep analysis. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: "pending" as const,
        startedAt: job.createdAt,
      },
      { status: 202 },
    );
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error(
      "[analytics/insights/deep] unhandled error:",
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : error,
    );
    return NextResponse.json(
      { error: "Failed to start deep analysis" },
      { status: 502 },
    );
  }
});
