import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import {
  AnalyticsInsightsRequestSchema,
  INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsPrompt,
} from "@/lib/analytics-insights";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import {
  getClaudeClientForUser,
  CLAUDE_MODELS,
  WEB_SEARCH_TOOL,
} from "@/app/api/ai/_shared/claude-client";
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

// More headroom than the fast Sonnet path. Deep research summaries are
// allowed to be longer and incorporate citations from the searches.
const DEEP_MAX_TOKENS = 4096;

// Cap web-search invocations so a runaway plan can't fan out. ~12 is enough
// to cover the 5-7 metric domains the snapshot can contain plus a couple of
// follow-ups, but not so high it explodes cost.
const DEEP_WEB_SEARCH_MAX_USES = 12;

const DEEP_SYSTEM_PROMPT = `${INSIGHTS_SYSTEM_PROMPT}

You are running in DEEP mode. The fast path already does a structural
summary; your job is to add the *connective* analysis the fast model
cannot — relating trends to the user's conditions and medications, and
grounding clinical context in current literature. A deep summary that
reads identically to a fast one is a failure.

REQUIRED PROCESS:

1. Web search is mandatory. Before calling analytics_insight you MUST run
   at least 2 web_search queries. Target what would actually help: the
   published target range for the user's notable metric, the expected
   response pattern for one of their active medications in their
   condition, or current monitoring guidance for the condition. Skip
   searches that are not useful; do not pad the count.

2. Medication ↔ trend alignment. For EACH active medication in the user's
   profile, write at least one observation that compares the observed
   metric trend against the expected clinical response, framed
   descriptively (NOT prescriptively). Examples of the right shape:
     - "Average systolic BP held at 132 mmHg over the period. For
        bisoprolol in HFrEF this is within the typical early-titration
        range; published targets are <130 mmHg once the dose is stable
        [source URL]."
     - "Weight trended down 1.8 kg, consistent with the diuretic-adjacent
        effect frequently observed when bisoprolol is up-titrated in
        heart failure [source URL]."
   If you cannot find a credible source, say so and frame the observation
   as data-only.

3. Condition framing. Use the user's reported conditions to explain WHY a
   metric matters, citing a source for the framing claim. If their data
   is within the recommended range for their condition, say so plainly;
   if it is not, name the number and recommend they discuss it with their
   provider. Never diagnose new conditions and never recommend changes to
   medication, dose, or treatment.

4. Suggestions. End with 1-2 observations that suggest topics worth
   raising with their healthcare provider, OR lifestyle / tracking
   adjustments aligned with their goals (e.g., "logging morning vs.
   evening BP separately may help interpret the rising trend in the
   afternoon readings"). Stay observational; never prescribe.

5. Sources. Pass every URL you used via web_search in the analytics_insight
   tool's "sources" field. Inline source references inside observations
   are fine too, but the sources array is the canonical citation list.

Final answer must come via the analytics_insight tool exactly once, after
the web_search calls.`;

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
    const customId = `insight-${job.id}`;

    let batch;
    try {
      batch = await client.messages.batches.create({
        requests: [
          {
            custom_id: customId,
            params: {
              model: CLAUDE_MODELS.premium,
              max_tokens: DEEP_MAX_TOKENS,
              temperature: 0.3,
              system: DEEP_SYSTEM_PROMPT,
              tools: [
                { ...WEB_SEARCH_TOOL, max_uses: DEEP_WEB_SEARCH_MAX_USES },
                INSIGHT_TOOL,
              ],
              // Auto so the model can run web_search before deciding it has
              // enough to call analytics_insight. Forcing analytics_insight
              // would block web_search calls before the final tool.
              tool_choice: { type: "auto" },
              messages: [
                {
                  role: "user",
                  content: buildInsightsPrompt(parsed.data),
                },
              ],
            },
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
