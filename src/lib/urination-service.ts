import { db, type UrinationRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

export async function addUrinationRecord(
  timestamp?: number,
  amountEstimate?: string,
  note?: string
): Promise<ServiceResult<UrinationRecord>> {
  try {
    const trimmedAmount = amountEstimate?.trim();
    const trimmedNote = note?.trim();
    const record: UrinationRecord = {
      id: generateId(),
      timestamp: timestamp ?? Date.now(),
      ...(trimmedAmount !== undefined && trimmedAmount !== "" && { amountEstimate: trimmedAmount }),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await db.urinationRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add urination record", e);
  }
}

export async function getUrinationRecords(
  limit?: number
): Promise<ServiceResult<UrinationRecord[]>> {
  try {
    let query = db.urinationRecords.orderBy("timestamp").reverse();
    const records = limit ? await query.limit(limit).toArray() : await query.toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get urination records", e);
  }
}

export async function getUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<ServiceResult<UrinationRecord[]>> {
  try {
    const records = await db.urinationRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get urination records by date range", e);
  }
}

export async function deleteUrinationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.urinationRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete urination record", e);
  }
}

export async function updateUrinationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  try {
    await db.urinationRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update urination record", e);
  }
}
