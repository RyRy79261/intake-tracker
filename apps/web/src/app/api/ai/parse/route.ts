import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { requestToolCall } from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, PARSE_RESULT_TOOL } from "@intake/ai-prompts/parse";

/**
 * Server-side AI parsing for food / drink descriptions.
 *
 * Always returns sodium in mg (no salt/sodium ambiguity). Uses the quality
 * tier (Claude Sonnet 5.5) + web_search for branded or regional items. No
 * sampling parameters (a non-default `temperature` is a 400), so
 * consistency comes from the prompt's reference values and the tool schema.
 * No forced tool_choice either (also a 400): the request is `auto` with a
 * strict result tool, and the prompt says to finish by calling it.
 */

// Vercel function limit. The shared deadline below stops short of it so a
// slow model call ends in a JSON 504 rather than the platform's own.
export const maxDuration = 60;
const DEADLINE_MS = 50_000;

const ParseRequestSchema = z.object({
  input: z.string().min(1, "Input is required").max(500, "Input too long"),
});

const AIParseResponseSchema = z.object({
  water: z.number().min(0).max(10000).nullable(),
  sodiumMg: z.number().min(0).max(20000).nullable(),
  sugarG: z.number().min(0).max(1000).nullable(),
  potassiumMg: z.number().min(0).max(20000).nullable(),
  isDrink: z.boolean().optional(),
  caffeineMg: z.number().min(0).max(2000).nullable().optional(),
  abvPercent: z.number().min(0).max(100).nullable().optional(),
  reasoning: z.string().max(1000).optional(),
});

const rateLimiter = createRateLimiter(20);

export const POST = withAuth(async ({ request, auth }) => {
  try {
    if (!rateLimiter.check(rateLimitKey(request, auth.userId))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = ParseRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Parse request failed", parsed.error);
    }

    const { input } = parsed.data;
    console.log(`[AUDIT] AI parse from user: ${auth.userId}`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const sanitizedInput = sanitizeForAI(input);
    if (!sanitizedInput) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    const userMessage = `Estimate water (ml), sodium (mg), total sugar (g) and potassium (mg) for: "${sanitizedInput}". Use web_search for branded or regional items, then call parse_food_result.`;

    // If the model finishes with text instead of calling the structured
    // tool, requestToolCall runs one more (unforced, append-only) turn that
    // asks for it, with the prior context. WEB_SEARCH_TOOL stays declared on
    // that turn because the replayed assistant turn may contain
    // server_tool_use blocks.
    const { toolUse: toolBlock } = await requestToolCall(
      client,
      {
        model: CLAUDE_MODELS.quality,
        // Headroom for adaptive thinking (always on for this model) and the
        // search traffic as well as the tool call itself.
        max_tokens: 8192,
        // The user is waiting on a lookup, not an open-ended analysis:
        // medium keeps it quick. Set explicitly — the default is high.
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: userMessage }],
      },
      {
        usage: { userId: auth.userId!, resolved, route: "/api/ai/parse" },
        deadline: Date.now() + DEADLINE_MS,
        toolName: PARSE_RESULT_TOOL.name,
        retryInstruction: "Now return the final estimate via the parse_food_result tool.",
        retryMaxTokens: 4096,
        forceOnRetry: false,
      },
    );

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const toolInput = toolBlock.input as Record<string, unknown>;
    const validated = AIParseResponseSchema.safeParse({
      water: toolInput.water_ml,
      sodiumMg: toolInput.sodium_mg,
      sugarG: toolInput.sugar_g,
      potassiumMg: toolInput.potassium_mg,
      isDrink: toolInput.is_drink,
      caffeineMg: toolInput.caffeine_mg,
      abvPercent: toolInput.abv_percent,
      reasoning: toolInput.reasoning,
    });
    if (!validated.success) {
      console.error("[VALIDATION] AI response validation failed:", JSON.stringify(z.flattenError(validated.error)));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    return NextResponse.json({
      water: validated.data.water,
      // Backwards-compatible field name; value is always sodium in mg.
      salt: validated.data.sodiumMg,
      measurement_type: "sodium" as const,
      sugar: validated.data.sugarG,
      potassium: validated.data.potassiumMg,
      // A drink routes to logDrink on the client so its caffeine/alcohol is
      // recorded the same way the voice and Liquids paths record it.
      is_drink: validated.data.isDrink ?? false,
      caffeine_mg: validated.data.caffeineMg ?? null,
      abv_percent: validated.data.abvPercent ?? null,
      ...(validated.data.reasoning !== undefined && { reasoning: validated.data.reasoning }),
    });
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("AI parse error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
