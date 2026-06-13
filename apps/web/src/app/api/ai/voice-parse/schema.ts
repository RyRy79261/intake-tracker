import { z } from "zod";

/**
 * Schema + tool definition for /api/ai/voice-parse, kept separate from the
 * route so the parsing logic can be unit-tested without pulling in Next.js
 * request machinery (mirrors api/ai/substance-lookup/schema.ts).
 */

export const ItemSchema = z.discriminatedUnion("kind", [
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
    sugarG: z.number().min(0).max(1000).optional(),
    potassiumMg: z.number().min(0).max(20000).optional(),
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
    abvPercent: z.number().min(0).max(95),
    volumeMl: z.number().min(1).max(5000),
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

export type VoiceParsedItem = z.infer<typeof ItemSchema>;

export const MAX_ITEMS = 20;
const MAX_REASONING_CHARS = 1000;

// Tool definition moved to @intake/ai-prompts in Phase 4a; re-exported so the
// route handler and this module's tests resolve `PARSE_TOOL` unchanged. The zod
// schema + extractVoiceItems below stay here (route-level validation/parsing).
export { PARSE_TOOL } from "@intake/ai-prompts/voice-parse";

export type VoiceExtractResult =
  | { ok: true; items: VoiceParsedItem[]; reasoning?: string; dropped: number }
  | { ok: false };

/**
 * Resiliently extract the parse_voice_log tool output.
 *
 * Previously the whole payload was validated atomically (one Zod object with
 * `items: z.array(ItemSchema)` and `reasoning: z.string().max(1000)`). Any
 * single defect — one malformed item, or just a `reasoning` string longer
 * than 1000 chars, which is common once a multi-item log gets a per-item
 * explanation — rejected the entire response and surfaced to the user as a
 * 422 "AI response format invalid", discarding every correctly-parsed item.
 *
 * Instead: validate each item independently and keep the good ones, and
 * coerce `reasoning` (truncate) rather than rejecting on its length. Fail
 * only when there is no usable items array, or items were present but none
 * survived validation.
 */
export function extractVoiceItems(input: unknown): VoiceExtractResult {
  if (typeof input !== "object" || input === null) return { ok: false };
  const obj = input as { items?: unknown; reasoning?: unknown };
  if (!Array.isArray(obj.items)) return { ok: false };

  const items: VoiceParsedItem[] = [];
  let dropped = 0;
  for (const raw of obj.items) {
    const parsed = ItemSchema.safeParse(raw);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      dropped++;
    }
  }

  // Model returned items but every one failed validation — a genuine format
  // failure, not an empty result.
  if (obj.items.length > 0 && items.length === 0) return { ok: false };

  const reasoning =
    typeof obj.reasoning === "string" && obj.reasoning.trim().length > 0
      ? obj.reasoning.slice(0, MAX_REASONING_CHARS)
      : undefined;

  return {
    ok: true,
    items: items.slice(0, MAX_ITEMS),
    dropped,
    ...(reasoning ? { reasoning } : {}),
  };
}
