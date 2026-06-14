import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

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
  console.error(`[VALIDATION] ${context}:`, JSON.stringify(z.flattenError(error)));
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

/**
 * Parse the request body as JSON, returning a tagged union so the caller
 * can short-circuit with a 400 instead of letting a SyntaxError bubble to
 * the outer 500/502 handler.
 */
export async function parseJsonBody(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request" }, { status: 400 }),
    };
  }
}

