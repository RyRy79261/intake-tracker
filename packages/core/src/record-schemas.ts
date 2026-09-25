/**
 * One validation contract per health record type, shared by every path that
 * writes the record (dashboard create forms, card inline edits, the Records
 * tab dialogs). Before this module each path carried its own ranges, so a
 * value rejected by the add form could still be saved through an edit.
 *
 * The form parsers take raw input strings and use Number() (not parseInt /
 * parseFloat), so "120.9" reaches `.int()` and "12abc" is rejected instead of
 * being silently truncated to a numeric prefix.
 *
 * Core stays pure: the full record schemas are factories that take the
 * caller's `now` for the "not in the future" check.
 */
import { z } from "zod";

// ============================================================================
// Timestamps
// ============================================================================

/**
 * Tolerance for "now" when checking for future timestamps. datetime-local
 * inputs are minute-precision and device clocks drift, so a record stamped a
 * few minutes ahead is treated as "now" rather than rejected.
 */
export const FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
export const FUTURE_TIMESTAMP_MESSAGE = "Time can't be in the future";

export function isFutureTimestamp(timestamp: number, now: number): boolean {
  return timestamp > now + FUTURE_TIMESTAMP_SKEW_MS;
}

/** Epoch-ms timestamp that is not in the future relative to `now`. */
export function recordTimestampSchema(now: number) {
  return z
    .number()
    .int()
    .refine((ts) => !isFutureTimestamp(ts, now), FUTURE_TIMESTAMP_MESSAGE);
}

/** Optional free-text note. `null` is an explicit clear on update. */
const noteSchema = z.string().nullable().optional();

// ============================================================================
// Shared number helpers
// ============================================================================

/**
 * Parse a numeric text input. Blank → undefined ("not entered"); anything
 * else goes through Number(), so partial input like "12abc" becomes NaN and
 * fails validation instead of being truncated.
 */
export function parseNumericInput(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

function numberField(label: string) {
  return z.number({
    error: (issue) =>
      issue.input === undefined ? `${label} is required` : `${label} must be a number`,
  });
}

function intField(label: string, range: { min: number; max: number }) {
  return numberField(label)
    .int("Must be a whole number")
    .min(range.min, `Too low (min ${range.min})`)
    .max(range.max, `Too high (max ${range.max})`);
}

// ============================================================================
// Weight
// ============================================================================

export const WEIGHT_RANGE_KG = { min: 1, max: 500 } as const;

/** Round a weight to 2 dp (the stored precision). Never snaps to an increment. */
export function roundWeightKg(value: number): number {
  return Math.round(value * 100) / 100;
}

const weightFields = {
  weight: numberField("Weight")
    .min(WEIGHT_RANGE_KG.min, `Weight must be at least ${WEIGHT_RANGE_KG.min} kg`)
    .max(WEIGHT_RANGE_KG.max, `Weight seems too high (max ${WEIGHT_RANGE_KG.max} kg)`),
  note: noteSchema,
};

export function weightRecordSchema(now: number) {
  return z.object({ ...weightFields, timestamp: recordTimestampSchema(now).optional() });
}

// ============================================================================
// Blood pressure
// ============================================================================

export const BP_RANGES = {
  systolic: { min: 50, max: 300 },
  diastolic: { min: 20, max: 200 },
  heartRate: { min: 20, max: 250 },
} as const;

export const BP_ORDER_MESSAGE = "Systolic must be higher than diastolic";

const bloodPressureFields = {
  systolic: intField("Systolic", BP_RANGES.systolic),
  diastolic: intField("Diastolic", BP_RANGES.diastolic),
  heartRate: intField("Heart rate", BP_RANGES.heartRate).nullable().optional(),
  irregularHeartbeat: z.boolean().optional(),
  position: z.enum(["sitting", "standing"]).optional(),
  arm: z.enum(["left", "right"]).optional(),
  note: noteSchema,
};

const bpOrderCheck = (v: { systolic: number; diastolic: number }) => v.systolic > v.diastolic;
const bpOrderIssue = { message: BP_ORDER_MESSAGE, path: ["diastolic"] };

export function bloodPressureRecordSchema(now: number) {
  return z
    .object({ ...bloodPressureFields, timestamp: recordTimestampSchema(now).optional() })
    .refine(bpOrderCheck, bpOrderIssue);
}

/** Value fields only (no timestamp) — for edit forms. */
const bloodPressureValuesSchema = z.object(bloodPressureFields).refine(bpOrderCheck, bpOrderIssue);

/**
 * True when the reading looks like systolic and diastolic were typed into
 * each other's boxes: the order is wrong, but swapped it is a valid reading.
 * Drives the "Swap values?" prompt.
 */
export function isSwappedBloodPressure(systolic: number, diastolic: number): boolean {
  if (!(systolic < diastolic)) return false;
  const s = BP_RANGES.systolic;
  const d = BP_RANGES.diastolic;
  return (
    Number.isInteger(systolic) &&
    Number.isInteger(diastolic) &&
    diastolic >= s.min && diastolic <= s.max &&
    systolic >= d.min && systolic <= d.max
  );
}

// ============================================================================
// Urination / defecation (amount estimate + note)
// ============================================================================

export const AMOUNT_ESTIMATE_VALUES = ["small", "medium", "large"] as const;

/** Select sentinel for "No estimate" (Radix Select can't hold ""). */
export const NO_ESTIMATE_VALUE = "__none__";

export function estimateRecordSchema(now: number) {
  return z.object({
    amountEstimate: z.enum(AMOUNT_ESTIMATE_VALUES).nullable().optional(),
    timestamp: recordTimestampSchema(now).optional(),
    note: noteSchema,
  });
}

/** Map a Select value to the stored estimate: blank / "No estimate" → null. */
export function normalizeAmountEstimate(value: string | null | undefined): string | null {
  if (!value || value === NO_ESTIMATE_VALUE) return null;
  return value;
}

// ============================================================================
// Form parsing
// ============================================================================

export type FormParseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** First issue, for a single toast. */
      message: string;
      /** First issue per top-level field, for inline errors. */
      fieldErrors: Record<string, string>;
    };

function toFailure(error: z.ZodError, fieldForRoot?: string): Extract<FormParseResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] ?? fieldForRoot;
    if (typeof field === "string" && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return { ok: false, message: error.issues[0]?.message ?? "Invalid values", fieldErrors };
}

/** Validate a typed weight (string or number); returns it rounded to 2 dp. */
export function parseWeightForm(input: { weight: string | number | null | undefined }): FormParseResult<{ weight: number }> {
  const parsed = weightFields.weight.safeParse(parseNumericInput(input.weight));
  if (!parsed.success) return toFailure(parsed.error, "weight");
  return { ok: true, data: { weight: roundWeightKg(parsed.data) } };
}

export interface BloodPressureFormResult {
  systolic: number;
  diastolic: number;
  /** `null` when the heart-rate field is blank (an explicit clear on edit). */
  heartRate: number | null;
}

/**
 * Validate systolic / diastolic / heart-rate inputs. On failure,
 * `swapSuggested` is set when the values are valid once swapped.
 */
export function parseBloodPressureForm(input: {
  systolic: string;
  diastolic: string;
  heartRate: string;
}): FormParseResult<BloodPressureFormResult> & { swapSuggested?: boolean } {
  const systolic = parseNumericInput(input.systolic);
  const diastolic = parseNumericInput(input.diastolic);
  const heartRate = parseNumericInput(input.heartRate);
  const parsed = bloodPressureValuesSchema.safeParse({
    systolic,
    diastolic,
    ...(heartRate !== undefined && { heartRate }),
  });
  if (!parsed.success) {
    const failure = toFailure(parsed.error);
    const swapSuggested =
      systolic !== undefined && diastolic !== undefined && isSwappedBloodPressure(systolic, diastolic);
    return swapSuggested ? { ...failure, swapSuggested } : failure;
  }
  return {
    ok: true,
    data: {
      systolic: parsed.data.systolic,
      diastolic: parsed.data.diastolic,
      heartRate: parsed.data.heartRate ?? null,
    },
  };
}
