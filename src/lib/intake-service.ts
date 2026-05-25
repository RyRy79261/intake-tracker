import { db, type IntakeRecord } from "@/lib/db";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { generateId, syncFields } from "@/lib/utils";
import { writeWithSync, enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function addIntakeRecord(
  type: "water" | "salt" | "sugar",
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

export async function getRecordsInLast24Hours(
  type?: "water" | "salt" | "sugar"
): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  // Full scan + JS filter rather than `where("timestamp").aboveOrEqual(...)`.
  // IndexedDB compares index keys by type, so a single row whose `timestamp`
  // was bulkPut as a string (a pull-path bigint round-trip edge case) silently
  // drops the entire range result and the dashboard reads zero. JS-side
  // coercion via `Number()` tolerates both shapes; cost is trivial here.
  const records = await db.intakeRecords.toArray();
  return records.filter(
    (r) =>
      r.deletedAt === null &&
      Number(r.timestamp) >= cutoffTime &&
      (!type || r.type === type),
  );
}

export async function getTotalInLast24Hours(type: "water" | "salt" | "sugar"): Promise<number> {
  const records = await getRecordsInLast24Hours(type);
  return records.reduce((sum, record) => sum + record.amount, 0);
}

/**
 * Get the timestamp for when the current "day" started based on the configurable hour.
 */
function getDayStartTimestamp(dayStartHour: number): number {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(dayStartHour, 0, 0, 0);
  if (now < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }
  return dayStart.getTime();
}

export async function getDailyTotal(type: "water" | "salt" | "sugar", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  // Full scan + JS filter — see comment on `getRecordsInLast24Hours` for why
  // we deliberately avoid the timestamp index range scan here.
  const records = await db.intakeRecords.toArray();
  return records
    .filter(
      (r) =>
        r.deletedAt === null &&
        r.type === type &&
        Number(r.timestamp) >= cutoffTime,
    )
    .reduce((sum, r) => sum + r.amount, 0);
}

export async function getRecentRecords(type: "water" | "salt" | "sugar", limit: number = 3): Promise<IntakeRecord[]> {
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

export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
  total: number;
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

export async function getRecordsByCursor(
  beforeTimestamp?: number,
  limit: number = 20
): Promise<{ records: IntakeRecord[]; nextCursor: number | null }> {
  let query = db.intakeRecords.orderBy("timestamp").reverse();

  if (beforeTimestamp !== undefined) {
    query = db.intakeRecords
      .where("timestamp")
      .below(beforeTimestamp)
      .reverse();
  }

  // Fetch extra to compensate for filtered-out soft-deleted records,
  // then apply soft-delete filter and limit manually.
  const raw = await query.toArray();
  const active = raw.filter((r) => r.deletedAt === null);
  const records = active.slice(0, limit + 1);

  const hasMore = records.length > limit;
  if (hasMore) {
    records.pop();
  }

  const lastRecord = records[records.length - 1];
  const nextCursor = hasMore && lastRecord
    ? lastRecord.timestamp
    : null;

  return { records, nextCursor };
}

export async function getRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: "water" | "salt" | "sugar"
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
  type: "water" | "salt" | "sugar"
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
