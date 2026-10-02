import type { VoiceParsedItem } from "@/lib/voice-types";
import { parseBloodPressureForm, parseWeightForm } from "@intake/core/record-schemas";
import { spokenTimeError } from "@/lib/voice-time";
import { getDeviceTimezone } from "@/lib/timezone";

/**
 * Review-row validation for voice items.
 *
 * The row editors turn a cleared field into 0 and pass negatives through, and
 * the record writers do not validate, so without this a fat-fingered "-250"
 * subtracted from the day's water and a cleared weight saved as 0 kg. A row
 * that fails here cannot be approved. Ranges follow the manual entry forms;
 * blood pressure and weight use the shared record contract
 * (@intake/core/record-schemas) itself, so a reading the add form refuses
 * cannot be saved by voice either.
 */

/** `value` is a finite number in [min, max]; `exclusiveMin` makes min open. */
function inRange(value: number, min: number, max: number, exclusiveMin = false): boolean {
  if (!Number.isFinite(value)) return false;
  if (exclusiveMin ? value <= min : value < min) return false;
  return value <= max;
}

function required(label: string, value: number, max: number): string | null {
  return inRange(value, 0, max, true) ? null : `${label} must be above 0 and at most ${max}.`;
}

function optional(label: string, value: number | undefined, max: number): string | null {
  if (value === undefined) return null;
  return inRange(value, 0, max) ? null : `${label} must be between 0 and ${max}.`;
}

function description(value: string): string | null {
  return value.trim().length > 0 ? null : "Description is required.";
}

/** First problem found, in field order. */
function first(...checks: (string | null)[]): string | null {
  return checks.find((c) => c !== null) ?? null;
}

/**
 * Why a voice item cannot be saved as-is, or `null` when it is valid.
 *
 * `now` and `timeZone` are the clock the item's time is checked against (it
 * must be a real date-time, not in the future); they default to the device's.
 */
export function validateVoiceItem(
  item: VoiceParsedItem,
  now: number = Date.now(),
  timeZone: string = getDeviceTimezone(),
): string | null {
  const timeError = spokenTimeError(item.at, now, timeZone);
  if (timeError) return timeError;
  switch (item.kind) {
    case "blood_pressure": {
      const parsed = parseBloodPressureForm({
        systolic: String(item.systolic),
        diastolic: String(item.diastolic),
        heartRate: item.heartRate === undefined ? "" : String(item.heartRate),
      });
      return parsed.ok ? null : parsed.message;
    }
    case "weight": {
      const parsed = parseWeightForm({ weight: item.weightKg });
      return parsed.ok ? null : parsed.message;
    }
    case "water":
      return required("Water", item.ml, 10000);
    case "salt":
      return required("Sodium", item.sodiumMg, 20000);
    case "food":
      return first(
        description(item.description),
        optional("Grams", item.grams, 5000),
        optional("Water", item.waterMl, 5000),
        optional("Sodium", item.sodiumMg, 20000),
        optional("Sugar", item.sugarG, 1000),
        optional("Potassium", item.potassiumMg, 20000),
      );
    case "caffeine":
      return first(
        description(item.description),
        optional("Caffeine", item.caffeineMg, 2000),
        optional("Volume", item.volumeMl, 5000),
        optional("Sugar", item.sugarG, 1000),
        optional("Sodium", item.sodiumMg, 20000),
        optional("Potassium", item.potassiumMg, 20000),
      );
    case "alcohol":
      return first(
        description(item.description),
        optional("ABV", item.abvPercent, 95),
        required("Volume", item.volumeMl, 5000),
        optional("Sugar", item.sugarG, 1000),
        optional("Sodium", item.sodiumMg, 20000),
        optional("Potassium", item.potassiumMg, 20000),
      );
    case "urination":
      // The manual card always records an amount; a missing one was imputed
      // as "medium" (300 ml) by the output analytics.
      return item.amountEstimate === undefined ? "Pick an amount." : null;
    case "defecation":
      return null;
  }
}
