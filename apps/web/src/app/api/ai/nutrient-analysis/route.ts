import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, NUTRIENT_ANALYSIS_TOOL } from "@intake/ai-prompts/nutrient-analysis";

const FoodItemSchema = z.object({
  description: z.string().min(1).max(300),
  grams: z.number().min(0).max(10000).optional(),
});

// Shape mirrors MedicationSchema in analytics-insights.ts — duplicated here
// rather than imported so the two routes stay independent.
const MedicationSchema = z.object({
  name: z.string().min(1).max(120),
  phaseType: z.enum(["maintenance", "titration"]),
  dose: z.string().min(1).max(80),
  frequency: z.string().min(1).max(120),
  daysOnPhase: z.number().int().nonnegative(),
});

const NutrientAnalysisRequestSchema = z.object({
  windowDays: z.number().int().min(1).max(90),
  focus: z.string().max(200).optional(),
  foods: z.array(FoodItemSchema).min(1).max(500),
  // Both only reach the route when the user has opted in on the profile page.
  conditions: z.array(z.string().min(1).max(120)).max(20).optional(),
  medications: z.array(MedicationSchema).max(40).optional(),
});

// Caps here are sanity limits, not display constraints — the real bound on
// model output is `max_tokens`. Earlier-too-tight caps caused 422s when
// Claude's detail strings spilled past 500 chars with web-search context.
const NutrientFindingSchema = z.object({
  nutrient: z.string().min(1).max(120),
  status: z.enum(["high", "low", "balanced"]),
  detail: z.string().max(2000),
  exampleFoods: z.array(z.string().max(200)).max(12).default([]),
});

const NutrientAnalysisResponseSchema = z.object({
  summary: z.string().max(4000),
  findings: z.array(NutrientFindingSchema).max(20).default([]),
  caveats: z.array(z.string().max(600)).max(8).default([]),
});

const rateLimiter = createRateLimiter(10);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string,
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
}

function buildFoodListText(
  foods: { description: string; grams?: number | undefined }[],
): string {
  return foods
    .map((f, i) => {
      const safe = sanitizeForAI(f.description);
      const portion = f.grams ? ` (~${Math.round(f.grams)} g)` : "";
      return `${i + 1}. ${safe}${portion}`;
    })
    .filter((line) => line.length > 3)
    .join("\n");
}

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
    const parsed = NutrientAnalysisRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Nutrient analysis request failed", parsed.error);
    }

    const { windowDays, focus, foods, conditions, medications } = parsed.data;
    console.log(`[AUDIT] AI nutrient-analysis from user: ${auth.userId} (${foods.length} foods, ${windowDays}d)`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const foodListText = buildFoodListText(foods);
    if (!foodListText) {
      return NextResponse.json(
        { error: "No analyzable food entries after sanitization." },
        { status: 400 },
      );
    }

    const sanitizedFocus = focus ? sanitizeForAI(focus) : "";
    const focusLine = sanitizedFocus
      ? `\n\nThe user has asked you to focus on: ${sanitizedFocus}`
      : "";

    const contextSections: string[] = [];
    if (conditions && conditions.length > 0) {
      const safeConditions = conditions
        .map((c) => sanitizeForAI(c))
        .filter((c) => c.length > 0);
      if (safeConditions.length > 0) {
        contextSections.push(
          `Reported conditions: ${safeConditions.join(", ")}`,
        );
      }
    }
    if (medications && medications.length > 0) {
      const lines = medications.map((m) => {
        const name = sanitizeForAI(m.name);
        const dose = sanitizeForAI(m.dose);
        const freq = sanitizeForAI(m.frequency);
        return `- ${name} (${m.phaseType}, ${dose}, ${freq}, day ${m.daysOnPhase})`;
      });
      contextSections.push(`Active medications:\n${lines.join("\n")}`);
    }
    const contextBlock =
      contextSections.length > 0
        ? `\n\nMedical context (user opted in — use to calibrate findings):\n${contextSections.join("\n")}`
        : "";

    const userMessage = `Below are the user's logged food and drink entries from the last ${windowDays} days. Some have approximate portions (in grams) shown in parentheses; many will not. Use web_search if you need to look up specific branded or regional items, then call the report_nutrient_analysis tool with your synthesis.${focusLine}${contextBlock}\n\nFoods:\n${foodListText}`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, NUTRIENT_ANALYSIS_TOOL],
      messages: [{ role: "user", content: userMessage }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/nutrient-analysis",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, NUTRIENT_ANALYSIS_TOOL.name);

    // Claude may finish with prose if web_search satisfied it. Force the
    // structured tool on a second turn, carrying the prior context so the
    // earlier server_tool_use blocks remain valid.
    if (!toolBlock) {
      const followupStartedAt = Date.now();
      const followup = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 2048,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL, NUTRIENT_ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: NUTRIENT_ANALYSIS_TOOL.name },
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content:
              "Now return your nutrient bias findings via the report_nutrient_analysis tool.",
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/nutrient-analysis",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, NUTRIENT_ANALYSIS_TOOL.name);
    }

    if (!toolBlock) {
      console.error(
        "[VALIDATION] Nutrient analysis: model never called the structured tool. Stop reason:",
        response.stop_reason,
      );
      return NextResponse.json(
        { error: "The AI didn't return a structured response. Try again." },
        { status: 422 },
      );
    }

    const validated = NutrientAnalysisResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] Nutrient analysis response validation failed:",
        JSON.stringify(z.flattenError(validated.error)),
      );
      return NextResponse.json(
        { error: "The AI response didn't match the expected shape. Try again." },
        { status: 422 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("AI nutrient-analysis error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 },
    );
  }
});
