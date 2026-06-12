import { z } from "zod";

export const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
  waterContentPercent: z.number().min(0).max(100),
});

// Tool definition moved to @intake/ai-prompts in Phase 4a; re-exported so the
// route handler and this module's tests resolve `SUBSTANCE_LOOKUP_TOOL`
// unchanged. The zod response schema above stays here (route-level validation).
export { SUBSTANCE_LOOKUP_TOOL } from "@intake/ai-prompts/substance-lookup";
