import { db } from "@/lib/db";
import type {
  IntakeRecord,
  WeightRecord,
  BloodPressureRecord,
  EatingRecord,
  UrinationRecord,
  DefecationRecord,
  SubstanceRecord,
  Prescription,
  MedicationPhase,
  PhaseSchedule,
  InventoryItem,
  InventoryTransaction,
  DoseLog,
  TitrationPlan,
  DailyNote,
  AuditLog,
  UserProfile,
} from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "./db-fixtures";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * A declarative set of fixture rows keyed by Dexie table name. Pass it to
 * {@link seedDatabase} (or to `renderWithFixtures`) to populate the test
 * database before a component renders. Every key is optional.
 */
export interface SeedSpec {
  intakeRecords?: IntakeRecord[];
  weightRecords?: WeightRecord[];
  bloodPressureRecords?: BloodPressureRecord[];
  eatingRecords?: EatingRecord[];
  urinationRecords?: UrinationRecord[];
  defecationRecords?: DefecationRecord[];
  substanceRecords?: SubstanceRecord[];
  prescriptions?: Prescription[];
  medicationPhases?: MedicationPhase[];
  phaseSchedules?: PhaseSchedule[];
  inventoryItems?: InventoryItem[];
  inventoryTransactions?: InventoryTransaction[];
  doseLogs?: DoseLog[];
  titrationPlans?: TitrationPlan[];
  dailyNotes?: DailyNote[];
  auditLogs?: AuditLog[];
  userProfile?: UserProfile[];
}

/**
 * Bulk-inserts fixture rows into the test IndexedDB. The global test setup
 * (`src/__tests__/setup.ts`) resets the database before every test, so this
 * always runs against an empty database.
 */
export async function seedDatabase(spec: SeedSpec): Promise<void> {
  if (spec.intakeRecords) await db.intakeRecords.bulkAdd(spec.intakeRecords);
  if (spec.weightRecords) await db.weightRecords.bulkAdd(spec.weightRecords);
  if (spec.bloodPressureRecords)
    await db.bloodPressureRecords.bulkAdd(spec.bloodPressureRecords);
  if (spec.eatingRecords) await db.eatingRecords.bulkAdd(spec.eatingRecords);
  if (spec.urinationRecords)
    await db.urinationRecords.bulkAdd(spec.urinationRecords);
  if (spec.defecationRecords)
    await db.defecationRecords.bulkAdd(spec.defecationRecords);
  if (spec.substanceRecords)
    await db.substanceRecords.bulkAdd(spec.substanceRecords);
  if (spec.prescriptions) await db.prescriptions.bulkAdd(spec.prescriptions);
  if (spec.medicationPhases)
    await db.medicationPhases.bulkAdd(spec.medicationPhases);
  if (spec.phaseSchedules) await db.phaseSchedules.bulkAdd(spec.phaseSchedules);
  if (spec.inventoryItems) await db.inventoryItems.bulkAdd(spec.inventoryItems);
  if (spec.inventoryTransactions)
    await db.inventoryTransactions.bulkAdd(spec.inventoryTransactions);
  if (spec.doseLogs) await db.doseLogs.bulkAdd(spec.doseLogs);
  if (spec.titrationPlans) await db.titrationPlans.bulkAdd(spec.titrationPlans);
  if (spec.dailyNotes) await db.dailyNotes.bulkAdd(spec.dailyNotes);
  if (spec.auditLogs) await db.auditLogs.bulkAdd(spec.auditLogs);
  if (spec.userProfile) await db.userProfile.bulkAdd(spec.userProfile);
}

/**
 * A run of blood-pressure readings, one per day, ending today. Index 0 is the
 * most recent (118/76) and values drift slightly upward going back in time.
 */
export function bloodPressureSeries(
  count = 5,
  base: Partial<BloodPressureRecord> = {},
): BloodPressureRecord[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    makeBloodPressureRecord({
      systolic: 118 + i * 2,
      diastolic: 76 + i,
      heartRate: 68 + i,
      timestamp: now - i * DAY_MS,
      ...base,
    }),
  );
}

/**
 * A run of weight readings, one per day, ending today. Index 0 is the most
 * recent (75.00 kg) and weight trends gently downward going back in time.
 */
export function weightSeries(
  count = 5,
  base: Partial<WeightRecord> = {},
): WeightRecord[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    makeWeightRecord({
      weight: Number((75 - i * 0.3).toFixed(2)),
      timestamp: now - i * DAY_MS,
      ...base,
    }),
  );
}

/** A handful of water-intake records logged across the last few hours. */
export function hydrationDay(
  servings = 4,
  base: Partial<IntakeRecord> = {},
): IntakeRecord[] {
  const now = Date.now();
  return Array.from({ length: servings }, (_, i) =>
    makeIntakeRecord({
      type: "water",
      amount: 250,
      timestamp: now - i * HOUR_MS,
      ...base,
    }),
  );
}

/**
 * A coherent, fully linked medication: a prescription with one maintenance
 * phase, a daily schedule and an inventory item. Spread the result straight
 * into a {@link SeedSpec} (the foreign keys already line up).
 */
export function medicationRegimen(): Required<
  Pick<
    SeedSpec,
    "prescriptions" | "medicationPhases" | "phaseSchedules" | "inventoryItems"
  >
> {
  const prescription = makePrescription();
  const phase = makeMedicationPhase(prescription.id);
  const schedule = makePhaseSchedule(phase.id);
  const inventory = makeInventoryItem(prescription.id);
  return {
    prescriptions: [prescription],
    medicationPhases: [phase],
    phaseSchedules: [schedule],
    inventoryItems: [inventory],
  };
}
