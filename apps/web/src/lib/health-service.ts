import {
  db,
  type WeightRecord,
  type BloodPressureRecord,
  type HealthRecordSource,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult, PaginatedResult } from "@intake/types/service";
import { generateId, syncFields } from "@/lib/utils";
import { syncedWrite, type SyncedChanges } from "@/lib/synced-write";

// Weight Records

export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string,
  /** How it was entered ("manual" form or "voice"); omitted = unknown. */
  source?: HealthRecordSource
): Promise<ServiceResult<WeightRecord>> {
  try {
    const trimmedNote = note?.trim();
    const record: WeightRecord = {
      id: generateId(),
      weight,
      timestamp: timestamp ?? Date.now(),
      ...(trimmedNote !== undefined && trimmedNote !== "" && { note: trimmedNote }),
      ...(source !== undefined && { source }),
      ...syncFields(),
    };

    await syncedWrite(["weightRecords"], (w) => w.insert("weightRecords", record));
    return ok(record);
  } catch (e) {
    return err("Failed to add weight record", e);
  }
}

export async function getWeightRecords(limit?: number): Promise<WeightRecord[]> {
  const records = await db.weightRecords.orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit ? active.slice(0, limit) : active;
}

export async function getWeightRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<WeightRecord[]> {
  const records = await db.weightRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function getLatestWeightRecord(): Promise<WeightRecord | undefined> {
  const records = await db.weightRecords.orderBy("timestamp").reverse().toArray();
  return records.find((r) => r.deletedAt === null);
}

export async function deleteWeightRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["weightRecords"], (w) => w.tombstone("weightRecords", id));
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete weight record", e);
  }
}

export async function undoDeleteWeightRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["weightRecords"], (w) => w.restore("weightRecords", id));
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete weight record", e);
  }
}

export async function updateWeightRecord(
  id: string,
  // `null` clears an optional field. It is stored as null (not deleted) so the
  // clear is pushed; the columns are nullable and pulled rows carry null too.
  updates: { weight?: number; timestamp?: number; note?: string | null }
): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["weightRecords"], (w) =>
      w.patch("weightRecords", id, updates as unknown as SyncedChanges<"weightRecords">),
    );
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
  irregularHeartbeat?: boolean,
  /** How it was entered ("manual" form or "voice"); omitted = unknown. */
  source?: HealthRecordSource
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
      ...(source !== undefined && { source }),
      ...syncFields(),
    };

    await syncedWrite(["bloodPressureRecords"], (w) => w.insert("bloodPressureRecords", record));
    return ok(record);
  } catch (e) {
    return err("Failed to add blood pressure record", e);
  }
}

export async function getBloodPressureRecords(limit?: number): Promise<BloodPressureRecord[]> {
  const records = await db.bloodPressureRecords.orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit ? active.slice(0, limit) : active;
}

export async function getBloodPressureRecordsByDateRange(
  startTime: number,
  endTime: number
): Promise<BloodPressureRecord[]> {
  const records = await db.bloodPressureRecords
    .where("timestamp")
    .between(startTime, endTime)
    .toArray();
  return records.filter((r) => r.deletedAt === null);
}

export async function getLatestBloodPressureRecord(): Promise<BloodPressureRecord | undefined> {
  const records = await db.bloodPressureRecords.orderBy("timestamp").reverse().toArray();
  return records.find((r) => r.deletedAt === null);
}

export async function deleteBloodPressureRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["bloodPressureRecords"], (w) => w.tombstone("bloodPressureRecords", id));
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete blood pressure record", e);
  }
}

export async function undoDeleteBloodPressureRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["bloodPressureRecords"], (w) => w.restore("bloodPressureRecords", id));
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete blood pressure record", e);
  }
}

export async function updateBloodPressureRecord(
  id: string,
  updates: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number | null;
    irregularHeartbeat?: boolean;
    position?: "sitting" | "standing";
    arm?: "left" | "right";
    timestamp?: number;
    note?: string | null;
  }
): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["bloodPressureRecords"], (w) =>
      w.patch("bloodPressureRecords", id, updates as unknown as SyncedChanges<"bloodPressureRecords">),
    );
    return ok(undefined);
  } catch (e) {
    return err("Failed to update blood pressure record", e);
  }
}

// Pagination helpers

export async function getWeightRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<WeightRecord>> {
  const offset = (page - 1) * limit;
  const allRecords = await db.weightRecords.orderBy("timestamp").reverse().toArray();
  const activeRecords = allRecords.filter((r) => r.deletedAt === null);
  const total = activeRecords.length;
  const records = activeRecords.slice(offset, offset + limit);
  return { records, hasMore: offset + records.length < total, total };
}

export async function getBloodPressureRecordsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<BloodPressureRecord>> {
  const offset = (page - 1) * limit;
  const allRecords = await db.bloodPressureRecords.orderBy("timestamp").reverse().toArray();
  const activeRecords = allRecords.filter((r) => r.deletedAt === null);
  const total = activeRecords.length;
  const records = activeRecords.slice(offset, offset + limit);
  return { records, hasMore: offset + records.length < total, total };
}
