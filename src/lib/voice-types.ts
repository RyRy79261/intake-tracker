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
}

export interface CaffeineItem {
  kind: "caffeine";
  description: string;
  caffeineMg: number;
  volumeMl?: number;
}

export interface AlcoholItem {
  kind: "alcohol";
  description: string;
  standardDrinks: number;
  volumeMl?: number;
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
