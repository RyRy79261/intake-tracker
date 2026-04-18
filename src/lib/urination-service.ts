import { db, type UrinationRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";
import { writeWithSync } from "./sync-queue";
import { schedulePush } from "./sync-engine";

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

export async function getUrinationRecords(
  limit?: number
): Promise<UrinationRecord[]> {
  const records = await db.urinationRecords.orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit ? active.slice(0, limit) : active;
}

export async function getUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<UrinationRecord[]> {
  const records = await db.urinationRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function deleteUrinationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("urinationRecords", "delete", async () => {
      await db.urinationRecords.update(id, { deletedAt: now, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete urination record", e);
  }
}

export async function undoDeleteUrinationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("urinationRecords", "upsert", async () => {
      await db.urinationRecords.update(id, { deletedAt: null, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete urination record", e);
  }
}

export async function updateUrinationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  try {
    await writeWithSync("urinationRecords", "upsert", async () => {
      await db.urinationRecords.update(id, { ...updates, updatedAt: Date.now() });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update urination record", e);
  }
}
