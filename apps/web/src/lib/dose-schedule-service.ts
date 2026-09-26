import {
  db,
  type DoseLog,
  type Prescription,
  type MedicationPhase,
  type PhaseSchedule,
  type InventoryItem,
} from "@/lib/db";
import { getDeviceTimezone, resolveScheduleLocalTime } from "@/lib/timezone";
import { calculatePillsConsumed, isCleanFraction, selectSlotLog } from "@/lib/dose-log-service";
import { isActiveBrand } from "@/lib/inventory-service";
import { isValidPillStrength } from "@intake/core/compound";
import { toLocalDateKey } from "@/lib/date-utils";
import { resolveDoseStatus, type ResolvedDoseStatus } from "@/lib/dose-status";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase, selectEffectivePhases } from "@intake/core/effective-phase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DoseSlotStatus = ResolvedDoseStatus;

export interface DoseSlot {
  // Schedule info
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduleTimeUTC: number; // minutes from midnight UTC
  localTime: string; // "HH:MM" in device timezone for display
  dosageMg: number; // from PhaseSchedule.dosage
  unit: string; // from MedicationPhase.unit

  // Status
  status: DoseSlotStatus;
  existingLog?: DoseLog; // the actual log record if one exists

  // Related entities for display
  prescription: Prescription;
  phase: MedicationPhase;
  schedule: PhaseSchedule;
  inventory?: InventoryItem; // active inventory for this prescription

  // Computed stock info
  pillsPerDose?: number; // dosageMg / inventory.strength (if inventory exists)
  inventoryWarning?: string; // "negative_stock" | "no_inventory" | "odd_fraction" | "invalid_strength"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get today's date as YYYY-MM-DD in the local timezone.
 */
function getTodayDateStr(): string {
  return toLocalDateKey();
}

/**
 * Determine dose slot status based on existing log and date. The shared rule
 * (resolveDoseStatus): an outstanding dose on a past day is missed.
 */
function deriveStatus(
  log: DoseLog | undefined,
  dateStr: string,
  todayStr: string,
): DoseSlotStatus {
  return resolveDoseStatus(log?.status, dateStr, todayStr);
}

/**
 * Whether a phase was running on a past date: started on or before it, and,
 * once completed, ended on or after it. An active phase has no end yet (a
 * maintenance phase re-activated after a titration keeps its old endDate).
 * A completed phase with no endDate cannot be dated and counts as not live.
 */
function phaseLiveOn(phase: MedicationPhase, dateStr: string): boolean {
  if (!isLive(phase) || toLocalDateKey(phase.startDate) > dateStr) return false;
  if (phase.status === "active") return true;
  if (phase.status === "completed") {
    return phase.endDate != null && toLocalDateKey(phase.endDate) >= dateStr;
  }
  return false;
}

/**
 * Whether a schedule applied on a date: added on or before it, and either
 * still live and enabled or removed after it. A removed schedule's `enabled`
 * says nothing about the days it ran (the v23 tombstone repair cleared it).
 */
function scheduleLiveOn(schedule: PhaseSchedule, dateStr: string): boolean {
  if (toLocalDateKey(schedule.createdAt) > dateStr) return false;
  if (isLive(schedule)) return schedule.enabled === true;
  return dateStr < toLocalDateKey(schedule.deletedAt!);
}

/**
 * The phase and schedules that drove each prescription on a PAST date. The
 * same precedence as today (a plan-linked titration beats maintenance), but
 * only among phases that were running on that date; ties go to the phase
 * that started last.
 */
function selectPhasesLiveOn(
  dateStr: string,
  phases: MedicationPhase[],
  schedules: PhaseSchedule[],
): { phase: MedicationPhase; schedules: PhaseSchedule[] }[] {
  const byPrescription = new Map<string, MedicationPhase[]>();
  for (const phase of phases) {
    if (!phaseLiveOn(phase, dateStr)) continue;
    const bucket = byPrescription.get(phase.prescriptionId) ?? [];
    bucket.push(phase);
    byPrescription.set(phase.prescriptionId, bucket);
  }

  const result: { phase: MedicationPhase; schedules: PhaseSchedule[] }[] = [];
  for (const candidates of byPrescription.values()) {
    // selectEffectivePhase only weighs active phases; every candidate here was
    // running on the date, so present them all as active and map back by id.
    candidates.sort((a, b) => b.startDate - a.startDate);
    const chosen = selectEffectivePhase(
      candidates.map((p) => ({ ...p, status: "active" as const })),
    );
    const phase = candidates.find((p) => p.id === chosen?.id);
    if (!phase) continue;
    result.push({
      phase,
      schedules: schedules.filter((s) => s.phaseId === phase.id && scheduleLiveOn(s, dateStr)),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Derive the daily dose schedule at read time from active prescriptions,
 * phases, schedules, and existing dose logs.
 *
 * This replaces the pre-create-pending-records pattern. Each call reads from
 * 5 tables (prescriptions, medicationPhases, phaseSchedules, doseLogs,
 * inventoryItems). When wrapped in useLiveQuery, it re-runs whenever any
 * of these tables change.
 */
export async function getDailyDoseSchedule(
  dateStr: string,
  timezone?: string,
): Promise<DoseSlot[]> {
  const tz = timezone ?? getDeviceTimezone();
  const todayStr = getTodayDateStr();

  // 1. Parse dateStr to get day-of-week
  // Use T12:00:00 to avoid timezone shift issues with date parsing
  const parsedDate = new Date(dateStr + "T12:00:00");
  const dayOfWeek = parsedDate.getDay(); // 0=Sunday

  // 2. Get all live, active prescriptions (filter on boolean, not indexed integer)
  const allPrescriptions = await db.prescriptions.toArray();
  const activePrescriptions = allPrescriptions.filter(
    (p) => p.isActive === true && isLive(p),
  );
  const prescriptionMap = new Map(activePrescriptions.map((p) => [p.id, p]));

  // 3. Pick each prescription's phase and schedules. Today and later use the
  // current regimen (a plan-linked titration overrides maintenance). A past
  // date is resolved from the phases and schedules that were live ON that
  // date, so a later titration or schedule edit does not rewrite history.
  const isPast = dateStr < todayStr;
  const allPhases = (await db.medicationPhases.toArray()).filter(
    (p) => prescriptionMap.has(p.prescriptionId) && isLive(p),
  );
  const allSchedules = await db.phaseSchedules.toArray();
  const effective = isPast
    ? selectPhasesLiveOn(dateStr, allPhases, allSchedules)
    : selectEffectivePhases(allPhases, allSchedules).map(({ phase, schedules }) => ({
        phase,
        // A schedule added today has no slot on the days before it.
        schedules: schedules.filter((s) => toLocalDateKey(s.createdAt) <= dateStr),
      }));
  const phaseMap = new Map(effective.map(({ phase }) => [phase.id, phase]));

  // 4. The schedules that apply on this day-of-week
  const applicableSchedules = effective
    .flatMap(({ schedules }) => schedules)
    .filter((s) => s.daysOfWeek.includes(dayOfWeek));

  // 5. Get all live scheduled dose logs for this date, grouped per slot. A
  // slot is (scheduleId, date); when several logs exist for one (older builds,
  // two offline devices) selectSlotLog picks one deterministically.
  const doseLogs = await db.doseLogs
    .where("scheduledDate")
    .equals(dateStr)
    .toArray();
  const logsBySchedule = new Map<string, DoseLog[]>();
  for (const log of doseLogs) {
    if (!log.scheduleId || log.kind === "prn" || !isLive(log)) continue;
    const bucket = logsBySchedule.get(log.scheduleId) ?? [];
    bucket.push(log);
    logsBySchedule.set(log.scheduleId, bucket);
  }
  const logMap = new Map<string, DoseLog>();
  for (const [scheduleId, logs] of logsBySchedule) {
    const log = selectSlotLog(logs);
    if (log) logMap.set(scheduleId, log);
  }

  // A past dose that was taken or skipped stays in history even when its
  // phase can no longer be dated (e.g. completed without an endDate).
  if (isPast) {
    const shown = new Set(applicableSchedules.map((s) => s.id));
    const scheduleById = new Map(allSchedules.map((s) => [s.id, s]));
    const phaseById = new Map(allPhases.map((p) => [p.id, p]));
    for (const [scheduleId, log] of logMap) {
      if (shown.has(scheduleId) || (log.status !== "taken" && log.status !== "skipped")) continue;
      const schedule = scheduleById.get(scheduleId);
      const phase = schedule && phaseById.get(schedule.phaseId);
      if (!schedule || !phase) continue;
      phaseMap.set(phase.id, phase);
      applicableSchedules.push(schedule);
    }
  }

  // 6. The active brand per prescription: live, flagged active, not archived.
  // A brand deleted on another device can still say isActive. First match
  // wins, the same choice takeDose makes via getActiveInventoryForPrescription.
  const allInventory = await db.inventoryItems.toArray();
  const inventoryByPrescription = new Map<string, InventoryItem>();
  for (const inv of allInventory) {
    if (isActiveBrand(inv) && !inventoryByPrescription.has(inv.prescriptionId)) {
      inventoryByPrescription.set(inv.prescriptionId, inv);
    }
  }

  // 7. Build DoseSlot for each applicable schedule
  const slots: DoseSlot[] = [];

  for (const schedule of applicableSchedules) {
    const phase = phaseMap.get(schedule.phaseId);
    if (!phase) continue;

    const prescription = prescriptionMap.get(phase.prescriptionId);
    if (!prescription) continue;

    // Don't show doses for dates before the prescription was created.
    // Compare local date keys: a UTC date hides evening doses west of UTC.
    const createdDate = prescription.createdAt
      ? toLocalDateKey(prescription.createdAt)
      : undefined;
    if (createdDate && dateStr < createdDate) continue;

    const existingLog = logMap.get(schedule.id);

    const status = deriveStatus(existingLog, dateStr, todayStr);
    // Wall-clock `time` in the anchor zone, resolved with this date's offset,
    // so the slot does not drift across DST (scheduleTimeUTC is a stale cache).
    const localTime = resolveScheduleLocalTime(schedule, dateStr, tz);
    const dosageMg = schedule.dosage;

    const inventory = inventoryByPrescription.get(prescription.id);
    // A logged dose shows what was recorded, not the schedule's current dose.
    const snapshot =
      existingLog?.status === "taken" || existingLog?.status === "skipped"
        ? existingLog
        : undefined;
    const shownDose = snapshot?.doseAmount ?? dosageMg;

    // Calculate pill info
    let pillsPerDose: number | undefined;
    let inventoryWarning: string | undefined;

    if (!inventory) {
      inventoryWarning = "no_inventory";
    } else if (!isValidPillStrength(inventory.strength)) {
      // A zero/missing strength can't be counted in pills — flag it instead
      // of showing "0 tablets" or NaN.
      inventoryWarning = "invalid_strength";
    } else {
      pillsPerDose = calculatePillsConsumed(shownDose, inventory.strength) ?? 0;
      pillsPerDose =
        Math.round(pillsPerDose * 10000) / 10000;

      // Check for odd fraction
      if (!isCleanFraction(pillsPerDose)) {
        inventoryWarning = "odd_fraction";
      }

      // Check if stock would go negative (using currentStock as best available)
      const currentStock = inventory.currentStock ?? 0;
      if (currentStock - pillsPerDose < 0) {
        inventoryWarning = "negative_stock";
      }
    }

    slots.push({
      prescriptionId: prescription.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      scheduledDate: dateStr,
      scheduleTimeUTC: schedule.scheduleTimeUTC,
      // A rescheduled dose sits at its new time.
      localTime: existingLog?.rescheduledTo ?? localTime,
      dosageMg: shownDose,
      unit: snapshot?.doseUnit ?? phase.unit,
      status,
      ...(existingLog !== undefined && { existingLog }),
      prescription,
      phase,
      schedule,
      ...(inventory !== undefined && { inventory }),
      ...(pillsPerDose !== undefined && { pillsPerDose }),
      ...(inventoryWarning !== undefined && { inventoryWarning }),
    });
  }

  // 8. Sort by localTime ascending
  slots.sort((a, b) => a.localTime.localeCompare(b.localTime));

  return slots;
}

// ---------------------------------------------------------------------------
// Range helper
// ---------------------------------------------------------------------------

/**
 * Get dose schedules for a date range. Returns a map of date -> DoseSlot[].
 * Useful for history/calendar views.
 */
export async function getDoseScheduleForDateRange(
  startDate: string,
  endDate: string,
  timezone?: string,
): Promise<Map<string, DoseSlot[]>> {
  const result = new Map<string, DoseSlot[]>();

  // Iterate dates in range
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  const current = new Date(start);
  while (current <= end) {
    const dateStr = toLocalDateKey(current);

    const slots = await getDailyDoseSchedule(dateStr, timezone);
    result.set(dateStr, slots);

    current.setDate(current.getDate() + 1);
  }

  return result;
}
