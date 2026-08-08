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

export interface BloodPressureItem {
  kind: "blood_pressure";
  systolic: number;
  diastolic: number;
  heartRate?: number;
  position?: "sitting" | "standing";
  arm?: "left" | "right";
  note?: string;
}

export interface WeightItem {
  kind: "weight";
  weightKg: number;
  note?: string;
}

export interface WaterItem {
  kind: "water";
  ml: number;
  note?: string;
}

export interface SaltItem {
  kind: "salt";
  sodiumMg: number;
  note?: string;
}

export interface FoodItem {
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
interface DrinkSolutes {
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

export interface UrinationItem {
  kind: "urination";
  amountEstimate?: "small" | "medium" | "large";
  note?: string;
}

export interface DefecationItem {
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

export interface VoiceParseResponse {
  items: VoiceParsedItem[];
  reasoning?: string;
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
