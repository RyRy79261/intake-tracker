/**
 * System prompt + tool definition for POST /api/ai/medicine-about — the
 * "About this medicine" page of an Rx card.
 *
 * Separate from medicine-search on purpose (owner decision, Ward Console
 * PR 8): the wizard lookup stays fast and cheap, and this longer answer is
 * only fetched when the user asks for it. The result is stored on the
 * prescription (`Prescription.medicineInfo`).
 *
 * Pure and SDK-free, like the other prompt modules.
 */

import { STE_FIELD_SUFFIX as STE, plainLanguageSection } from "./plain-language";

export const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. The user takes the medicine named in the message. Explain the medicine to them with the medicine_about_result tool.

For EACH active ingredient, give one entry in "compounds":
- "name": the active ingredient name.
- "drugClass": the type of medicine, with a plain explanation in brackets. Example: "ACE inhibitor (a medicine that makes blood vessels wider)".
- "forText": what doctors use it for. Name each condition in plain words first.
- "howItWorks": how it works in the body, in two or three short sentences.
- "sideEffects": the common side effects, each as a short phrase. Example: "Dry cough".
A single-ingredient medicine has exactly one entry. A combination tablet (for example Sacubitril/Valsartan) has one entry per ingredient.

"drugClass" (top level): the type of the whole medicine. For a combination, say how the parts work together.
"warnings": the important risks. For each, "risk" says what can happen and "whatToDo" says what the user must do. Include the serious risks that need emergency help.
"contraindications": when not to take it, one situation per entry.
"foodInstruction": "before" or "after" eating when that matters, else "none". "foodNote": one or two sentences about food, drink or timing.
"pillDescription": what the common tablets or capsules look like, in general terms. "visualIdentification": typical markings, or "" when you are not sure. Do not guess markings.

Be precise and evidence-based. If you are not sure about a detail, leave it out rather than guess.

${plainLanguageSection(
  ["drugClass", "forText", "howItWorks", "sideEffects", "risk", "whatToDo", "contraindications", "foodNote", "pillDescription", "visualIdentification"],
  "medicine names, active ingredient names, doses and units",
)}`;

export const MEDICINE_ABOUT_TOOL = {
  name: "medicine_about_result" as const,
  description: "Return plain-English information about a medicine the user takes",
  // Schema-valid arguments without forcing the tool, which the premium
  // model (Claude Opus 5.5) rejects.
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      drugClass: {
        type: "string",
        description: "The type of the whole medicine and what it does." + STE,
      },
      compounds: {
        type: "array",
        description: "One entry per active ingredient.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The active ingredient name, exactly." },
            drugClass: {
              type: "string",
              description: "The type of medicine, with a plain explanation in brackets." + STE,
            },
            forText: { type: "string", description: "What it is used for." + STE },
            howItWorks: { type: "string", description: "How it works in the body." + STE },
            sideEffects: {
              type: "array",
              items: { type: "string" },
              description: "Common side effects, each a short phrase." + STE,
            },
          },
          required: ["name", "drugClass", "forText", "howItWorks", "sideEffects"],
          additionalProperties: false,
        },
      },
      warnings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            risk: { type: "string", description: "What can happen." + STE },
            whatToDo: { type: "string", description: "What the user must do about it." + STE },
          },
          required: ["risk", "whatToDo"],
          additionalProperties: false,
        },
      },
      contraindications: {
        type: "array",
        items: { type: "string" },
        description: "When not to take it, one situation per entry." + STE,
      },
      foodInstruction: { type: "string", enum: ["before", "after", "none"] },
      foodNote: { type: "string", description: "Food, drink or timing advice." + STE },
      pillDescription: { type: "string", description: "What the common tablets look like." + STE },
      visualIdentification: {
        type: "string",
        description: "Typical markings, or empty when not sure." + STE,
      },
    },
    required: [
      "drugClass", "compounds", "warnings", "contraindications",
      "foodInstruction", "foodNote", "pillDescription", "visualIdentification",
    ],
    additionalProperties: false,
  },
};
