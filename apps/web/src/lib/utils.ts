import { getDeviceTimezone } from "@/lib/timezone";
import { type LiquidPreset } from "@/lib/constants";

// `cn` moved to @intake/ui in Phase 4b (it's the class helper every UI
// primitive needs). Re-exported here so all `@/lib/utils` importers — cn-only
// and the few that pull cn alongside an app helper below — resolve unchanged.
export { cn } from "@intake/ui/lib/utils";

/**
 * Format an amount for display. Summed totals can carry float noise
 * (0.1 + 0.2), so values are rounded to one decimal. Litres keep up to three
 * decimals (every whole ml) so a total just over a whole-litre limit
 * (1040 ml → "1.04L") never reads the same as the limit ("1.0L").
 */
export function formatAmount(amount: number, unit: string): string {
  if (unit === "ml" && amount >= 1000) {
    const litres = Math.round(amount) / 1000;
    return `${litres.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 3,
      useGrouping: false,
    })}L`;
  }
  return `${Math.round(amount * 10) / 10}${unit}`;
}

/**
 * Generate an opaque, collision-resistant record id (RFC 4122 v4 UUID).
 *
 * Previously this returned a `${Date.now()}-${random}` string, which left the
 * codebase with two id formats (this vs. the `crypto.randomUUID()` used by the
 * medication/substance services) and made ids in this half sortable-by-creation
 * while the other half were not. Ids are opaque sync keys — nothing parses the
 * old timestamp prefix — so emitting a UUID here normalises every table on a
 * single format without touching existing stored ids.
 */
export function generateId(): string {
  return crypto.randomUUID();
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

/**
 * Sync scaffolding for a new record on a table WITHOUT a `timezone` field:
 * Prescription, MedicationPhase, PhaseSchedule (it has `anchorTimezone`),
 * TitrationPlan, UserProfile and InsightReport. Neither their interfaces nor
 * their server tables carry `timezone`, so writing one only leaves an untyped
 * local-only value that the first sync round-trip drops.
 */
export function baseSyncFields() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null as null, deviceId: getDeviceId() };
}

/** Sync scaffolding plus the device `timezone`, for tables that declare it. */
export function syncFields() {
  return { ...baseSyncFields(), timezone: getDeviceTimezone() };
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

  // Substance prefix: "substance:{id}" -> note (description) or "Drink".
  // Written by the old implicit auto-water path; still present on older rows.
  if (source.startsWith("substance:")) {
    return options?.note || "Drink";
  }

  // A drink logged through `logDrink`. Its water row carries the drink name as
  // its note, which is the label the user expects to see — without this a
  // dictated latte rendered as a bare "250 ml".
  if (source === "drink" || source === "voice") {
    return options?.note || "Drink";
  }

  // Manual sub-sources: "manual:food_water_content" -> note or "Food"
  if (source.startsWith("manual:")) {
    return options?.note || "Food";
  }

  // Unknown source format — return null to prevent raw strings in UI
  return null;
}
