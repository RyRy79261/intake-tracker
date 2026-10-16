import "server-only";
import type { z } from "zod";
import {
  AnalyticsInsightsRequestSchema,
  InsightResponseSchema,
  FAST_INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsPrompt,
} from "@intake/ai-prompts/analytics-insights";
import { zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import { sanitizeInsightsRequest } from "@/lib/server/sanitize-insights-request";

/**
 * Analytics insights: the client computes a numeric analytics snapshot
 * locally and POSTs it; this turns it into an AI-written narrative. The
 * client throttles how often it calls, so AI cost scales with active usage.
 *
 * The metrics are aggregate-only (numbers/enums). Three parts are free text,
 * each opt-in: user-reported conditions and the active medication list
 * (profile sharing toggles), and `priorAssessments`, the app's own earlier
 * AI summaries (which can quote those conditions back). Those are sent on
 * purpose, so sanitizeInsightsRequest only redacts incidental PII in them
 * (emails, phone and ID numbers) before the prompt is built.
 */
export const insightsTask = {
  route: "/api/analytics/insights",
  rateLimit: 10,
  request: AnalyticsInsightsRequestSchema,
  tier: "quality",
  // The response schema permits a 4000-char summary plus 16 × 2000-char
  // observations, and a comparison (priorAssessments) runs long: 1024 used
  // to truncate the tool call mid-JSON. Adaptive thinking shares the
  // ceiling, and high effort thinks more, so this leaves room for both.
  maxTokens: 8192,
  tool: FAST_INSIGHT_TOOL,
  retryInstruction: "Now return the summary and observations via the analytics_insight tool.",
  search: { mode: "off" },
  prompt: (req) => ({
    system: INSIGHTS_SYSTEM_PROMPT,
    user: buildInsightsPrompt(sanitizeInsightsRequest(req)),
  }),
  output: zodOutput(InsightResponseSchema),
  respond: (out) => ({
    narrative: out.summary,
    observations: out.observations,
    generatedAt: Date.now(),
  }),
  messages: {
    failed: "Failed to generate insights",
    // The shared refusal text says to enter the value by hand, which means
    // nothing for a summary.
    refused: "The AI declined to summarise this data.",
    truncated:
      "AI response was cut off before it finished. Try again, or generate without 'Include my previous summary'.",
  },
} satisfies AiTaskSpec<
  z.infer<typeof AnalyticsInsightsRequestSchema>,
  z.infer<typeof InsightResponseSchema>,
  unknown
>;
