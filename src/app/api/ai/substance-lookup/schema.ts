import { z } from "zod";

export const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
  waterContentPercent: z.number().min(0).max(100),
});

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
