import type { UpdateSpec } from "dexie";
import {
  db,
  type WeightRecord,
  type BloodPressureRecord,
  type HealthRecordSource,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult, PaginatedResult } from "@intake/types/service";
import { generateId, syncFields } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

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

    await writeWithSync("weightRecords", "upsert", async () => {
      await db.weightRecords.add(record);
      return record;
    });
    schedulePush();
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
    const now = Date.now();
    await writeWithSync("weightRecords", "delete", async () => {
      await db.weightRecords.update(id, { deletedAt: now, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete weight record", e);
  }
}

export async function undoDeleteWeightRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("weightRecords", "upsert", async () => {
      await db.weightRecords.update(id, { deletedAt: null, updatedAt: now });
      return { id };
    });
    schedulePush();
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
    await writeWithSync("weightRecords", "upsert", async () => {
      await db.weightRecords.update(id, { ...updates, updatedAt: Date.now() } as UpdateSpec<WeightRecord>);
      return { id };
    });
    schedulePush();
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

    await writeWithSync("bloodPressureRecords", "upsert", async () => {
      await db.bloodPressureRecords.add(record);
      return record;
    });
    schedulePush();
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
    const now = Date.now();
    await writeWithSync("bloodPressureRecords", "delete", async () => {
      await db.bloodPressureRecords.update(id, { deletedAt: now, updatedAt: now });
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete blood pressure record", e);
  }
}

export async function undoDeleteBloodPressureRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync("bloodPressureRecords", "upsert", async () => {
      await db.bloodPressureRecords.update(id, { deletedAt: null, updatedAt: now });
      return { id };
    });
    schedulePush();
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
    await writeWithSync("bloodPressureRecords", "upsert", async () => {
      await db.bloodPressureRecords.update(id, { ...updates, updatedAt: Date.now() } as UpdateSpec<BloodPressureRecord>);
      return { id };
    });
    schedulePush();
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
