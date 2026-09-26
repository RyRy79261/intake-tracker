/**
 * One source of truth for medication reminders.
 *
 * Native Android (Capacitor LocalNotifications), the in-page web notifier and
 * the server push schedule used to each derive "what is due when" on their
 * own, and they disagreed: native treated `scheduleTimeUTC` as a device-local
 * hour, the web notifier ignored tombstones and titration precedence, and push
 * spread today's slots across the whole week. Everything now goes through
 * this module:
 *
 *   1. `loadReminderDoses()` reads the regimen from Dexie: live, active
 *      prescriptions, the effective phase per prescription (titration over
 *      maintenance, via `selectEffectivePhases`) and its live, enabled
 *      schedules.
 *   2. `buildReminderOccurrences()` turns those doses into absolute instants.
 *      A schedule's canonical time is its wall-clock `time` in
 *      `anchorTimezone`, so the instant is resolved per date (DST-correct) and
 *      is valid in whatever zone the device happens to be in.
 *   3. `buildWeeklyPushEntries()` groups one week of occurrences into the
 *      per-weekday, device-local `HH:MM` slots the push server matches on.
 */
import { db, type DoseLog, type InventoryItem, type MedicationPhase, type PhaseSchedule } from "@/lib/db";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhases } from "@intake/core/effective-phase";
import { formatComboDose } from "@intake/core/compound";
import { isActiveBrand } from "@/lib/inventory-service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One scheduled dose of the effective regimen, independent of any date. */
export interface ReminderDose {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  /** Generic name — native notification titles use it. */
  genericName: string;
  /** Brand name of the active inventory item, else the generic name. */
  displayName: string;
  /** e.g. "50mg" or the compound short form for combination products. */
  dosageText: string;
  /** Canonical wall-clock "HH:MM" in `anchorTimezone`. */
  time: string;
  anchorTimezone: string;
  /** Weekdays in `anchorTimezone` (0 = Sunday). */
  daysOfWeek: number[];
}

/** A dose on a concrete date. */
export interface ReminderOccurrence {
  dose: ReminderDose;
  /** The dose's date ("YYYY-MM-DD") in its anchor timezone — the dose-log key. */
  dateKey: string;
  /** Absolute instant the dose is due (epoch ms). */
  at: number;
  /** Device-local "HH:MM" of `at`. */
  localTime: string;
  /** Device-local weekday of `at` (0 = Sunday). */
  localWeekday: number;
}

export interface PushScheduleEntry {
  timeSlot: string;
  dayOfWeek: number;
  medicationsJson: string;
}

/**
 * Payload stored in `push_schedules.medications_json`: the notification body
 * plus the schedule ids behind it, so the server can suppress a reminder once
 * every dose in the slot has been logged. Legacy rows hold the bare body text.
 */
export interface PushMedicationsPayload {
  body: string;
  scheduleIds: string[];
}

// ---------------------------------------------------------------------------
// Timezone helpers (Intl only, no Date-local arithmetic)
// ---------------------------------------------------------------------------

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
  dateKey: string;
  time: string;
  weekday: number;
  /** Wall-clock of the instant, read as if it were UTC (epoch ms). */
  wallAsUtc: number;
}

/** Break an instant into its wall-clock parts in `timeZone`. */
export function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(epochMs))) {
    parts[p.type] = p.value;
  }
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);
  const mi = Number(parts.minute);
  const s = Number(parts.second);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? 0,
    wallAsUtc: Date.UTC(y, mo - 1, d, h, mi, s),
  };
}

/**
 * The instant at which the wall clock in `timeZone` reads `dateKey` `time`.
 * A time skipped by a DST spring-forward resolves to the shifted instant
 * (02:30 -> 03:30); an ambiguous fall-back time resolves to its first
 * occurrence.
 */
export function zonedTimeToEpoch(dateKey: string, time: string, timeZone: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  // Two passes of offset correction settle every real-world zone.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const offset = zonedParts(guess, timeZone).wallAsUtc - guess;
    guess = wall - offset;
  }
  // Prefer the earlier instant of an ambiguous (fall-back) wall time.
  const earlier = guess - 60 * 60 * 1000;
  if (zonedParts(earlier, timeZone).wallAsUtc === wall) return earlier;
  return guess;
}

function addDays(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (mo ?? 1) - 1, (d ?? 1) + days);
  return new Date(t).toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1)).getUTCDay();
}

function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Regimen
// ---------------------------------------------------------------------------

/**
 * Same labeller as the Today view: a combination dose shows the active brand's
 * per-pill compounds x the pill count, never a split of the Rx reference.
 */
function formatDosage(
  phase: MedicationPhase,
  schedule: PhaseSchedule,
  brand: InventoryItem | undefined,
): string {
  return formatComboDose(schedule.dosage, phase.unit ?? "mg", brand);
}

/**
 * Load every dose the user should currently be reminded about.
 *
 * Tombstoned rows never count, a prescription must be active, and each
 * prescription contributes only its effective phase (a plan-linked titration
 * phase overrides maintenance), matching the Today view.
 */
export async function loadReminderDoses(): Promise<ReminderDose[]> {
  const [prescriptions, phases, schedules, inventory] = await Promise.all([
    db.prescriptions.toArray(),
    db.medicationPhases.toArray(),
    db.phaseSchedules.toArray(),
    db.inventoryItems.toArray(),
  ]);

  const prescriptionMap = new Map(
    prescriptions.filter((p) => p.isActive === true && isLive(p)).map((p) => [p.id, p]),
  );
  const brandByPrescription = new Map<string, InventoryItem>();
  for (const inv of inventory) {
    if (isActiveBrand(inv) && !brandByPrescription.has(inv.prescriptionId)) {
      brandByPrescription.set(inv.prescriptionId, inv);
    }
  }

  const effective = selectEffectivePhases(
    phases.filter((p) => prescriptionMap.has(p.prescriptionId)),
    schedules,
  );

  const doses: ReminderDose[] = [];
  for (const { prescriptionId, phase, schedules: phaseSchedules } of effective) {
    const prescription = prescriptionMap.get(prescriptionId);
    if (!prescription) continue;
    const brand = brandByPrescription.get(prescriptionId);
    for (const schedule of phaseSchedules) {
      if (!/^\d{1,2}:\d{2}$/.test(schedule.time ?? "")) continue;
      doses.push({
        prescriptionId,
        phaseId: phase.id,
        scheduleId: schedule.id,
        genericName: prescription.genericName,
        displayName: brand?.brandName || prescription.genericName,
        dosageText: formatDosage(phase, schedule, brand),
        time: schedule.time.padStart(5, "0"),
        anchorTimezone: schedule.anchorTimezone,
        daysOfWeek: schedule.daysOfWeek ?? [],
      });
    }
  }
  return doses;
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

/**
 * Every occurrence with `from <= at < from + days`, sorted by time.
 * `deviceTz` also stands in for a schedule whose anchor zone is missing or
 * unknown to Intl.
 */
export function buildReminderOccurrences(
  doses: readonly ReminderDose[],
  opts: { from: number; days: number; deviceTz: string },
): ReminderOccurrence[] {
  const end = opts.from + opts.days * DAY_MS;
  const out: ReminderOccurrence[] = [];

  for (const dose of doses) {
    const tz = isValidTimeZone(dose.anchorTimezone) ? dose.anchorTimezone : opts.deviceTz;
    // Start one anchor-day early so a zone far from the device can't lose
    // the first occurrence to a date-line difference.
    let dateKey = addDays(zonedParts(opts.from, tz).dateKey, -1);
    for (let i = 0; i <= opts.days + 1; i++, dateKey = addDays(dateKey, 1)) {
      if (!dose.daysOfWeek.includes(weekdayOf(dateKey))) continue;
      const at = zonedTimeToEpoch(dateKey, dose.time, tz);
      if (at < opts.from || at >= end) continue;
      const local = zonedParts(at, opts.deviceTz);
      out.push({ dose, dateKey, at, localTime: local.time, localWeekday: local.weekday });
    }
  }

  return out.sort((a, b) => a.at - b.at || a.dose.scheduleId.localeCompare(b.dose.scheduleId));
}

/**
 * True when the slot has been dealt with (taken, skipped or rescheduled), so
 * no reminder or follow-up should fire for it.
 */
export function isSlotHandled(log: Pick<DoseLog, "status" | "deletedAt"> | undefined): boolean {
  if (!log || !isLive(log)) return false;
  return log.status === "taken" || log.status === "skipped" || log.status === "rescheduled";
}

/** `scheduleId|dateKey` keys of every handled slot among `occurrences`. */
export async function loadHandledSlots(
  occurrences: readonly ReminderOccurrence[],
): Promise<Set<string>> {
  const keys = [...new Set(occurrences.map((o) => `${o.dose.scheduleId}|${o.dateKey}`))];
  if (keys.length === 0) return new Set();
  const logs = await db.doseLogs
    .where("[scheduleId+scheduledDate]")
    .anyOf(keys.map((k) => k.split("|") as [string, string]))
    .toArray();
  const handled = new Set<string>();
  for (const log of logs) {
    if (log.scheduleId && isSlotHandled(log)) handled.add(`${log.scheduleId}|${log.scheduledDate}`);
  }
  return handled;
}

// ---------------------------------------------------------------------------
// Push schedule
// ---------------------------------------------------------------------------

export function encodePushMedications(payload: PushMedicationsPayload): string {
  return JSON.stringify(payload);
}

/**
 * Build the weekly push schedule: one entry per (device-local weekday, HH:MM)
 * holding exactly the doses due on that weekday. Anchoring the week at the
 * device's local midnight makes each weekday appear exactly once.
 */
export function buildWeeklyPushEntries(
  doses: readonly ReminderDose[],
  deviceTz: string,
  now: number = Date.now(),
): PushScheduleEntry[] {
  const todayKey = zonedParts(now, deviceTz).dateKey;
  const from = zonedTimeToEpoch(todayKey, "00:00", deviceTz);
  const occurrences = buildReminderOccurrences(doses, { from, days: 7, deviceTz });

  const bySlot = new Map<string, ReminderOccurrence[]>();
  for (const o of occurrences) {
    const key = `${o.localWeekday}|${o.localTime}`;
    const bucket = bySlot.get(key);
    if (bucket) bucket.push(o);
    else bySlot.set(key, [o]);
  }

  const entries: PushScheduleEntry[] = [];
  for (const [key, slot] of bySlot) {
    const [day, timeSlot] = key.split("|");
    entries.push({
      timeSlot: timeSlot ?? "00:00",
      dayOfWeek: Number(day),
      medicationsJson: encodePushMedications({
        body: slot.map((o) => `${o.dose.displayName} ${o.dose.dosageText}`).join(", "),
        scheduleIds: slot.map((o) => o.dose.scheduleId),
      }),
    });
  }
  return entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.timeSlot.localeCompare(b.timeSlot));
}
