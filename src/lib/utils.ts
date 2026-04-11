import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getDeviceTimezone } from "@/lib/timezone";
import { type LiquidPreset } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(amount: number, unit: string): string {
  if (unit === "ml" && amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}L`;
  }
  return `${amount}${unit}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

let _deviceId: string | null = null;

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("intake-tracker-device-id");
    if (stored) {
      _deviceId = stored;
      return stored;
    }
    const id = crypto.randomUUID();
    localStorage.setItem("intake-tracker-device-id", id);
    _deviceId = id;
    return id;
  }
  return "server";
}

export function syncFields() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null as null, deviceId: getDeviceId(), timezone: getDeviceTimezone() };
}

/**
 * Derive a human-readable label from an IntakeRecord's `source` field.
 * Returns null for plain water ("manual") since it's the default/zero option.
 *
 * @param source - The record's source field (e.g., "manual", "coffee:latte", "preset:abc123", "substance:xyz")
 * @param options.presets - Available liquid presets for name lookup (from settings store)
 * @param options.note - The record's note field, used as fallback label for substance-sourced entries
 */
export function getLiquidTypeLabel(
  source?: string,
  options?: { presets?: LiquidPreset[] | undefined; note?: string | undefined }
): string | null {
  if (!source || source === "manual") return null;

  // Legacy coffee prefix: "coffee:latte" -> "Latte"
  if (source.startsWith("coffee:")) {
    const sub = source.split(":")[1];
    return sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : "Coffee";
  }

  // Beverage prefix: "beverage" or "beverage:Juice" -> "Beverage" or "Juice"
  if (source === "beverage") return "Beverage";
  if (source.startsWith("beverage:")) {
    const name = source.slice(9);
    return name || "Beverage";
  }

  // Juice prefix: "juice" or "juice:orange" -> "Juice" or "Orange"
  if (source === "juice") return "Juice";
  if (source.startsWith("juice:")) {
    const name = source.slice(6);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Juice";
  }

  // Food prefix: "food" or "food:ai_parse" -> note or "Food"
  if (source === "food") return options?.note || "Food";
  if (source.startsWith("food:")) {
    return options?.note || "Food";
  }

  // Preset prefix: "preset:manual" -> null, "preset:{id}" -> preset name or "Beverage"
  if (source === "preset:manual") return null;
  if (source.startsWith("preset:")) {
    const presetId = source.slice(7);
    if (options?.presets) {
      const preset = options.presets.find((p) => p.id === presetId);
      if (preset) return preset.name;
    }
    return "Beverage";
  }

  // Substance prefix: "substance:{id}" -> note (description) or "Drink"
  if (source.startsWith("substance:")) {
    return options?.note || "Drink";
  }

  // Manual sub-sources: "manual:food_water_content" -> note or "Food"
  if (source.startsWith("manual:")) {
    return options?.note || "Food";
  }

  // Unknown source format — return null to prevent raw strings in UI
  return null;
}
