/**
 * Client-side reader for AI route error bodies.
 *
 * The AI routes answer failures with `{ error, code? }`, and `error` is
 * already written for the user: NO_AI_KEY and INVALID_KEY point at Settings →
 * AI features, SEARCH_REQUIRED says to retry or enter the value manually, and
 * 429 says to wait. Callers show that text rather than a generic "failed".
 */
export async function readAiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim() !== "") {
      return body.error;
    }
  } catch {
    // Non-JSON body — fall through to the caller's wording.
  }
  return fallback;
}
