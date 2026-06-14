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
import { SYSTEM_PROMPT, PARSE_RESULT_TOOL } from "@intake/ai-prompts/parse";

/**
 * Server-side AI parsing for food / drink descriptions.
 *
 * Always returns sodium in mg (no salt/sodium ambiguity). Uses Opus + web_search
 * for high-quality lookups, with temperature 0 for deterministic numeric answers.
 */

const ParseRequestSchema = z.object({
  input: z.string().min(1, "Input is required").max(500, "Input too long"),
});

const AIParseResponseSchema = z.object({
  water: z.number().min(0).max(10000).nullable(),
  sodiumMg: z.number().min(0).max(20000).nullable(),
  sugarG: z.number().min(0).max(1000).nullable(),
  potassiumMg: z.number().min(0).max(20000).nullable(),
  reasoning: z.string().max(1000).optional(),
});

const rateLimiter = createRateLimiter(20);

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

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
      messages: [{ role: "user", content: userMessage }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/parse",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, PARSE_RESULT_TOOL.name);

    // If the model finished with text instead of calling the structured tool,
    // run a second turn that forces the tool with the prior context.
    if (!toolBlock) {
      const followupStartedAt = Date.now();
      const followup = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        // WEB_SEARCH_TOOL must stay declared because the prior assistant turn
        // may contain server_tool_use blocks; tool_choice still forces the
        // structured tool.
        tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
        tool_choice: { type: "tool", name: PARSE_RESULT_TOOL.name },
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: "Now return the final estimate via the parse_food_result tool.",
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/parse",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, PARSE_RESULT_TOOL.name);
    }

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
