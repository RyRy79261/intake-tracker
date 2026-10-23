/**
 * Is a voice transcript a question about drug interactions, rather than
 * something to log? Drug names are often misheard, but the question words
 * around them ("interactions", "can I take") are common English that speech
 * recognition gets right, so a word check is enough and costs no AI call.
 */
const QUESTION_PATTERNS = [
  /\binteract(?:ion|ions|s)?\b/i,
  /\bcontra[\s-]?indicat/i,
  /\bcan(?:'t|not| ?not)? i (?:take|have|use|mix)\b/i,
  /\b(?:safe|ok|okay|alright) (?:for me )?to (?:take|have|use|mix)\b/i,
  /\bmix(?:ed|ing)? (?:\w+ )?with\b/i,
];

export function isInteractionQuestion(transcript: string): boolean {
  // Curly apostrophes from the transcriber count as straight ones.
  const text = transcript.replace(/[‘’]/g, "'");
  return QUESTION_PATTERNS.some((p) => p.test(text));
}
