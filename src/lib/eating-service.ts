import { db, type EatingRecord } from "./db";
import { generateId } from "./utils";

export async function addEatingRecord(
  timestamp?: number,
  note?: string
): Promise<EatingRecord> {
  const record: EatingRecord = {
    id: generateId(),
    timestamp: timestamp ?? Date.now(),
    note: note?.trim() || undefined,
  };

  await db.eatingRecords.add(record);
  return record;
}

export async function getEatingRecords(limit?: number): Promise<EatingRecord[]> {
  let query = db.eatingRecords.orderBy("timestamp").reverse();

  if (limit) {
    return query.limit(limit).toArray();
  }

  return query.toArray();
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

export async function deleteEatingRecord(id: string): Promise<void> {
  await db.eatingRecords.delete(id);
}

export async function updateEatingRecord(
  id: string,
  updates: { timestamp?: number; note?: string }
): Promise<void> {
  await db.eatingRecords.update(id, updates);
}
