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
  const query = db.eatingRecords.orderBy("timestamp").reverse();
  return limit ? query.limit(limit).toArray() : query.toArray();
}

export async function getEatingRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<EatingRecord[]> {
  return db.eatingRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
}

export async function deleteEatingRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.eatingRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete eating record", e);
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
