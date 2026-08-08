import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  addSubstanceRecord,
  getSubstanceRecordsByDateRange,
  deleteSubstanceRecord,
  updateSubstanceRecord,
  getUnenrichedSubstanceRecords,
} from "@/lib/substance-service";
import { makeSubstanceRecord, makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import { logDrink } from "@/lib/drink-service";

describe("substance-service: addSubstanceRecord", () => {
  it("records volumeMl as data and creates NO water intake (issue #322)", async () => {
    const result = await addSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Morning coffee",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Substance record exists, and keeps the volume as plain data.
    const substance = await db.substanceRecords.get(result.data.id);
    expect(substance).toBeDefined();
    expect(substance!.type).toBe("caffeine");
    expect(substance!.amountMg).toBe(95);
    expect(substance!.volumeMl).toBe(250);

    // `volumeMl` is no longer an implicit request to book hydration. Counting
    // *all* water rows, not just `substance:<id>`-sourced ones, is the point:
    // the source-scoped assertion this replaced was structurally blind to a
    // second water row written by another caller, which is why the suite never
    // caught #322.
    const allWater = await db.intakeRecords
      .where("type")
      .equals("water")
      .toArray();
    expect(allWater).toHaveLength(0);
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
  it("cascades to a legacy source-linked water row (pre-v22 data)", async () => {
    // Rows written by the old implicit auto-water path are linked only by the
    // `substance:<id>` source string and carry no group.
    const result = await addSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Coffee to delete",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const substanceId = result.data.id;

    await db.intakeRecords.add(
      makeIntakeRecord({
        type: "water",
        amount: 250,
        source: `substance:${substanceId}`,
      }),
    );

    const deleteResult = await deleteSubstanceRecord(substanceId);
    expect(deleteResult.success).toBe(true);

    const substance = await db.substanceRecords.get(substanceId);
    expect(substance!.deletedAt).toBeTypeOf("number");

    const intakes = await db.intakeRecords
      .where("source")
      .equals(`substance:${substanceId}`)
      .toArray();
    expect(intakes).toHaveLength(1);
    expect(intakes[0]!.deletedAt).toBeTypeOf("number");
  });

  it("cascades to a sibling substance in the same group", async () => {
    // An espresso martini is one drink with two substances. Deleting one used
    // to leave the other counting with no fluid attached.
    const drink = await logDrink({
      volumeMl: 300,
      description: "Espresso martini",
      caffeineMg: 60,
      abvPercent: 15,
    });
    expect(drink.success).toBe(true);
    if (!drink.success) return;
    expect(drink.data.substanceIds).toHaveLength(2);

    expect((await deleteSubstanceRecord(drink.data.substanceIds[0]!)).success).toBe(true);

    const live = (await db.substanceRecords.toArray()).filter(
      (r) => r.deletedAt === null,
    );
    expect(live).toHaveLength(0);
    const water = await db.intakeRecords.get(drink.data.waterIntakeId);
    expect(water!.deletedAt).toBeTypeOf("number");
  });

  it("cascades to the group's water row (post-v22 data)", async () => {
    // `logDrink` links the two halves by groupId, not by source string.
    const groupId = crypto.randomUUID();
    const result = await addSubstanceRecord({
      type: "alcohol",
      abvPercent: 5,
      volumeMl: 500,
      description: "Beer to delete",
      groupId,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const waterId = crypto.randomUUID();
    await db.intakeRecords.add(
      makeIntakeRecord({
        id: waterId,
        type: "water",
        amount: 500,
        source: "drink",
        groupId,
      }),
    );

    expect((await deleteSubstanceRecord(result.data.id)).success).toBe(true);

    const water = await db.intakeRecords.get(waterId);
    expect(water!.deletedAt).toBeTypeOf("number");
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

describe("substance-service: updateSubstanceRecord keeps the group's fluid in step", () => {
  it("updates the group's water row when the volume changes", async () => {
    const drink = await logDrink({
      volumeMl: 330,
      description: "Beer",
      abvPercent: 5,
    });
    expect(drink.success).toBe(true);
    if (!drink.success) return;

    // Editing the volume on the substance alone let the two halves of one
    // drink disagree: the substance said 500 ml, hydration still counted 330.
    const result = await updateSubstanceRecord(drink.data.substanceIds[0]!, {
      volumeMl: 500,
    });
    expect(result.success).toBe(true);

    const water = await db.intakeRecords.get(drink.data.waterIntakeId);
    expect(water!.amount).toBe(500);
  });

  it("moves the group's water row when the timestamp changes", async () => {
    const drink = await logDrink({
      volumeMl: 250,
      description: "Coffee",
      caffeineMg: 95,
      timestamp: 1700000000000,
    });
    expect(drink.success).toBe(true);
    if (!drink.success) return;

    const moved = 1700086400000;
    await updateSubstanceRecord(drink.data.substanceIds[0]!, { timestamp: moved });

    const water = await db.intakeRecords.get(drink.data.waterIntakeId);
    expect(water!.timestamp).toBe(moved);
  });

  it("leaves the water row alone for a description-only edit", async () => {
    const drink = await logDrink({
      volumeMl: 250,
      description: "Coffee",
      caffeineMg: 95,
    });
    expect(drink.success).toBe(true);
    if (!drink.success) return;
    const before = await db.intakeRecords.get(drink.data.waterIntakeId);

    await updateSubstanceRecord(drink.data.substanceIds[0]!, {
      description: "Flat white",
    });

    const after = await db.intakeRecords.get(drink.data.waterIntakeId);
    expect(after!.amount).toBe(before!.amount);
    expect(after!.timestamp).toBe(before!.timestamp);
  });

  it("does not create a water row for an ungrouped substance", async () => {
    const created = await addSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      description: "Caffeine tablet",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    await updateSubstanceRecord(created.data.id, { volumeMl: 250 });
    const water = await db.intakeRecords.where("type").equals("water").toArray();
    expect(water).toHaveLength(0);
  });
});
