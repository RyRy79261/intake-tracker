import { db, type WeightRecord, type BloodPressureRecord } from "./db";
import { generateId } from "./utils";

// Weight Records

export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string
): Promise<WeightRecord> {
  const record: WeightRecord = {
    id: generateId(),
    weight,
    timestamp: timestamp ?? Date.now(),
    note,
  };

  await db.weightRecords.add(record);
  return record;
}

export async function getWeightRecords(limit?: number): Promise<WeightRecord[]> {
  let query = db.weightRecords.orderBy("timestamp").reverse();

  if (limit) {
    return query.limit(limit).toArray();
  }

  return query.toArray();
}

export async function getWeightRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<WeightRecord[]> {
  return db.weightRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
}

export async function getLatestWeightRecord(): Promise<WeightRecord | undefined> {
  const records = await getWeightRecords(1);
  return records[0];
}

export async function deleteWeightRecord(id: string): Promise<void> {
  await db.weightRecords.delete(id);
}

export async function updateWeightRecord(
  id: string,
  updates: { weight?: number; timestamp?: number; note?: string }
): Promise<void> {
  await db.weightRecords.update(id, updates);
}

// Blood Pressure Records

export async function addBloodPressureRecord(
  systolic: number,
  diastolic: number,
  position: "standing" | "sitting",
  arm: "left" | "right",
  heartRate?: number,
  timestamp?: number,
  note?: string
): Promise<BloodPressureRecord> {
  const record: BloodPressureRecord = {
    id: generateId(),
    systolic,
    diastolic,
    heartRate,
    position,
    arm,
    timestamp: timestamp ?? Date.now(),
    note,
  };

  await db.bloodPressureRecords.add(record);
  return record;
}

export async function getBloodPressureRecords(limit?: number): Promise<BloodPressureRecord[]> {
  let query = db.bloodPressureRecords.orderBy("timestamp").reverse();

  if (limit) {
    return query.limit(limit).toArray();
  }

  return query.toArray();
}

export async function getBloodPressureRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<BloodPressureRecord[]> {
  return db.bloodPressureRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
}

export async function getLatestBloodPressureRecord(): Promise<BloodPressureRecord | undefined> {
  const records = await getBloodPressureRecords(1);
  return records[0];
}

export async function deleteBloodPressureRecord(id: string): Promise<void> {
  await db.bloodPressureRecords.delete(id);
}

export async function updateBloodPressureRecord(
  id: string,
  updates: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    position?: "sitting" | "standing";
    arm?: "left" | "right";
    timestamp?: number;
    note?: string;
  }
): Promise<void> {
  await db.bloodPressureRecords.update(id, updates);
}

// Pagination helpers

export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
  total: number;
}

/**
 * Get paginated weight records
 */
export async function getWeightRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<WeightRecord>> {
  const offset = (page - 1) * limit;
  const total = await db.weightRecords.count();
  
  const records = await db.weightRecords
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
 * Get paginated blood pressure records
 */
export async function getBloodPressureRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<BloodPressureRecord>> {
  const offset = (page - 1) * limit;
  const total = await db.bloodPressureRecords.count();
  
  const records = await db.bloodPressureRecords
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
