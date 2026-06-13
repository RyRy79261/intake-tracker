/**
 * System prompt + tool definition for POST /api/ai/interaction-check.
 *
 * Pure, SDK-free prompt/tool artifacts extracted from the route handler in
 * Phase 4a. The route imports them from @intake/ai-prompts; the Anthropic SDK
 * client, key vault, and zod request/response validation stay in apps/web.
 */

export const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a patient's current medications and a substance to check, identify drug interactions. Return the results using the interaction_check_result tool.

Severity levels:
- AVOID: Dangerous combination, should not be taken together
- CAUTION: Monitor closely, potential interaction that may require dose adjustment or timing separation
- OK: No significant interaction known

Be precise and evidence-based. Err on the side of CAUTION when uncertain.

Check the queried substance against EACH active medication. Include an entry for every medication, even if the severity is OK.`;

export const INTERACTION_CHECK_TOOL = {
  name: "interaction_check_result" as const,
  description: "Return drug interaction analysis for a substance against current medications",
  input_schema: {
    type: "object" as const,
    properties: {
      interactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            substance: { type: "string" },
            medication: { type: "string" },
            severity: { type: "string", enum: ["AVOID", "CAUTION", "OK"] },
            description: { type: "string" },
          },
          required: ["substance", "medication", "severity", "description"],
          additionalProperties: false,
        },
      },
      drugClass: { type: "string", description: "Pharmacological class of the queried substance" },
      summary: { type: "string", description: "One-line overall safety summary" },
    },
    required: ["interactions", "drugClass", "summary"],
    additionalProperties: false,
  },
};
