/**
 * Zod schemas for backup data validation, mirroring the legacy isValid*
 * checks in backup-service.ts.
 *
 * COMPATIBILITY MODE: schemas here are intentionally lenient and use
 * .passthrough() so they accept every record the legacy hand-rolled
 * validators accept. They also leave sync metadata (createdAt, updatedAt,
 * deletedAt, deviceId, timezone) optional, because the legacy checks never
 * inspected those fields. Tighten in the cutover PR -- not here.
 */

import { z } from "zod";

/**
 * Number primitive matching the legacy `typeof x === "number"` check.
 * Crucially, this accepts NaN and +/-Infinity -- Zod's built-in z.number()
 * rejects NaN, which would tighten compat. Use this everywhere the legacy
 * validators accepted any numeric value.
 */
const numberLike = z.custom<number>((val) => typeof val === "number", {
  message: "Expected number",
});

/**
 * Sync metadata fields shared by every record. All optional in compat mode
 * because the legacy validators did not require any of them.
 */
export const syncFieldsSchema = z.object({
  createdAt: numberLike.optional(),
  updatedAt: numberLike.optional(),
  deletedAt: z.union([numberLike, z.null()]).optional(),
  deviceId: z.string().optional(),
  timezone: z.string().optional(),
});

/** Unix-ms timestamp. Matches `typeof === "number"` (accepts NaN/Infinity). */
export const timestampSchema = numberLike;

const baseRecord = syncFieldsSchema.extend({
  id: z.string(),
});

export const intakeRecordSchema = baseRecord
  .extend({
    type: z.union([z.literal("water"), z.literal("salt")]),
    amount: numberLike,
    timestamp: timestampSchema,
  })
  .passthrough();

export const weightRecordSchema = baseRecord
  .extend({
    weight: numberLike,
    timestamp: timestampSchema,
  })
  .passthrough();

export const bloodPressureRecordSchema = baseRecord
  .extend({
    systolic: numberLike,
    diastolic: numberLike,
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
    dosage: numberLike,
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
    amount: numberLike,
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
  | "auditLogs";

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
};

/** Convenience: returns a boolean type guard backed by a Zod schema. */
export function makeZodValidator(schema: z.ZodTypeAny): (record: unknown) => boolean {
  return (record) => schema.safeParse(record).success;
}
