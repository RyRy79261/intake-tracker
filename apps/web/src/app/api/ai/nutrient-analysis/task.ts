import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import {
  SYSTEM_PROMPT,
  NUTRIENT_ANALYSIS_TOOL,
  MAX_FOOD_DESCRIPTION_CHARS,
  MAX_FOOD_GRAMS,
  MAX_FOOD_ENTRIES,
} from "@intake/ai-prompts/nutrient-analysis";
import {
  MAX_MEDICATION_NAME_CHARS,
  MAX_MEDICATION_DOSE_CHARS,
  MAX_MEDICATION_FREQUENCY_CHARS,
} from "@intake/ai-prompts/analytics-insights";

/**
 * Nutrient bias findings over weeks of logged food. Quality tier with
 * web_search allowed for branded or regional items.
 */

const FoodItemSchema = z.object({
  description: z.string().min(1).max(MAX_FOOD_DESCRIPTION_CHARS),
  grams: z.number().min(0).max(MAX_FOOD_GRAMS).optional(),
});

// Shape mirrors MedicationSchema in analytics-insights.ts — duplicated here
// rather than imported so the two routes stay independent. The field caps
// are shared so the producer (buildMedicationSummary) clamps to the same
// bounds both validators enforce.
const MedicationSchema = z.object({
  name: z.string().min(1).max(MAX_MEDICATION_NAME_CHARS),
  phaseType: z.enum(["maintenance", "titration", "prn"]),
  dose: z.string().min(1).max(MAX_MEDICATION_DOSE_CHARS),
  frequency: z.string().min(1).max(MAX_MEDICATION_FREQUENCY_CHARS),
  daysOnPhase: z.number().int().nonnegative(),
});

const NutrientAnalysisRequestSchema = z.object({
  windowDays: z.number().int().min(1).max(90),
  focus: z.string().max(200).optional(),
  foods: z.array(FoodItemSchema).min(1).max(MAX_FOOD_ENTRIES),
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

export const nutrientAnalysisTask = {
  route: "/api/ai/nutrient-analysis",
  rateLimit: 10,
  request: NutrientAnalysisRequestSchema,
  tier: "quality",
  // Adaptive thinking shares this ceiling with the search traffic and the
  // tool call, and high effort thinks more. A budget that runs out costs a
  // whole second call the deadline has no room for, so the ceiling is
  // generous; a short answer still bills short.
  maxTokens: 16000,
  retryMaxTokens: 4096,
  tool: NUTRIENT_ANALYSIS_TOOL,
  retryInstruction:
    "Now return your nutrient bias findings via the report_nutrient_analysis tool.",
  search: { mode: "allowed" },
  prompt: ({ windowDays, focus, foods, conditions, medications }) => {
    const foodListText = buildFoodListText(foods);
    if (!foodListText) {
      return reply(400, { error: "No analyzable food entries after sanitization." });
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
        contextSections.push(`Reported conditions: ${safeConditions.join(", ")}`);
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

    return {
      system: SYSTEM_PROMPT,
      user: `Below are the user's logged food and drink entries from the last ${windowDays} days. Some have approximate portions (in grams) shown in parentheses; many will not. Use web_search if you need to look up specific branded or regional items, then call the report_nutrient_analysis tool with your synthesis.${focusLine}${contextBlock}\n\nFoods:\n${foodListText}`,
    };
  },
  output: zodOutput(NutrientAnalysisResponseSchema),
  respond: (out) => out,
  messages: {
    failed: "Failed to process request",
    // The shared refusal text says to enter the value by hand, which means
    // nothing for an analysis.
    refused: "The AI declined to analyze this food log.",
  },
} satisfies AiTaskSpec<
  z.infer<typeof NutrientAnalysisRequestSchema>,
  z.infer<typeof NutrientAnalysisResponseSchema>,
  unknown
>;
