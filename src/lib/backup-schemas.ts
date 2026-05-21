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
export const syncFieldsSchema = z.object({
  createdAt: finiteNumber.optional(),
  updatedAt: finiteNumber.optional(),
  deletedAt: z.union([finiteNumber, z.null()]).optional(),
  deviceId: z.string().optional(),
  timezone: z.string().optional(),
});

/** Unix-ms timestamp. Finite number; rejects NaN/Infinity. */
export const timestampSchema = finiteNumber;

const baseRecord = syncFieldsSchema.extend({
  id: z.string(),
});

export const intakeRecordSchema = baseRecord
  .extend({
    type: z.union([z.literal("water"), z.literal("salt")]),
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

export const prescriptionSchema = baseRecord
  .extend({
    genericName: z.string(),
    indication: z.string(),
    isActive: z.boolean(),
  })
  .passthrough();

export const medicationPhaseSchema = baseRecord
  .extend({
    prescriptionId: z.string(),
    type: z.string(),
    unit: z.string(),
  })
  .passthrough();

export const phaseScheduleSchema = baseRecord
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
    phaseId: z.string(),
    scheduledDate: z.string(),
  })
  .passthrough();

export const titrationPlanSchema = baseRecord
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

export const userProfileSchema = baseRecord
  .extend({
    conditions: z.array(z.string()),
    shareConditionsWithAI: z.boolean(),
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
  | "userProfile";

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
};
