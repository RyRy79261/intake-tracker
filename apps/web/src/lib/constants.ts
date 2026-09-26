/**
 * Centralized application constants.
 * Keep domain-specific data out of UI components so it's easy to
 * find, test, and extend.
 */

// ─── localStorage Keys ───────────────────────────────────────────────

/** First-run welcome dialog "seen" flag. Device-local, never synced. */
export const WELCOME_SEEN_KEY = "intake-tracker-welcome-seen";

// ─── Blood Pressure Thresholds ───────────────────────────────────────

export interface BPCategory {
  label: string;
  color: string;
}

/**
 * Classify a blood-pressure reading per the ESH 2023 / 2018 ESC-ESH office BP
 * classification — the same scale Withings BPM devices use in Europe.
 * Categories are evaluated highest-first; each threshold is OR-based, so
 * whichever of systolic/diastolic falls in the higher band sets the category
 * (a normal systolic does not cancel out a high diastolic).
 */
export function getBPCategory(systolic: number, diastolic: number): BPCategory {
  if (systolic >= 180 || diastolic >= 110) {
    return { label: "Grade 3 hypertension", color: "text-red-700 dark:text-red-300" };
  } else if (systolic >= 160 || diastolic >= 100) {
    return { label: "Grade 2 hypertension", color: "text-red-600 dark:text-red-400" };
  } else if (systolic >= 140 || diastolic >= 90) {
    return { label: "Grade 1 hypertension", color: "text-orange-600 dark:text-orange-400" };
  } else if (systolic >= 130 || diastolic >= 85) {
    return { label: "High normal", color: "text-yellow-600 dark:text-yellow-400" };
  } else if (systolic >= 120 || diastolic >= 80) {
    return { label: "Normal", color: "text-lime-600 dark:text-lime-400" };
  } else {
    return { label: "Optimal", color: "text-green-600 dark:text-green-400" };
  }
}

// ─── Urination Amount Options ────────────────────────────────────────

export interface AmountOption {
  value: string;
  label: string;
}

export const URINATION_AMOUNT_OPTIONS: readonly AmountOption[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

// ─── Defecation Amount Options ──────────────────────────────────────

export const DEFECATION_AMOUNT_OPTIONS: readonly AmountOption[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

// ─── Sodium Source Presets ──────────────────────────────────────────

export interface SodiumPreset {
  id: string;
  name: string;
  sodiumPercent: number; // sodium content by weight (0-100)
  isDefault: boolean;
}

export const DEFAULT_SODIUM_PRESETS: SodiumPreset[] = [
  { id: "default-sodium", name: "Sodium", sodiumPercent: 100, isDefault: true },
  { id: "default-table-salt", name: "Table Salt", sodiumPercent: 39, isDefault: true },
  { id: "default-msg", name: "MSG", sodiumPercent: 12, isDefault: true },
];

// ─── Liquid Presets (multi-substance, per D-10) ─────────────────────

export interface LiquidPreset {
  id: string;
  name: string;
  tab: "coffee" | "alcohol" | "beverage";   // which LiquidsCard tab (replaces old `type`)
  defaultVolumeMl: number;
  waterContentPercent: number;                // 0-100, default 100
  caffeinePer100ml?: number;                 // mg per 100ml
  alcoholPer100ml?: number;                  // ABV percentage (e.g. 5 for beer, 12 for wine)
  saltPer100ml?: number;                     // mg sodium per 100ml
  sugarPer100ml?: number;                    // g sugar per 100ml
  potassiumPer100ml?: number;                // mg potassium per 100ml
  isDefault: boolean;
  source: "manual" | "ai";
  aiConfidence?: number;
}

/**
 * Patch accepted by `updateLiquidPreset`. Unlike `Partial<LiquidPreset>`, a key
 * may be present with the value `undefined` — that means "clear this field"
 * (e.g. the user emptied the sugar input), not "leave it alone".
 */
export type LiquidPresetPatch = {
  [K in keyof Omit<LiquidPreset, "id">]?: Omit<LiquidPreset, "id">[K] | undefined;
};

export const DEFAULT_LIQUID_PRESETS: LiquidPreset[] = [
  // Caffeine presets
  { id: "default-espresso", name: "Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 30, isDefault: true, source: "manual" },
  { id: "default-double-espresso", name: "Double Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 60, isDefault: true, source: "manual" },
  { id: "default-moka", name: "Moka", tab: "coffee", caffeinePer100ml: 130, waterContentPercent: 98, defaultVolumeMl: 50, isDefault: true, source: "manual" },
  { id: "default-coffee", name: "Coffee", tab: "coffee", caffeinePer100ml: 38, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-tea", name: "Tea", tab: "coffee", caffeinePer100ml: 19, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  // Alcohol presets
  { id: "default-beer", name: "Beer", tab: "alcohol", alcoholPer100ml: 5, waterContentPercent: 93, defaultVolumeMl: 330, isDefault: true, source: "manual" },
  { id: "default-wine", name: "Wine", tab: "alcohol", alcoholPer100ml: 12, waterContentPercent: 87, defaultVolumeMl: 150, isDefault: true, source: "manual" },
  { id: "default-spirit", name: "Spirit", tab: "alcohol", alcoholPer100ml: 40, waterContentPercent: 60, defaultVolumeMl: 45, isDefault: true, source: "manual" },
];
