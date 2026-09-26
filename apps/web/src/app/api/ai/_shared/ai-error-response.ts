import "server-only";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { KeyUnreadableError, NoAiKeyError } from "@/lib/ai-key-resolver";
import {
  AiIncompleteError,
  AiRefusalError,
  AiTimeoutError,
  AiTruncatedError,
} from "@/app/api/ai/_shared/claude-call";

/**
 * Translate provider / key-resolution errors into responses the client UI
 * can act on. Anything not recognised returns `null` so the caller can
 * surface its own generic 502.
 *
 * Codes the client checks:
 *   NO_AI_KEY          — user has not configured a key for this provider.
 *   INVALID_KEY        — the resolved key was rejected upstream (401/403).
 *   KEY_UNREADABLE     — a stored key no longer decrypts (secret rotation);
 *                        the owner has to re-enter it.
 *   AI_REFUSED         — the model declined the request (stop_reason
 *                        "refusal"); retrying won't help, enter it manually.
 *   RESPONSE_TRUNCATED — the answer hit max_tokens even after a retry.
 *   AI_INCOMPLETE      — a paused web-search turn never finished.
 *   AI_TIMEOUT         — the upstream call ran past the route's deadline.
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

  if (error instanceof KeyUnreadableError) {
    return NextResponse.json(
      {
        error:
          error.source === "own_stored"
            ? `Your saved ${error.provider} key can't be read any more. Re-enter your key in Settings → AI features.`
            : `The ${error.provider} key shared with you can't be read any more. Ask its owner to re-enter it in Settings.`,
        code: "KEY_UNREADABLE",
        provider: error.provider,
      },
      { status: 400 },
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

  if (error instanceof AiRefusalError) {
    return NextResponse.json(
      {
        error: "The AI declined to answer this request. Enter the details manually.",
        code: "AI_REFUSED",
        fallbackToManual: true,
      },
      { status: 422 },
    );
  }

  if (error instanceof AiTruncatedError) {
    return NextResponse.json(
      { error: "The AI response was cut off. Try again.", code: "RESPONSE_TRUNCATED" },
      { status: 502 },
    );
  }

  if (error instanceof AiIncompleteError) {
    return NextResponse.json(
      { error: "The AI lookup didn't finish. Try again.", code: "AI_INCOMPLETE" },
      { status: 502 },
    );
  }

  if (error instanceof AiTimeoutError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return NextResponse.json(
      { error: "The AI took too long to respond. Try again.", code: "AI_TIMEOUT" },
      { status: 504 },
    );
  }

  return null;
}
