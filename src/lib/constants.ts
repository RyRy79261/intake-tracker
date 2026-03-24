/**
 * Centralized application constants.
 * Keep domain-specific data out of UI components so it's easy to
 * find, test, and extend.
 */

// ─── Food Presets (water content %) ──────────────────────────────────

export interface FoodPreset {
  name: string;
  waterPercent: number;
}

export const FOOD_PRESETS: readonly FoodPreset[] = [
  { name: "Apple", waterPercent: 86 },
  { name: "Banana", waterPercent: 75 },
  { name: "Orange", waterPercent: 87 },
  { name: "Watermelon", waterPercent: 92 },
  { name: "Grapes", waterPercent: 81 },
  { name: "Strawberries", waterPercent: 91 },
  { name: "Cucumber", waterPercent: 96 },
  { name: "Tomato", waterPercent: 94 },
  { name: "Lettuce", waterPercent: 96 },
  { name: "Celery", waterPercent: 95 },
  { name: "Carrot", waterPercent: 88 },
  { name: "Broccoli", waterPercent: 89 },
  { name: "Spinach", waterPercent: 91 },
  { name: "Peach", waterPercent: 89 },
  { name: "Pineapple", waterPercent: 86 },
  { name: "Milk", waterPercent: 87 },
  { name: "Yogurt", waterPercent: 85 },
  { name: "Soup (broth)", waterPercent: 92 },
  { name: "Rice (cooked)", waterPercent: 70 },
  { name: "Pasta (cooked)", waterPercent: 62 },
  { name: "Custom", waterPercent: 80 },
] as const;

// ─── Blood Pressure Thresholds ───────────────────────────────────────

export interface BPCategory {
  label: string;
  color: string;
}

/**
 * Classify a blood-pressure reading according to AHA guidelines.
 */
export function getBPCategory(systolic: number, diastolic: number): BPCategory {
  if (systolic < 120 && diastolic < 80) {
    return { label: "Normal", color: "text-green-600 dark:text-green-400" };
  } else if (systolic < 130 && diastolic < 80) {
    return { label: "Elevated", color: "text-yellow-600 dark:text-yellow-400" };
  } else if (systolic < 140 && diastolic < 90) {
    return { label: "High Stage 1", color: "text-orange-600 dark:text-orange-400" };
  } else {
    return { label: "High Stage 2", color: "text-red-600 dark:text-red-400" };
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

// ─── Coffee Presets ─────────────────────────────────────────────────

export interface CoffeePreset {
  value: string;
  label: string;
  waterMl: number;
}

export const COFFEE_PRESETS: readonly CoffeePreset[] = [
  { value: "espresso", label: "Espresso", waterMl: 30 },
  { value: "double-espresso", label: "Double espresso", waterMl: 60 },
  { value: "moka", label: "Moka", waterMl: 50 },
  { value: "other", label: "Other", waterMl: 0 },
] as const;

// ─── Liquid Type Options ────────────────────────────────────────────

export const LIQUID_TYPE_OPTIONS = [
  { value: "water", label: "Water" },
  { value: "juice", label: "Juice" },
  { value: "coffee", label: "Coffee" },
  { value: "food", label: "Food" },
] as const;

// ─── Liquid Presets (multi-substance, per D-10) ─────────────────────

export interface LiquidPreset {
  id: string;
  name: string;
  tab: "coffee" | "alcohol" | "beverage";   // which LiquidsCard tab (replaces old `type`)
  defaultVolumeMl: number;
  waterContentPercent: number;                // 0-100, default 100
  caffeinePer100ml?: number;                 // mg per 100ml
  alcoholPer100ml?: number;                  // standard drinks per 100ml
  saltPer100ml?: number;                     // mg sodium per 100ml
  isDefault: boolean;
  source: "manual" | "ai";
  aiConfidence?: number;
}

export const DEFAULT_LIQUID_PRESETS: LiquidPreset[] = [
  // Caffeine presets
  { id: "default-espresso", name: "Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 30, isDefault: true, source: "manual" },
  { id: "default-double-espresso", name: "Double Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 60, isDefault: true, source: "manual" },
  { id: "default-moka", name: "Moka", tab: "coffee", caffeinePer100ml: 130, waterContentPercent: 98, defaultVolumeMl: 50, isDefault: true, source: "manual" },
  { id: "default-coffee", name: "Coffee", tab: "coffee", caffeinePer100ml: 38, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-tea", name: "Tea", tab: "coffee", caffeinePer100ml: 19, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  // Alcohol presets
  { id: "default-beer", name: "Beer", tab: "alcohol", alcoholPer100ml: 0.30, waterContentPercent: 93, defaultVolumeMl: 330, isDefault: true, source: "manual" },
  { id: "default-wine", name: "Wine", tab: "alcohol", alcoholPer100ml: 0.67, waterContentPercent: 87, defaultVolumeMl: 150, isDefault: true, source: "manual" },
  { id: "default-spirit", name: "Spirit", tab: "alcohol", alcoholPer100ml: 2.22, waterContentPercent: 60, defaultVolumeMl: 45, isDefault: true, source: "manual" },
];
