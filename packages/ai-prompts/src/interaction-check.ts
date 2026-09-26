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

/** One row of the validated interaction_check_result output. */
export interface InteractionRow {
  substance: string;
  medication: string;
  severity: "AVOID" | "CAUTION" | "OK";
  description: string;
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The prompt asks for a row per medication, but nothing forces the model to
 * comply, and an omitted drug reads exactly like "no interaction" (the lookup
 * UI shows a green all-clear, the add-medication wizard saves silently). For
 * every requested medication with no matching row — case-insensitive, and a
 * returned "Bisoprolol (Concor)" still matches "bisoprolol" — append a
 * CAUTION "Not assessed" row so the gap is visible and never read as safe.
 */
export function withUnassessedMedications<T extends InteractionRow>(
  interactions: T[],
  requestedMedications: string[],
  substance: string,
): (T | InteractionRow)[] {
  const returned = interactions.map((i) => normaliseName(i.medication));
  const seen = new Set<string>();
  const missing: InteractionRow[] = [];
  for (const medication of requestedMedications) {
    const key = normaliseName(medication);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const assessed = returned.some(
      (r) => r !== "" && (r.includes(key) || key.includes(r)),
    );
    if (assessed) continue;
    missing.push({
      substance,
      medication: medication.trim(),
      severity: "CAUTION",
      description:
        "Not assessed: the AI check returned no result for this medication. Check this combination with your pharmacist.",
    });
  }
  return missing.length > 0 ? [...interactions, ...missing] : interactions;
}
