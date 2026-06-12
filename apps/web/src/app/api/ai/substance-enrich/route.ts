import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { ethanolGrams, standardDrinksFromAbv } from "@/lib/alcohol-units";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { CAFFEINE_ENRICH_TOOL, ALCOHOL_ENRICH_TOOL, CAFFEINE_SYSTEM_PROMPT, ALCOHOL_SYSTEM_PROMPT } from "@intake/ai-prompts/substance-enrich";

/**
 * AI enrichment for caffeine / alcohol "Other" entries. Uses Opus + web_search
 * with temperature 0. Alcohol is reasoned in metric (ABV %, ml, grams of pure
 * ethanol) and converted to standard drinks at the route boundary using the
 * WHO / metric definition of 10 g ethanol per standard drink.
 */

const SubstanceEnrichRequestSchema = z.object({
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
  type: z.enum(["caffeine", "alcohol"]),
});

// --- Tool inputs (raw, from the model) ---

const CaffeineToolInputSchema = z.object({
  caffeineMg: z.number().min(0).max(2000),
  volumeMl: z.number().min(0).max(5000),
  reasoning: z.string().max(1000).optional(),
});

const AlcoholToolInputSchema = z.object({
  abvPercent: z.number().min(0).max(95),
  volumeMl: z.number().min(0).max(5000),
  ethanolGrams: z.number().min(0).max(500).optional(),
  reasoning: z.string().max(1000).optional(),
});

const rateLimiter = createRateLimiter(30);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);

    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = SubstanceEnrichRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Substance enrich request failed", parsed.error);
    }

    const { description, type } = parsed.data;
    console.log(`[AUDIT] Substance enrich from user: ${auth.userId}, type: ${type}`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const sanitized = sanitizeForAI(description);
    if (!sanitized) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    const systemPrompt = type === "caffeine" ? CAFFEINE_SYSTEM_PROMPT : ALCOHOL_SYSTEM_PROMPT;
    const tool = type === "caffeine" ? CAFFEINE_ENRICH_TOOL : ALCOHOL_ENRICH_TOOL;
    const userPrompt =
      type === "caffeine"
        ? `Estimate caffeine (mg) and volume (ml) for: "${sanitized}". Use web_search for branded items, then call caffeine_enrichment.`
        : `Estimate ABV (%) and volume (ml) for: "${sanitized}". Use web_search if branded or unfamiliar, then call alcohol_enrichment. Return ABV as a percentage, NOT grams.`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL, tool],
      messages: [{ role: "user", content: userPrompt }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/substance-enrich",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, tool.name);

    if (!toolBlock) {
      const followupStartedAt = Date.now();
      const followup = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 1024,
        temperature: 0,
        system: systemPrompt,
        // WEB_SEARCH_TOOL must stay declared because the prior assistant turn
        // may contain server_tool_use blocks; tool_choice still forces the
        // structured tool.
        tools: [WEB_SEARCH_TOOL, tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: `Now return the final answer via the ${tool.name} tool.`,
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/substance-enrich",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, tool.name);
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    if (type === "caffeine") {
      const validated = CaffeineToolInputSchema.safeParse(toolBlock.input);
      if (!validated.success) {
        console.error(
          "[VALIDATION] Caffeine enrichment validation failed:",
          JSON.stringify(validated.error.flatten())
        );
        return NextResponse.json(
          { error: "AI response format invalid", fallbackToManual: true },
          { status: 422 }
        );
      }
      return NextResponse.json(validated.data);
    }

    const validated = AlcoholToolInputSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] Alcohol enrichment validation failed:",
        JSON.stringify(validated.error.flatten())
      );
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const grams = ethanolGrams(validated.data.abvPercent, validated.data.volumeMl);
    const standardDrinks =
      Math.round(standardDrinksFromAbv(validated.data.abvPercent, validated.data.volumeMl) * 10) / 10;

    return NextResponse.json({
      standardDrinks,
      volumeMl: validated.data.volumeMl,
      abvPercent: validated.data.abvPercent,
      ethanolGrams: Math.round(grams * 10) / 10,
      ...(validated.data.reasoning !== undefined && { reasoning: validated.data.reasoning }),
    });
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Substance enrich error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
