import { describe, it, expect } from "vitest";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";

describe("sync-topology", () => {
  const idx = (t: string) => TABLE_PUSH_ORDER.indexOf(t as TableName);

  it("places prescriptions before medicationPhases before phaseSchedules before doseLogs", () => {
    expect(idx("prescriptions")).toBeGreaterThanOrEqual(0);
    expect(idx("medicationPhases")).toBeGreaterThanOrEqual(0);
    expect(idx("phaseSchedules")).toBeGreaterThanOrEqual(0);
    expect(idx("doseLogs")).toBeGreaterThanOrEqual(0);

    expect(idx("prescriptions")).toBeLessThan(idx("medicationPhases"));
    expect(idx("medicationPhases")).toBeLessThan(idx("phaseSchedules"));
    expect(idx("phaseSchedules")).toBeLessThan(idx("doseLogs"));
  });

  it("places intakeRecords before substanceRecords", () => {
    expect(idx("intakeRecords")).toBeGreaterThanOrEqual(0);
    expect(idx("substanceRecords")).toBeGreaterThanOrEqual(0);
    expect(idx("intakeRecords")).toBeLessThan(idx("substanceRecords"));
  });

  it("contains exactly 16 data tables, no duplicates", () => {
    expect(TABLE_PUSH_ORDER).toHaveLength(16);
    expect(new Set(TABLE_PUSH_ORDER).size).toBe(16);
  });

  it("every FK pair in src/db/schema.ts satisfies parent-before-child in TABLE_PUSH_ORDER", () => {
    // Known FK pairs derived from src/db/schema.ts (Phase 42):
    //   medicationPhases.prescriptionId        → prescriptions
    //   medicationPhases.titrationPlanId       → titrationPlans
    //   phaseSchedules.phaseId                 → medicationPhases
    //   inventoryItems.prescriptionId          → prescriptions
    //   doseLogs.prescriptionId                → prescriptions
    //   doseLogs.phaseId                       → medicationPhases
    //   doseLogs.scheduleId                    → phaseSchedules
    //   doseLogs.inventoryItemId               → inventoryItems
    //   inventoryTransactions.inventoryItemId  → inventoryItems
    //   inventoryTransactions.doseLogId        → doseLogs
    //   dailyNotes.prescriptionId              → prescriptions
    //   dailyNotes.doseLogId                   → doseLogs
    //   substanceRecords.sourceRecordId        → intakeRecords
    const fkPairs: Array<[parent: string, child: string]> = [
      ["prescriptions", "medicationPhases"],
      ["titrationPlans", "medicationPhases"],
      ["medicationPhases", "phaseSchedules"],
      ["prescriptions", "inventoryItems"],
      ["prescriptions", "doseLogs"],
      ["medicationPhases", "doseLogs"],
      ["phaseSchedules", "doseLogs"],
      ["inventoryItems", "doseLogs"],
      ["inventoryItems", "inventoryTransactions"],
      ["doseLogs", "inventoryTransactions"],
      ["prescriptions", "dailyNotes"],
      ["doseLogs", "dailyNotes"],
      ["intakeRecords", "substanceRecords"],
    ];

    for (const [parent, child] of fkPairs) {
      const pIdx = idx(parent);
      const cIdx = idx(child);
      expect(pIdx, `${parent} must appear in TABLE_PUSH_ORDER`).toBeGreaterThanOrEqual(0);
      expect(cIdx, `${child} must appear in TABLE_PUSH_ORDER`).toBeGreaterThanOrEqual(0);
      expect(
        pIdx,
        `${parent} (${pIdx}) must come before ${child} (${cIdx}) in TABLE_PUSH_ORDER`,
      ).toBeLessThan(cIdx);
    }
  });
});
