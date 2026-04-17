import { describe, it, expect } from "vitest";

describe("sync-topology", () => {
  it("MISSING — sync-topology module not implemented yet (Plan 05)", () => {
    expect.fail("sync-topology.ts not implemented — see 43-05-PLAN.md");
  });

  it.todo("places prescriptions before medicationPhases before phaseSchedules before doseLogs");
  it.todo("places intakeRecords before substanceRecords");
  it.todo("contains exactly 16 data tables, no duplicates");
  it.todo("every FK pair in src/db/schema.ts satisfies parent-before-child in TABLE_PUSH_ORDER");
});
