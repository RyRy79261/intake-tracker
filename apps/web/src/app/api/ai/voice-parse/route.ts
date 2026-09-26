import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT } from "@intake/ai-prompts/voice-parse";
import { PARSE_TOOL, extractVoiceItems } from "@/app/api/ai/voice-parse/schema";

/**
 * Parse a voice transcript into a heterogeneous list of health record items
 * (BP, HR, weight, water, sodium, food, caffeine, alcohol, urination,
 * defecation). Mirrors the pattern in /api/ai/parse — structured tool output,
 * two-turn fallback when the model returns prose instead of calling the
 * tool, and per-item validation on the response (see schema.ts).
 */

/**
 * Characters of transcript sent to the model — about two minutes of speech.
 * Longer transcripts are accepted (up to MAX_REQUEST_CHARS) and cut to this,
 * with `transcriptTruncated` in the response so the review panel can say the
 * tail was not parsed, rather than silently losing it.
 */
const MAX_TRANSCRIPT_CHARS = 2000;
const MAX_REQUEST_CHARS = 8000;

const ParseRequestSchema = z.object({
  transcript: z.string().min(1).max(MAX_REQUEST_CHARS),
});

/**
 * True for the SDK's per-call timeout. The SDK's timeout error does not set
 * `name`, so this must be an `instanceof` check — a name comparison never
 * matched and every timeout fell through to the generic 502.
 */
function isTimeoutError(e: unknown): boolean {
  return (
    e instanceof Anthropic.APIConnectionTimeoutError ||
    (e instanceof Error && e.name === "AbortError")
  );
}

const rateLimiter = createRateLimiter(20);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);

    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = ParseRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("voice-parse request invalid", parsed.error);
    }

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    // Sanitize one char past the cap so an over-long transcript is detected
    // after PII redaction (which changes the length), then cut to the cap.
    const redacted = sanitizeForAI(parsed.data.transcript, MAX_TRANSCRIPT_CHARS + 1);
    const transcriptTruncated = redacted.length > MAX_TRANSCRIPT_CHARS;
    const sanitized = redacted.slice(0, MAX_TRANSCRIPT_CHARS).trim();
    if (!sanitized) {
      return NextResponse.json({ error: "Empty input after sanitization" }, { status: 400 });
    }

    console.log(`[AUDIT] voice-parse from user: ${auth.userId}`);

    const userMessage = `Voice transcript:\n"""\n${sanitized}\n"""\n\nExtract every distinct health log item and return them via the parse_voice_log tool.`;

    // Per-call timeout — the SDK's 10 min default is poor UX for a user
    // actively waiting after speaking. Sonnet outputs ~75 tok/s; a full
    // 2048-token response is ~28s before TTFT and peak-hour jitter, so
    // 60s gives ~2x margin over the worst legitimate case.
    const REQUEST_TIMEOUT_MS = 60_000;
    // The SDK retries a timed-out call twice by default, turning the 60 s
    // budget into ~180 s of waiting. One retry covers a transient blip.
    const REQUEST_OPTIONS = { timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 };

    let response: Anthropic.Messages.Message;
    const startedAt = Date.now();
    try {
      response = await client.messages.create(
        {
          model: CLAUDE_MODELS.quality,
          max_tokens: 4096, // headroom for Sonnet 5 adaptive thinking
          system: SYSTEM_PROMPT,
          tools: [PARSE_TOOL],
          messages: [{ role: "user", content: userMessage }],
        },
        REQUEST_OPTIONS
      );
    } catch (e) {
      if (isTimeoutError(e)) {
        return NextResponse.json({ error: "AI request timed out" }, { status: 504 });
      }
      throw e;
    }
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/voice-parse",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, PARSE_TOOL.name);

    if (!toolBlock) {
      let followup: Anthropic.Messages.Message;
      const followupStartedAt = Date.now();
      try {
        followup = await client.messages.create(
          {
            model: CLAUDE_MODELS.quality,
            max_tokens: 4096, // headroom for Sonnet 5 adaptive thinking
            system: SYSTEM_PROMPT,
            tools: [PARSE_TOOL],
            tool_choice: { type: "tool", name: PARSE_TOOL.name },
            messages: [
              { role: "user", content: userMessage },
              { role: "assistant", content: response.content },
              {
                role: "user",
                content: "Return the structured items via the parse_voice_log tool now.",
              },
            ],
          },
          REQUEST_OPTIONS
        );
      } catch (e) {
        if (isTimeoutError(e)) {
          return NextResponse.json({ error: "AI request timed out" }, { status: 504 });
        }
        throw e;
      }
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/voice-parse",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, PARSE_TOOL.name);
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 }
      );
    }

    const extracted = extractVoiceItems(toolBlock.input);
    if (!extracted.ok) {
      console.error(
        "[VALIDATION] voice-parse: tool output had no usable items:",
        JSON.stringify(toolBlock.input)
      );
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 }
      );
    }
    if (extracted.dropped > 0) {
      console.warn(
        `[VALIDATION] voice-parse: dropped ${extracted.dropped} malformed item(s)`
      );
    }

    if (extracted.overCap > 0) {
      console.warn(
        `[VALIDATION] voice-parse: ${extracted.overCap} item(s) over the cap were cut`
      );
    }

    // What was left out travels with the items, so the review panel can say
    // so instead of looking complete.
    return NextResponse.json({
      items: extracted.items,
      ...(extracted.reasoning !== undefined && { reasoning: extracted.reasoning }),
      ...(extracted.dropped > 0 && { dropped: extracted.dropped }),
      ...(extracted.overCap > 0 && { overCap: extracted.overCap }),
      ...(transcriptTruncated && { transcriptTruncated: true }),
    });
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("voice-parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse transcript" },
      { status: 502 }
    );
  }
});
