/**
 * System-prompt builder + tool definition for POST /api/ai/substance-lookup.
 *
 * Pure, SDK-free prompt/tool artifacts extracted in Phase 4a. The zod
 * request/response validation + parsing helpers stay in the route's schema.ts
 * (which re-exports the tool below so existing importers resolve unchanged).
 */

export function buildSystemPrompt(type: "caffeine" | "alcohol"): string {
  if (type === "caffeine") {
    return `You are a beverage research assistant. Given a beverage name, return its caffeine content per 100 ml, a typical serving size, and water content percentage.

Units (metric only):
- substancePer100ml = milligrams of caffeine per 100 ml of beverage
- defaultVolumeMl = typical single serve in millilitres
- waterContentPercent = 0-100

Reference points (brewed coffee varies a lot by method -- match the method the user named, do not collapse everything onto the drip value):
- Drip / auto filter coffee: ~40 mg / 100 ml
- Pour-over (V60, Chemex, Kalita, hand-poured filter): ~55 mg / 100 ml
- French press / cafetiere: ~50 mg / 100 ml
- AeroPress: ~65 mg / 100 ml
- Moka pot / stovetop: ~120 mg / 100 ml
- Cold brew, ready to drink: ~55 mg / 100 ml (undiluted concentrate is 2-3x higher)
- Instant coffee: ~30 mg / 100 ml
- Espresso: ~200 mg / 100 ml
- Black tea: ~20 mg / 100 ml
- Green tea: ~12 mg / 100 ml
- Cola: ~10 mg / 100 ml
- Energy drinks (Red Bull, Monster): ~32 mg / 100 ml
- Matcha: highly variable, ~60-100 mg / 100 ml prepared

Process:
1. For branded products (Starbucks, Red Bull variants, energy shots, regional sodas) USE THE web_search TOOL to look up the manufacturer's published value or a reputable third-party measurement (Caffeine Informer, USDA, manufacturer site). Prefer per-100-ml values; if only per-serving is available, divide by the stated serving volume.
2. When the query names a brewing method or preparation (pour-over, V60, Chemex, French press, AeroPress, moka pot, cold brew, percolator, Turkish, siphon, instant), answer with that method's reference point above -- never the generic drip value. If the method is not listed above, or the query also names a brand, bean or brew ratio, USE THE web_search TOOL.
3. For generic items with one common preparation (black tea, green tea, cola) you may answer from your own knowledge.
4. Always finish by calling the substance_lookup_result tool with the structured output.`;
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

export const SUBSTANCE_LOOKUP_TOOL = {
  name: "substance_lookup_result" as const,
  description:
    "Return beverage data. For caffeine queries: caffeine in mg per 100 ml. For alcohol queries: ABV as a percentage (vol/vol).",
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description:
          "FOR CAFFEINE QUERIES: caffeine in milligrams per 100 ml of beverage (e.g. ~40 for filter coffee, ~200 for espresso). FOR ALCOHOL QUERIES: ABV as a percentage by volume -- the same number that appears on the bottle label (e.g. 5 for typical lager, 12 for wine, 40 for vodka). NEVER grams of ethanol. NEVER mg of ethanol.",
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
      waterContentPercent: {
        type: "number",
        description:
          "Estimated water content as a percentage (0-100). Reference: black coffee ~99, beer ~93, wine ~87, spirits ~60.",
      },
    },
    required: [
      "substancePer100ml",
      "defaultVolumeMl",
      "beverageName",
      "reasoning",
      "waterContentPercent",
    ],
    additionalProperties: false,
  },
};
