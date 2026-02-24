import { db, type DoseLog, type DoseStatus } from "./db";
import { adjustStock, getActiveInventoryForPrescription } from "./medication-service";

export async function getDoseLogsForDate(date: string): Promise<DoseLog[]> {
  return db.doseLogs.where("scheduledDate").equals(date).toArray();
}

export async function getDoseLog(
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

async function upsertDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  status: DoseStatus,
  extra?: Partial<Pick<DoseLog, "rescheduledTo" | "skipReason" | "note" | "inventoryItemId">>
): Promise<DoseLog> {
  const existing = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
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
): Promise<DoseLog> {
  const prev = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
  const wasTaken = prev?.status === "taken";
  
  let inventoryItemId = prev?.inventoryItemId;
  
  if (!wasTaken) {
    const activeInventory = await getActiveInventoryForPrescription(prescriptionId);
    if (activeInventory) {
      inventoryItemId = activeInventory.id;
      await adjustStock(inventoryItemId, -dosageAmount);
    }
  }

  return upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "taken", { inventoryItemId });
}

export async function untakeDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<DoseLog> {
  const prev = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
  const wasTaken = prev?.status === "taken";
  
  if (wasTaken && prev?.inventoryItemId) {
    await adjustStock(prev.inventoryItemId, dosageAmount);
  }
  
  return upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "pending");
}

export async function skipDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number,
  reason?: string
): Promise<DoseLog> {
  const prev = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
  if (prev?.status === "taken" && prev?.inventoryItemId) {
    await adjustStock(prev.inventoryItemId, dosageAmount);
  }
  return upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "skipped", {
    skipReason: reason,
  });
}

export async function rescheduleDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  newTime: string,
  dosageAmount: number
): Promise<DoseLog> {
  const prev = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
  if (prev?.status === "taken" && prev?.inventoryItemId) {
    await adjustStock(prev.inventoryItemId, dosageAmount);
  }
  await upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "rescheduled", {
    rescheduledTo: newTime,
  });
  return upsertDoseLog(prescriptionId, phaseId, scheduleId, date, newTime, "pending");
}

export async function takeAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[],
  date: string,
  time: string
): Promise<void> {
  for (const entry of entries) {
    await takeDose(entry.prescriptionId, entry.phaseId, entry.scheduleId, date, time, entry.dosageAmount);
  }
}

export async function skipAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[],
  date: string,
  time: string,
  reason?: string
): Promise<void> {
  for (const entry of entries) {
    await skipDose(entry.prescriptionId, entry.phaseId, entry.scheduleId, date, time, entry.dosageAmount, reason);
  }
}
