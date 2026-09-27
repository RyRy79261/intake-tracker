/**
 * ASD-STE100 Simplified Technical English rule for AI text the user reads.
 *
 * The user is not a medical expert. Every prompt whose output is shown as
 * prose embeds `plainLanguageSection(...)`, and every free-text tool field
 * appends `STE_FIELD_SUFFIX` to its description (the model reads field
 * descriptions when it fills the tool input). Names, doses and units stay
 * exact.
 */

export const STE_FIELD_SUFFIX =
  " Write in ASD-STE100 Simplified Technical English: short sentences, plain words, no unexplained jargon.";

/**
 * The PLAIN LANGUAGE section of a system prompt.
 *
 * @param fields - quoted tool field names the rule applies to.
 * @param keepExact - what must never be simplified (names, numbers, units).
 */
export function plainLanguageSection(fields: string[], keepExact: string): string {
  const list = fields.map((f) => `"${f}"`).join(", ");
  return `PLAIN LANGUAGE (ASD-STE100 Simplified Technical English): the user is not a medical expert. Write every free-text field in ASD-STE100 style: ${list}.
- Use short sentences: at most 20 words, one idea per sentence.
- Use active voice and simple, common words.
- Do not use medical jargon or Latin terms. If you must use a medical term, explain it right after in plain words, in brackets. Example: "ACE inhibitor (a medicine that makes blood vessels wider)".
- Say what the risk is and what to do. Example: "Do not take with potassium supplements. Your potassium level can become too high."
- For a condition, name it in plain words first. Example: "High blood pressure" instead of "Hypertension".
Do NOT simplify names or numbers: keep ${keepExact} exactly as given.`;
}
