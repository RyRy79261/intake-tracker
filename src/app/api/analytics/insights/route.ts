import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  verifyWebhookSignature,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from "@/lib/webhook-auth";
import {
  AnalyticsInsightsRequestSchema,
  InsightResponseSchema,
  INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsPrompt,
} from "@/lib/analytics-insights";
import { zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";

/**
 * Analytics insights webhook.
 *
 * Accepts a numeric analytics snapshot, authenticates it with an HMAC
 * signature (no user session — see webhook-auth.ts), and returns an
 * AI-generated narrative. The signed payload is intentionally aggregate-only,
 * so no free-text personal data reaches the external AI call.
 */

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(10);

type ToolUseBlock = Extract<
  Anthropic.Messages.ContentBlock,
  { type: "tool_use" }
>;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const secret = process.env.ANALYTICS_WEBHOOK_SECRET;
    if (!secret) {
      console.error(
        "[analytics/insights] ANALYTICS_WEBHOOK_SECRET is not configured",
      );
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    // Read the raw body once — the HMAC is computed over the exact bytes.
    const rawBody = await request.text();

    const verification = verifyWebhookSignature({
      rawBody,
      timestamp: request.headers.get(WEBHOOK_TIMESTAMP_HEADER),
      signature: request.headers.get(WEBHOOK_SIGNATURE_HEADER),
      secret,
    });
    if (!verification.valid) {
      console.warn(
        `[analytics/insights] signature rejected: ${verification.reason}`,
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Request body is not valid JSON" },
        { status: 400 },
      );
    }

    const parsed = AnalyticsInsightsRequestSchema.safeParse(json);
    if (!parsed.success) {
      return zodErrorResponse("Invalid analytics payload", parsed.error);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(
        "[analytics/insights] ANTHROPIC_API_KEY is not configured",
      );
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 503 },
      );
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 1024,
      temperature: 0.3,
      system: INSIGHTS_SYSTEM_PROMPT,
      tools: [INSIGHT_TOOL],
      tool_choice: { type: "tool", name: INSIGHT_TOOL.name },
      messages: [{ role: "user", content: buildInsightsPrompt(parsed.data) }],
    });

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
}
