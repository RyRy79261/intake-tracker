export {
  SubstanceLookupResponseSchema,
  type SubstanceLookupResponse,
} from "@/lib/substance-lookup-schema";

// Tool definition moved to @intake/ai-prompts in Phase 4a; re-exported so the
// route handler and this module's tests resolve `SUBSTANCE_LOOKUP_TOOL`
// unchanged. The zod response schema lives in @/lib/substance-lookup-schema.
export { SUBSTANCE_LOOKUP_TOOL } from "@intake/ai-prompts/substance-lookup";
