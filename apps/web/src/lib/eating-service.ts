import { db, type EatingRecord } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
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

/**
 * `eating_records.grams` is a Postgres `integer`. AI parses and the voice
 * panel's `parseFloat` inputs can both produce a fraction, and a fractional
 * value fails push validation — the record, and later its tombstone, are
 * dropped from the sync queue and never reach the server (issue #354). Round
 * at the write sites so stored data matches what the column can hold; the
 * push loop normalizes as a backstop for rows written before this.
 */
export function roundGrams(grams: number | undefined): number | undefined {
  if (grams === undefined || !Number.isFinite(grams)) return undefined;
  return Math.round(grams);
}

export async function addEatingRecord(
  timestamp?: number,
  note?: string,
  grams?: number
): Promise<ServiceResult<EatingRecord>> {
  try {
    const trimmedNote = note?.trim();
    const wholeGrams = roundGrams(grams);
    const record: EatingRecord = {
      id: generateId(),
      timestamp: timestamp ?? Date.now(),
      ...(wholeGrams !== undefined && wholeGrams > 0 && { grams: wholeGrams }),
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
  const normalized = { ...updates };
  if (updates.grams !== undefined) {
    const wholeGrams = roundGrams(updates.grams);
    // exactOptionalPropertyTypes forbids assigning undefined to an optional
    // field, so an unusable value (NaN/Infinity) drops the key entirely.
    if (wholeGrams === undefined) delete normalized.grams;
    else normalized.grams = wholeGrams;
  }
  return updateRecord<EatingRecord>(db.eatingRecords, "eatingRecords", id, normalized, "Failed to update eating record");
}
