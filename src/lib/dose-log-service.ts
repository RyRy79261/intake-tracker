import { db, type DoseLog, type DoseStatus } from "./db";
import { adjustStock } from "./medication-service";

export async function getDoseLogsForDate(date: string): Promise<DoseLog[]> {
  return db.doseLogs.where("scheduledDate").equals(date).toArray();
}

export async function getDoseLog(
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string
): Promise<DoseLog | undefined> {
  return db.doseLogs
    .where("[medicationId+scheduleId+scheduledDate+scheduledTime]")
    .equals([medicationId, scheduleId, date, time])
    .first()
    .catch(() =>
      db.doseLogs
        .filter(
          (l) =>
            l.medicationId === medicationId &&
            l.scheduleId === scheduleId &&
            l.scheduledDate === date &&
            l.scheduledTime === time
        )
        .first()
    );
}

async function upsertDoseLog(
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string,
  status: DoseStatus,
  extra?: Partial<Pick<DoseLog, "rescheduledTo" | "skipReason" | "note">>
): Promise<DoseLog> {
  const existing = await getDoseLog(medicationId, scheduleId, date, time);
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
    medicationId,
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
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<DoseLog> {
  const prev = await getDoseLog(medicationId, scheduleId, date, time);
  const wasTaken = prev?.status === "taken";
  const log = await upsertDoseLog(medicationId, scheduleId, date, time, "taken");
  if (!wasTaken) {
    await adjustStock(medicationId, -dosageAmount);
  }
  return log;
}

export async function untakeDose(
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<DoseLog> {
  const prev = await getDoseLog(medicationId, scheduleId, date, time);
  const wasTaken = prev?.status === "taken";
  const log = await upsertDoseLog(medicationId, scheduleId, date, time, "pending");
  if (wasTaken) {
    await adjustStock(medicationId, dosageAmount);
  }
  return log;
}

export async function skipDose(
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string,
  reason?: string
): Promise<DoseLog> {
  const prev = await getDoseLog(medicationId, scheduleId, date, time);
  if (prev?.status === "taken") {
    const med = await db.medications.get(medicationId);
    if (med) await adjustStock(medicationId, med.dosageAmount);
  }
  return upsertDoseLog(medicationId, scheduleId, date, time, "skipped", {
    skipReason: reason,
  });
}

export async function rescheduleDose(
  medicationId: string,
  scheduleId: string,
  date: string,
  time: string,
  newTime: string
): Promise<DoseLog> {
  const prev = await getDoseLog(medicationId, scheduleId, date, time);
  if (prev?.status === "taken") {
    const med = await db.medications.get(medicationId);
    if (med) await adjustStock(medicationId, med.dosageAmount);
  }
  await upsertDoseLog(medicationId, scheduleId, date, time, "rescheduled", {
    rescheduledTo: newTime,
  });
  return upsertDoseLog(medicationId, scheduleId, date, newTime, "pending");
}

export async function takeAllDoses(
  entries: { medicationId: string; scheduleId: string; dosageAmount: number }[],
  date: string,
  time: string
): Promise<void> {
  for (const entry of entries) {
    await takeDose(entry.medicationId, entry.scheduleId, date, time, entry.dosageAmount);
  }
}

export async function skipAllDoses(
  entries: { medicationId: string; scheduleId: string }[],
  date: string,
  time: string,
  reason?: string
): Promise<void> {
  for (const entry of entries) {
    await skipDose(entry.medicationId, entry.scheduleId, date, time, reason);
  }
}
