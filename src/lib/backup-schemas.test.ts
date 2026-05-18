import { describe, it, expect } from "vitest";
import {
  BACKUP_SCHEMAS,
  BACKUP_VALIDATORS,
  syncFieldsSchema,
  intakeRecordSchema,
  weightRecordSchema,
  bloodPressureRecordSchema,
  eatingRecordSchema,
  urinationRecordSchema,
  defecationRecordSchema,
  substanceRecordSchema,
  prescriptionSchema,
  medicationPhaseSchema,
  phaseScheduleSchema,
  inventoryItemSchema,
  inventoryTransactionSchema,
  doseLogSchema,
  titrationPlanSchema,
  dailyNoteSchema,
  auditLogSchema,
  type BackupTableName,
} from "@/lib/backup-schemas";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
  makeSubstanceRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
  makeTitrationPlan,
  makeDailyNote,
  makeAuditLog,
} from "@/__tests__/fixtures/db-fixtures";

/** Fixtures stripped of any undefined-valued keys, mirroring JSON round-trip. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

const fixturesByTable: Record<BackupTableName, () => Array<Record<string, unknown>>> = {
  intakeRecords: () => [
    makeIntakeRecord(),
    makeIntakeRecord({ type: "salt", amount: 500 }),
    makeIntakeRecord({ note: "with breakfast", source: "ai_food_parse" }),
    JSON.parse(JSON.stringify(makeIntakeRecord())),
  ],
  weightRecords: () => [
    makeWeightRecord(),
    makeWeightRecord({ weight: 80.5, note: "morning" }),
    JSON.parse(JSON.stringify(makeWeightRecord())),
  ],
  bloodPressureRecords: () => [
    makeBloodPressureRecord(),
    makeBloodPressureRecord({ position: "standing", arm: "right" }),
    makeBloodPressureRecord({ heartRate: 90, irregularHeartbeat: true }),
    JSON.parse(JSON.stringify(makeBloodPressureRecord())),
  ],
  eatingRecords: () => [
    makeEatingRecord(),
    makeEatingRecord({ grams: 350, note: "lunch" }),
    JSON.parse(JSON.stringify(makeEatingRecord())),
  ],
  urinationRecords: () => [
    makeUrinationRecord(),
    makeUrinationRecord({ amountEstimate: "large" }),
    JSON.parse(JSON.stringify(makeUrinationRecord())),
  ],
  defecationRecords: () => [
    makeDefecationRecord(),
    makeDefecationRecord({ amountEstimate: "small", note: "irregular" }),
    JSON.parse(JSON.stringify(makeDefecationRecord())),
  ],
  substanceRecords: () => [
    makeSubstanceRecord(),
    makeSubstanceRecord({ type: "alcohol", amountStandardDrinks: 2 }),
    JSON.parse(JSON.stringify(makeSubstanceRecord())),
  ],
  prescriptions: () => [
    makePrescription(),
    makePrescription({ isActive: false, notes: "Discontinued" }),
    JSON.parse(JSON.stringify(makePrescription())),
  ],
  medicationPhases: () => [
    makeMedicationPhase("rx-1"),
    makeMedicationPhase("rx-2", { type: "titration", unit: "mcg" }),
    JSON.parse(JSON.stringify(makeMedicationPhase("rx-3"))),
  ],
  phaseSchedules: () => [
    makePhaseSchedule("phase-1"),
    makePhaseSchedule("phase-2", { dosage: 12.5, enabled: false }),
    JSON.parse(JSON.stringify(makePhaseSchedule("phase-3"))),
  ],
  inventoryItems: () => [
    makeInventoryItem("rx-1"),
    makeInventoryItem("rx-2", { isActive: false, currentStock: 30 }),
    JSON.parse(JSON.stringify(makeInventoryItem("rx-3"))),
  ],
  inventoryTransactions: () => [
    makeInventoryTransaction("inv-1"),
    makeInventoryTransaction("inv-2", { type: "consumed", amount: -1 }),
    JSON.parse(JSON.stringify(makeInventoryTransaction("inv-3"))),
  ],
  doseLogs: () => [
    makeDoseLog("rx-1", "phase-1", "sch-1"),
    makeDoseLog("rx-2", "phase-2", "sch-2", { status: "taken", actionTimestamp: Date.now() }),
    JSON.parse(JSON.stringify(makeDoseLog("rx-3", "phase-3", "sch-3"))),
  ],
  titrationPlans: () => [
    makeTitrationPlan(),
    makeTitrationPlan({ status: "active", recommendedStartDate: Date.now() }),
    JSON.parse(JSON.stringify(makeTitrationPlan())),
  ],
  dailyNotes: () => [
    makeDailyNote(),
    makeDailyNote({ prescriptionId: "rx-1", note: "felt drowsy" }),
    JSON.parse(JSON.stringify(makeDailyNote())),
  ],
  auditLogs: () => [
    makeAuditLog(),
    makeAuditLog({ action: "data_import", details: "imported 100 records" }),
    JSON.parse(JSON.stringify(makeAuditLog())),
  ],
};

const tableNames = Object.keys(BACKUP_SCHEMAS) as BackupTableName[];

describe("backup-schemas: real-world fixtures", () => {
  for (const table of tableNames) {
    describe(table, () => {
      const fixtures = fixturesByTable[table]();
      const accepts = BACKUP_VALIDATORS[table];

      it("accepts every db-fixture record", () => {
        for (const fixture of fixtures) {
          expect(accepts(fixture), `rejected fixture for ${table}`).toBe(true);
        }
      });

      it("accepts fixtures with undefined keys stripped (JSON round-trip)", () => {
        for (const fixture of fixtures) {
          expect(accepts(stripUndefined(fixture))).toBe(true);
        }
      });

      it("accepts fixtures with arbitrary extra unknown keys (passthrough)", () => {
        const augmented = { ...fixtures[0]!, _futureField: "abc", _another: 42 };
        expect(accepts(augmented)).toBe(true);
      });

      it("rejects null and non-objects", () => {
        for (const bad of [null, undefined, 42, "string", true, []]) {
          expect(accepts(bad)).toBe(false);
        }
      });

      it("rejects records with a missing id", () => {
        const first = fixtures[0]!;
        const { id: _drop, ...rest } = first;
        void _drop;
        expect(accepts(rest)).toBe(false);
      });
    });
  }
});

describe("backup-schemas: tightening over the legacy isValid* checks", () => {
  // The legacy hand-rolled validators used `typeof x === "number"`, which
  // silently accepted NaN and +/-Infinity. The Zod schemas in this file
  // tighten that -- z.number().finite() rejects both. If a real-world backup
  // ever hits this we'll need a migration; the equivalence tests above
  // protect against accidental regressions in the common path.

  it("rejects NaN in required number fields", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), amount: Number.NaN })).toBe(false);
    expect(BACKUP_VALIDATORS.weightRecords({ ...makeWeightRecord(), weight: Number.NaN })).toBe(false);
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), timestamp: Number.NaN })).toBe(false);
  });

  it("rejects +Infinity in required number fields", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), amount: Number.POSITIVE_INFINITY })).toBe(false);
    expect(BACKUP_VALIDATORS.weightRecords({ ...makeWeightRecord(), weight: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("rejects -Infinity in required number fields", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), amount: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it("treats missing sync metadata the same as present sync metadata", () => {
    const minimal = { id: "x", type: "water" as const, amount: 250, timestamp: 1 };
    expect(BACKUP_VALIDATORS.intakeRecords(minimal)).toBe(true);
  });

  it("accepts deletedAt: null", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), deletedAt: null })).toBe(true);
  });

  it("accepts deletedAt as a finite number", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), deletedAt: 123456 })).toBe(true);
  });

  it("rejects deletedAt with a non-number, non-null value", () => {
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), deletedAt: "yes" })).toBe(false);
    expect(BACKUP_VALIDATORS.intakeRecords({ ...makeIntakeRecord(), deletedAt: Number.NaN })).toBe(false);
  });
});

describe("backup-schemas: invariants", () => {
  it("BACKUP_SCHEMAS covers exactly the 16 expected tables", () => {
    expect(tableNames.sort()).toEqual(
      [
        "auditLogs",
        "bloodPressureRecords",
        "dailyNotes",
        "defecationRecords",
        "doseLogs",
        "eatingRecords",
        "intakeRecords",
        "inventoryItems",
        "inventoryTransactions",
        "medicationPhases",
        "phaseSchedules",
        "prescriptions",
        "substanceRecords",
        "titrationPlans",
        "urinationRecords",
        "weightRecords",
      ].sort()
    );
  });

  it("BACKUP_VALIDATORS has the same keys as BACKUP_SCHEMAS", () => {
    expect(Object.keys(BACKUP_VALIDATORS).sort()).toEqual(Object.keys(BACKUP_SCHEMAS).sort());
  });

  it("each named export matches its slot in BACKUP_SCHEMAS", () => {
    expect(BACKUP_SCHEMAS.intakeRecords).toBe(intakeRecordSchema);
    expect(BACKUP_SCHEMAS.weightRecords).toBe(weightRecordSchema);
    expect(BACKUP_SCHEMAS.bloodPressureRecords).toBe(bloodPressureRecordSchema);
    expect(BACKUP_SCHEMAS.eatingRecords).toBe(eatingRecordSchema);
    expect(BACKUP_SCHEMAS.urinationRecords).toBe(urinationRecordSchema);
    expect(BACKUP_SCHEMAS.defecationRecords).toBe(defecationRecordSchema);
    expect(BACKUP_SCHEMAS.substanceRecords).toBe(substanceRecordSchema);
    expect(BACKUP_SCHEMAS.prescriptions).toBe(prescriptionSchema);
    expect(BACKUP_SCHEMAS.medicationPhases).toBe(medicationPhaseSchema);
    expect(BACKUP_SCHEMAS.phaseSchedules).toBe(phaseScheduleSchema);
    expect(BACKUP_SCHEMAS.inventoryItems).toBe(inventoryItemSchema);
    expect(BACKUP_SCHEMAS.inventoryTransactions).toBe(inventoryTransactionSchema);
    expect(BACKUP_SCHEMAS.doseLogs).toBe(doseLogSchema);
    expect(BACKUP_SCHEMAS.titrationPlans).toBe(titrationPlanSchema);
    expect(BACKUP_SCHEMAS.dailyNotes).toBe(dailyNoteSchema);
    expect(BACKUP_SCHEMAS.auditLogs).toBe(auditLogSchema);
  });

  it("syncFieldsSchema treats all metadata fields as optional", () => {
    expect(syncFieldsSchema.safeParse({}).success).toBe(true);
    expect(syncFieldsSchema.safeParse({ createdAt: 1, deletedAt: null }).success).toBe(true);
    expect(syncFieldsSchema.safeParse({ deletedAt: 999 }).success).toBe(true);
  });
});
