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
  description: "Return the substance content per 100ml and typical serving size for a beverage",
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description: "For caffeine: mg per 100ml. For alcohol: standard drinks per 100ml.",
      },
      defaultVolumeMl: {
        type: "number",
        description: "Typical single serving volume in ml",
      },
      beverageName: {
        type: "string",
        description: "Normalized name of the beverage",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of the estimate and data source",
      },
      waterContentPercent: {
        type: "number",
        description: "Estimated water content as a percentage (0-100). Reference: black coffee ~99, beer ~93, wine ~87, spirits ~60.",
      },
    },
    required: ["substancePer100ml", "defaultVolumeMl", "beverageName", "reasoning", "waterContentPercent"],
    additionalProperties: false,
  },
};
