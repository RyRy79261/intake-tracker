import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { PARSE_TOOL, extractVoiceItems } from "@/app/api/ai/voice-parse/schema";

/**
 * Parse a voice transcript into a heterogeneous list of health record items
 * (BP, HR, weight, water, sodium, food, caffeine, alcohol, urination,
 * defecation). Mirrors the pattern in /api/ai/parse — structured tool output,
 * two-turn fallback when the model returns prose instead of calling the
 * tool, and per-item validation on the response (see schema.ts).
 */

const ParseRequestSchema = z.object({
  transcript: z.string().min(1).max(2000),
});

const SYSTEM_PROMPT = `You convert a spoken health log transcript into a structured list of items. The user dictates multiple distinct events in one utterance — extract each as its own item.

Item kinds (use exactly these strings):
- "blood_pressure": systolic (mmHg, int), diastolic (mmHg, int), heartRate (bpm, int, optional), position ("sitting"|"standing", optional), arm ("left"|"right", optional)
- "weight": weightKg (number, convert if user says lbs: kg = lbs * 0.4536)
- "water": ml (number, convert oz: ml = oz * 29.5735, cup: 240, glass: 250)
- "salt": sodiumMg (number, in mg sodium NOT salt — if user says "1g of salt" convert: sodium_mg = salt_g * 400)
- "food": description (short string), grams (optional), waterMl (optional rough estimate of water content), sodiumMg (optional rough estimate of sodium), sugarG (optional rough estimate of total sugars in grams — the sum of naturally-occurring and added sugars, as on a nutrition label's "of which sugars" line. Examples: 330ml can of regular cola ~35g, medium apple ~19g, banana ~14g, glass of milk 250ml ~12g, fruit juice 250ml ~22g, plain water/black coffee/eggs/plain meat ~0g), potassiumMg (optional rough estimate of potassium content in mg — elemental K+. Examples: medium banana ~420mg, baked potato with skin ~900mg, avocado half ~485mg, glass of orange juice 250ml ~500mg, glass of milk 250ml ~380mg, cooked spinach 1 cup ~840mg, chicken breast 100g ~250mg, plain water/black coffee ~0-100mg)
- "caffeine": description, caffeineMg (e.g. drip coffee 250ml ~ 95mg, espresso 30ml ~ 63mg, tea ~ 47mg), volumeMl (optional)
- "alcohol": description, abvPercent (alcohol by volume % — the number printed on the bottle label: lager ~5, IPA ~6, red wine ~13, vodka ~40), volumeMl (volume of the drink in ml: pint 568, half pint 284, wine glass 125-175, single spirit measure 25-30, double 50). Always provide BOTH abvPercent and volumeMl. Never report "standard drinks" or "units" — the app derives those from abvPercent and volumeMl.
- "urination": amountEstimate ("small"|"medium"|"large", optional)
- "defecation": amountEstimate ("small"|"medium"|"large", optional)

Rules:
1. Numbers spoken loosely ("about 110 over 75", "around 80") → take the central number verbatim.
2. Blood pressure "112 over 75 heart rate 78" → one blood_pressure item with heartRate. Heart rate alone (no BP) → still emit a blood_pressure item only if systolic/diastolic are also given; otherwise skip it (no orphan HR item type exists).
3. "Toasted cheese sandwich with 2 slices of cheddar" → one food item; estimate grams (~ 180 for 2-slice sandwich) and rough sodiumMg (~ 600).
4. "Glass of orange juice" → one food item with waterMl ~ 240 and sodiumMg ~ 2, description "glass of orange juice". Do NOT also emit a water item — food handles its own water content.
5. A plain "glass of water" → one water item ml: 250 (not a food item).
6. If the user says "I just had X and Y", emit one item per distinct intake.
7. If you cannot extract anything from the transcript, return items: [].
8. Always call the parse_voice_log tool. Never return prose only.
9. Be conservative on optional fields — only include them if the transcript supports the value.`;

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

    const sanitized = sanitizeForAI(parsed.data.transcript);
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

    let response: Anthropic.Messages.Message;
    const startedAt = Date.now();
    try {
      response = await client.messages.create(
        {
          model: CLAUDE_MODELS.quality,
          max_tokens: 2048,
          temperature: 0,
          system: SYSTEM_PROMPT,
          tools: [PARSE_TOOL],
          messages: [{ role: "user", content: userMessage }],
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );
    } catch (e) {
      if (e instanceof Error && (e.name === "APIConnectionTimeoutError" || e.name === "AbortError")) {
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
            max_tokens: 2048,
            temperature: 0,
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
          { timeout: REQUEST_TIMEOUT_MS }
        );
      } catch (e) {
        if (e instanceof Error && (e.name === "APIConnectionTimeoutError" || e.name === "AbortError")) {
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

    return NextResponse.json({
      items: extracted.items,
      ...(extracted.reasoning !== undefined && { reasoning: extracted.reasoning }),
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
