import { db, type WeightRecord, type BloodPressureRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

// Weight Records

export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string
): Promise<ServiceResult<WeightRecord>> {
  try {
    const trimmedNote = note?.trim();
    const record: WeightRecord = {
      id: generateId(),
      weight,
      timestamp: timestamp ?? Date.now(),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await db.weightRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add weight record", e);
  }
}

export async function getWeightRecords(limit?: number): Promise<WeightRecord[]> {
  const query = db.weightRecords.orderBy("timestamp").reverse();
  return limit ? query.limit(limit).toArray() : query.toArray();
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
  const records = await db.weightRecords.orderBy("timestamp").reverse().limit(1).toArray();
  return records[0];
}

export async function deleteWeightRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.weightRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete weight record", e);
  }
}

export async function updateWeightRecord(
  id: string,
  updates: { weight?: number; timestamp?: number; note?: string }
): Promise<ServiceResult<void>> {
  try {
    await db.weightRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update weight record", e);
  }
}

// Blood Pressure Records

export async function addBloodPressureRecord(
  systolic: number,
  diastolic: number,
  position: "standing" | "sitting",
  arm: "left" | "right",
  heartRate?: number,
  timestamp?: number,
  note?: string,
  irregularHeartbeat?: boolean
): Promise<ServiceResult<BloodPressureRecord>> {
  try {
    const trimmedNote = note?.trim();
    const record: BloodPressureRecord = {
      id: generateId(),
      systolic,
      diastolic,
      ...(heartRate !== undefined && { heartRate }),
      ...(irregularHeartbeat !== undefined && { irregularHeartbeat }),
      position,
      arm,
      timestamp: timestamp ?? Date.now(),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...syncFields(),
    };

    await db.bloodPressureRecords.add(record);
    return ok(record);
  } catch (e) {
    return err("Failed to add blood pressure record", e);
  }
}

export async function getBloodPressureRecords(limit?: number): Promise<BloodPressureRecord[]> {
  const query = db.bloodPressureRecords.orderBy("timestamp").reverse();
  return limit ? query.limit(limit).toArray() : query.toArray();
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
  const records = await db.bloodPressureRecords.orderBy("timestamp").reverse().limit(1).toArray();
  return records[0];
}

export async function deleteBloodPressureRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.bloodPressureRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete blood pressure record", e);
  }
}

export async function updateBloodPressureRecord(
  id: string,
  updates: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    irregularHeartbeat?: boolean;
    position?: "sitting" | "standing";
    arm?: "left" | "right";
    timestamp?: number;
    note?: string;
  }
): Promise<ServiceResult<void>> {
  try {
    await db.bloodPressureRecords.update(id, updates);
    return ok(undefined);
  } catch (e) {
    return err("Failed to update blood pressure record", e);
  }
}

// Pagination helpers

export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
  total: number;
}

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
  return { records, hasMore: offset + records.length < total, total };
}

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
  return { records, hasMore: offset + records.length < total, total };
}
