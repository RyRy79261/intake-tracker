import { z } from "zod";

export const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
  waterContentPercent: z.number().min(0).max(100),
  // Dissolved solutes, per 100 ml. Optional so a model reply that omits them
  // still validates; the client reads a missing value as none, and clears any
  // value left over from the previous drink.
  sugarPer100ml: z.number().min(0).max(100).optional(),
  sodiumPer100ml: z.number().min(0).max(10000).optional(),
});

/** The JSON body POST /api/ai/substance-lookup returns on success. */
export type SubstanceLookupResponse = z.infer<typeof SubstanceLookupResponseSchema>;

// Tool definition moved to @intake/ai-prompts in Phase 4a; re-exported so the
// route handler and this module's tests resolve `SUBSTANCE_LOOKUP_TOOL`
// unchanged. The zod response schema above stays here (route-level validation).
export { SUBSTANCE_LOOKUP_TOOL } from "@intake/ai-prompts/substance-lookup";
