import {
  db,
  type DoseLog,
  type Prescription,
  type MedicationPhase,
  type PhaseSchedule,
  type InventoryItem,
} from "./db";
import { formatLocalTime, getDeviceTimezone } from "./timezone";
import { calculatePillsConsumed, isCleanFraction } from "./dose-log-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DoseSlotStatus = "taken" | "skipped" | "pending" | "missed";

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
  inventoryWarning?: string; // "negative_stock" | "no_inventory" | "odd_fraction"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get today's date as YYYY-MM-DD in the local timezone.
 */
function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Determine dose slot status based on existing log and date.
 */
function deriveStatus(
  log: DoseLog | undefined,
  dateStr: string,
  todayStr: string,
): DoseSlotStatus {
  if (log) {
    // Map dose log status to slot status
    if (log.status === "taken") return "taken";
    if (log.status === "skipped") return "skipped";
    // "rescheduled" and "pending" logs map to their respective statuses
    if (log.status === "rescheduled") return "skipped"; // rescheduled slots show as handled
    if (log.status === "pending") return "pending";
  }

  // No log exists
  if (dateStr === todayStr) return "pending";
  if (dateStr < todayStr) return "missed";
  // Future date
  return "pending";
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

  // 2. Get all active prescriptions
  const activePrescriptions = await db.prescriptions
    .where("isActive")
    .equals(1)
    .toArray();
  const prescriptionMap = new Map(activePrescriptions.map((p) => [p.id, p]));
  const prescriptionIds = activePrescriptions.map((p) => p.id);

  // 3. Get active phases for those prescriptions
  const allActivePhases = await db.medicationPhases
    .where("status")
    .equals("active")
    .toArray();
  const activePhases = allActivePhases.filter((p) =>
    prescriptionIds.includes(p.prescriptionId),
  );
  const phaseMap = new Map(activePhases.map((p) => [p.id, p]));
  const phaseIds = activePhases.map((p) => p.id);

  // 4. Get enabled schedules for active phases on this day-of-week
  const enabledSchedules = await db.phaseSchedules
    .where("enabled")
    .equals(1)
    .toArray();
  const applicableSchedules = enabledSchedules.filter(
    (s) => phaseIds.includes(s.phaseId) && s.daysOfWeek.includes(dayOfWeek),
  );

  // 5. Get all existing dose logs for this date
  const doseLogs = await db.doseLogs
    .where("scheduledDate")
    .equals(dateStr)
    .toArray();

  // Build a lookup map: "prescriptionId|phaseId|scheduleId" -> DoseLog
  const logMap = new Map<string, DoseLog>();
  for (const log of doseLogs) {
    const key = `${log.prescriptionId}|${log.phaseId}|${log.scheduleId}`;
    logMap.set(key, log);
  }

  // 6. Get all active inventory items
  const activeInventory = await db.inventoryItems
    .where("isActive")
    .equals(1)
    .toArray();
  const inventoryByPrescription = new Map<string, InventoryItem>();
  for (const inv of activeInventory) {
    if (!inv.isArchived) {
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

    const logKey = `${prescription.id}|${phase.id}|${schedule.id}`;
    const existingLog = logMap.get(logKey);

    const status = deriveStatus(existingLog, dateStr, todayStr);
    const localTime = formatLocalTime(schedule.scheduleTimeUTC, tz);
    const dosageMg = schedule.dosage;

    const inventory = inventoryByPrescription.get(prescription.id);

    // Calculate pill info
    let pillsPerDose: number | undefined;
    let inventoryWarning: string | undefined;

    if (!inventory) {
      inventoryWarning = "no_inventory";
    } else {
      pillsPerDose = calculatePillsConsumed(dosageMg, inventory.strength);
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
      localTime,
      dosageMg,
      unit: phase.unit,
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
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;

    const slots = await getDailyDoseSchedule(dateStr, timezone);
    result.set(dateStr, slots);

    current.setDate(current.getDate() + 1);
  }

  return result;
}
