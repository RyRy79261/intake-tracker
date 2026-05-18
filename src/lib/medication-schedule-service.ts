import { db, type PhaseSchedule, type Prescription, type MedicationPhase, type InventoryItem } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";
import { enqueueInsideTx } from "./sync-queue";
import { schedulePush } from "./sync-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleWithDetails {
  schedule: PhaseSchedule;
  phase: MedicationPhase;
  prescription: Prescription;
  inventory?: InventoryItem;
}

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

/**
 * Get daily schedule grouped by time for a given day of the week.
 * Uses indexed queries where possible to avoid .toArray().filter() anti-pattern.
 */
export async function getDailySchedule(dayOfWeek: number): Promise<Map<string, ScheduleWithDetails[]>> {
  // Filter on boolean isActive (Dexie boolean indexing unreliable)
  const allPrescriptions = await db.prescriptions.toArray();
  const activePrescriptions = allPrescriptions.filter(p => p.isActive === true);
  const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));

  const prescriptionIds = activePrescriptions.map(p => p.id);
  const phases = await db.medicationPhases.where("status").equals("active").toArray();
  const activePhases = phases.filter(p => prescriptionIds.includes(p.prescriptionId));
  const phaseMap = new Map(activePhases.map(p => [p.id, p]));

  // Filter on boolean isActive; filter out archived in JS (isArchived not indexed)
  const allInventory = await db.inventoryItems.toArray();
  const activeInventory = allInventory.filter(i => i.isActive === true);
  const inventoryItems = activeInventory.filter(i => !i.isArchived);
  const inventoryMap = new Map(inventoryItems.map(i => [i.prescriptionId, i]));

  const phaseIds = activePhases.map(p => p.id);
  // Filter on boolean enabled field; filter by phaseId + dayOfWeek in JS
  const allSchedules = await db.phaseSchedules.toArray();
  const enabledSchedules = allSchedules.filter(s => s.enabled === true && s.deletedAt === null);
  const activeSchedules = enabledSchedules.filter(
    s => phaseIds.includes(s.phaseId) && s.daysOfWeek.includes(dayOfWeek),
  );

  const grouped = new Map<string, ScheduleWithDetails[]>();

  for (const schedule of activeSchedules) {
    const phase = phaseMap.get(schedule.phaseId);
    if (!phase) continue;
    const prescription = prescriptionMap.get(phase.prescriptionId);
    if (!prescription) continue;
    const inventory = inventoryMap.get(prescription.id);

    const existing = grouped.get(schedule.time) ?? [];
    existing.push({
      schedule,
      phase,
      prescription,
      ...(inventory !== undefined && { inventory }),
    });
    grouped.set(schedule.time, existing);
  }

  const sorted = new Map<string, ScheduleWithDetails[]>(
    Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)),
  );

  return sorted;
}

export async function getSchedulesForPhase(phaseId: string): Promise<PhaseSchedule[]> {
  const records = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
  return records.filter(r => r.deletedAt === null);
}

// ---------------------------------------------------------------------------
// Mutation functions — keep ServiceResult with audit logging
// ---------------------------------------------------------------------------

export async function addSchedule(
  input: Omit<PhaseSchedule, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId" | "enabled">,
): Promise<ServiceResult<PhaseSchedule>> {
  try {
    const tz = getDeviceTimezone();
    const schedule: PhaseSchedule = {
      ...input,
      id: crypto.randomUUID(),
      enabled: true,
      scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, tz),
      anchorTimezone: tz,
      ...syncFields(),
    };
    await db.transaction("rw", [db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
      await db.phaseSchedules.add(schedule);
      const auditEntry = buildAuditEntry("prescription_updated", {
        action: "schedule_added",
        scheduleId: schedule.id,
        phaseId: input.phaseId,
        time: input.time,
        dosage: input.dosage,
      });
      await db.auditLogs.add(auditEntry);
      await enqueueInsideTx("phaseSchedules", schedule.id, "upsert");
      await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
    });
    schedulePush();
    return ok(schedule);
  } catch (e) {
    return err("Failed to add schedule", e);
  }
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">>,
): Promise<ServiceResult<void>> {
  try {
    const tz = getDeviceTimezone();
    const finalUpdates = { ...updates, updatedAt: Date.now() };

    // If time is being updated, recompute scheduleTimeUTC
    if (updates.time) {
      finalUpdates.scheduleTimeUTC = localHHMMStringToUTCMinutes(updates.time, tz);
      finalUpdates.anchorTimezone = tz;
    }

    await db.transaction("rw", [db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
      await db.phaseSchedules.update(id, finalUpdates);
      const auditEntry = buildAuditEntry("prescription_updated", {
        action: "schedule_updated",
        scheduleId: id,
        updatedFields: Object.keys(updates),
      });
      await db.auditLogs.add(auditEntry);
      await enqueueInsideTx("phaseSchedules", id, "upsert");
      await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update schedule", e);
  }
}

export async function deleteSchedule(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
      await db.phaseSchedules.update(id, { deletedAt: now, updatedAt: now });
      const auditEntry = buildAuditEntry("prescription_updated", {
        action: "schedule_deleted",
        scheduleId: id,
      });
      await db.auditLogs.add(auditEntry);
      await enqueueInsideTx("phaseSchedules", id, "upsert");
      await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete schedule", e);
  }
}
