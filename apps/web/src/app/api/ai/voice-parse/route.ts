import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { hasCompletedWebSearch, requestToolCall } from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, buildRefreshMessage, buildUserMessage } from "@intake/ai-prompts/voice-parse";
import {
  PARSE_TOOL,
  ParseRequestSchema,
  extractVoiceItems,
} from "@/app/api/ai/voice-parse/schema";

/**
 * Parse a voice transcript into a heterogeneous list of health record items
 * (BP, HR, weight, water, sodium, food, caffeine, alcohol, urination,
 * defecation). Mirrors the pattern in /api/ai/parse — structured tool output,
 * two-turn fallback when the model returns prose instead of calling the
 * tool, and per-item validation on the response (see schema.ts).
 *
 * The Claude calls go through the shared claude-call helpers, which branch on
 * `stop_reason` (a refusal is a clear 422, a max_tokens cut-off is retried
 * with a bigger budget), record usage for every upstream response, and share
 * one route-wide deadline.
 *
 * Quality tier (Claude Opus 5.5): no forced tool_choice and no sampling
 * parameters (each a 400). The request is `auto`, the prompt says to always
 * call the tool, and the retry turn is unforced. The tool is not strict: the
 * API can't compile its schema (see PARSE_TOOL), so the items are checked
 * with Zod here instead.
 */

// Vercel function limit. The shared deadline stops short of it so a slow
// model call ends in a JSON 504 rather than the platform's own. The user is
// waiting after speaking; a full 4096-token reply is well inside this.
export const maxDuration = 60;
const DEADLINE_MS = 50_000;

/**
 * Characters of transcript sent to the model — about two minutes of speech.
 * Longer transcripts are accepted (up to MAX_REQUEST_CHARS in schema.ts) and cut to this,
 * with `transcriptTruncated` in the response so the review panel can say the
 * tail was not parsed, rather than silently losing it.
 */
const MAX_TRANSCRIPT_CHARS = 2000;

const rateLimiter = createRateLimiter(20);

export const POST = withAuth(async ({ request, auth }) => {
  try {
    if (!rateLimiter.check(rateLimitKey(request, auth.userId))) {
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

    // The client's clock (local time, zone, offset) leads the user turn, so
    // the model can date "yesterday at 8pm". It is validated to strict shapes
    // above and is not PII; nothing else about the device is sent. An older
    // cached client sends no clock: the message then states no time and asks
    // for relative times only.
    //
    // A review row's refresh (`kind` set) is different: the first parse got
    // that item wrong, so the model is told not to trust the old values and
    // to check the corrected item on the web.
    const { kind } = parsed.data;
    const userMessage = kind
      ? buildRefreshMessage(sanitized, kind)
      : buildUserMessage(sanitized, parsed.data.now);

    const params = {
      model: CLAUDE_MODELS.quality,
      // Headroom for adaptive thinking, which is always on for this model
      // and shares the ceiling with the tool call — plus the search traffic
      // on a refresh.
      max_tokens: kind ? 8192 : 4096,
      // The user has just spoken and is waiting: medium, not the default
      // high.
      output_config: { effort: "medium" as const },
      system: SYSTEM_PROMPT,
      // web_search stays declared on the retry turn too, since the replayed
      // assistant turn may hold server_tool_use blocks.
      tools: kind ? [WEB_SEARCH_TOOL, PARSE_TOOL] : [PARSE_TOOL],
      tool_choice: { type: "auto" as const },
      messages: [{ role: "user" as const, content: userMessage }],
    };
    const callOptions = {
      usage: { userId: auth.userId!, resolved, route: "/api/ai/voice-parse" },
      deadline: Date.now() + DEADLINE_MS,
      toolName: PARSE_TOOL.name,
      retryInstruction: "Return the structured items via the parse_voice_log tool now.",
      forceOnRetry: false,
    };

    let { toolUse: toolBlock, responses } = await requestToolCall(client, params, callOptions);

    // Declaring web_search does not make the model use it. A refresh that
    // answered from memory is just another unverified guess, so it gets one
    // fresh try that insists on a search, and is refused if that fails too.
    if (kind && !hasCompletedWebSearch(responses)) {
      ({ toolUse: toolBlock, responses } = await requestToolCall(
        client,
        {
          ...params,
          // A fresh turn, not a continuation: the unsourced answer is being
          // thrown away, so there is nothing to carry over.
          messages: [
            {
              role: "user",
              content: `${userMessage} You must call the web_search tool before answering — values from memory are not acceptable here.`,
            },
          ],
        },
        callOptions,
      ));
      if (!hasCompletedWebSearch(responses)) {
        console.warn("[voice-parse] refresh rejected: no web search completed");
        return NextResponse.json(
          {
            error: "Could not check this item against a web source. Try again, or enter the values yourself.",
            code: "SEARCH_REQUIRED",
          },
          { status: 422 },
        );
      }
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 }
      );
    }

    const extracted = extractVoiceItems(toolBlock.input, {
      absoluteTimes: parsed.data.now !== undefined,
    });
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
