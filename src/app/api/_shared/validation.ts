import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Build a 400 response for a Zod validation failure.
 *
 * Logs the full flattened error server-side for debugging, but returns only
 * a generic message to the client to avoid disclosing schema shape (which
 * helps probing attackers and leaks no useful info to legitimate callers).
 */
export function zodErrorResponse(
  context: string,
  error: ZodError<unknown>,
): NextResponse {
  console.error(`[VALIDATION] ${context}:`, JSON.stringify(error.flatten()));
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
