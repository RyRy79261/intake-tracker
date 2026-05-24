import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import {
  AnalyticsInsightsRequestSchema,
  InsightResponseSchema,
  INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsPrompt,
} from "@/lib/analytics-insights";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import {
  getClaudeClientForUser,
  CLAUDE_MODELS,
} from "@/app/api/ai/_shared/claude-client";
import {
  recordUsage,
  tokensFromAnthropic,
} from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";

/**
 * Analytics insights endpoint.
 *
 * Called by a signed-in client device (the PWA) which computes a numeric
 * analytics snapshot locally and POSTs it here. The endpoint turns that
 * snapshot into an AI-written narrative using the caller's resolved Claude
 * key. The client throttles how often it calls this, so AI cost scales with
 * active usage rather than total user count.
 *
 * The request body is intentionally aggregate-only (numbers/enums, no free
 * text), so no personal health detail reaches the external AI call — except
 * `priorAssessments`, the app's own earlier AI summaries, which the user can
 * opt in to including so the model can compare periods.
 */

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(10);

type ToolUseBlock = Extract<
  Anthropic.Messages.ContentBlock,
  { type: "tool_use" }
>;

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

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 1024,
      temperature: 0.3,
      system: INSIGHTS_SYSTEM_PROMPT,
      tools: [INSIGHT_TOOL],
      tool_choice: { type: "tool", name: INSIGHT_TOOL.name },
      messages: [{ role: "user", content: buildInsightsPrompt(parsed.data) }],
    });
    // Usage telemetry must never turn a successful AI call into a 502.
    try {
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/analytics/insights",
        status: "success",
        durationMs: Date.now() - startedAt,
        ...tokensFromAnthropic(response.usage),
      });
    } catch (usageError) {
      console.error("[analytics/insights] usage recording failed:", usageError);
    }

    const toolBlock = response.content.find(
      (b): b is ToolUseBlock =>
        b.type === "tool_use" && b.name === INSIGHT_TOOL.name,
    );
    if (!toolBlock) {
      console.error("[analytics/insights] model did not call the insight tool");
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 502 },
      );
    }

    const validated = InsightResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[analytics/insights] AI response validation failed:",
        JSON.stringify(validated.error.flatten()),
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
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("[analytics/insights] error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 502 },
    );
  }
});
