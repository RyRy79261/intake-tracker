import { db, type IntakeRecord } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult, PaginatedResult } from "@intake/types/service";
import { generateId, syncFields } from "@/lib/utils";
import { writeWithSync, enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { getDayStartTimestamp } from "@/lib/date-utils";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function addIntakeRecord(
  type: "water" | "salt" | "sugar" | "potassium",
  amount: number,
  source: string = "manual",
  timestamp?: number,
  note?: string
): Promise<ServiceResult<IntakeRecord>> {
  try {
    const trimmedNote = note?.trim();
    const record: IntakeRecord = {
      id: generateId(),
      type,
      amount,
      timestamp: timestamp ?? Date.now(),
      source,
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await writeWithSync("intakeRecords", "upsert", async () => {
      await db.intakeRecords.add(record);
      return record;
    });
    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to add intake record", e);
  }
}

export async function deleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("intakeRecords", "delete", async () => {
      await db.intakeRecords.update(id, { deletedAt: now, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete intake record", e);
  }
}

export async function undoDeleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("intakeRecords", "upsert", async () => {
      await db.intakeRecords.update(id, { deletedAt: null, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete intake record", e);
  }
}

export async function updateIntakeRecord(
  id: string,
  updates: { amount?: number; timestamp?: number; note?: string; source?: string }
): Promise<ServiceResult<void>> {
  try {
    const existing = await db.intakeRecords.get(id);
    if (!existing) return err("Record not found");
    await writeWithSync("intakeRecords", "upsert", async () => {
      await db.intakeRecords.update(id, { ...updates, updatedAt: Date.now() });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update intake record", e);
  }
}

/**
 * "Today" / "last 24h" reads count records up to now only: a future-dated
 * record (a mistyped date) must not inflate the current day. The index range
 * stays open-ended and the upper bound is applied in memory, at query time:
 * a live query only re-runs for writes inside the index range it read, so a
 * `between(start, now)` range would miss a record stamped a moment later.
 */
function isNotFuture(r: IntakeRecord): boolean {
  return r.timestamp <= Date.now();
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt" | "sugar" | "potassium"
): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const query = db.intakeRecords.where("timestamp").aboveOrEqual(cutoffTime);
  const records = (await query.toArray()).filter(isNotFuture);
  if (type) {
    return records.filter((r) => r.type === type && r.deletedAt === null);
  }
  return records.filter((r) => r.deletedAt === null);
}

export async function getTotalInLast24Hours(type: "water" | "salt" | "sugar" | "potassium"): Promise<number> {
  const records = await getRecordsInLast24Hours(type);
  return records.reduce((sum, record) => sum + record.amount, 0);
}

export async function getDailyTotal(type: "water" | "salt" | "sugar" | "potassium", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type && r.deletedAt === null && isNotFuture(r))
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

export async function getRecentRecords(type: "water" | "salt" | "sugar" | "potassium", limit: number = 3): Promise<IntakeRecord[]> {
  const records = await db.intakeRecords
    .where("type")
    .equals(type)
    .toArray();
  return records
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export async function getAllRecords(): Promise<IntakeRecord[]> {
  const records = await db.intakeRecords.orderBy("timestamp").reverse().toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function getRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<IntakeRecord>> {
  const offset = (page - 1) * limit;
  // Load all non-deleted records, then apply offset/limit manually.
  // Dexie's .offset()/.limit() run before .filter(), so soft-deleted records
  // would occupy slots. Data volume is small (single-user app), so this is fine.
  const allRecords = await db.intakeRecords
    .orderBy("timestamp")
    .reverse()
    .toArray();
  const activeRecords = allRecords.filter((r) => r.deletedAt === null);
  const total = activeRecords.length;
  const records = activeRecords.slice(offset, offset + limit);
  return { records, hasMore: offset + records.length < total, total };
}

export async function getRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: "water" | "salt" | "sugar" | "potassium"
): Promise<IntakeRecord[]> {
  let records = await db.intakeRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  records = records.filter((r) => r.deletedAt === null);
  if (type) {
    records = records.filter((r) => r.type === type);
  }
  return records;
}

export async function exportAllData(): Promise<string> {
  const records = await getAllRecords();
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), records },
    null,
    2
  );
}

async function getIntakeTotalsByGroupIds(
  groupIds: string[],
  type: "water" | "salt" | "sugar" | "potassium"
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const records = await db.intakeRecords
    .where("groupId")
    .anyOf(groupIds)
    .and((r) => r.type === type && r.deletedAt === null)
    .toArray();
  const map = new Map<string, number>();
  for (const r of records) {
    if (r.groupId) {
      map.set(r.groupId, (map.get(r.groupId) || 0) + r.amount);
    }
  }
  return map;
}

export function getSaltTotalsByGroupIds(
  groupIds: string[]
): Promise<Map<string, number>> {
  return getIntakeTotalsByGroupIds(groupIds, "salt");
}

export function getSugarTotalsByGroupIds(
  groupIds: string[]
): Promise<Map<string, number>> {
  return getIntakeTotalsByGroupIds(groupIds, "sugar");
}

export function getPotassiumTotalsByGroupIds(
  groupIds: string[]
): Promise<Map<string, number>> {
  return getIntakeTotalsByGroupIds(groupIds, "potassium");
}

export async function clearAllData(): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    // Soft-delete + enqueue each row rather than a hard `.clear()`. A hard
    // clear leaves no tombstone and no sync-queue entry, so the next pull
    // cycle re-downloads every "deleted" record and resurrects it.
    await db.transaction("rw", db.intakeRecords, db._syncQueue, async () => {
      const records = await db.intakeRecords.toArray();
      for (const record of records) {
        if (record.deletedAt !== null) continue;
        await db.intakeRecords.update(record.id, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("intakeRecords", record.id, "delete");
      }
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to clear all data", e);
  }
}
