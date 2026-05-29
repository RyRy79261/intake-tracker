import { db, type UrinationRecord } from "@/lib/db";
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

    await writeWithSync("urinationRecords", "upsert", async () => {
      await db.urinationRecords.add(record);
      return record;
    });
    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to add urination record", e);
  }
}

export function getUrinationRecords(limit?: number): Promise<UrinationRecord[]> {
  return getActiveRecords<UrinationRecord>(db.urinationRecords, limit);
}

export function getUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<UrinationRecord[]> {
  return getRecordsBetween<UrinationRecord>(db.urinationRecords, startTime, endTime);
}

export function deleteUrinationRecord(id: string): Promise<ServiceResult<void>> {
  return softDeleteRecord<UrinationRecord>(db.urinationRecords, "urinationRecords", id, "Failed to delete urination record");
}

export function undoDeleteUrinationRecord(id: string): Promise<ServiceResult<void>> {
  return undoSoftDeleteRecord<UrinationRecord>(db.urinationRecords, "urinationRecords", id, "Failed to undo delete urination record");
}

export function updateUrinationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  return updateRecord<UrinationRecord>(db.urinationRecords, "urinationRecords", id, updates, "Failed to update urination record");
}
