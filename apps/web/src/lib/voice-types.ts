/**
 * Shared types for the voice health metrics pipeline.
 *
 * The voice-parse API extracts a heterogeneous list of items from a single
 * transcript; each item maps to one of the existing record domains. The UI
 * renders them as editable, color-coded rows that the user approves
 * individually or in bulk.
 */

export type VoiceItemKind =
  | "blood_pressure"
  | "weight"
  | "water"
  | "salt"
  | "food"
  | "caffeine"
  | "alcohol"
  | "urination"
  | "defecation";

/**
 * When an item happened, as the parser returns it: a local wall-clock
 * date-time the user stated ("yesterday at 8pm" → "2026-09-29T20:00"), or an
 * offset from the moment of the request ("an hour ago" → 60).
 */
export type SpokenWhen =
  | { kind: "absolute"; localDateTime: string }
  | { kind: "relative"; minutesAgo: number };

/** The client's clock, sent with a parse request so the model can date items. */
export type { VoiceParseClientNow } from "@intake/ai-prompts/voice-parse";

/**
 * When an item happened, if the user said. Absent → the save time.
 *
 * `when` is the wire form. The panel converts it on receipt (see
 * `normalizeSpokenTiming`) to `at`: a local wall-clock "YYYY-MM-DDTHH:mm" in
 * the device's zone, which is what the review row shows and edits and what the
 * save turns into the record's timestamp.
 */
interface SpokenTiming {
  when?: SpokenWhen;
  at?: string;
}

export interface BloodPressureItem extends SpokenTiming {
  kind: "blood_pressure";
  systolic: number;
  diastolic: number;
  heartRate?: number;
  position?: "sitting" | "standing";
  arm?: "left" | "right";
  note?: string;
}

export interface WeightItem extends SpokenTiming {
  kind: "weight";
  weightKg: number;
  note?: string;
}

export interface WaterItem extends SpokenTiming {
  kind: "water";
  ml: number;
  note?: string;
}

export interface SaltItem extends SpokenTiming {
  kind: "salt";
  sodiumMg: number;
  note?: string;
}

export interface FoodItem extends SpokenTiming {
  kind: "food";
  description: string;
  grams?: number;
  waterMl?: number;
  sodiumMg?: number;
  sugarG?: number;
  potassiumMg?: number;
}

/**
 * A caffeinated or alcoholic drink is a COMPLETE drink: its `volumeMl` is the
 * fluid the user drank, and its dissolved solutes live on the same item.
 *
 * The solute fields exist so the model never has to pair a drink with a
 * companion `food` item just to record a latte's sugar — that pairing booked
 * the same fluid twice (issue #322), because `food.waterMl` and a drink's
 * `volumeMl` are both hydration.
 */
interface DrinkSolutes extends SpokenTiming {
  /** Total sugars dissolved in the drink, in grams. */
  sugarG?: number;
  /** Sodium dissolved in the drink, in mg. */
  sodiumMg?: number;
  /** Potassium in the drink, in mg. */
  potassiumMg?: number;
}

export interface CaffeineItem extends DrinkSolutes {
  kind: "caffeine";
  description: string;
  caffeineMg: number;
  /**
   * Volume of the drink in ml. Optional only because dropping an otherwise
   * valid item would lose the caffeine dose entirely; when absent no hydration
   * is recorded (rather than invented) and the review row exposes the field so
   * the user can fill it in.
   */
  volumeMl?: number;
}

export interface AlcoholItem extends DrinkSolutes {
  kind: "alcohol";
  description: string;
  /** Alcohol by volume % — the number on the bottle label. */
  abvPercent: number;
  /** Volume of the drink consumed, in millilitres. */
  volumeMl: number;
}

export interface UrinationItem extends SpokenTiming {
  kind: "urination";
  amountEstimate?: "small" | "medium" | "large";
  note?: string;
}

export interface DefecationItem extends SpokenTiming {
  kind: "defecation";
  amountEstimate?: "small" | "medium" | "large";
  note?: string;
}

export type VoiceParsedItem =
  | BloodPressureItem
  | WeightItem
  | WaterItem
  | SaltItem
  | FoodItem
  | CaffeineItem
  | AlcoholItem
  | UrinationItem
  | DefecationItem;

/**
 * Kinds a review row can re-look-up on its own. The row sends its edited
 * description with its `kind`, and the parser returns that one item again.
 */
export const REFRESHABLE_KINDS = ["food", "caffeine", "alcohol"] as const;
export type RefreshableKind = (typeof REFRESHABLE_KINDS)[number];
export type RefreshableItem = Extract<VoiceParsedItem, { kind: RefreshableKind }>;

export function isRefreshable(item: VoiceParsedItem): item is RefreshableItem {
  return (REFRESHABLE_KINDS as readonly string[]).includes(item.kind);
}

export interface VoiceParseResponse {
  items: VoiceParsedItem[];
  reasoning?: string;
  /** Items the model returned that failed validation and were discarded. */
  dropped?: number;
  /** Valid items cut by the server's per-request item cap. */
  overCap?: number;
  /** The transcript was longer than the parser accepts; its tail was not parsed. */
  transcriptTruncated?: boolean;
}

export const VOICE_ITEM_COLOR: Record<VoiceItemKind, string> = {
  blood_pressure: "bp",
  weight: "weight",
  water: "water",
  salt: "salt",
  food: "eating",
  caffeine: "caffeine",
  alcohol: "alcohol",
  urination: "urination",
  defecation: "defecation",
};

export const VOICE_ITEM_LABEL: Record<VoiceItemKind, string> = {
  blood_pressure: "Blood pressure",
  weight: "Weight",
  water: "Water",
  salt: "Sodium",
  food: "Food",
  caffeine: "Caffeine",
  alcohol: "Alcohol",
  urination: "Urination",
  defecation: "Defecation",
};
