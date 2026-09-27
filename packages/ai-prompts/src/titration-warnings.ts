/**
 * Tool definition + system prompt for POST /api/ai/titration-warnings.
 *
 * Pure, SDK-free prompt/tool artifacts extracted from the route handler in
 * Phase 4a. The route imports them from @intake/ai-prompts; the Anthropic SDK
 * client, key vault, and zod request/response validation stay in apps/web.
 */

import { STE_FIELD_SUFFIX, plainLanguageSection } from "./plain-language";

export const TITRATION_WARNINGS_TOOL = {
  name: "titration_warnings_result" as const,
  description: "Return warning signs to watch during medication titration",
  // Schema-valid arguments without forcing the tool, which the premium
  // model (Claude Opus 5.5) rejects.
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "One warning sign per entry, in one short sentence: what to watch for and what to do." + STE_FIELD_SUFFIX,
      },
    },
    required: ["warnings"],
    additionalProperties: false,
  },
};

export const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a list of medications involved in a dosage titration (with schedule details including times, amounts, and frequency), provide a concise list of warning signs the patient should watch for during the titration period.

Focus on:
- Symptoms that indicate the new dosage is too high or causing adverse effects
- Timing-specific concerns (e.g., evening doses causing insomnia, morning doses causing drowsiness)
- Drug interaction concerns when multiple medications change simultaneously or are taken at the same time
- Frequency changes (e.g., going from 1x to 2x daily -- peak/trough effects)
- Vital sign thresholds to watch (blood pressure, heart rate, etc.)
- Symptoms requiring immediate medical attention

Use the titration_warnings_result tool to return the warnings.
Keep each warning to one short sentence. Aim for 4-8 warnings. Be practical and patient-friendly, not overly clinical.

${plainLanguageSection(
  ["warnings"],
  "medication names, doses, times, units and vital-sign thresholds (for example 90 mmHg or 50 beats per minute)",
)}
Each warning says what to watch for and what to do. Example: "If your heart rate goes below 50 beats per minute, call your doctor."`;
