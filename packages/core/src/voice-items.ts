/**
 * The voice item contract: what each kind of item a voice log can hold
 * carries, in what unit, within what range, and which fields are required.
 *
 * This is the one place those facts live. Everything else is derived:
 * - the TS item types ({@link VoiceItem}, {@link VoiceItemOf}),
 * - the Zod schema the route checks the model's output with
 *   ({@link voiceItemSchema}),
 * - the item properties of the parse tool's JSON schema
 *   ({@link voiceToolItemProperties}),
 * - the review row's check before an item can be saved
 *   ({@link voiceItemProblem}).
 *
 * Before this module the nine kinds were typed four times (tool schema, Zod,
 * client types, client validation) and their limits twice, and nothing
 * checked that what the route returns passes the review check.
 */
import { z } from "zod";
import { BP_RANGES, WEIGHT_RANGE_KG } from "./record-schemas";

// ─── Field specs ──────────────────────────────────────────────────────

interface FieldBase {
  /** Name in a review message: "Water must be between 1 and 10000." */
  label: string;
  /**
   * Required in every item, the model's included. A required field missing
   * from the model's output drops the item.
   */
  required: boolean;
  /**
   * Optional in the model's output, but the user must fill it in before the
   * item is saved (the manual card always records it).
   */
  requiredOnReview?: true;
}

export interface NumberFieldSpec extends FieldBase {
  type: "number";
  /** "mmHg", "kg", "ml", "mg", "g", "%", "bpm". */
  unit: string;
  min: number;
  max: number;
  /** Whole numbers only. */
  int?: true;
}

export interface ChoiceFieldSpec extends FieldBase {
  type: "choice";
  values: readonly string[];
}

export interface TextFieldSpec extends FieldBase {
  type: "text";
  maxLength: number;
}

export type VoiceFieldSpec = NumberFieldSpec | ChoiceFieldSpec | TextFieldSpec;

// Shared field shapes. Each is a full spec, so a kind that differs (salt's
// sodium is required and at least 1 mg) spells its own out.
const NOTE = { type: "text", label: "Note", maxLength: 200, required: false } as const;
const DESCRIPTION = {
  type: "text",
  label: "Description",
  maxLength: 200,
  required: true,
} as const;
const AMOUNT_ESTIMATE = {
  type: "choice",
  label: "Amount",
  values: ["small", "medium", "large"],
  required: false,
} as const;
const SUGAR = { type: "number", label: "Sugar", unit: "g", min: 0, max: 1000, required: false } as const;
const SODIUM = {
  type: "number",
  label: "Sodium",
  unit: "mg",
  min: 0,
  max: 20000,
  required: false,
} as const;
const POTASSIUM = {
  type: "number",
  label: "Potassium",
  unit: "mg",
  min: 0,
  max: 20000,
  required: false,
} as const;

/**
 * Every kind, its fields in order. The review check reports the first
 * problem in this order. Blood pressure and weight use the ranges of the
 * shared record contract, so a reading the add form refuses cannot come in
 * by voice either.
 */
export const VOICE_ITEM_SPEC = {
  blood_pressure: {
    systolic: { type: "number", label: "Systolic", unit: "mmHg", ...BP_RANGES.systolic, int: true, required: true },
    diastolic: { type: "number", label: "Diastolic", unit: "mmHg", ...BP_RANGES.diastolic, int: true, required: true },
    heartRate: { type: "number", label: "Heart rate", unit: "bpm", ...BP_RANGES.heartRate, int: true, required: false },
    position: { type: "choice", label: "Position", values: ["sitting", "standing"], required: false },
    arm: { type: "choice", label: "Arm", values: ["left", "right"], required: false },
    note: NOTE,
  },
  weight: {
    weightKg: { type: "number", label: "Weight", unit: "kg", ...WEIGHT_RANGE_KG, required: true },
    note: NOTE,
  },
  water: {
    ml: { type: "number", label: "Water", unit: "ml", min: 1, max: 10000, required: true },
    note: NOTE,
  },
  salt: {
    sodiumMg: { type: "number", label: "Sodium", unit: "mg", min: 1, max: 20000, required: true },
    note: NOTE,
  },
  food: {
    description: DESCRIPTION,
    grams: { type: "number", label: "Grams", unit: "g", min: 1, max: 5000, required: false },
    waterMl: { type: "number", label: "Water", unit: "ml", min: 0, max: 5000, required: false },
    sodiumMg: SODIUM,
    sugarG: SUGAR,
    potassiumMg: POTASSIUM,
  },
  // A caffeinated or alcoholic drink is a complete drink: its volume is the
  // fluid the user drank and its dissolved solutes live on the same item, so
  // the model never pairs it with a `food` item (that booked the fluid
  // twice, issue #322).
  caffeine: {
    description: DESCRIPTION,
    caffeineMg: { type: "number", label: "Caffeine", unit: "mg", min: 0, max: 2000, required: true },
    // Optional only because dropping the item would lose the caffeine dose.
    // With no volume no hydration is recorded, and the review row shows the
    // field so the user can fill it in.
    volumeMl: { type: "number", label: "Volume", unit: "ml", min: 0, max: 5000, required: false },
    sugarG: SUGAR,
    sodiumMg: SODIUM,
    potassiumMg: POTASSIUM,
  },
  alcohol: {
    description: DESCRIPTION,
    // The number on the bottle label.
    abvPercent: { type: "number", label: "ABV", unit: "%", min: 0, max: 95, required: true },
    volumeMl: { type: "number", label: "Volume", unit: "ml", min: 1, max: 5000, required: true },
    sugarG: SUGAR,
    sodiumMg: SODIUM,
    potassiumMg: POTASSIUM,
  },
  urination: {
    // The manual card always records an amount; a missing one was imputed
    // as "medium" (300 ml) by the output analytics.
    amountEstimate: { ...AMOUNT_ESTIMATE, requiredOnReview: true },
    note: NOTE,
  },
  defecation: {
    amountEstimate: AMOUNT_ESTIMATE,
    note: NOTE,
  },
} as const satisfies Record<string, Record<string, VoiceFieldSpec>>;

type Spec = typeof VOICE_ITEM_SPEC;
export type VoiceItemKind = keyof Spec;

/** Every kind, in the order the tool schema lists them. */
export const VOICE_ITEM_KINDS = Object.keys(VOICE_ITEM_SPEC) as VoiceItemKind[];

/**
 * Kinds a review row can re-look-up on its own. The row sends its edited
 * description with its `kind`, and the parser returns that one item again.
 */
export const REFRESHABLE_KINDS = ["food", "caffeine", "alcohol"] as const satisfies readonly VoiceItemKind[];
export type RefreshableKind = (typeof REFRESHABLE_KINDS)[number];

// ─── Derived TS types ─────────────────────────────────────────────────

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type FieldValue<F> = F extends { type: "number" }
  ? number
  : F extends { type: "choice"; values: readonly (infer V)[] }
    ? V
    : string;

type RequiredKeys<S> = { [K in keyof S]: S[K] extends { required: true } ? K : never }[keyof S];

/** The item of one kind, as the spec describes it. */
export type VoiceItemOf<K extends VoiceItemKind> = Simplify<
  { kind: K } & { [F in RequiredKeys<Spec[K]>]: FieldValue<Spec[K][F]> } & {
    [F in Exclude<keyof Spec[K], RequiredKeys<Spec[K]>>]?: FieldValue<Spec[K][F]>;
  }
>;

/** Any voice item, without its timing. */
export type VoiceItem = { [K in VoiceItemKind]: VoiceItemOf<K> }[VoiceItemKind];

function fieldsOf(kind: VoiceItemKind): [string, VoiceFieldSpec][] {
  return Object.entries(VOICE_ITEM_SPEC[kind] as Record<string, VoiceFieldSpec>);
}

// ─── Zod schema (the route's check of the model's output) ─────────────

function fieldSchema(field: VoiceFieldSpec): z.ZodType {
  let schema: z.ZodType;
  switch (field.type) {
    case "number": {
      let n = z.number();
      if (field.int) n = n.int();
      schema = n.min(field.min).max(field.max);
      break;
    }
    case "choice":
      schema = z.enum(field.values as [string, ...string[]]);
      break;
    case "text":
      schema = field.required
        ? z
            .string()
            .max(field.maxLength)
            .refine((s) => s.trim().length > 0)
        : z.string().max(field.maxLength);
      break;
  }
  return field.required ? schema : schema.optional();
}

/**
 * The Zod schema of one item, one branch per kind. `extra` adds fields every
 * kind shares that are not part of the item itself (the route's `when`).
 * Unknown keys are stripped.
 */
export function voiceItemSchema<E extends z.ZodRawShape>(extra: E) {
  const branches = VOICE_ITEM_KINDS.map((kind) =>
    z.object({
      kind: z.literal(kind),
      ...extra,
      ...Object.fromEntries(fieldsOf(kind).map(([name, field]) => [name, fieldSchema(field)])),
    }),
  );
  return z.discriminatedUnion(
    "kind",
    branches as unknown as [(typeof branches)[number], ...(typeof branches)[number][]],
  ) as unknown as z.ZodType<VoiceItem & { [K in keyof E]?: z.output<E[K]> }>;
}

// ─── JSON tool schema (what the model is asked for) ───────────────────

type JsonProperty =
  | { type: "string" | "number" }
  | { type: "string"; enum: readonly string[] };

/**
 * The item properties of the parse tool: `kind`, then the union of every
 * kind's fields as one flat object of optional properties. One flat object
 * keeps the tool schema small; which fields belong to which kind, and their
 * ranges, are checked by {@link voiceItemSchema} on the server. A field that
 * appears in several kinds must have the same type in each.
 */
export function voiceToolItemProperties(): Record<string, JsonProperty> {
  const properties: Record<string, JsonProperty> = {
    kind: { type: "string", enum: [...VOICE_ITEM_KINDS] },
  };
  for (const kind of VOICE_ITEM_KINDS) {
    for (const [name, field] of fieldsOf(kind)) {
      if (name in properties) continue;
      properties[name] =
        field.type === "number"
          ? { type: "number" }
          : field.type === "choice"
            ? { type: "string", enum: field.values }
            : { type: "string" };
    }
  }
  return properties;
}

// ─── Review check (before an item is saved) ───────────────────────────

function numberProblem(field: NumberFieldSpec, value: number): string | null {
  const { label, min, max } = field;
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  if (field.int && !Number.isInteger(value)) return `${label} must be a whole number.`;
  return null;
}

/**
 * Why an item cannot be saved as it is, by the spec alone, or `null` when it
 * passes. The first problem in field order wins. A field marked
 * `requiredOnReview` must be filled in here even though the model may leave
 * it out. Rules across fields (systolic above diastolic) and the item's time
 * are the caller's.
 */
export function voiceItemProblem(item: VoiceItem): string | null {
  const values = item as unknown as Record<string, unknown>;
  for (const [name, field] of fieldsOf(item.kind)) {
    const value = values[name];
    if (value === undefined) {
      if (field.required) {
        return field.type === "text" ? `${field.label} is required.` : `${field.label} is missing.`;
      }
      if (field.requiredOnReview) return `Pick an ${field.label.toLowerCase()}.`;
      continue;
    }
    let problem: string | null = null;
    switch (field.type) {
      case "number":
        problem =
          typeof value === "number"
            ? numberProblem(field, value)
            : `${field.label} must be a number.`;
        break;
      case "choice":
        problem = field.values.includes(value as string)
          ? null
          : `${field.label} must be one of ${field.values.join(", ")}.`;
        break;
      case "text":
        if (typeof value !== "string") problem = `${field.label} must be text.`;
        else if (field.required && value.trim().length === 0) problem = `${field.label} is required.`;
        else if (value.length > field.maxLength) {
          problem = `${field.label} must be at most ${field.maxLength} characters.`;
        }
        break;
    }
    if (problem) return problem;
  }
  return null;
}
