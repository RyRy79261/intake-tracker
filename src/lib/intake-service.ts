import { z } from "zod";
import { db, type IntakeRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Zod schemas for validation
const IntakeRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["water", "salt"]),
  amount: z.number().positive().max(100000), // Reasonable max
  timestamp: z.number().positive(),
  source: z.string().optional(),
  note: z.string().max(200).optional(),
});

const ImportDataSchema = z.object({
  version: z.number().optional(),
  exportedAt: z.string().optional(),
  records: z.array(IntakeRecordSchema),
});

export type ImportValidationError = {
  index: number;
  errors: string[];
};

export async function addIntakeRecord(
  type: "water" | "salt",
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

    await db.intakeRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add intake record", e);
  }
}

export async function deleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.intakeRecords.update(id, { deletedAt: now, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete intake record", e);
  }
}

export async function undoDeleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.intakeRecords.update(id, { deletedAt: null, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete intake record", e);
  }
}

export async function updateIntakeRecord(
  id: string,
  updates: { amount?: number; timestamp?: number; note?: string }
): Promise<ServiceResult<void>> {
  try {
    const existing = await db.intakeRecords.get(id);
    if (!existing) return err("Record not found");
    await db.intakeRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update intake record", e);
  }
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt"
): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const query = db.intakeRecords.where("timestamp").aboveOrEqual(cutoffTime);
  const records = await query.toArray();
  if (type) {
    return records.filter((r) => r.type === type && r.deletedAt === null);
  }
  return records.filter((r) => r.deletedAt === null);
}

export async function getTotalInLast24Hours(type: "water" | "salt"): Promise<number> {
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

export async function getDailyTotal(type: "water" | "salt", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type && r.deletedAt === null)
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

export async function getRecentRecords(type: "water" | "salt", limit: number = 3): Promise<IntakeRecord[]> {
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
  type?: "water" | "salt"
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

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportValidationError[];
}

export function validateImportData(jsonData: string): {
  valid: boolean;
  errors: ImportValidationError[];
  recordCount?: number;
} {
  let data: unknown;

  try {
    data = JSON.parse(jsonData);
  } catch {
    return {
      valid: false,
      errors: [{ index: -1, errors: ["Invalid JSON format"] }]
    };
  }

  const result = ImportDataSchema.safeParse(data);

  if (!result.success) {
    const errors: ImportValidationError[] = result.error.issues.map((issue) => ({
      index: typeof issue.path[1] === "number" ? issue.path[1] : -1,
      errors: [issue.message],
    }));
    return { valid: false, errors };
  }

  return { valid: true, errors: [], recordCount: result.data.records.length };
}

export async function importData(
  jsonData: string,
  mode: "merge" | "replace" = "merge"
): Promise<ServiceResult<ImportResult>> {
  let data: unknown;

  try {
    data = JSON.parse(jsonData);
  } catch {
    return err("Invalid JSON format");
  }

  const parseResult = ImportDataSchema.safeParse(data);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return err(`Invalid data format: ${errorMessages}`);
  }

  const validatedData = parseResult.data;

  let imported = 0;
  let skipped = 0;
  const errors: ImportValidationError[] = [];

  try {
    if (mode === "replace") {
      await db.intakeRecords.clear();
    }

    for (const record of validatedData.records) {
      if (record.type !== "water" && record.type !== "salt") {
        errors.push({ index: skipped + imported, errors: [`Invalid type: ${record.type}`] });
        skipped++;
        continue;
      }

      if (mode === "merge") {
        const existing = await db.intakeRecords.get(record.id);
        if (existing) {
          skipped++;
          continue;
        }
      }

      try {
        await db.intakeRecords.add({
          id: record.id,
          type: record.type,
          amount: record.amount,
          timestamp: record.timestamp,
          ...(record.source !== undefined && { source: record.source }),
          ...(record.note !== undefined && { note: record.note }),
          ...syncFields(),
        });
        imported++;
      } catch (error) {
        errors.push({
          index: skipped + imported,
          errors: [error instanceof Error ? error.message : "Unknown error"]
        });
        skipped++;
      }
    }

    return ok({ imported, skipped, errors });
  } catch (e) {
    return err("Failed to import data", e);
  }
}

export async function clearAllData(): Promise<ServiceResult<void>> {
  try {
    await db.intakeRecords.clear();
    return ok(undefined);
  } catch (e) {
    return err("Failed to clear all data", e);
  }
}
