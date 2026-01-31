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

export async function getLatestWeightRecord(): Promise<WeightRecord | undefined> {
  const records = await getWeightRecords(1);
  return records[0];
}

export async function deleteWeightRecord(id: string): Promise<void> {
  await db.weightRecords.delete(id);
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

export async function getLatestBloodPressureRecord(): Promise<BloodPressureRecord | undefined> {
  const records = await getBloodPressureRecords(1);
  return records[0];
}

export async function deleteBloodPressureRecord(id: string): Promise<void> {
  await db.bloodPressureRecords.delete(id);
}
