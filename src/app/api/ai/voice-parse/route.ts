import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";

/**
 * Parse a voice transcript into a heterogeneous list of health record items
 * (BP, HR, weight, water, sodium, food, caffeine, alcohol, urination,
 * defecation). Mirrors the pattern in /api/ai/parse — structured tool output,
 * two-turn fallback when the model returns prose instead of calling the
 * tool, and Zod validation on the response.
 */

const ParseRequestSchema = z.object({
  transcript: z.string().min(1).max(2000),
});

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("blood_pressure"),
    systolic: z.number().int().min(40).max(260),
    diastolic: z.number().int().min(20).max(200),
    heartRate: z.number().int().min(20).max(250).optional(),
    position: z.enum(["sitting", "standing"]).optional(),
    arm: z.enum(["left", "right"]).optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("weight"),
    weightKg: z.number().min(1).max(500),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("water"),
    ml: z.number().min(1).max(10000),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("salt"),
    sodiumMg: z.number().min(1).max(20000),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("food"),
    description: z.string().min(1).max(200),
    grams: z.number().min(1).max(5000).optional(),
    waterMl: z.number().min(0).max(5000).optional(),
    sodiumMg: z.number().min(0).max(20000).optional(),
  }),
  z.object({
    kind: z.literal("caffeine"),
    description: z.string().min(1).max(200),
    caffeineMg: z.number().min(0).max(2000),
    volumeMl: z.number().min(0).max(5000).optional(),
  }),
  z.object({
    kind: z.literal("alcohol"),
    description: z.string().min(1).max(200),
    standardDrinks: z.number().min(0).max(50),
    volumeMl: z.number().min(0).max(5000).optional(),
  }),
  z.object({
    kind: z.literal("urination"),
    amountEstimate: z.enum(["small", "medium", "large"]).optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("defecation"),
    amountEstimate: z.enum(["small", "medium", "large"]).optional(),
    note: z.string().max(200).optional(),
  }),
]);

const ResponseSchema = z.object({
  items: z.array(ItemSchema).max(20),
  reasoning: z.string().max(1000).optional(),
});

const SYSTEM_PROMPT = `You convert a spoken health log transcript into a structured list of items. The user dictates multiple distinct events in one utterance — extract each as its own item.

Item kinds (use exactly these strings):
- "blood_pressure": systolic (mmHg, int), diastolic (mmHg, int), heartRate (bpm, int, optional), position ("sitting"|"standing", optional), arm ("left"|"right", optional)
- "weight": weightKg (number, convert if user says lbs: kg = lbs * 0.4536)
- "water": ml (number, convert oz: ml = oz * 29.5735, cup: 240, glass: 250)
- "salt": sodiumMg (number, in mg sodium NOT salt — if user says "1g of salt" convert: sodium_mg = salt_g * 400)
- "food": description (short string), grams (optional), waterMl (optional rough estimate of water content), sodiumMg (optional rough estimate of sodium)
- "caffeine": description, caffeineMg (e.g. drip coffee 250ml ~ 95mg, espresso 30ml ~ 63mg, tea ~ 47mg), volumeMl (optional)
- "alcohol": description, standardDrinks (1 std drink = 10g ethanol; beer 330ml@5% ~ 1.3, wine 150ml@13% ~ 1.5, shot 45ml@40% ~ 1.4), volumeMl (optional)
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

const PARSE_TOOL = {
  name: "parse_voice_log" as const,
  description:
    "Return a structured list of health log items extracted from a voice transcript.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description: "Ordered list of extracted items. Empty if nothing parseable.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "blood_pressure",
                "weight",
                "water",
                "salt",
                "food",
                "caffeine",
                "alcohol",
                "urination",
                "defecation",
              ],
            },
            // Fields are union — Anthropic tool input schemas don't enforce
            // discriminated unions, so we list everything and validate
            // server-side with Zod.
            systolic: { type: "number" },
            diastolic: { type: "number" },
            heartRate: { type: "number" },
            position: { type: "string", enum: ["sitting", "standing"] },
            arm: { type: "string", enum: ["left", "right"] },
            weightKg: { type: "number" },
            ml: { type: "number" },
            sodiumMg: { type: "number" },
            description: { type: "string" },
            grams: { type: "number" },
            waterMl: { type: "number" },
            caffeineMg: { type: "number" },
            standardDrinks: { type: "number" },
            volumeMl: { type: "number" },
            amountEstimate: { type: "string", enum: ["small", "medium", "large"] },
            note: { type: "string" },
          },
          required: ["kind"],
        },
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of estimates and assumptions.",
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

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
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured on server" },
        { status: 503 }
      );
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

    let toolBlock = findToolUse(response.content, PARSE_TOOL.name);

    if (!toolBlock) {
      let followup: Anthropic.Messages.Message;
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
      toolBlock = findToolUse(followup.content, PARSE_TOOL.name);
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 }
      );
    }

    const validated = ResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] voice-parse response invalid:",
        JSON.stringify(validated.error.flatten())
      );
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("voice-parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse transcript" },
      { status: 502 }
    );
  }
});
