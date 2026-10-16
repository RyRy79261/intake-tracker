import "server-only";
import type { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import { SYSTEM_PROMPT, buildRefreshMessage, buildUserMessage } from "@intake/ai-prompts/voice-parse";
import {
  PARSE_TOOL,
  ParseRequestSchema,
  extractVoiceItems,
  type VoiceExtractResult,
} from "@/app/api/ai/voice-parse/schema";

/**
 * Parse a voice transcript into a heterogeneous list of health record items
 * (BP, HR, weight, water, sodium, food, caffeine, alcohol, urination,
 * defecation), checked item by item (see schema.ts). Quality tier. The tool
 * is not strict: the API can't compile its schema (see PARSE_TOOL), so the
 * items are checked with Zod instead.
 *
 * A review row's refresh (`kind` set) is different: the first parse got
 * that item wrong, so the model is told not to trust the old values and to
 * check the corrected item on the web, and an answer from memory is refused.
 */

/**
 * Characters of transcript sent to the model — about two minutes of speech.
 * Longer transcripts are accepted (up to MAX_REQUEST_CHARS in schema.ts) and
 * cut to this, with `transcriptTruncated` in the response so the review
 * panel can say the tail was not parsed, rather than silently losing it.
 */
const MAX_TRANSCRIPT_CHARS = 2000;

type Request = z.infer<typeof ParseRequestSchema>;
type Extracted = Extract<VoiceExtractResult, { ok: true }>;

/**
 * Sanitize one char past the cap so an over-long transcript is detected
 * after PII redaction (which changes the length), then cut to the cap.
 */
function sanitizeTranscript(transcript: string) {
  const redacted = sanitizeForAI(transcript, MAX_TRANSCRIPT_CHARS + 1);
  return {
    text: redacted.slice(0, MAX_TRANSCRIPT_CHARS).trim(),
    truncated: redacted.length > MAX_TRANSCRIPT_CHARS,
  };
}

export const voiceParseTask = {
  route: "/api/ai/voice-parse",
  rateLimit: 20,
  request: ParseRequestSchema,
  tier: "quality",
  // Headroom for adaptive thinking, which shares the ceiling with the tool
  // call — plus the search traffic on a refresh.
  maxTokens: ({ kind }) => (kind ? 8192 : 4096),
  tool: PARSE_TOOL,
  retryInstruction: "Return the structured items via the parse_voice_log tool now.",
  search: ({ kind }) =>
    kind
      ? {
          mode: "required",
          insist:
            "You must call the web_search tool before answering — values from memory are not acceptable here.",
          message:
            "Could not check this item against a web source. Try again, or enter the values yourself.",
        }
      : { mode: "off" },
  prompt: ({ transcript, now, kind }) => {
    const sanitized = sanitizeTranscript(transcript).text;
    if (!sanitized) return reply(400, { error: "Empty input after sanitization" });
    // The client's clock (local time, zone, offset) leads the user turn, so
    // the model can date "yesterday at 8pm". It is validated to strict
    // shapes and is not PII; nothing else about the device is sent. An older
    // cached client sends no clock: the message then states no time and asks
    // for relative times only.
    return {
      system: SYSTEM_PROMPT,
      user: kind ? buildRefreshMessage(sanitized, kind) : buildUserMessage(sanitized, now),
    };
  },
  output: (toolInput, req) => {
    const extracted = extractVoiceItems(toolInput, { absoluteTimes: req.now !== undefined });
    return extracted.ok
      ? { ok: true, value: extracted }
      : { ok: false, detail: `no usable items in ${JSON.stringify(toolInput)}` };
  },
  // What was left out travels with the items, so the review panel can say
  // so instead of looking complete.
  respond: (out, { req }) => {
    if (out.dropped > 0) {
      console.warn(`[VALIDATION] voice-parse: dropped ${out.dropped} malformed item(s)`);
    }
    if (out.overCap > 0) {
      console.warn(`[VALIDATION] voice-parse: ${out.overCap} item(s) over the cap were cut`);
    }
    return {
      items: out.items,
      ...(out.reasoning !== undefined && { reasoning: out.reasoning }),
      ...(out.dropped > 0 && { dropped: out.dropped }),
      ...(out.overCap > 0 && { overCap: out.overCap }),
      ...(sanitizeTranscript(req.transcript).truncated && { transcriptTruncated: true }),
    };
  },
  messages: { failed: "Failed to parse transcript" },
  // The response is not yet checked against the client's VoiceParseResponse:
  // the server's and the client's voice item types are separate copies
  // (idea #8 merges them into one contract).
} satisfies AiTaskSpec<Request, Extracted, unknown>;
