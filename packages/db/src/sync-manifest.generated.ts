/**
 * GENERATED from packages/db/src/schema.ts by sync-manifest-builder.ts.
 * Do not edit: run `pnpm db:generate` (or `pnpm --filter @intake/db
 * sync-manifest`) after changing the schema. A test fails if this file is
 * stale.
 *
 * Pure data, safe for the client bundle (no drizzle import).
 */

export const TABLE_PUSH_ORDER = [
  "auditLogs",
  "bloodPressureRecords",
  "defecationRecords",
  "eatingRecords",
  "insightReports",
  "intakeRecords",
  "prescriptions",
  "titrationPlans",
  "urinationRecords",
  "userProfile",
  "userSettings",
  "weightRecords",
  "inventoryItems",
  "medicationPhases",
  "substanceRecords",
  "phaseSchedules",
  "doseLogs",
  "dailyNotes",
  "inventoryTransactions",
] as const;

/** One synced table name. */
export type SyncTableName = (typeof TABLE_PUSH_ORDER)[number];

export interface SyncTableFacts {
  /** Columns backed by `integer`/`bigint`: a fraction is rejected. */
  readonly integerFields: readonly string[];
  /** Columns backed by `real`: fractions are fine, NaN/Infinity are not. */
  readonly floatFields: readonly string[];
  /** Columns without NOT NULL (server-only columns left out). */
  readonly nullableFields: readonly string[];
  /** Whether the table has a `timezone` column. */
  readonly hasTimezone: boolean;
  /** Foreign keys to other synced tables: [column, parent table]. */
  readonly fkParents: ReadonlyArray<readonly [string, SyncTableName]>;
}

export const SYNC_TABLES: Record<SyncTableName, SyncTableFacts> = {
  auditLogs: {
    integerFields: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["details", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  bloodPressureRecords: {
    integerFields: ["systolic", "diastolic", "heartRate", "timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["heartRate", "irregularHeartbeat", "note", "source", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  dailyNotes: {
    integerFields: ["createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["prescriptionId", "doseLogId", "deletedAt"],
    hasTimezone: true,
    fkParents: [["doseLogId", "doseLogs"], ["prescriptionId", "prescriptions"]],
  },
  defecationRecords: {
    integerFields: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["amountEstimate", "note", "source", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  doseLogs: {
    integerFields: ["actionTimestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["doseMg", "doseAmount", "pillsConsumed", "pillStrength"],
    nullableFields: ["phaseId", "scheduleId", "inventoryItemId", "doseMg", "doseAmount", "doseUnit", "pillsConsumed", "pillStrength", "actionTimestamp", "rescheduledTo", "skipReason", "note", "deletedAt"],
    hasTimezone: true,
    fkParents: [["inventoryItemId", "inventoryItems"], ["phaseId", "medicationPhases"], ["prescriptionId", "prescriptions"], ["scheduleId", "phaseSchedules"]],
  },
  eatingRecords: {
    integerFields: ["timestamp", "grams", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["grams", "note", "groupId", "originalInputText", "groupSource", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  insightReports: {
    integerFields: ["generatedAt", "rangeStart", "rangeEnd", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["sources", "mode", "deletedAt"],
    hasTimezone: false,
    fkParents: [],
  },
  intakeRecords: {
    integerFields: ["amount", "timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["sourceAmount"],
    nullableFields: ["source", "note", "groupId", "originalInputText", "groupSource", "sodiumSource", "sourceAmount", "sourceUnit", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  inventoryItems: {
    integerFields: ["refillAlertDays", "refillAlertPills", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["currentStock", "strength"],
    nullableFields: ["currentStock", "compounds", "visualIdentification", "refillAlertDays", "refillAlertPills", "isArchived", "deletedAt"],
    hasTimezone: true,
    fkParents: [["prescriptionId", "prescriptions"]],
  },
  inventoryTransactions: {
    integerFields: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["amount"],
    nullableFields: ["note", "doseLogId", "deletedAt"],
    hasTimezone: true,
    fkParents: [["doseLogId", "doseLogs"], ["inventoryItemId", "inventoryItems"]],
  },
  medicationPhases: {
    integerFields: ["startDate", "endDate", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["endDate", "foodNote", "notes", "titrationPlanId", "deletedAt"],
    hasTimezone: false,
    fkParents: [["prescriptionId", "prescriptions"], ["titrationPlanId", "titrationPlans"]],
  },
  phaseSchedules: {
    integerFields: ["scheduleTimeUTC", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["dosage"],
    nullableFields: ["unit", "deletedAt"],
    hasTimezone: false,
    fkParents: [["phaseId", "medicationPhases"]],
  },
  prescriptions: {
    integerFields: ["createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["indication", "notes", "contraindications", "warnings", "compounds", "medicineInfo", "interactionCheck", "deletedAt"],
    hasTimezone: false,
    fkParents: [],
  },
  substanceRecords: {
    integerFields: ["amountMg", "volumeMl", "timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["amountStandardDrinks", "abvPercent"],
    nullableFields: ["amountMg", "amountStandardDrinks", "abvPercent", "volumeMl", "sourceRecordId", "aiEnriched", "groupId", "originalInputText", "groupSource", "deletedAt"],
    hasTimezone: true,
    fkParents: [["sourceRecordId", "intakeRecords"]],
  },
  titrationPlans: {
    integerFields: ["recommendedStartDate", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["recommendedStartDate", "notes", "warnings", "deletedAt"],
    hasTimezone: false,
    fkParents: [],
  },
  urinationRecords: {
    integerFields: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["amountEstimate", "note", "source", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
  userProfile: {
    integerFields: ["aiInsightsConsentAt", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["aiInsightsConsentAt", "deletedAt"],
    hasTimezone: false,
    fkParents: [],
  },
  userSettings: {
    integerFields: ["waterLimit", "saltLimit", "sugarLimit", "potassiumLimit", "waterExtendedBuffer", "saltExtendedBuffer", "sugarExtendedBuffer", "dayStartHour", "weekStartsOn", "reminderFollowUpCount", "reminderFollowUpInterval", "homeTimezoneConfirmedAt", "createdAt", "updatedAt", "deletedAt"],
    floatFields: [],
    nullableFields: ["homeTimezone", "homeTimezoneConfirmedAt", "fieldUpdatedAt", "deletedAt"],
    hasTimezone: false,
    fkParents: [],
  },
  weightRecords: {
    integerFields: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
    floatFields: ["weight"],
    nullableFields: ["note", "source", "deletedAt"],
    hasTimezone: true,
    fkParents: [],
  },
};
