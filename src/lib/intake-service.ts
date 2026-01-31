import { z } from "zod";
import { db, type IntakeRecord } from "./db";
import { generateId } from "./utils";

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
): Promise<IntakeRecord> {
  const record: IntakeRecord = {
    id: generateId(),
    type,
    amount,
    timestamp: timestamp ?? Date.now(),
    source,
    note: note?.trim() || undefined,
  };

  await db.intakeRecords.add(record);
  return record;
}

export async function deleteIntakeRecord(id: string): Promise<void> {
  await db.intakeRecords.delete(id);
}

export async function updateIntakeRecord(
  id: string,
  updates: { amount?: number; timestamp?: number; note?: string }
): Promise<void> {
  const existing = await db.intakeRecords.get(id);
  if (!existing) {
    throw new Error("Record not found");
  }
  await db.intakeRecords.update(id, updates);
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt"
): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;

  let query = db.intakeRecords.where("timestamp").aboveOrEqual(cutoffTime);

  const records = await query.toArray();

  if (type) {
    return records.filter((r) => r.type === type);
  }

  return records;
}

export async function getTotalInLast24Hours(type: "water" | "salt"): Promise<number> {
  const records = await getRecordsInLast24Hours(type);
  return records.reduce((sum, record) => sum + record.amount, 0);
}

export async function getAllRecords(): Promise<IntakeRecord[]> {
  return db.intakeRecords.orderBy("timestamp").reverse().toArray();
}

export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
  total: number;
}

/**
 * Get paginated intake records
 * @param page Page number (1-based)
 * @param limit Number of records per page
 * @returns Paginated records with metadata
 */
export async function getRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<IntakeRecord>> {
  const offset = (page - 1) * limit;
  const total = await db.intakeRecords.count();
  
  const records = await db.intakeRecords
    .orderBy("timestamp")
    .reverse()
    .offset(offset)
    .limit(limit)
    .toArray();
  
  return {
    records,
    hasMore: offset + records.length < total,
    total,
  };
}

/**
 * Get intake records using cursor-based pagination (more efficient for large datasets)
 * @param beforeTimestamp Get records before this timestamp (exclusive)
 * @param limit Number of records to fetch
 * @returns Records and the cursor for the next page
 */
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
  
  const records = await query.limit(limit + 1).toArray();
  
  const hasMore = records.length > limit;
  if (hasMore) {
    records.pop(); // Remove the extra record used for hasMore check
  }
  
  const nextCursor = hasMore && records.length > 0 
    ? records[records.length - 1].timestamp 
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

  if (type) {
    records = records.filter((r) => r.type === type);
  }

  return records;
}

export async function exportAllData(): Promise<string> {
  const records = await getAllRecords();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    },
    null,
    2
  );
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportValidationError[];
}

/**
 * Validate import data without importing
 * Useful for showing preview/errors before actual import
 */
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
): Promise<ImportResult> {
  let data: unknown;
  
  try {
    data = JSON.parse(jsonData);
  } catch {
    throw new Error("Invalid JSON format");
  }

  // Validate with Zod
  const parseResult = ImportDataSchema.safeParse(data);
  
  if (!parseResult.success) {
    // Collect all validation errors
    const errorMessages = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid data format: ${errorMessages}`);
  }

  const validatedData = parseResult.data;

  let imported = 0;
  let skipped = 0;
  const errors: ImportValidationError[] = [];

  if (mode === "replace") {
    await db.intakeRecords.clear();
  }

  for (let i = 0; i < validatedData.records.length; i++) {
    const record = validatedData.records[i];
    
    // Additional business logic validation
    if (record.type !== "water" && record.type !== "salt") {
      errors.push({ index: i, errors: [`Invalid type: ${record.type}`] });
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
        source: record.source,
        note: record.note,
      });
      imported++;
    } catch (error) {
      errors.push({ 
        index: i, 
        errors: [error instanceof Error ? error.message : "Unknown error"] 
      });
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

export async function clearAllData(): Promise<void> {
  await db.intakeRecords.clear();
}
