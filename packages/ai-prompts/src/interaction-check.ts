/**
 * System prompt + tool definition for POST /api/ai/interaction-check.
 *
 * Pure, SDK-free prompt/tool artifacts extracted from the route handler in
 * Phase 4a. The route imports them from @intake/ai-prompts; the Anthropic SDK
 * client, key vault, and zod request/response validation stay in apps/web.
 */

import { STE_FIELD_SUFFIX, plainLanguageSection } from "./plain-language";

export const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a patient's current medications and a substance to check, identify drug interactions. Return the results using the interaction_check_result tool.

Severity levels:
- AVOID: Dangerous combination, should not be taken together
- CAUTION: Monitor closely, potential interaction that may require dose adjustment or timing separation
- OK: No significant interaction known

Be precise and evidence-based. Err on the side of CAUTION when uncertain.

Check the queried substance against EACH active medication. Include an entry for every medication, even if the severity is OK.

${plainLanguageSection(
  ["description", "drugClass", "summary"],
  'substance names, medication names (copy each one exactly as written in the list, without the drug class in brackets), doses and units',
)}
In each "description", say what can happen and what to do. Example: "Both lower blood pressure. You can feel dizzy when you stand up. Check your blood pressure more often."`;

export const INTERACTION_CHECK_TOOL = {
  name: "interaction_check_result" as const,
  description: "Return drug interaction analysis for a substance against current medications",
  // Schema-valid arguments without forcing the tool, which the premium
  // model (Claude Opus 5.5) rejects.
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      interactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            substance: { type: "string" },
            medication: {
              type: "string",
              description:
                "The medication name exactly as written in the list, without the drug class in brackets.",
            },
            severity: { type: "string", enum: ["AVOID", "CAUTION", "OK"] },
            description: {
              type: "string",
              description: "What the interaction does and what to do about it." + STE_FIELD_SUFFIX,
            },
          },
          required: ["substance", "medication", "severity", "description"],
          additionalProperties: false,
        },
      },
      drugClass: {
        type: "string",
        description: "The type of medicine the queried substance is and what it does, in plain words." + STE_FIELD_SUFFIX,
      },
      summary: {
        type: "string",
        description: "One-line overall safety summary." + STE_FIELD_SUFFIX,
      },
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
  // Unicode-aware: an ASCII-only class would reduce a non-Latin name to ""
  // and silently exempt it from the coverage check.
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
