import { db, type UrinationRecord } from "./db";
import { generateId } from "./utils";

export async function addUrinationRecord(
  timestamp?: number,
  amountEstimate?: string,
  note?: string
): Promise<UrinationRecord> {
  const record: UrinationRecord = {
    id: generateId(),
    timestamp: timestamp ?? Date.now(),
    amountEstimate: amountEstimate?.trim() || undefined,
    note: note?.trim() || undefined,
  };

  await db.urinationRecords.add(record);
  return record;
}

export async function getUrinationRecords(
  limit?: number
): Promise<UrinationRecord[]> {
  let query = db.urinationRecords.orderBy("timestamp").reverse();

  if (limit) {
    return query.limit(limit).toArray();
  }

  return query.toArray();
}

export async function getUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<UrinationRecord[]> {
  return db.urinationRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
}

export async function deleteUrinationRecord(id: string): Promise<void> {
  await db.urinationRecords.delete(id);
}

export async function updateUrinationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<void> {
  await db.urinationRecords.update(id, updates);
}
