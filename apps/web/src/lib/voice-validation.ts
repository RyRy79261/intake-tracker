import type { VoiceParsedItem } from "@/lib/voice-types";
import { parseBloodPressureForm, parseWeightForm } from "@intake/core/record-schemas";
import { voiceItemProblem } from "@intake/core/voice-items";
import { spokenTimeError } from "@/lib/voice-time";
import { getDeviceTimezone } from "@/lib/timezone";

/**
 * Review-row validation for voice items.
 *
 * The row editors turn a cleared field into 0 and pass negatives through, and
 * the record writers do not validate, so without this a fat-fingered "-250"
 * subtracted from the day's water and a cleared weight saved as 0 kg. A row
 * that fails here cannot be approved.
 *
 * The ranges are the voice item contract's (@intake/core/voice-items), the
 * same ones the route checks the model's output with, so anything the route
 * returns passes here unless the user must still fill something in. Blood
 * pressure and weight also go through the shared record contract
 * (@intake/core/record-schemas), so a reading the add form refuses (systolic
 * not above diastolic) cannot be saved by voice either.
 */

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
  if (item.kind === "blood_pressure") {
    const parsed = parseBloodPressureForm({
      systolic: String(item.systolic),
      diastolic: String(item.diastolic),
      heartRate: item.heartRate === undefined ? "" : String(item.heartRate),
    });
    if (!parsed.ok) return parsed.message;
  }
  if (item.kind === "weight") {
    const parsed = parseWeightForm({ weight: item.weightKg });
    if (!parsed.ok) return parsed.message;
  }
  const { when: _when, at: _at, ...fields } = item;
  return voiceItemProblem(fields);
}
