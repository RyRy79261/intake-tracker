/**
 * System prompt + tool definition for POST /api/ai/medicine-search.
 *
 * Pure, SDK-free prompt/tool artifacts extracted from the route handler in
 * Phase 4a. The route imports them from @intake/ai-prompts; the Anthropic SDK
 * client, key vault, and zod request/response validation stay in apps/web.
 */

import { STE_FIELD_SUFFIX as STE } from "./plain-language";

export const SYSTEM_PROMPT = `You are a pharmaceutical information assistant. When given a medication name or active ingredient, respond with information about the medication using the medicine_search_result tool. Pay special attention to looking up the physical appearance of the pill (its color and shape) and country specific brand names.

Use the web_search tool to confirm the pill's physical appearance and the brand names sold in the user's country before answering. Do not report a colour or shape from memory: if a search doesn't turn it up, leave pillColor and pillShape empty. Always finish by calling medicine_search_result.

If the user searches for a specific brand name, you MUST provide the physical description for that specific brand and include the searched brand name in the response. If you cannot find information for that exact brand and must fall back to generic information, explicitly mention that the physical description and details are for the generic equivalent.

Be precise with medical information.

FOOD: choose "foodInstruction" from what the official label or patient leaflet says.
- "after": take it with or after a meal (the label says "take with food" or "with a meal").
- "before": take it on an empty stomach, before a meal.
- "none": when the label says food does not matter. Do not choose "none" just because you are not sure: search the label first.
- If you cannot find what the label says, choose "none" and say so in "foodNote": "The food rule was not found. Check the package leaflet." Never guess "before" or "after".
"foodNote" is one or two short sentences. Say what to do, then why, in the user's words. Do not write about how you decided. If the kind of meal matters (for example, the meal must contain some fat), say so and give a plain example. Example: "Take it during or just after a meal. Food makes the medicine act more slowly, so you are less likely to feel dizzy."

APPEARANCE: the pill often looks different for each strength. Search for the appearance of each marketed strength of the searched brand, and put it in that strength's "pillColor", "pillShape" and "markings" in "strengthOptions". The last section of the package leaflet ("What X looks like", in German "Wie sieht X aus") usually describes every strength in one place, so search for the leaflet first. The top-level "pillColor", "pillShape" and "visualIdentification" describe the most common strength. Do not describe the other strengths in "pillDescription": it is for the general look only.
These fields are copied into the user's form: "pillColor", "pillShape", "markings" and "visualIdentification" hold only the colour, the shape or the print on the pill. When a search does not turn it up, leave the field empty. Never write a note such as "not confirmed" or "check the leaflet" in them. Put that advice in "pillDescription".

COMBINATION DRUGS: Many medications combine two or more active ingredients in one tablet (e.g. sacubitril/valsartan sold as Entresto or Vymada, or amlodipine/valsartan). For EVERY medication:
- "activeIngredients": list each active ingredient by name. A single-ingredient drug has exactly one entry; a combination drug has two or more.
- "strengthOptions": one entry per marketed strength of the searched brand. Each entry has a "label" (how the strength is printed on the box, e.g. "100 (49/51 mg)" or "75 mg") and a "compounds" array giving the per-tablet milligram amount of EACH active ingredient. For a combination tablet sold as "Vymada 100", compounds is [{"name":"Sacubitril","strength":49},{"name":"Valsartan","strength":51}]. For a single-ingredient tablet, compounds has one entry whose strength equals the tablet strength.
Always populate "activeIngredients" and "strengthOptions" — they are required.

CONDITIONS: the user message can list the user's own conditions. Many medicines treat more than one condition. Put first in "commonIndications" the use that matches the user's conditions, then the other common uses. Each entry is the use only, in a few words: the first entry is copied into the user's form. Do not add notes about approval or licensing to an entry; put them in "warnings" if they matter. Example: carvedilol for a user with a fast heart rate: "Slows a fast heart rate" first, then "High blood pressure". Do not invent a match: if none of the user's conditions fits, keep the usual order. Never repeat the user's conditions in any other field.

PLAIN LANGUAGE (ASD-STE100 Simplified Technical English): the user is not a medical expert. Write every free-text field in ASD-STE100 style: "commonIndications", "foodNote", "pillDescription", "drugClass", "visualIdentification", "contraindications" and "warnings".
- Use short sentences: at most 20 words, one idea per sentence.
- Use active voice and simple, common words.
- Do not use medical jargon or Latin terms. If you must use a medical term, explain it right after in plain words, in brackets. Example: "ACE inhibitor (a medicine that makes blood vessels wider)".
- Say what the risk is and what to do. Example: "Do not take with potassium supplements. Your potassium level can become too high."
- For a condition, name it in plain words first. Example: "High blood pressure" instead of "Hypertension".
Do NOT simplify names or numbers: keep brand names, generic names, active ingredient names, strength labels and units exactly as printed.`;

export const MEDICINE_SEARCH_TOOL = {
  name: "medicine_search_result" as const,
  description: "Return pharmaceutical information for a medication",
  // Schema-valid arguments are guaranteed without forcing the tool, which
  // the premium model (Claude Opus 5.5) rejects.
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      brandNames: { type: "array", items: { type: "string" } },
      localAlternatives: { type: "array", items: { type: "string" } },
      genericName: { type: "string" },
      dosageStrengths: { type: "array", items: { type: "string" } },
      activeIngredients: {
        type: "array",
        items: { type: "string" },
        description: "Each active ingredient name; one entry for a single-ingredient drug, two or more for a combination drug",
      },
      strengthOptions: {
        type: "array",
        description: "One entry per marketed strength, with the per-tablet mg of each active ingredient and what that pill looks like",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            pillColor: { type: "string", description: "Colour of the pill at this strength; empty if not found" },
            pillShape: { type: "string", description: "Shape of the pill at this strength; empty if not found" },
            markings: { type: "string", description: "What is printed or scored on the pill at this strength; empty if not found" },
            compounds: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  strength: { type: "number" },
                },
                required: ["name", "strength"],
                additionalProperties: false,
              },
            },
          },
          required: ["label", "pillColor", "pillShape", "markings", "compounds"],
          additionalProperties: false,
        },
      },
      commonIndications: { type: "array", items: { type: "string" }, description: "What the medicine is used for, in plain words. The use that matches the user's conditions comes first." + STE },
      foodInstruction: { type: "string", enum: ["before", "after", "none"] },
      foodNote: { type: "string", description: "What to do about food and why, in one or two sentences." + STE },
      pillColor: { type: "string" },
      pillShape: { type: "string" },
      pillDescription: { type: "string", description: "What the pill looks like." + STE },
      drugClass: { type: "string", description: "The type of medicine and what it does, in plain words." + STE },
      visualIdentification: { type: "string", description: "Detailed notes on physical markings." + STE },
      contraindications: { type: "array", items: { type: "string" }, description: "When not to take it, in plain words." + STE },
      warnings: { type: "array", items: { type: "string" }, description: "Risks and what to do about them, in plain words." + STE },
      isGenericFallback: { type: "boolean" },
    },
    required: [
      "brandNames", "localAlternatives", "genericName", "dosageStrengths",
      "activeIngredients", "strengthOptions",
      "commonIndications", "foodInstruction", "foodNote", "pillColor",
      "pillShape", "pillDescription", "drugClass", "visualIdentification",
      "contraindications", "warnings", "isGenericFallback",
    ],
    additionalProperties: false,
  },
};
