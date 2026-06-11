import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "@/app/api/ai/substance-lookup/schema";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";

const RequestSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["caffeine", "alcohol"]),
});

const rateLimiter = createRateLimiter(15);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
}

function buildSystemPrompt(type: "caffeine" | "alcohol"): string {
  if (type === "caffeine") {
    return `You are a beverage research assistant. Given a beverage name, return its caffeine content per 100 ml, a typical serving size, and water content percentage.

Units (metric only):
- substancePer100ml = milligrams of caffeine per 100 ml of beverage
- defaultVolumeMl = typical single serve in millilitres
- waterContentPercent = 0-100

Reference points:
- Filter / drip coffee: ~40 mg / 100 ml
- Espresso: ~200 mg / 100 ml
- Black tea: ~20 mg / 100 ml
- Green tea: ~12 mg / 100 ml
- Cola: ~10 mg / 100 ml
- Energy drinks (Red Bull, Monster): ~32 mg / 100 ml
- Matcha: highly variable, ~60-100 mg / 100 ml prepared

Process:
1. For branded products (Starbucks, Red Bull variants, energy shots, regional sodas) USE THE web_search TOOL to look up the manufacturer's published value or a reputable third-party measurement (Caffeine Informer, USDA, manufacturer site). Prefer per-100-ml values; if only per-serving is available, divide by the stated serving volume.
2. For generic items (filter coffee, black tea) you may answer from your own knowledge.
3. Always finish by calling the substance_lookup_result tool with the structured output.`;
  }

  return `You are a beverage research assistant. Given an alcoholic drink name, return its ABV (alcohol by volume), a typical serving size, and water content percentage.

CRITICAL UNIT RULE:
- substancePer100ml MUST be ABV as a percentage by volume -- the same number printed on the bottle label.
- It is NOT grams of ethanol per 100 ml.
- It is NOT millilitres of ethanol per 100 ml (numerically the same as ABV %, but think of it as the label %).
- Examples: typical lager = 5, IPA = 6-7, red wine = 13, vodka = 40, cask-strength whisky = 60.

Other fields:
- defaultVolumeMl = typical single serving in millilitres (e.g. pint = 568, half pint = 284, wine glass = 175, single spirit = 25 (UK) / 30 (most of EU))
- waterContentPercent = 0-100 (beer ~93, wine ~87, spirits ~60)

Process:
1. For branded products, regional drinks, craft beers, named cocktails, or anything you are not 100% sure of, USE THE web_search TOOL to look up the producer's stated ABV or a reputable retailer listing.
2. For generic items (lager, red wine, vodka) you may answer from your own knowledge but stay within typical ranges.
3. Always finish by calling the substance_lookup_result tool with the structured output. Do NOT convert ABV to grams or mg.`;
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
    const parsed = RequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Substance lookup request failed", parsed.error);
    }

    const { query, type } = parsed.data;
    const sanitized = sanitizeForAI(query);
    if (!sanitized) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    console.log(`[AUDIT] Substance lookup from user: ${auth.userId}, type: ${type}`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const systemPrompt = buildSystemPrompt(type);
    const userPrompt =
      type === "caffeine"
        ? `Look up caffeine content per 100 ml for: "${sanitized}". Use web_search if it is a branded product, then call substance_lookup_result.`
        : `Look up the ABV (% alcohol by volume) for: "${sanitized}". Use web_search if it is a branded product, then call substance_lookup_result. Return the ABV as a percentage (e.g. 5, 13, 40), NOT grams of ethanol.`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
      messages: [{ role: "user", content: userPrompt }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/substance-lookup",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, SUBSTANCE_LOOKUP_TOOL.name);

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
        tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
        tool_choice: { type: "tool", name: SUBSTANCE_LOOKUP_TOOL.name },
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: "Now return the final answer via the substance_lookup_result tool.",
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/substance-lookup",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, SUBSTANCE_LOOKUP_TOOL.name);
    }

    if (!toolBlock) {
      return NextResponse.json({ error: "AI response format invalid" }, { status: 422 });
    }

    const validated = SubstanceLookupResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] Substance lookup response failed:",
        JSON.stringify(validated.error.flatten())
      );
      return NextResponse.json({ error: "AI response validation failed" }, { status: 422 });
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Substance lookup error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
});
