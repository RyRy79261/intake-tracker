/**
 * Zod schemas for backup data validation. Used by backup-service.ts to
 * decide whether each record in an imported backup is acceptable, and
 * reusable by any other service that needs to validate the same shapes.
 *
 * Compared to the hand-rolled isValid* checks they replaced, these
 * schemas tighten the legacy `typeof === "number"` test by rejecting NaN
 * and +/-Infinity (a real bug in the old code), and require deletedAt to
 * be number | null when present. Sync metadata (createdAt, updatedAt,
 * deletedAt, deviceId, timezone) remains optional because real backups
 * from older app versions can omit any of them.
 *
 * Unknown keys are preserved via .passthrough() so forward-compatible
 * fields survive a round-trip.
 */

import { z } from "zod";

/** A real, finite JS number -- rejects NaN and +/-Infinity. */
const finiteNumber = z.number().finite();

/**
 * Sync metadata fields shared by every record. All optional, since
 * historical backups predate some of these fields.
 */
const baseSyncFieldsSchema = z.object({
  createdAt: finiteNumber.optional(),
  updatedAt: finiteNumber.optional(),
  deletedAt: z.union([finiteNumber, z.null()]).optional(),
  deviceId: z.string().optional(),
});

/**
 * Sync metadata plus `timezone`, for the tables whose record type declares it.
 * The other tables (prescriptions, phases, schedules, titration plans, profile,
 * insight reports) still accept a stray `timezone` from an older backup
 * through `.passthrough()`.
 */
export const syncFieldsSchema = baseSyncFieldsSchema.extend({
  timezone: z.string().optional(),
});

/** Unix-ms timestamp. Finite number; rejects NaN/Infinity. */
export const timestampSchema = finiteNumber;

/** A record on a table with a `timezone` column. */
const baseRecord = syncFieldsSchema.extend({
  id: z.string(),
});

/** A record on a table without a `timezone` column. */
const baseRecordNoTz = baseSyncFieldsSchema.extend({
  id: z.string(),
});

export const intakeRecordSchema = baseRecord
  .extend({
    type: z.enum(["water", "salt", "sugar", "potassium"]),
    amount: finiteNumber,
    timestamp: timestampSchema,
  })
  .passthrough();

export const weightRecordSchema = baseRecord
  .extend({
    weight: finiteNumber,
    timestamp: timestampSchema,
  })
  .passthrough();

export const bloodPressureRecordSchema = baseRecord
  .extend({
    systolic: finiteNumber,
    diastolic: finiteNumber,
    timestamp: timestampSchema,
    position: z.union([z.literal("sitting"), z.literal("standing")]),
    arm: z.union([z.literal("left"), z.literal("right")]),
  })
  .passthrough();

export const eatingRecordSchema = baseRecord
  .extend({ timestamp: timestampSchema })
  .passthrough();

export const urinationRecordSchema = baseRecord
  .extend({ timestamp: timestampSchema })
  .passthrough();

export const defecationRecordSchema = baseRecord
  .extend({ timestamp: timestampSchema })
  .passthrough();

export const substanceRecordSchema = baseRecord
  .extend({
    type: z.union([z.literal("caffeine"), z.literal("alcohol")]),
    timestamp: timestampSchema,
  })
  .passthrough();

export const prescriptionSchema = baseRecordNoTz
  .extend({
    genericName: z.string(),
    // Optional since 2026-09 (audit sync-engine#10); pulled rows carry null.
    indication: z.string().nullable().optional(),
    isActive: z.boolean(),
  })
  .passthrough();

export const medicationPhaseSchema = baseRecordNoTz
  .extend({
    prescriptionId: z.string(),
    type: z.string(),
    unit: z.string(),
  })
  .passthrough();

export const phaseScheduleSchema = baseRecordNoTz
  .extend({
    phaseId: z.string(),
    dosage: finiteNumber,
  })
  .passthrough();

export const inventoryItemSchema = baseRecord
  .extend({
    prescriptionId: z.string(),
    brandName: z.string(),
  })
  .passthrough();

export const inventoryTransactionSchema = baseRecord
  .extend({
    inventoryItemId: z.string(),
    amount: finiteNumber,
  })
  .passthrough();

export const doseLogSchema = baseRecord
  .extend({
    prescriptionId: z.string(),
    // PRN (as-needed) doses have no phase or schedule; pulled rows carry null.
    phaseId: z.string().nullable().optional(),
    scheduleId: z.string().nullable().optional(),
    scheduledDate: z.string(),
    // Dose snapshot (2026-09). Optional, and null when pulled from the server.
    doseAmount: finiteNumber.nullable().optional(),
    doseUnit: z.string().nullable().optional(),
    pillsConsumed: finiteNumber.nullable().optional(),
    pillStrength: finiteNumber.nullable().optional(),
  })
  .passthrough();

export const titrationPlanSchema = baseRecordNoTz
  .extend({
    title: z.string(),
    status: z.string(),
  })
  .passthrough();

export const dailyNoteSchema = baseRecord
  .extend({
    date: z.string(),
    note: z.string(),
  })
  .passthrough();

export const auditLogSchema = baseRecord
  .extend({
    timestamp: timestampSchema,
    action: z.string(),
  })
  .passthrough();

export const userProfileSchema = baseRecordNoTz
  .extend({
    conditions: z.array(z.string()),
    shareConditionsWithAI: z.boolean(),
  })
  .passthrough();

export const insightReportSchema = baseRecordNoTz
  .extend({
    generatedAt: timestampSchema,
    narrative: z.string(),
    observations: z.array(z.string()),
  })
  .passthrough();

export const userSettingsSchema = baseRecordNoTz
  .extend({
    waterLimit: finiteNumber,
    saltLimit: finiteNumber,
    dayStartHour: finiteNumber,
    liquidPresets: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
  })
  .passthrough();

export type BackupTableName =
  | "intakeRecords"
  | "weightRecords"
  | "bloodPressureRecords"
  | "eatingRecords"
  | "urinationRecords"
  | "defecationRecords"
  | "substanceRecords"
  | "prescriptions"
  | "medicationPhases"
  | "phaseSchedules"
  | "inventoryItems"
  | "inventoryTransactions"
  | "doseLogs"
  | "titrationPlans"
  | "dailyNotes"
  | "auditLogs"
  | "userProfile"
  | "insightReports"
  | "userSettings";

export const BACKUP_SCHEMAS: Record<BackupTableName, z.ZodTypeAny> = {
  intakeRecords: intakeRecordSchema,
  weightRecords: weightRecordSchema,
  bloodPressureRecords: bloodPressureRecordSchema,
  eatingRecords: eatingRecordSchema,
  urinationRecords: urinationRecordSchema,
  defecationRecords: defecationRecordSchema,
  substanceRecords: substanceRecordSchema,
  prescriptions: prescriptionSchema,
  medicationPhases: medicationPhaseSchema,
  phaseSchedules: phaseScheduleSchema,
  inventoryItems: inventoryItemSchema,
  inventoryTransactions: inventoryTransactionSchema,
  doseLogs: doseLogSchema,
  titrationPlans: titrationPlanSchema,
  dailyNotes: dailyNoteSchema,
  auditLogs: auditLogSchema,
  userProfile: userProfileSchema,
  insightReports: insightReportSchema,
  userSettings: userSettingsSchema,
};

/** Boolean type guard backed by a Zod schema. */
export function makeZodValidator(schema: z.ZodTypeAny): (record: unknown) => boolean {
  return (record) => schema.safeParse(record).success;
}

/** Per-table validator map -- one safeParse-backed predicate per table. */
export const BACKUP_VALIDATORS: Record<BackupTableName, (record: unknown) => boolean> = {
  intakeRecords: makeZodValidator(intakeRecordSchema),
  weightRecords: makeZodValidator(weightRecordSchema),
  bloodPressureRecords: makeZodValidator(bloodPressureRecordSchema),
  eatingRecords: makeZodValidator(eatingRecordSchema),
  urinationRecords: makeZodValidator(urinationRecordSchema),
  defecationRecords: makeZodValidator(defecationRecordSchema),
  substanceRecords: makeZodValidator(substanceRecordSchema),
  prescriptions: makeZodValidator(prescriptionSchema),
  medicationPhases: makeZodValidator(medicationPhaseSchema),
  phaseSchedules: makeZodValidator(phaseScheduleSchema),
  inventoryItems: makeZodValidator(inventoryItemSchema),
  inventoryTransactions: makeZodValidator(inventoryTransactionSchema),
  doseLogs: makeZodValidator(doseLogSchema),
  titrationPlans: makeZodValidator(titrationPlanSchema),
  dailyNotes: makeZodValidator(dailyNoteSchema),
  auditLogs: makeZodValidator(auditLogSchema),
  userProfile: makeZodValidator(userProfileSchema),
  insightReports: makeZodValidator(insightReportSchema),
  userSettings: makeZodValidator(userSettingsSchema),
};
