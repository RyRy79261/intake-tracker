import { db, type EatingRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

export async function addEatingRecord(
  timestamp?: number,
  note?: string,
  grams?: number
): Promise<ServiceResult<EatingRecord>> {
  try {
    const trimmedNote = note?.trim();
    const record: EatingRecord = {
      id: generateId(),
      timestamp: timestamp ?? Date.now(),
      ...(grams !== undefined && grams > 0 && { grams }),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await db.eatingRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add eating record", e);
  }
}

export async function getEatingRecords(limit?: number): Promise<EatingRecord[]> {
  const records = await db.eatingRecords.orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit ? active.slice(0, limit) : active;
}

export async function getEatingRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<EatingRecord[]> {
  const records = await db.eatingRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function deleteEatingRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.eatingRecords.update(id, { deletedAt: now, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete eating record", e);
  }
}

export async function undoDeleteEatingRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.eatingRecords.update(id, { deletedAt: null, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete eating record", e);
  }
}

export async function updateEatingRecord(
  id: string,
  updates: { timestamp?: number; note?: string; grams?: number }
): Promise<ServiceResult<void>> {
  try {
    await db.eatingRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update eating record", e);
  }
}
