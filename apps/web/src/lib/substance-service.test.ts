import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  addSubstanceRecord,
  getSubstanceRecordsByDateRange,
  deleteSubstanceRecord,
  getUnenrichedSubstanceRecords,
} from "@/lib/substance-service";
import { makeSubstanceRecord } from "@/__tests__/fixtures/db-fixtures";

describe("substance-service: addSubstanceRecord", () => {
  it("creates substance + linked intake record in transaction when volumeMl provided", async () => {
    const result = await addSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Morning coffee",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Substance record exists
    const substance = await db.substanceRecords.get(result.data.id);
    expect(substance).toBeDefined();
    expect(substance!.type).toBe("caffeine");
    expect(substance!.amountMg).toBe(95);

    // Linked intake record exists
    const intakes = await db.intakeRecords
      .where("source")
      .equals(`substance:${result.data.id}`)
      .toArray();
    expect(intakes).toHaveLength(1);
    expect(intakes[0]!.amount).toBe(250);
    expect(intakes[0]!.type).toBe("water");
    expect(intakes[0]!.note).toBe("Morning coffee");
  });

  it("creates substance only (no linked intake) when volumeMl not provided", async () => {
    const result = await addSubstanceRecord({
      type: "alcohol",
      amountStandardDrinks: 1.5,
      description: "Cocktail at bar",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Substance record exists
    const substance = await db.substanceRecords.get(result.data.id);
    expect(substance).toBeDefined();
    expect(substance!.type).toBe("alcohol");
    expect(substance!.amountStandardDrinks).toBe(1.5);

    // No linked intake record
    const intakes = await db.intakeRecords
      .where("source")
      .equals(`substance:${result.data.id}`)
      .toArray();
    expect(intakes).toHaveLength(0);
  });
});

describe("substance-service: getSubstanceRecordsByDateRange", () => {
  it("filters by type correctly when type provided", async () => {
    const base = 1700000000000;
    await db.substanceRecords.bulkAdd([
      makeSubstanceRecord({ id: "range-c1", type: "caffeine", timestamp: base + 1000 }),
      makeSubstanceRecord({ id: "range-a1", type: "alcohol", timestamp: base + 2000, amountStandardDrinks: 1 }),
      makeSubstanceRecord({ id: "range-c2", type: "caffeine", timestamp: base + 3000 }),
    ]);

    const caffeineOnly = await getSubstanceRecordsByDateRange(base, base + 5000, "caffeine");
    expect(caffeineOnly).toHaveLength(2);
    expect(caffeineOnly.every((r) => r.type === "caffeine")).toBe(true);

    const all = await getSubstanceRecordsByDateRange(base, base + 5000);
    expect(all).toHaveLength(3);
  });
});

describe("substance-service: deleteSubstanceRecord", () => {
  it("soft-deletes both substance and linked intake record", async () => {
    // Add a substance with a linked intake
    const result = await addSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Coffee to delete",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const substanceId = result.data.id;

    // Delete it
    const deleteResult = await deleteSubstanceRecord(substanceId);
    expect(deleteResult.success).toBe(true);

    // Substance is soft-deleted
    const substance = await db.substanceRecords.get(substanceId);
    expect(substance).toBeDefined();
    expect(substance!.deletedAt).toBeTypeOf("number");

    // Linked intake is soft-deleted
    const intakes = await db.intakeRecords
      .where("source")
      .equals(`substance:${substanceId}`)
      .toArray();
    expect(intakes).toHaveLength(1);
    expect(intakes[0]!.deletedAt).toBeTypeOf("number");
  });
});

describe("substance-service: getUnenrichedSubstanceRecords", () => {
  it("returns only unenriched water_intake source records", async () => {
    await db.substanceRecords.bulkAdd([
      makeSubstanceRecord({ id: "unenriched-1", source: "water_intake", aiEnriched: false }),
      makeSubstanceRecord({ id: "unenriched-2", source: "water_intake", aiEnriched: false }),
      makeSubstanceRecord({ id: "enriched-1", source: "water_intake", aiEnriched: true }),
      makeSubstanceRecord({ id: "standalone-1", source: "standalone", aiEnriched: false }),
    ]);

    const records = await getUnenrichedSubstanceRecords();
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.id).sort()).toEqual(["unenriched-1", "unenriched-2"]);
  });
});
