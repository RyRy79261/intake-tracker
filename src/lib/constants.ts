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

// ─── Liquid Presets (per D-01: per-100ml is the primary unit) ───────

export interface LiquidPreset {
  id: string;
  name: string;
  type: "caffeine" | "alcohol";
  substancePer100ml: number; // mg for caffeine, standard drinks for alcohol
  defaultVolumeMl: number;
  isDefault: boolean;
  source: "manual" | "ai";
  aiConfidence?: number;
}

export const DEFAULT_LIQUID_PRESETS: LiquidPreset[] = [
  // Caffeine presets (seeded from COFFEE_PRESETS + substanceConfig.caffeine.types)
  { id: "default-espresso", name: "Espresso", type: "caffeine", substancePer100ml: 210, defaultVolumeMl: 30, isDefault: true, source: "manual" },
  { id: "default-double-espresso", name: "Double Espresso", type: "caffeine", substancePer100ml: 210, defaultVolumeMl: 60, isDefault: true, source: "manual" },
  { id: "default-moka", name: "Moka", type: "caffeine", substancePer100ml: 130, defaultVolumeMl: 50, isDefault: true, source: "manual" },
  { id: "default-coffee", name: "Coffee", type: "caffeine", substancePer100ml: 38, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-tea", name: "Tea", type: "caffeine", substancePer100ml: 19, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  // Alcohol presets (seeded from substanceConfig.alcohol.types)
  { id: "default-beer", name: "Beer", type: "alcohol", substancePer100ml: 0.30, defaultVolumeMl: 330, isDefault: true, source: "manual" },
  { id: "default-wine", name: "Wine", type: "alcohol", substancePer100ml: 0.67, defaultVolumeMl: 150, isDefault: true, source: "manual" },
  { id: "default-spirit", name: "Spirit", type: "alcohol", substancePer100ml: 2.22, defaultVolumeMl: 45, isDefault: true, source: "manual" },
];
