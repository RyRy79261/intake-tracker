import { db, type DefecationRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

export async function addDefecationRecord(
  timestamp?: number,
  amountEstimate?: string,
  note?: string
): Promise<ServiceResult<DefecationRecord>> {
  try {
    const trimmedAmount = amountEstimate?.trim();
    const trimmedNote = note?.trim();
    const record: DefecationRecord = {
      id: generateId(),
      timestamp: timestamp ?? Date.now(),
      ...(trimmedAmount !== undefined && trimmedAmount !== "" && { amountEstimate: trimmedAmount }),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await db.defecationRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add defecation record", e);
  }
}

export async function getDefecationRecords(
  limit?: number
): Promise<ServiceResult<DefecationRecord[]>> {
  try {
    let query = db.defecationRecords.orderBy("timestamp").reverse();
    const records = limit ? await query.limit(limit).toArray() : await query.toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get defecation records", e);
  }
}

export async function getDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<ServiceResult<DefecationRecord[]>> {
  try {
    const records = await db.defecationRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get defecation records by date range", e);
  }
}

export async function deleteDefecationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.defecationRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete defecation record", e);
  }
}

export async function updateDefecationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  try {
    const existing = await db.defecationRecords.get(id);
    if (!existing) return err("Record not found");
    await db.defecationRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update defecation record", e);
  }
}
