import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import {
  AnalyticsInsightsRequestSchema,
  InsightResponseSchema,
  FAST_INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsPrompt,
} from "@intake/ai-prompts/analytics-insights";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import {
  getClaudeClientForUser,
  CLAUDE_MODELS,
} from "@/app/api/ai/_shared/claude-client";
import {
  AiRefusalError,
  AiTruncatedError,
  requestToolCall,
} from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { sanitizeInsightsRequest } from "@/lib/server/sanitize-insights-request";

/**
 * Analytics insights endpoint.
 *
 * Called by a signed-in client device (the PWA) which computes a numeric
 * analytics snapshot locally and POSTs it here. The endpoint turns that
 * snapshot into an AI-written narrative using the caller's resolved Claude
 * key. The client throttles how often it calls this, so AI cost scales with
 * active usage rather than total user count.
 *
 * The metrics are aggregate-only (numbers/enums). Three parts are free text,
 * each opt-in: user-reported conditions and the active medication list
 * (profile sharing toggles), and `priorAssessments`, the app's own earlier AI
 * summaries (which can quote those conditions back). Those are sent on
 * purpose, so sanitizeInsightsRequest only redacts incidental PII in them
 * (emails, phone and ID numbers) before the prompt is built.
 *
 * The Claude call goes through the shared claude-call helpers, which branch
 * on `stop_reason` (a refusal, a max_tokens cut-off), record usage for every
 * upstream response and hold the call to one route-wide deadline.
 */

export const runtime = "nodejs";

// Vercel function limit. The shared deadline stops short of it so a slow
// model call ends in a JSON 504 rather than the platform's own.
export const maxDuration = 90;
const DEADLINE_MS = 80_000;

const rateLimiter = createRateLimiter(10);

export const POST = withAuth(async ({ request, auth }) => {
  try {
    if (!rateLimiter.check(rateLimitKey(request, auth.userId))) {
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

    console.log(`[AUDIT] analytics insights from user: ${auth.userId}`);

    // Quality tier (Claude Opus 5.5): a forced tool_choice is a 400 on
    // this model, so the request is `auto` with a strict tool. The system
    // prompt says to always answer through the tool, and if the reply is
    // prose anyway requestToolCall asks once more on an unforced,
    // append-only turn. No sampling parameters either (also a 400).
    const { toolUse: toolBlock, responses } = await requestToolCall(
      client,
      {
        model: CLAUDE_MODELS.quality,
        // The response schema permits a 4000-char summary plus 16 × 2000-char
        // observations, and a comparison (priorAssessments) runs long: 1024
        // used to truncate the tool call mid-JSON. Adaptive thinking is
        // always on for this model and shares the ceiling, and high effort
        // thinks more, so this leaves room for both. A short answer still
        // bills short.
        max_tokens: 8192,
        // A written assessment of the period, read later rather than waited
        // on like a lookup: high. Set explicitly on every quality request.
        output_config: { effort: "high" },
        system: INSIGHTS_SYSTEM_PROMPT,
        tools: [FAST_INSIGHT_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: buildInsightsPrompt(sanitizeInsightsRequest(parsed.data)),
          },
        ],
      },
      {
        usage: {
          userId: auth.userId!,
          resolved,
          route: "/api/analytics/insights",
        },
        deadline: Date.now() + DEADLINE_MS,
        toolName: FAST_INSIGHT_TOOL.name,
        retryInstruction:
          "Now return the summary and observations via the analytics_insight tool.",
        forceOnRetry: false,
      },
    );

    const stopReason = responses.at(-1)?.stop_reason;
    if (!toolBlock) {
      console.error("[analytics/insights] model did not call the insight tool", {
        stopReason,
      });
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 502 },
      );
    }

    const validated = InsightResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[analytics/insights] AI response validation failed:",
        JSON.stringify(z.flattenError(validated.error)),
        { stopReason },
      );
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      narrative: validated.data.summary,
      observations: validated.data.observations,
      generatedAt: Date.now(),
    });
  } catch (error) {
    // Still cut off after the budget was raised once: a distinct, actionable
    // error instead of the generic "format invalid" toast.
    if (error instanceof AiTruncatedError) {
      console.error("[analytics/insights] response truncated by max_tokens");
      return NextResponse.json(
        {
          error:
            "AI response was cut off before it finished. Try again, or generate without 'Include my previous summary'.",
          code: "RESPONSE_TRUNCATED",
        },
        { status: 502 },
      );
    }
    // The shared refusal message tells the user to enter the value by hand,
    // which means nothing for a summary.
    if (error instanceof AiRefusalError) {
      return NextResponse.json(
        {
          error: "The AI declined to summarise this data.",
          code: "AI_REFUSED",
        },
        { status: 422 },
      );
    }
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("[analytics/insights] error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 502 },
    );
  }
});
