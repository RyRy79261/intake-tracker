import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
// The client's contract for this route: the response must match it.
import type { AiRoutes } from "@/lib/ai-client";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "@/app/api/ai/substance-lookup/schema";
import { buildSystemPrompt } from "@intake/ai-prompts/substance-lookup";

/**
 * Caffeine per 100 ml or ABV for a named drink, plus its sugar and sodium.
 *
 * Caffeine figures must be sourced, not recalled. The caffeine prompt
 * mandates a search on every query, but a prompt is an instruction, not a
 * guarantee: the model can answer from recall and the response looks the
 * same. Recalled caffeine figures are what issue #262 was (they collapse
 * onto one remembered value per category, so brewing method stops moving
 * the answer), so a caffeine lookup is search-required. ABV is exempt: it
 * is a label value the model can legitimately know.
 */

const RequestSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["caffeine", "alcohol"]),
});

// Sugar and sodium ride along with every lookup: without them a cola or a
// cider found here was logged sugar-free, while the same drink entered by
// voice or on the Food card recorded its sugar.
const SOLUTE_ASK = "Also report its total sugars (g) and sodium (mg) per 100 ml.";

export const substanceLookupTask = {
  route: "/api/ai/substance-lookup",
  rateLimit: 15,
  request: RequestSchema,
  tier: "quality",
  // Headroom for adaptive thinking, which is always on for this model.
  maxTokens: 4096,
  tool: SUBSTANCE_LOOKUP_TOOL,
  retryInstruction: "Now return the final answer via the substance_lookup_result tool.",
  search: ({ type }) =>
    type === "caffeine"
      ? {
          mode: "required",
          insist:
            "You must call the web_search tool before answering — a figure from memory is not acceptable here. Cite the source you used in reasoning.",
          message:
            "Could not verify the caffeine content against a source. Try again, or enter the value manually.",
        }
      : { mode: "allowed" },
  prompt: ({ query, type }) => {
    const sanitized = sanitizeForAI(query);
    if (!sanitized) return reply(400, { error: "Invalid input after sanitization" });
    return {
      system: buildSystemPrompt(type),
      user:
        type === "caffeine"
          ? `Look up caffeine content per 100 ml for: "${sanitized}". ${SOLUTE_ASK} Use web_search first -- always, not only for branded products -- then call substance_lookup_result.`
          : `Look up the ABV (% alcohol by volume) for: "${sanitized}". ${SOLUTE_ASK} Use web_search if it is a branded product, then call substance_lookup_result. Return the ABV as a percentage (e.g. 5, 13, 40), NOT grams of ethanol.`,
    };
  },
  output: zodOutput(SubstanceLookupResponseSchema),
  respond: (out) => out,
  messages: { failed: "Failed to process request" },
} satisfies AiTaskSpec<
  z.infer<typeof RequestSchema>,
  z.infer<typeof SubstanceLookupResponseSchema>,
  AiRoutes["/api/ai/substance-lookup"]["result"]
>;
