import { db, type DefecationRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";
import { writeWithSync } from "./sync-queue";
import { schedulePush } from "./sync-engine";

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

export async function getDefecationRecords(
  limit?: number
): Promise<DefecationRecord[]> {
  const records = await db.defecationRecords.orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit ? active.slice(0, limit) : active;
}

export async function getDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<DefecationRecord[]> {
  const records = await db.defecationRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function deleteDefecationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("defecationRecords", "delete", async () => {
      await db.defecationRecords.update(id, { deletedAt: now, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete defecation record", e);
  }
}

export async function undoDeleteDefecationRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("defecationRecords", "upsert", async () => {
      await db.defecationRecords.update(id, { deletedAt: null, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete defecation record", e);
  }
}

export async function updateDefecationRecord(
  id: string,
  updates: { timestamp?: number; amountEstimate?: string; note?: string }
): Promise<ServiceResult<void>> {
  try {
    const existing = await db.defecationRecords.get(id);
    if (!existing) return err("Record not found");
    await writeWithSync("defecationRecords", "upsert", async () => {
      await db.defecationRecords.update(id, { ...updates, updatedAt: Date.now() });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update defecation record", e);
  }
}
