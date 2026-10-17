/**
 * Shared types for the voice health metrics pipeline.
 *
 * The voice-parse API extracts a heterogeneous list of items from a single
 * transcript; each item maps to one of the existing record domains. The UI
 * renders them as editable, color-coded rows that the user approves
 * individually or in bulk.
 */

import {
  REFRESHABLE_KINDS,
  type RefreshableKind,
  type VoiceItemKind,
  type VoiceItemOf,
} from "@intake/core/voice-items";

export { REFRESHABLE_KINDS, type RefreshableKind, type VoiceItemKind };

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

/**
 * One item of each kind. The fields, their units and ranges come from the
 * voice item contract (@intake/core/voice-items); this adds the timing the
 * panel works with.
 */
type Timed<K extends VoiceItemKind> = VoiceItemOf<K> & SpokenTiming;

export type BloodPressureItem = Timed<"blood_pressure">;
export type WeightItem = Timed<"weight">;
export type WaterItem = Timed<"water">;
export type SaltItem = Timed<"salt">;
export type FoodItem = Timed<"food">;
export type CaffeineItem = Timed<"caffeine">;
export type AlcoholItem = Timed<"alcohol">;
export type UrinationItem = Timed<"urination">;
export type DefecationItem = Timed<"defecation">;

export type VoiceParsedItem = { [K in VoiceItemKind]: Timed<K> }[VoiceItemKind];

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
