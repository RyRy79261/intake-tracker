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
import { buildSystemPrompt } from "@intake/ai-prompts/substance-lookup";

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

/**
 * Did a web search actually complete and return results?
 *
 * The caffeine prompt mandates a search on every query, but a prompt is an
 * instruction, not a guarantee — the model can answer straight from recall and
 * the response looks identical. Recalled caffeine figures are what issue #262
 * was: they collapse onto one remembered value per category, so brewing method
 * stops moving the answer. So the route verifies rather than trusts.
 *
 * An errored search does not count: `content` is a WebSearchToolResultError
 * object rather than an array of results, which leaves the model nothing to
 * source from.
 */
function hasCompletedWebSearch(content: Anthropic.Messages.ContentBlock[]): boolean {
  return content.some(
    (b) =>
      b.type === "web_search_tool_result" &&
      Array.isArray(b.content) &&
      b.content.length > 0
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
        ? `Look up caffeine content per 100 ml for: "${sanitized}". Use web_search first -- always, not only for branded products -- then call substance_lookup_result.`
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

    // Caffeine figures must be sourced, not recalled — see hasCompletedWebSearch.
    // ABV is exempt: it is a label value the model can legitimately know.
    const searchRequired = type === "caffeine";
    let searched = hasCompletedWebSearch(response.content);
    let priorContent = response.content;

    if (searchRequired && !searched) {
      const retryStartedAt = Date.now();
      const retry = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        // Deliberately no tool_choice here: forcing the structured tool would
        // stop it searching, which is the one thing we need it to do.
        tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content:
              "You answered without searching. Use the web_search tool now to find a published caffeine figure for this beverage, then call substance_lookup_result with the value you found and cite the source in reasoning.",
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
        durationMs: Date.now() - retryStartedAt,
        ...tokensFromAnthropic(retry.usage),
      });
      searched = hasCompletedWebSearch(retry.content);
      priorContent = retry.content;
      toolBlock = findToolUse(retry.content, SUBSTANCE_LOOKUP_TOOL.name) ?? toolBlock;
    }

    if (searchRequired && !searched) {
      // Returning the number anyway is how #262 happened. Refuse instead.
      console.warn(
        "[substance-lookup] caffeine result rejected: no web search completed"
      );
      return NextResponse.json(
        {
          error:
            "Could not verify the caffeine content against a source. Try again, or enter the value manually.",
          code: "SEARCH_REQUIRED",
        },
        { status: 422 }
      );
    }

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
          { role: "assistant", content: priorContent },
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
        JSON.stringify(z.flattenError(validated.error))
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
