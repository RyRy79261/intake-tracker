/**
 * System-prompt builder + tool definition for POST /api/ai/substance-lookup.
 *
 * Pure, SDK-free prompt/tool artifacts extracted in Phase 4a. The zod
 * request/response validation + parsing helpers stay in the route's schema.ts
 * (which re-exports the tool below so existing importers resolve unchanged).
 */

export function buildSystemPrompt(type: "caffeine" | "alcohol"): string {
  if (type === "caffeine") {
    return `You are a beverage research assistant. Given a beverage name, return its caffeine content per 100 ml, a typical serving size, and its sugar and sodium per 100 ml.

Units (metric only):
- substancePer100ml = milligrams of caffeine per 100 ml of beverage
- defaultVolumeMl = typical single serve in millilitres
- sugarPer100ml = grams of total sugars per 100 ml (the label's "of which sugars" line; 0 for an unsweetened drink)
- sodiumPer100ml = milligrams of sodium per 100 ml (0 if negligible)

Process:
1. ALWAYS use the web_search tool, for every query without exception. Never
   answer caffeine content from your own knowledge. Recalled caffeine figures
   are unreliable in practice -- they collapse onto a single remembered value
   for whole categories, so brewing method and brand stop moving the answer.
   This applies to generic items (filter coffee, black tea, cola) exactly as
   much as to branded ones.
2. Search for the specific thing asked for. If the query names a brewing
   method or preparation (pour-over, V60, Chemex, French press, AeroPress,
   moka pot, cold brew, percolator, Turkish, siphon, instant), search for that
   method -- brewed coffee varies several-fold by method, so a generic
   "coffee" figure is the wrong answer.
3. Prefer per-100-ml figures from USDA FoodData Central, the manufacturer, or
   Caffeine Informer. If only a per-serving figure is published, divide by the
   stated serving volume and say so in reasoning.
4. Cite what you actually used in reasoning: the source and the figure it
   gave. "Estimated" or an uncited number means you skipped step 1.
5. If search returns nothing usable, say so in reasoning and return your best
   available figure clearly marked as unverified. Never present a recalled
   number as if it were sourced.
6. Always finish by calling the substance_lookup_result tool with the
   structured output.`;
  }

  return `You are a beverage research assistant. Given an alcoholic drink name, return its ABV (alcohol by volume), a typical serving size, and its sugar and sodium per 100 ml.

CRITICAL UNIT RULE:
- substancePer100ml MUST be ABV as a percentage by volume -- the same number printed on the bottle label.
- It is NOT grams of ethanol per 100 ml.
- It is NOT millilitres of ethanol per 100 ml (numerically the same as ABV %, but think of it as the label %).
- Examples: typical lager = 5, IPA = 6-7, red wine = 13, vodka = 40, cask-strength whisky = 60.

Other fields:
- defaultVolumeMl = typical single serving in millilitres (e.g. pint = 568, half pint = 284, wine glass = 175, single spirit = 25 (UK) / 30 (most of EU))
- sugarPer100ml = grams of total sugars per 100 ml (the label's "of which sugars" line; cider, alcopops, liqueurs and sweet wine carry real sugar, dry spirits ~0)
- sodiumPer100ml = milligrams of sodium per 100 ml (0 if negligible)

Process:
1. For branded products, regional drinks, craft beers, named cocktails, or anything you are not 100% sure of, USE THE web_search TOOL to look up the producer's stated ABV or a reputable retailer listing.
2. For generic items (lager, red wine, vodka) you may answer from your own knowledge but stay within typical ranges.
3. Always finish by calling the substance_lookup_result tool with the structured output. Do NOT convert ABV to grams or mg.`;
}

export const SUBSTANCE_LOOKUP_TOOL = {
  name: "substance_lookup_result" as const,
  description:
    "Return beverage data. For caffeine queries: caffeine in mg per 100 ml. For alcohol queries: ABV as a percentage (vol/vol). Always include sugar (g) and sodium (mg) per 100 ml.",
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description:
          "FOR CAFFEINE QUERIES: caffeine in milligrams per 100 ml of beverage, taken from the source you searched -- not from memory, and not anchored to any example. FOR ALCOHOL QUERIES: ABV as a percentage by volume -- the same number that appears on the bottle label (e.g. 5 for typical lager, 12 for wine, 40 for vodka). NEVER grams of ethanol. NEVER mg of ethanol.",
      },
      defaultVolumeMl: {
        type: "number",
        description: "Typical single serving volume in millilitres.",
      },
      beverageName: {
        type: "string",
        description: "Normalised name of the beverage.",
      },
      reasoning: {
        type: "string",
        description:
          "Brief explanation of the estimate, citing the source (web search result, manufacturer label, etc.) and the unit interpretation used.",
      },
      sugarPer100ml: {
        type: "number",
        description:
          "Total sugars in grams per 100 ml (the nutrition label's 'of which sugars' figure). 0 for black coffee, plain tea, dry spirits and other unsweetened drinks.",
      },
      sodiumPer100ml: {
        type: "number",
        description: "Sodium in milligrams per 100 ml. 0 if negligible.",
      },
    },
    required: [
      "substancePer100ml",
      "defaultVolumeMl",
      "beverageName",
      "reasoning",
      "sugarPer100ml",
      "sodiumPer100ml",
    ],
    additionalProperties: false,
  },
};
