import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
// The client's contract for this route: the response must match it.
import type { AiRoutes } from "@/lib/ai-client";
import { SYSTEM_PROMPT, PARSE_RESULT_TOOL } from "@intake/ai-prompts/parse";

/**
 * Food / drink description → water, sodium (always mg, so there is no
 * salt/sodium ambiguity), sugar, potassium, and caffeine/ABV for a drink.
 * Quality tier, web_search allowed for branded or regional items.
 */

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

export const parseTask = {
  route: "/api/ai/parse",
  rateLimit: 20,
  request: ParseRequestSchema,
  tier: "quality",
  // Headroom for adaptive thinking and the search traffic as well as the
  // tool call itself.
  maxTokens: 8192,
  retryMaxTokens: 4096,
  tool: PARSE_RESULT_TOOL,
  retryInstruction: "Now return the final estimate via the parse_food_result tool.",
  search: { mode: "allowed" },
  prompt: ({ input }) => {
    const sanitized = sanitizeForAI(input);
    if (!sanitized) return reply(400, { error: "Invalid input after sanitization" });
    return {
      system: SYSTEM_PROMPT,
      user: `Estimate water (ml), sodium (mg), total sugar (g) and potassium (mg) for: "${sanitized}". Use web_search for branded or regional items, then call parse_food_result.`,
    };
  },
  output: zodOutput(AIParseResponseSchema, (t) => ({
    water: t.water_ml,
    sodiumMg: t.sodium_mg,
    sugarG: t.sugar_g,
    potassiumMg: t.potassium_mg,
    isDrink: t.is_drink,
    caffeineMg: t.caffeine_mg,
    abvPercent: t.abv_percent,
    reasoning: t.reasoning,
  })),
  respond: (out) => ({
    water: out.water,
    // Backwards-compatible field name; the value is always sodium in mg.
    salt: out.sodiumMg,
    measurement_type: "sodium" as const,
    sugar: out.sugarG,
    potassium: out.potassiumMg,
    // A drink routes to logDrink on the client so its caffeine/alcohol is
    // recorded the same way the voice and Liquids paths record it.
    is_drink: out.isDrink ?? false,
    caffeine_mg: out.caffeineMg ?? null,
    abv_percent: out.abvPercent ?? null,
    ...(out.reasoning !== undefined && { reasoning: out.reasoning }),
  }),
  messages: { failed: "Failed to process request" },
} satisfies AiTaskSpec<
  z.infer<typeof ParseRequestSchema>,
  z.infer<typeof AIParseResponseSchema>,
  AiRoutes["/api/ai/parse"]["result"]
>;
