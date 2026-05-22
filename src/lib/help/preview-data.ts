import { generateId, syncFields } from "@/lib/utils";
import type {
  AppDatabase,
  BloodPressureRecord,
  WeightRecord,
} from "@/lib/db";

/**
 * Sample data for the in-app component previews. Each function bulk-inserts
 * curated rows into a throwaway preview database (created by
 * `createPreviewDatabase`) so the previewed component has something realistic
 * to show. This data never touches the user's real database.
 */

const DAY_MS = 86_400_000;

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
