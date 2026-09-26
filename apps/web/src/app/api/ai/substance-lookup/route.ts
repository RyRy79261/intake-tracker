import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "@/app/api/ai/substance-lookup/schema";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import {
  createMessage,
  findToolUse,
  hasCompletedWebSearch,
  type CallOptions,
} from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { buildSystemPrompt } from "@intake/ai-prompts/substance-lookup";
import { rejectsForcedToolChoice } from "@intake/ai-prompts/models";

// Vercel function limit. The shared deadline stops short of it so a slow
// search-and-answer turn ends in a JSON 504 rather than the platform's own.
export const maxDuration = 60;
const DEADLINE_MS = 50_000;

const RequestSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["caffeine", "alcohol"]),
});

const rateLimiter = createRateLimiter(15);

/*
 * Caffeine figures must be sourced, not recalled.
 *
 * The caffeine prompt mandates a search on every query, but a prompt is an
 * instruction, not a guarantee — the model can answer straight from recall and
 * the response looks identical. Recalled caffeine figures are what issue #262
 * was: they collapse onto one remembered value per category, so brewing method
 * stops moving the answer. So the route verifies rather than trusts, using
 * hasCompletedWebSearch (an errored search does not count).
 */

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
    // Sugar and sodium ride along with every lookup: without them a cola or a
    // cider found here was logged sugar-free, while the same drink entered by
    // voice or on the Food card recorded its sugar.
    const soluteAsk = "Also report its total sugars (g) and sodium (mg) per 100 ml.";
    const userPrompt =
      type === "caffeine"
        ? `Look up caffeine content per 100 ml for: "${sanitized}". ${soluteAsk} Use web_search first -- always, not only for branded products -- then call substance_lookup_result.`
        : `Look up the ABV (% alcohol by volume) for: "${sanitized}". ${soluteAsk} Use web_search if it is a branded product, then call substance_lookup_result. Return the ABV as a percentage (e.g. 5, 13, 40), NOT grams of ethanol.`;

    // One deadline for every upstream call this request makes. createMessage
    // branches on stop_reason: a refusal throws (-> 422 AI_REFUSED), a
    // max_tokens cut-off is retried with more budget, and a paused web-search
    // turn is resumed rather than read as "no answer".
    const callOptions: CallOptions = {
      usage: { userId: auth.userId!, resolved, route: "/api/ai/substance-lookup" },
      deadline: Date.now() + DEADLINE_MS,
    };

    const response = await createMessage(
      client,
      {
        model: CLAUDE_MODELS.quality,
        max_tokens: 4096,
        system: systemPrompt,
        tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
        messages: [{ role: "user", content: userPrompt }],
      },
      callOptions,
    );

    let toolBlock = findToolUse(response.content, SUBSTANCE_LOOKUP_TOOL.name);

    // ABV is exempt from the search gate: it is a label value the model can
    // legitimately know.
    const searchRequired = type === "caffeine";
    let searched = hasCompletedWebSearch([response]);
    let priorContent = response.content;

    if (searchRequired && !searched) {
      const retry = await createMessage(
        client,
        {
          model: CLAUDE_MODELS.quality,
          max_tokens: 4096,
          system: systemPrompt,
          // Deliberately no tool_choice here: forcing the structured tool would
          // stop it searching, which is the one thing we need it to do.
          tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
          // A fresh turn, NOT a continuation. The rejected answer is a bare
          // tool_use block, and the Messages API requires every assistant
          // tool_use to be followed by a matching tool_result — replaying it
          // without one is a malformed request. There is also nothing worth
          // carrying over: the answer is being discarded precisely because it
          // was unsourced.
          messages: [
            {
              role: "user",
              content: `${userPrompt} You must call the web_search tool before answering — a figure from memory is not acceptable here. Cite the source you used in reasoning.`,
            },
          ],
        },
        callOptions,
      );
      searched = hasCompletedWebSearch([retry]);
      priorContent = retry.content;
      // Take the result ONLY from the retry. Falling back to the first answer
      // would pair the retry's "searched" flag with the unsourced value it was
      // meant to replace — exactly the number this gate exists to reject.
      toolBlock = findToolUse(retry.content, SUBSTANCE_LOOKUP_TOOL.name);
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
      const model = CLAUDE_MODELS.quality;
      const followup = await createMessage(
        client,
        {
          model,
          max_tokens: 4096, // headroom for Sonnet 5 adaptive thinking
          system: systemPrompt,
          // WEB_SEARCH_TOOL must stay declared because the prior assistant turn
          // may contain server_tool_use blocks; tool_choice still forces the
          // structured tool where the model accepts a forced choice.
          tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
          tool_choice: rejectsForcedToolChoice(model)
            ? { type: "auto" }
            : { type: "tool", name: SUBSTANCE_LOOKUP_TOOL.name },
          messages: [
            { role: "user", content: userPrompt },
            ...(priorContent.length > 0
              ? [{ role: "assistant" as const, content: priorContent }]
              : []),
            {
              role: "user",
              content: "Now return the final answer via the substance_lookup_result tool.",
            },
          ],
        },
        callOptions,
      );
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
