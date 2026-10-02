import { z } from "zod";
import { BP_RANGES, WEIGHT_RANGE_KG } from "@intake/core/record-schemas";
import { REFRESHABLE_KINDS } from "@/lib/voice-types";

/**
 * Schema + tool definition for /api/ai/voice-parse, kept separate from the
 * route so the parsing logic can be unit-tested without pulling in Next.js
 * request machinery (mirrors api/ai/substance-lookup/schema.ts).
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

/**
 * A local wall-clock "YYYY-MM-DDTHH:mm" with no zone, cut to the minute
 * (seconds, if the sender added them, are dropped). Rejects a date that does
 * not exist (2026-02-30) as well as a wrong shape.
 */
const localDateTime = z
  .string()
  .refine((value) => {
    const m = LOCAL_DATE_TIME.exec(value);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  })
  .transform((value) => value.slice(0, 16));

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The client's clock when it sent the transcript. The server has no idea what
 * time it is for the user, so "yesterday at 8pm" can only be dated from this.
 * It goes into the prompt, hence the strict shapes: the zone must be one Intl
 * knows, not free text.
 */
export const ClientNowSchema = z.object({
  localDateTime,
  timeZone: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/)
    .refine(isIanaTimeZone),
  // Real zones span UTC-12:00 to UTC+14:00.
  utcOffsetMinutes: z.number().int().min(-720).max(840),
});

export const MAX_REQUEST_CHARS = 8000;

export const ParseRequestSchema = z.object({
  transcript: z.string().min(1).max(MAX_REQUEST_CHARS),
  // Optional: a cached client from before this field existed still sends the
  // transcript alone, and must keep working. Without a clock the model is
  // asked for relative times only (see `extractVoiceItems`). A clock that is
  // present but malformed is still a 400.
  now: ClientNowSchema.optional(),
  /** Set by a review row's refresh: re-look-up one item of this kind. */
  kind: z.enum(REFRESHABLE_KINDS).optional(),
});

/** A relative time further back than this is not a slip of the tongue. */
const MAX_MINUTES_AGO = 366 * 24 * 60;

/**
 * Optional "when" of an item, shared by every kind: either a local wall-clock
 * date-time the user stated ("yesterday at 8pm" → absolute), or an offset
 * from now ("an hour ago" → relative, 60). The client turns both into a
 * timestamp with the device's zone, and clamps a future time to now. A
 * malformed value is stripped (`.catch`) rather than failing the item, so a
 * bad time never costs the user the reading itself.
 */
const timing = {
  when: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("absolute"), localDateTime }),
      z.object({
        kind: z.literal("relative"),
        minutesAgo: z.number().min(0).max(MAX_MINUTES_AGO).transform(Math.round),
      }),
    ])
    .nullish()
    .catch(undefined),
};

export const ItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("blood_pressure"),
    ...timing,
    // Ranges shared with the add/edit forms (@intake/core/record-schemas).
    systolic: z.number().int().min(BP_RANGES.systolic.min).max(BP_RANGES.systolic.max),
    diastolic: z.number().int().min(BP_RANGES.diastolic.min).max(BP_RANGES.diastolic.max),
    heartRate: z
      .number()
      .int()
      .min(BP_RANGES.heartRate.min)
      .max(BP_RANGES.heartRate.max)
      .optional(),
    position: z.enum(["sitting", "standing"]).optional(),
    arm: z.enum(["left", "right"]).optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("weight"),
    ...timing,
    weightKg: z.number().min(WEIGHT_RANGE_KG.min).max(WEIGHT_RANGE_KG.max),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("water"),
    ...timing,
    ml: z.number().min(1).max(10000),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("salt"),
    ...timing,
    sodiumMg: z.number().min(1).max(20000),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("food"),
    ...timing,
    description: z.string().min(1).max(200),
    grams: z.number().min(1).max(5000).optional(),
    waterMl: z.number().min(0).max(5000).optional(),
    sodiumMg: z.number().min(0).max(20000).optional(),
    sugarG: z.number().min(0).max(1000).optional(),
    potassiumMg: z.number().min(0).max(20000).optional(),
  }),
  // Drinks carry their own dissolved solutes so the model never needs to pair
  // one with a `food` item to record a latte's sugar — that pairing booked the
  // same fluid twice (issue #322).
  z.object({
    kind: z.literal("caffeine"),
    ...timing,
    description: z.string().min(1).max(200),
    caffeineMg: z.number().min(0).max(2000),
    volumeMl: z.number().min(0).max(5000).optional(),
    sugarG: z.number().min(0).max(1000).optional(),
    sodiumMg: z.number().min(0).max(20000).optional(),
    potassiumMg: z.number().min(0).max(20000).optional(),
  }),
  z.object({
    kind: z.literal("alcohol"),
    ...timing,
    description: z.string().min(1).max(200),
    abvPercent: z.number().min(0).max(95),
    volumeMl: z.number().min(1).max(5000),
    sugarG: z.number().min(0).max(1000).optional(),
    sodiumMg: z.number().min(0).max(20000).optional(),
    potassiumMg: z.number().min(0).max(20000).optional(),
  }),
  z.object({
    kind: z.literal("urination"),
    ...timing,
    amountEstimate: z.enum(["small", "medium", "large"]).optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("defecation"),
    ...timing,
    amountEstimate: z.enum(["small", "medium", "large"]).optional(),
    note: z.string().max(200).optional(),
  }),
]);

type ParsedItem = z.infer<typeof ItemSchema>;
type ItemWhen = NonNullable<ParsedItem["when"]>;
/** An item as the route returns it: `when` is present only when a time was said. */
type WithWhen<T> = T extends unknown ? Omit<T, "when"> & { when?: ItemWhen } : never;
export type VoiceParsedItem = WithWhen<ParsedItem>;

export const MAX_ITEMS = 20;
const MAX_REASONING_CHARS = 1000;

// Tool definition moved to @intake/ai-prompts in Phase 4a; re-exported so the
// route handler and this module's tests resolve `PARSE_TOOL` unchanged. The zod
// schema + extractVoiceItems below stay here (route-level validation/parsing).
export { PARSE_TOOL } from "@intake/ai-prompts/voice-parse";

export type VoiceExtractResult =
  | {
      ok: true;
      items: VoiceParsedItem[];
      reasoning?: string;
      /** Items the model returned that failed validation and were discarded. */
      dropped: number;
      /** Valid items cut off by the {@link MAX_ITEMS} cap. */
      overCap: number;
    }
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
export function extractVoiceItems(
  input: unknown,
  /**
   * `absoluteTimes: false` when the request carried no client clock: the
   * model was given no date, so an absolute `when` can only be a guess and is
   * stripped (the item is kept and saves at "now").
   */
  { absoluteTimes = true }: { absoluteTimes?: boolean } = {},
): VoiceExtractResult {
  if (typeof input !== "object" || input === null) return { ok: false };
  const obj = input as { items?: unknown; reasoning?: unknown };
  if (!Array.isArray(obj.items)) return { ok: false };

  const items: VoiceParsedItem[] = [];
  let dropped = 0;
  for (const raw of obj.items) {
    const parsed = ItemSchema.safeParse(raw);
    if (parsed.success) {
      // "No time said" arrives as null, an absent key, or a stripped (caught)
      // value; all three leave the response with no `when` key.
      const { when, ...rest } = parsed.data;
      const keep = when && (absoluteTimes || when.kind === "relative");
      items.push((keep ? { ...rest, when } : rest) as VoiceParsedItem);
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
    overCap: Math.max(0, items.length - MAX_ITEMS),
    ...(reasoning ? { reasoning } : {}),
  };
}
