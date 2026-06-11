import { generateId, syncFields } from "@/lib/utils";
import type {
  AppDatabase,
  BloodPressureRecord,
  DefecationRecord,
  IntakeRecord,
  SubstanceRecord,
  UrinationRecord,
  WeightRecord,
} from "@/lib/db";

/**
 * Sample data for the in-app component previews. Each function bulk-inserts
 * curated rows into a throwaway preview database (created by
 * `createPreviewDatabase`) so the previewed component has something realistic
 * to show. This data never touches the user's real database.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export async function seedBloodPressurePreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: BloodPressureRecord[] = [
    {
      id: generateId(),
      systolic: 118,
      diastolic: 76,
      heartRate: 68,
      position: "sitting",
      arm: "left",
      timestamp: now - DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      systolic: 124,
      diastolic: 81,
      heartRate: 72,
      position: "sitting",
      arm: "left",
      timestamp: now - 3 * DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      systolic: 131,
      diastolic: 84,
      heartRate: 77,
      position: "standing",
      arm: "right",
      timestamp: now - 6 * DAY_MS,
      ...syncFields(),
    },
  ];
  await database.bloodPressureRecords.bulkAdd(rows);
}

export async function seedWeightPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: WeightRecord[] = [
    { id: generateId(), weight: 74.6, timestamp: now - DAY_MS, ...syncFields() },
    {
      id: generateId(),
      weight: 74.9,
      timestamp: now - 4 * DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      weight: 75.4,
      timestamp: now - 8 * DAY_MS,
      ...syncFields(),
    },
  ];
  await database.weightRecords.bulkAdd(rows);
}

export async function seedLiquidsPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: IntakeRecord[] = [
    {
      id: generateId(),
      type: "water",
      amount: 250,
      timestamp: now - HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 200,
      timestamp: now - 3 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 300,
      timestamp: now - 6 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(rows);
}

export async function seedFoodSaltPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: IntakeRecord[] = [
    {
      id: generateId(),
      type: "salt",
      amount: 400,
      timestamp: now - 2 * HOUR_MS,
      source: "manual",
      note: "Lunch",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "salt",
      amount: 250,
      timestamp: now - 5 * HOUR_MS,
      source: "manual",
      note: "Breakfast",
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(rows);
}

export async function seedBathroomPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const urination: UrinationRecord[] = [
    {
      id: generateId(),
      timestamp: now - HOUR_MS,
      amountEstimate: "medium",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - 4 * HOUR_MS,
      amountEstimate: "large",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - 8 * HOUR_MS,
      amountEstimate: "small",
      note: "pale",
      ...syncFields(),
    },
  ];
  const defecation: DefecationRecord[] = [
    {
      id: generateId(),
      timestamp: now - 5 * HOUR_MS,
      amountEstimate: "medium",
      note: "normal",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - DAY_MS - 4 * HOUR_MS,
      amountEstimate: "small",
      ...syncFields(),
    },
  ];
  await database.urinationRecords.bulkAdd(urination);
  await database.defecationRecords.bulkAdd(defecation);
}

export async function seedTextMetricsPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const intake: IntakeRecord[] = [
    {
      id: generateId(),
      type: "water",
      amount: 500,
      timestamp: now - HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 300,
      timestamp: now - 4 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "salt",
      amount: 600,
      timestamp: now - 2 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
  ];
  const substances: SubstanceRecord[] = [
    {
      id: generateId(),
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Coffee",
      source: "standalone",
      aiEnriched: false,
      timestamp: now - 3 * HOUR_MS,
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(intake);
  await database.substanceRecords.bulkAdd(substances);
}
