import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { NoAiKeyError } from "@/lib/ai-key-resolver";

/**
 * Translate provider / key-resolution errors into responses the client UI
 * can act on. Anything not recognised returns `null` so the caller can
 * surface its own generic 502.
 *
 * Codes the client checks:
 *   NO_AI_KEY   — user has not configured a key for this provider.
 *   INVALID_KEY — the resolved key was rejected upstream (401/403).
 */
export function aiErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof NoAiKeyError) {
    return NextResponse.json(
      {
        error: `No ${error.provider} API key configured. Add one in Settings → AI features.`,
        code: "NO_AI_KEY",
        provider: error.provider,
      },
      { status: 402 },
    );
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json(
      {
        error: "Anthropic rejected the API key. Update it in Settings → AI features.",
        code: "INVALID_KEY",
        provider: "anthropic",
      },
      { status: 400 },
    );
  }

  return null;
}
