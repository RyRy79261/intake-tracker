import { db, type DefecationRecord } from "@/lib/db";
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

    await writeWithSync("defecationRecords", "upsert", async () => {
      await db.defecationRecords.add(record);
      return record;
    });
    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to add defecation record", e);
  }
}

export function getDefecationRecords(limit?: number): Promise<DefecationRecord[]> {
  return getActiveRecords<DefecationRecord>(db.defecationRecords, limit);
}

export function getDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<DefecationRecord[]> {
  return getRecordsBetween<DefecationRecord>(db.defecationRecords, startTime, endTime);
}

export function deleteDefecationRecord(id: string): Promise<ServiceResult<void>> {
  return softDeleteRecord<DefecationRecord>(db.defecationRecords, "defecationRecords", id, "Failed to delete defecation record");
}

export function undoDeleteDefecationRecord(id: string): Promise<ServiceResult<void>> {
  return undoSoftDeleteRecord<DefecationRecord>(db.defecationRecords, "defecationRecords", id, "Failed to undo delete defecation record");
}

export function updateDefecationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  return updateRecord<DefecationRecord>(db.defecationRecords, "defecationRecords", id, updates, "Failed to update defecation record");
}
