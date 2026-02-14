import { db, type DefecationRecord } from "./db";
import { generateId } from "./utils";

export async function addDefecationRecord(
  timestamp?: number,
  amountEstimate?: string,
  note?: string
): Promise<DefecationRecord> {
  const record: DefecationRecord = {
    id: generateId(),
    timestamp: timestamp ?? Date.now(),
    amountEstimate: amountEstimate?.trim() || undefined,
    note: note?.trim() || undefined,
  };

  await db.defecationRecords.add(record);
  return record;
}

export async function getDefecationRecords(
  limit?: number
): Promise<DefecationRecord[]> {
  let query = db.defecationRecords.orderBy("timestamp").reverse();

  if (limit) {
    return query.limit(limit).toArray();
  }

  return query.toArray();
}

export async function getDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<DefecationRecord[]> {
  return db.defecationRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
}

export async function deleteDefecationRecord(id: string): Promise<void> {
  await db.defecationRecords.delete(id);
}

export async function updateDefecationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<void> {
  await db.defecationRecords.update(id, updates);
}
