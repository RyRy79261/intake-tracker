import { db, type DoseLog, type DoseStatus, type Prescription, type MedicationPhase, type PhaseSchedule, type InventoryItem } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { adjustStock, getActiveInventoryForPrescription } from "./medication-service";
import { getDailySchedule } from "./medication-schedule-service";
import { syncFields } from "./utils";

export interface DoseLogWithDetails {
  log: DoseLog;
  prescription: Prescription;
  phase: MedicationPhase;
  schedule: PhaseSchedule;
  inventory?: InventoryItem;
}

export async function generatePendingDoseLogs(dateStr: string): Promise<ServiceResult<void>> {
  try {
    const date = new Date(dateStr + "T12:00:00Z");
    const dayOfWeek = date.getDay();
    const scheduleResult = await getDailySchedule(dayOfWeek);
    if (!scheduleResult.success) return err(scheduleResult.error);
    const scheduleMap = scheduleResult.data;

    for (const [time, entries] of Array.from(scheduleMap.entries())) {
      for (const entry of entries) {
        const existing = await getDoseLogRaw(
          entry.prescription.id,
          entry.phase.id,
          entry.schedule.id,
          dateStr,
          time
        );

        if (!existing) {
          const log: DoseLog = {
            id: crypto.randomUUID(),
            prescriptionId: entry.prescription.id,
            phaseId: entry.phase.id,
            scheduleId: entry.schedule.id,
            scheduledDate: dateStr,
            scheduledTime: time,
            status: "pending",
            ...syncFields(),
          };
          await db.doseLogs.add(log);
        }
      }
    }
    return ok(undefined);
  } catch (e) {
    return err("Failed to generate pending dose logs", e);
  }
}

export async function getDoseLogsWithDetailsForDate(dateStr: string): Promise<ServiceResult<DoseLogWithDetails[]>> {
  try {
    const genResult = await generatePendingDoseLogs(dateStr);
    if (!genResult.success) return err(genResult.error);

    const logs = await db.doseLogs.where("scheduledDate").equals(dateStr).toArray();

    const activePrescriptions = await db.prescriptions.toArray();
    const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));

    const phases = await db.medicationPhases.toArray();
    const phaseMap = new Map(phases.map(p => [p.id, p]));

    const schedules = await db.phaseSchedules.toArray();
    const scheduleMap = new Map(schedules.map(s => [s.id, s]));

    const inventories = await db.inventoryItems.toArray();
    const inventoryMap = new Map<string, InventoryItem>();
    for (const inv of inventories) {
      if (inv.isActive && !inv.isArchived) {
        inventoryMap.set(inv.prescriptionId, inv);
      }
    }

    const result: DoseLogWithDetails[] = [];
    for (const log of logs) {
      const prescription = prescriptionMap.get(log.prescriptionId);
      const phase = phaseMap.get(log.phaseId);
      const schedule = scheduleMap.get(log.scheduleId);
      const inventory = inventoryMap.get(log.prescriptionId);

      if (prescription && phase && schedule) {
        result.push({
          log,
          prescription,
          phase,
          schedule,
          ...(inventory !== undefined && { inventory }),
        });
      }
    }

    return ok(result);
  } catch (e) {
    return err("Failed to get dose logs with details", e);
  }
}

export async function getDoseLogsForDate(date: string): Promise<ServiceResult<DoseLog[]>> {
  try {
    const logs = await db.doseLogs.where("scheduledDate").equals(date).toArray();
    return ok(logs);
  } catch (e) {
    return err("Failed to get dose logs for date", e);
  }
}

// Internal raw query (no ServiceResult) for use within this module
async function getDoseLogRaw(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string
): Promise<DoseLog | undefined> {
  return db.doseLogs
    .where("scheduleId")
    .equals(scheduleId)
    .filter(
      (l) =>
        l.prescriptionId === prescriptionId &&
        l.phaseId === phaseId &&
        l.scheduledDate === date &&
        l.scheduledTime === time
    )
    .first();
}

export async function getDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string
): Promise<ServiceResult<DoseLog | undefined>> {
  try {
    const log = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
    return ok(log);
  } catch (e) {
    return err("Failed to get dose log", e);
  }
}

async function upsertDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  status: DoseStatus,
  extra?: Partial<Pick<DoseLog, "rescheduledTo" | "skipReason" | "note" | "inventoryItemId">>
): Promise<DoseLog> {
  const existing = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
  const now = Date.now();

  if (existing) {
    const updates: Partial<DoseLog> = {
      status,
      actionTimestamp: now,
      ...extra,
    };
    await db.doseLogs.update(existing.id, updates);
    return { ...existing, ...updates };
  }

  const log: DoseLog = {
    id: crypto.randomUUID(),
    prescriptionId,
    phaseId,
    scheduleId,
    scheduledDate: date,
    scheduledTime: time,
    status,
    actionTimestamp: now,
    ...extra,
    ...syncFields(),
  };
  await db.doseLogs.add(log);
  return log;
}

export async function takeDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<ServiceResult<DoseLog>> {
  try {
    const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
    const wasTaken = prev?.status === "taken";

    let inventoryItemId = prev?.inventoryItemId;

    if (!wasTaken) {
      const invResult = await getActiveInventoryForPrescription(prescriptionId);
      if (invResult.success && invResult.data) {
        inventoryItemId = invResult.data.id;
        const stockResult = await adjustStock(inventoryItemId, -dosageAmount);
        if (!stockResult.success) return err(stockResult.error);
      }
    }

    const log = await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "taken",
      inventoryItemId !== undefined ? { inventoryItemId } : undefined
    );
    return ok(log);
  } catch (e) {
    return err("Failed to take dose", e);
  }
}

export async function untakeDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<ServiceResult<DoseLog>> {
  try {
    const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
    const wasTaken = prev?.status === "taken";

    if (wasTaken && prev?.inventoryItemId) {
      const stockResult = await adjustStock(prev.inventoryItemId, dosageAmount);
      if (!stockResult.success) return err(stockResult.error);
    }

    const log = await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "pending");
    return ok(log);
  } catch (e) {
    return err("Failed to untake dose", e);
  }
}

export async function skipDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number,
  reason?: string
): Promise<ServiceResult<DoseLog>> {
  try {
    const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
    if (prev?.status === "taken" && prev?.inventoryItemId) {
      const stockResult = await adjustStock(prev.inventoryItemId, dosageAmount);
      if (!stockResult.success) return err(stockResult.error);
    }
    const log = await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "skipped",
      reason !== undefined ? { skipReason: reason } : undefined
    );
    return ok(log);
  } catch (e) {
    return err("Failed to skip dose", e);
  }
}

export async function rescheduleDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  newTime: string,
  dosageAmount: number
): Promise<ServiceResult<DoseLog>> {
  try {
    const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
    if (prev?.status === "taken" && prev?.inventoryItemId) {
      const stockResult = await adjustStock(prev.inventoryItemId, dosageAmount);
      if (!stockResult.success) return err(stockResult.error);
    }
    await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "rescheduled", {
      rescheduledTo: newTime,
    });
    const log = await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, newTime, "pending");
    return ok(log);
  } catch (e) {
    return err("Failed to reschedule dose", e);
  }
}

export async function takeAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[],
  date: string,
  time: string
): Promise<ServiceResult<void>> {
  try {
    for (const entry of entries) {
      const result = await takeDose(entry.prescriptionId, entry.phaseId, entry.scheduleId, date, time, entry.dosageAmount);
      if (!result.success) return err(result.error);
    }
    return ok(undefined);
  } catch (e) {
    return err("Failed to take all doses", e);
  }
}

export async function skipAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[],
  date: string,
  time: string,
  reason?: string
): Promise<ServiceResult<void>> {
  try {
    for (const entry of entries) {
      const result = await skipDose(entry.prescriptionId, entry.phaseId, entry.scheduleId, date, time, entry.dosageAmount, reason);
      if (!result.success) return err(result.error);
    }
    return ok(undefined);
  } catch (e) {
    return err("Failed to skip all doses", e);
  }
}
