import { db, type IntakeRecord } from "./db";
import { generateId } from "./utils";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function addIntakeRecord(
  type: "water" | "salt",
  amount: number,
  source: string = "manual",
  timestamp?: number
): Promise<IntakeRecord> {
  const record: IntakeRecord = {
    id: generateId(),
    type,
    amount,
    timestamp: timestamp ?? Date.now(),
    source,
  };

  await db.intakeRecords.add(record);
  return record;
}

export async function deleteIntakeRecord(id: string): Promise<void> {
  await db.intakeRecords.delete(id);
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt"
): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;

  let query = db.intakeRecords.where("timestamp").above(cutoffTime);

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

export async function importData(
  jsonData: string,
  mode: "merge" | "replace" = "merge"
): Promise<{ imported: number; skipped: number }> {
  const data = JSON.parse(jsonData);

  if (!data.records || !Array.isArray(data.records)) {
    throw new Error("Invalid data format");
  }

  let imported = 0;
  let skipped = 0;

  if (mode === "replace") {
    await db.intakeRecords.clear();
  }

  for (const record of data.records) {
    // Validate record structure
    if (
      !record.id ||
      !record.type ||
      typeof record.amount !== "number" ||
      typeof record.timestamp !== "number"
    ) {
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

    await db.intakeRecords.add({
      id: record.id,
      type: record.type,
      amount: record.amount,
      timestamp: record.timestamp,
      source: record.source,
    });
    imported++;
  }

  return { imported, skipped };
}

export async function clearAllData(): Promise<void> {
  await db.intakeRecords.clear();
}
