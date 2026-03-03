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

export async function getWeightRecords(limit?: number): Promise<ServiceResult<WeightRecord[]>> {
  try {
    let query = db.weightRecords.orderBy("timestamp").reverse();
    const records = limit ? await query.limit(limit).toArray() : await query.toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get weight records", e);
  }
}

export async function getWeightRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<ServiceResult<WeightRecord[]>> {
  try {
    const records = await db.weightRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get weight records by date range", e);
  }
}

export async function getLatestWeightRecord(): Promise<ServiceResult<WeightRecord | undefined>> {
  try {
    const records = await db.weightRecords.orderBy("timestamp").reverse().limit(1).toArray();
    return ok(records[0]);
  } catch (e) {
    return err("Failed to get latest weight record", e);
  }
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

export async function getBloodPressureRecords(limit?: number): Promise<ServiceResult<BloodPressureRecord[]>> {
  try {
    let query = db.bloodPressureRecords.orderBy("timestamp").reverse();
    const records = limit ? await query.limit(limit).toArray() : await query.toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get blood pressure records", e);
  }
}

export async function getBloodPressureRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<ServiceResult<BloodPressureRecord[]>> {
  try {
    const records = await db.bloodPressureRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get blood pressure records by date range", e);
  }
}

export async function getLatestBloodPressureRecord(): Promise<ServiceResult<BloodPressureRecord | undefined>> {
  try {
    const records = await db.bloodPressureRecords.orderBy("timestamp").reverse().limit(1).toArray();
    return ok(records[0]);
  } catch (e) {
    return err("Failed to get latest blood pressure record", e);
  }
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
): Promise<ServiceResult<PaginatedResult<WeightRecord>>> {
  try {
    const offset = (page - 1) * limit;
    const total = await db.weightRecords.count();
    const records = await db.weightRecords
      .orderBy("timestamp")
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
    return ok({ records, hasMore: offset + records.length < total, total });
  } catch (e) {
    return err("Failed to get paginated weight records", e);
  }
}

export async function getBloodPressureRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<ServiceResult<PaginatedResult<BloodPressureRecord>>> {
  try {
    const offset = (page - 1) * limit;
    const total = await db.bloodPressureRecords.count();
    const records = await db.bloodPressureRecords
      .orderBy("timestamp")
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
    return ok({ records, hasMore: offset + records.length < total, total });
  } catch (e) {
    return err("Failed to get paginated blood pressure records", e);
  }
}
