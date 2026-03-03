import { db, type PhaseSchedule, type Prescription, type MedicationPhase, type InventoryItem } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";

export interface ScheduleWithDetails {
  schedule: PhaseSchedule;
  phase: MedicationPhase;
  prescription: Prescription;
  inventory?: InventoryItem;
}

export async function getDailySchedule(dayOfWeek: number): Promise<ServiceResult<Map<string, ScheduleWithDetails[]>>> {
  try {
    const allPrescriptions = await db.prescriptions.toArray();
    const activePrescriptions = allPrescriptions.filter(p => p.isActive);
    const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));

    const prescriptionIds = activePrescriptions.map(p => p.id);
    const phases = await db.medicationPhases.where("status").equals("active").toArray();
    const activePhases = phases.filter(p => prescriptionIds.includes(p.prescriptionId));
    const phaseMap = new Map(activePhases.map(p => [p.id, p]));

    const allInventoryItems = await db.inventoryItems.toArray();
    const inventoryItems = allInventoryItems.filter(i => i.isActive && !i.isArchived);
    const inventoryMap = new Map(inventoryItems.map(i => [i.prescriptionId, i]));

    const phaseIds = activePhases.map(p => p.id);
    const allSchedules = await db.phaseSchedules.toArray();
    const activeSchedules = allSchedules.filter(s => s.enabled && phaseIds.includes(s.phaseId) && s.daysOfWeek.includes(dayOfWeek));

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
      Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))
    );

    return ok(sorted);
  } catch (e) {
    return err("Failed to get daily schedule", e);
  }
}

export async function getSchedulesForPhase(phaseId: string): Promise<ServiceResult<PhaseSchedule[]>> {
  try {
    const schedules = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
    return ok(schedules);
  } catch (e) {
    return err("Failed to get schedules for phase", e);
  }
}

export async function addSchedule(input: Omit<PhaseSchedule, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId" | "enabled">): Promise<ServiceResult<PhaseSchedule>> {
  try {
    const schedule: PhaseSchedule = {
      ...input,
      id: crypto.randomUUID(),
      enabled: true,
      ...syncFields(),
    };
    await db.phaseSchedules.add(schedule);
    return ok(schedule);
  } catch (e) {
    return err("Failed to add schedule", e);
  }
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">>
): Promise<ServiceResult<void>> {
  try {
    await db.phaseSchedules.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update schedule", e);
  }
}

export async function deleteSchedule(id: string): Promise<ServiceResult<void>> {
  try {
    await db.phaseSchedules.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete schedule", e);
  }
}
