import { z } from "zod";

// Shared by the substance-lookup route and the Liquids preset tab. Lives under
// lib/ (not app/api) because the Capacitor export removes app/api before
// type-checking the client.

export const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
  // Dissolved solutes, per 100 ml. Optional so a model reply that omits them
  // still validates; the client reads a missing value as none, and clears any
  // value left over from the previous drink.
  sugarPer100ml: z.number().min(0).max(100).optional(),
  sodiumPer100ml: z.number().min(0).max(10000).optional(),
});

/** The JSON body POST /api/ai/substance-lookup returns on success. */
export type SubstanceLookupResponse = z.infer<typeof SubstanceLookupResponseSchema>;
