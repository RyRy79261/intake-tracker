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

export async function getEatingRecords(limit?: number): Promise<ServiceResult<EatingRecord[]>> {
  try {
    let query = db.eatingRecords.orderBy("timestamp").reverse();
    const records = limit ? await query.limit(limit).toArray() : await query.toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get eating records", e);
  }
}

export async function getEatingRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<ServiceResult<EatingRecord[]>> {
  try {
    const records = await db.eatingRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get eating records by date range", e);
  }
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
