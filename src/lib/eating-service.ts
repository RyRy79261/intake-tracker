import { db, type EatingRecord } from "@/lib/db";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { generateId, syncFields } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import {
  getActiveRecords,
  getRecordsBetween,
  softDeleteRecord,
  undoSoftDeleteRecord,
  updateRecord,
} from "@/lib/record-crud";

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

    await writeWithSync("eatingRecords", "upsert", async () => {
      await db.eatingRecords.add(record);
      return record;
    });
    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to add eating record", e);
  }
}

export function getEatingRecords(limit?: number): Promise<EatingRecord[]> {
  return getActiveRecords<EatingRecord>(db.eatingRecords, limit);
}

export function getEatingRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<EatingRecord[]> {
  return getRecordsBetween<EatingRecord>(db.eatingRecords, startTime, endTime);
}

export function deleteEatingRecord(id: string): Promise<ServiceResult<void>> {
  return softDeleteRecord<EatingRecord>(db.eatingRecords, "eatingRecords", id, "Failed to delete eating record");
}

export function undoDeleteEatingRecord(id: string): Promise<ServiceResult<void>> {
  return undoSoftDeleteRecord<EatingRecord>(db.eatingRecords, "eatingRecords", id, "Failed to undo delete eating record");
}

export function updateEatingRecord(
  id: string,
  updates: { timestamp?: number; note?: string; grams?: number }
): Promise<ServiceResult<void>> {
  return updateRecord<EatingRecord>(db.eatingRecords, "eatingRecords", id, updates, "Failed to update eating record");
}
