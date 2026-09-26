/**
 * Tests for the shared provider / key-resolution error mapping.
 */
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { KeyUnreadableError, NoAiKeyError } from "@/lib/ai-key-resolver";
import {
  AiIncompleteError,
  AiRefusalError,
  AiTimeoutError,
  AiTruncatedError,
} from "@/app/api/ai/_shared/claude-call";

async function mapped(error: unknown) {
  const res = aiErrorResponse(error);
  if (!res) return null;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("aiErrorResponse", () => {
  it("maps NoAiKeyError to 402 NO_AI_KEY", async () => {
    const res = await mapped(new NoAiKeyError("anthropic"));
    expect(res?.status).toBe(402);
    expect(res?.body.code).toBe("NO_AI_KEY");
  });

  it("maps the caller's own unreadable key to a 'Re-enter your key' 4xx", async () => {
    const res = await mapped(new KeyUnreadableError("anthropic", "own_stored"));
    expect(res?.status).toBe(400);
    expect(res?.body.code).toBe("KEY_UNREADABLE");
    expect(String(res?.body.error)).toMatch(/re-enter/i);
  });

  it("tells a grantee that the shared key has to be re-entered by its owner", async () => {
    const res = await mapped(new KeyUnreadableError("anthropic", "shared_from"));
    expect(res?.status).toBe(400);
    expect(res?.body.code).toBe("KEY_UNREADABLE");
    expect(String(res?.body.error)).toMatch(/shared/i);
  });

  it("maps a model refusal to a clear 422 that points at manual entry", async () => {
    const res = await mapped(new AiRefusalError("bio"));
    expect(res?.status).toBe(422);
    expect(res?.body.code).toBe("AI_REFUSED");
    expect(res?.body.fallbackToManual).toBe(true);
  });

  it("maps a truncated or unfinished turn to a 502 with its own code", async () => {
    expect((await mapped(new AiTruncatedError()))?.body.code).toBe("RESPONSE_TRUNCATED");
    expect((await mapped(new AiIncompleteError()))?.body.code).toBe("AI_INCOMPLETE");
  });

  it("maps a deadline or SDK timeout to a JSON 504", async () => {
    expect((await mapped(new AiTimeoutError()))?.status).toBe(504);
    const sdkTimeout = new Anthropic.APIConnectionTimeoutError();
    const res = await mapped(sdkTimeout);
    expect(res?.status).toBe(504);
    expect(res?.body.code).toBe("AI_TIMEOUT");
  });

  it("returns null for anything it doesn't recognise", () => {
    expect(aiErrorResponse(new Error("boom"))).toBeNull();
  });
});
