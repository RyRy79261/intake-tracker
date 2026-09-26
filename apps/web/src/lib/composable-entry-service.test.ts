import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeEatingRecord, makeIntakeRecord, seedComposableGroup } from "@/__tests__/fixtures/db-fixtures";
import { logDrink } from "@/lib/drink-service";
import { standardDrinksFromAbv } from "@intake/core/alcohol";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  getEntryGroup,
  deleteSingleGroupRecord,
  undoDeleteSingleRecord,
  recalculateFromCurrentValues,
  syncLiquidEntrySubstances,
  classifyLiquidDelete,
  deleteEatingEntry,
  undoDeleteEatingEntry,
  updateEatingEntry,
  syncEatingGroup,
  type ComposableEntryInput,
} from "@/lib/composable-entry-service";

describe("composable-entry-service", () => {
  // ─── addComposableEntry ─────────────────────────────────────────────

  describe("addComposableEntry", () => {
    it("Test 1: creates eating + intake(water) + intake(salt) with same groupId", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Chicken salad", grams: 350 },
        intakes: [
          { type: "water", amount: 250, source: "food" },
          { type: "salt", amount: 500 },
        ],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const { groupId, eatingId, intakeIds, substanceId } = result.data;
      expect(groupId).toBeTruthy();
      expect(eatingId).toBeTruthy();
      expect(intakeIds).toHaveLength(2);
      expect(substanceId).toBeUndefined();

      // Verify all records share the same groupId
      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.groupId).toBe(groupId);

      for (const id of intakeIds) {
        const intake = await db.intakeRecords.get(id);
        expect(intake?.groupId).toBe(groupId);
      }
    });

    it("Test 2: creates only eating + intake when no substance input", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Toast" },
        intakes: [{ type: "water", amount: 200 }],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.eatingId).toBeTruthy();
      expect(result.data.intakeIds).toHaveLength(1);
      expect(result.data.substanceId).toBeUndefined();

      // Verify groupId is shared
      const eating = await db.eatingRecords.get(result.data.eatingId!);
      const intake = await db.intakeRecords.get(result.data.intakeIds[0]!);
      expect(eating?.groupId).toBe(result.data.groupId);
      expect(intake?.groupId).toBe(result.data.groupId);
    });

    it("Test 3: substance.volumeMl creates NO water intake (issue #322)", async () => {
      const input: ComposableEntryInput = {
        substance: {
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Black coffee",
        },
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.eatingId).toBeUndefined();
      expect(result.data.substanceId).toBeTruthy();

      // `volumeMl` is data, not a request to book hydration. This branch used
      // to write a water row from it, so a caller that also queued its own
      // water intake double-counted the drink. It also made the singular and
      // plural substance branches behave differently for identical input.
      expect(result.data.intakeIds).toHaveLength(0);
      const allWater = await db.intakeRecords.where("type").equals("water").toArray();
      expect(allWater).toHaveLength(0);

      // The volume is still stored on the substance.
      const substance = await db.substanceRecords.get(result.data.substanceId!);
      expect(substance?.volumeMl).toBe(250);
      expect(substance?.groupId).toBe(result.data.groupId);
    });

    it("Test 3b: singular and plural substance branches agree on water", async () => {
      // The asymmetry between these two was the shape of the original bug.
      const singular = await addComposableEntry({
        substance: { type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee" },
      });
      const plural = await addComposableEntry({
        substances: [
          { type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee" },
        ],
      });
      expect(singular.success && plural.success).toBe(true);
      if (!singular.success || !plural.success) return;
      expect(singular.data.intakeIds).toEqual(plural.data.intakeIds);
    });

    it("Test 4: all records share the same timestamp", async () => {
      const ts = 1700000000000;
      const input: ComposableEntryInput = {
        eating: { note: "Lunch" },
        intakes: [{ type: "water", amount: 300 }],
        substance: { type: "caffeine", amountMg: 50, description: "Green tea" },
      };
      const result = await addComposableEntry(input, ts);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(result.data.eatingId!);
      const intake = await db.intakeRecords.get(result.data.intakeIds[0]!);
      const substance = await db.substanceRecords.get(result.data.substanceId!);

      expect(eating?.timestamp).toBe(ts);
      expect(intake?.timestamp).toBe(ts);
      expect(substance?.timestamp).toBe(ts);
    });

    it("Test 5: all records have syncFields", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Snack" },
        intakes: [{ type: "water", amount: 100 }],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(result.data.eatingId!);
      expect(eating?.createdAt).toBeTypeOf("number");
      expect(eating?.updatedAt).toBeTypeOf("number");
      expect(eating?.deletedAt).toBeNull();
      expect(eating?.deviceId).toBeTypeOf("string");
      expect(eating?.timezone).toBeTypeOf("string");

      const intake = await db.intakeRecords.get(result.data.intakeIds[0]!);
      expect(intake?.createdAt).toBeTypeOf("number");
      expect(intake?.updatedAt).toBeTypeOf("number");
      expect(intake?.deletedAt).toBeNull();
      expect(intake?.deviceId).toBeTypeOf("string");
      expect(intake?.timezone).toBeTypeOf("string");
    });

    it("Test 6: returns correct groupId and record IDs in ComposableEntryResult", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Dinner", grams: 500 },
        intakes: [
          { type: "water", amount: 500 },
          { type: "salt", amount: 1000 },
        ],
        substance: { type: "alcohol", amountStandardDrinks: 1, description: "Wine" },
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify IDs actually exist in the DB
      expect(await db.eatingRecords.get(result.data.eatingId!)).toBeTruthy();
      for (const id of result.data.intakeIds) {
        expect(await db.intakeRecords.get(id)).toBeTruthy();
      }
      expect(await db.substanceRecords.get(result.data.substanceId!)).toBeTruthy();
    });

    it("Test 7: stores originalInputText on the primary record when provided", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Pasta with cheese" },
        intakes: [{ type: "water", amount: 200 }],
        originalInputText: "I had pasta with cheese and some water",
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Eating record is the primary when it exists
      const eating = await db.eatingRecords.get(result.data.eatingId!);
      expect(eating?.originalInputText).toBe("I had pasta with cheese and some water");
    });

    it("Test 7b: stores originalInputText on substance when no eating record", async () => {
      const input: ComposableEntryInput = {
        substance: { type: "caffeine", amountMg: 95, description: "Espresso" },
        originalInputText: "double espresso",
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const substance = await db.substanceRecords.get(result.data.substanceId!);
      expect(substance?.originalInputText).toBe("double espresso");
    });

    it("Test 8: stores groupSource on all records when provided", async () => {
      const input: ComposableEntryInput = {
        eating: { note: "Sushi" },
        intakes: [{ type: "water", amount: 100 }],
        groupSource: "ai_food_parse",
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(result.data.eatingId!);
      expect(eating?.groupSource).toBe("ai_food_parse");

      const intake = await db.intakeRecords.get(result.data.intakeIds[0]!);
      expect(intake?.groupSource).toBe("ai_food_parse");
    });

    it("Test 9: transaction atomicity — if one table write fails, no records are created", async () => {
      // Pass an intake with an id that already exists to cause a duplicate key error
      const existingRecord = makeIntakeRecord();
      await db.intakeRecords.add(existingRecord);

      const input: ComposableEntryInput = {
        eating: { note: "Should not be created" },
        // The second intake has the same id as existing — will cause ConstraintError
        intakes: [{ type: "water", amount: 100 }],
      };

      // Monkey-patch crypto.randomUUID to return the existing id on the second call
      const originalRandomUUID = crypto.randomUUID.bind(crypto);
      let callCount = 0;
      const patchedRandomUUID = ((): string => {
        callCount++;
        // First call = groupId, second call = eating record, third call = intake record
        if (callCount === 3) return existingRecord.id;
        return originalRandomUUID();
      }) as typeof crypto.randomUUID;
      (crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID = patchedRandomUUID;

      try {
        const result = await addComposableEntry(input);
        expect(result.success).toBe(false);
      } finally {
        (crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID = originalRandomUUID;
      }

      // Verify no eating records were created (transaction rolled back)
      const eatings = await db.eatingRecords.toArray();
      expect(eatings).toHaveLength(0);
    });
  });

  // ─── deleteEntryGroup ───────────────────────────────────────────────

  describe("deleteEntryGroup", () => {
    it("Test 10: sets deletedAt on ALL records with matching groupId across all 3 tables", async () => {
      const { groupId, eatingId, intakeIds, substanceId } = await seedComposableGroup({
        eating: { note: "Meal" },
        intakes: [{ type: "water", amount: 200 }, { type: "salt", amount: 300 }],
        substance: { type: "caffeine", amountMg: 50, description: "Tea" },
      });

      const result = await deleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeTypeOf("number");

      for (const id of intakeIds) {
        const intake = await db.intakeRecords.get(id);
        expect(intake?.deletedAt).toBeTypeOf("number");
      }

      const substance = await db.substanceRecords.get(substanceId!);
      expect(substance?.deletedAt).toBeTypeOf("number");
    });

    it("Test 11: returns deletedCount matching total records in group", async () => {
      const { groupId } = await seedComposableGroup({
        eating: { note: "Lunch" },
        intakes: [{ type: "water", amount: 250 }],
        substance: { type: "caffeine", amountMg: 95, description: "Coffee" },
      });

      const result = await deleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.deletedCount).toBe(3); // eating + intake + substance
    });

    it("Test 12: skips records already soft-deleted", async () => {
      await seedComposableGroup({
        eating: { note: "Pre-deleted", deletedAt: 1700000000000 },
        intakes: [{ type: "water", amount: 200 }],
      }).then(async ({ groupId }) => {
        const result = await deleteEntryGroup(groupId);
        expect(result.success).toBe(true);
        if (!result.success) return;
        // Only the intake record should be counted (eating already deleted)
        expect(result.data.deletedCount).toBe(1);
      });
    });

    it("Test 13: after deleteEntryGroup, records still exist in DB but have non-null deletedAt", async () => {
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Still here" },
        intakes: [{ type: "water", amount: 100 }],
      });

      await deleteEntryGroup(groupId);

      // Records exist but are soft-deleted
      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating).toBeTruthy();
      expect(eating?.deletedAt).not.toBeNull();

      const intake = await db.intakeRecords.get(intakeIds[0]!);
      expect(intake).toBeTruthy();
      expect(intake?.deletedAt).not.toBeNull();
    });
  });

  // ─── undoDeleteEntryGroup ───────────────────────────────────────────

  describe("undoDeleteEntryGroup", () => {
    it("Test 14: restores all soft-deleted records (sets deletedAt back to null)", async () => {
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Restore me" },
        intakes: [{ type: "water", amount: 200 }],
      });

      // Delete then undo
      const del = await deleteEntryGroup(groupId);
      if (!del.success) throw new Error("delete failed");
      const result = await undoDeleteEntryGroup(groupId, del.data.deletedAt);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();

      const intake = await db.intakeRecords.get(intakeIds[0]!);
      expect(intake?.deletedAt).toBeNull();
    });

    it("Test 15: returns restoredCount matching total restored", async () => {
      const { groupId } = await seedComposableGroup({
        eating: { note: "Count me" },
        intakes: [{ type: "water", amount: 100 }, { type: "salt", amount: 200 }],
      });

      const del = await deleteEntryGroup(groupId);
      if (!del.success) throw new Error("delete failed");
      const result = await undoDeleteEntryGroup(groupId, del.data.deletedAt);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.restoredCount).toBe(3); // eating + 2 intakes
    });

    it("Test 16: only restores the rows that delete tombstoned", async () => {
      // A row removed earlier (an edit cleared it) must stay removed. Undo used
      // to restore every tombstoned row in the group, resurrecting it.
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Active" },
        intakes: [{ type: "water", amount: 100 }, { type: "salt", amount: 500 }],
      });
      await db.intakeRecords.update(intakeIds[0]!, { deletedAt: 1700000000000 });

      const del = await deleteEntryGroup(groupId);
      if (!del.success) throw new Error("delete failed");
      const result = await undoDeleteEntryGroup(groupId, del.data.deletedAt);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.restoredCount).toBe(2); // eating + salt

      expect((await db.eatingRecords.get(eatingId!))?.deletedAt).toBeNull();
      expect((await db.intakeRecords.get(intakeIds[1]!))?.deletedAt).toBeNull();
      expect((await db.intakeRecords.get(intakeIds[0]!))?.deletedAt).toBe(1700000000000);
    });

    it("does not resurrect a substance an edit removed before the drink was deleted", async () => {
      const drink = await logDrink({
        volumeMl: 250,
        description: "Irish coffee",
        caffeineMg: 80,
        abvPercent: 10,
      });
      if (!drink.success) throw new Error("logDrink failed");
      // The user clears the caffeine in the edit form; alcohol stays.
      await syncLiquidEntrySubstances(drink.data.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 250,
        caffeineMg: 0,
        alcoholAbv: null,
        sugarG: null,
      });

      const del = await deleteEntryGroup(drink.data.groupId);
      if (!del.success) throw new Error("delete failed");
      await undoDeleteEntryGroup(drink.data.groupId, del.data.deletedAt);

      const live = (await db.substanceRecords.toArray()).filter((r) => r.deletedAt === null);
      expect(live.map((r) => r.type)).toEqual(["alcohol"]);
    });
  });

  // ─── getEntryGroup ──────────────────────────────────────────────────

  describe("getEntryGroup", () => {
    it("Test 17: returns all non-deleted records across 3 tables for a groupId", async () => {
      const { groupId } = await seedComposableGroup({
        eating: { note: "Group meal" },
        intakes: [{ type: "water", amount: 300 }],
        substance: { type: "caffeine", amountMg: 70, description: "Matcha" },
      });

      const group = await getEntryGroup(groupId);
      expect(group).not.toBeNull();
      expect(group!.groupId).toBe(groupId);
      expect(group!.eatings).toHaveLength(1);
      expect(group!.intakes).toHaveLength(1);
      expect(group!.substances).toHaveLength(1);
    });

    it("Test 18: excludes soft-deleted records from results", async () => {
      const { groupId, eatingId } = await seedComposableGroup({
        eating: { note: "Partially deleted" },
        intakes: [{ type: "water", amount: 100 }],
      });

      // Soft-delete the eating record
      await db.eatingRecords.update(eatingId!, { deletedAt: Date.now() });

      const group = await getEntryGroup(groupId);
      expect(group).not.toBeNull();
      expect(group!.eatings).toHaveLength(0);
      expect(group!.intakes).toHaveLength(1);
    });

    it("Test 19: returns empty arrays for non-existent groupId", async () => {
      const group = await getEntryGroup("non-existent-group-id");
      expect(group).not.toBeNull();
      expect(group!.intakes).toHaveLength(0);
      expect(group!.eatings).toHaveLength(0);
      expect(group!.substances).toHaveLength(0);
    });

    it("Test 20: returns null when called with undefined groupId", async () => {
      const group = await getEntryGroup(undefined);
      expect(group).toBeNull();
    });
  });

  // ─── deleteSingleGroupRecord ────────────────────────────────────────

  describe("deleteSingleGroupRecord", () => {
    it("Test 21: soft-deletes a single intake record, leaving other group members intact", async () => {
      const { eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Keep eating" },
        intakes: [{ type: "water", amount: 200 }, { type: "salt", amount: 300 }],
      });

      const result = await deleteSingleGroupRecord("intakeRecords", intakeIds[0]!);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.table).toBe("intakeRecords");
      expect(result.data.id).toBe(intakeIds[0]);

      // Deleted record
      const deleted = await db.intakeRecords.get(intakeIds[0]!);
      expect(deleted?.deletedAt).toBeTypeOf("number");

      // Other group members intact
      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();

      const otherIntake = await db.intakeRecords.get(intakeIds[1]!);
      expect(otherIntake?.deletedAt).toBeNull();
    });

    it("Test 22: soft-deletes a single eating record, leaving other group members intact", async () => {
      const { eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Delete just me" },
        intakes: [{ type: "water", amount: 100 }],
      });

      const result = await deleteSingleGroupRecord("eatingRecords", eatingId!);
      expect(result.success).toBe(true);

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeTypeOf("number");

      const intake = await db.intakeRecords.get(intakeIds[0]!);
      expect(intake?.deletedAt).toBeNull();
    });

    it("Test 23: soft-deletes a single substance record, leaving other group members intact", async () => {
      const { eatingId, substanceId } = await seedComposableGroup({
        eating: { note: "Still here" },
        substance: { type: "caffeine", amountMg: 95, description: "Espresso" },
      });

      const result = await deleteSingleGroupRecord("substanceRecords", substanceId!);
      expect(result.success).toBe(true);

      const substance = await db.substanceRecords.get(substanceId!);
      expect(substance?.deletedAt).toBeTypeOf("number");

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();
    });

    it("Test 24: returns ok with the deleted record's table and id", async () => {
      const { intakeIds } = await seedComposableGroup({
        intakes: [{ type: "water", amount: 200 }],
      });

      const result = await deleteSingleGroupRecord("intakeRecords", intakeIds[0]!);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({ table: "intakeRecords", id: intakeIds[0] });
    });
  });

  // ─── undoDeleteSingleRecord ─────────────────────────────────────────

  describe("undoDeleteSingleRecord", () => {
    it("Test 25: restores a single soft-deleted intake record, other group members unchanged", async () => {
      const { eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Untouched" },
        intakes: [{ type: "water", amount: 200 }],
      });

      // Delete then undo
      await deleteSingleGroupRecord("intakeRecords", intakeIds[0]!);
      const result = await undoDeleteSingleRecord("intakeRecords", intakeIds[0]!);
      expect(result.success).toBe(true);

      const intake = await db.intakeRecords.get(intakeIds[0]!);
      expect(intake?.deletedAt).toBeNull();

      // Eating was never touched
      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();
    });

    it("Test 26: restores a single soft-deleted eating record", async () => {
      const { eatingId } = await seedComposableGroup({
        eating: { note: "Restore me" },
      });

      await deleteSingleGroupRecord("eatingRecords", eatingId!);
      const result = await undoDeleteSingleRecord("eatingRecords", eatingId!);
      expect(result.success).toBe(true);

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();
    });

    it("Test 27: returns ok with the restored record's table and id", async () => {
      const { intakeIds } = await seedComposableGroup({
        intakes: [{ type: "water", amount: 150 }],
      });

      await deleteSingleGroupRecord("intakeRecords", intakeIds[0]!);
      const result = await undoDeleteSingleRecord("intakeRecords", intakeIds[0]!);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({ table: "intakeRecords", id: intakeIds[0] });
    });
  });

  // ─── multi-substance entries ────────────────────────────────────────

  describe("multi-substance entries", () => {
    it("creates 2 substance records + 1 water intake from substances array + intakes", async () => {
      const input: ComposableEntryInput = {
        substances: [
          { type: "caffeine", amountMg: 126, description: "Don Pedro" },
          { type: "alcohol", amountStandardDrinks: 0.9, description: "Don Pedro" },
        ],
        intakes: [{ type: "water", amount: 24 }],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // substanceIds has 2 entries
      expect(result.data.substanceIds).toHaveLength(2);
      // intakeIds has 1 entry (the explicit water intake)
      expect(result.data.intakeIds).toHaveLength(1);
      // substanceId (singular) is undefined when using substances array
      expect(result.data.substanceId).toBeUndefined();

      // All records share the same groupId
      for (const sid of result.data.substanceIds) {
        const substance = await db.substanceRecords.get(sid);
        expect(substance?.groupId).toBe(result.data.groupId);
      }
      const intake = await db.intakeRecords.get(result.data.intakeIds[0]!);
      expect(intake?.groupId).toBe(result.data.groupId);

      // Verify substance types and amounts
      const caffeine = await db.substanceRecords.get(result.data.substanceIds[0]!);
      expect(caffeine?.type).toBe("caffeine");
      expect(caffeine?.amountMg).toBe(126);

      const alcohol = await db.substanceRecords.get(result.data.substanceIds[1]!);
      expect(alcohol?.type).toBe("alcohol");
      expect(alcohol?.amountStandardDrinks).toBe(0.9);
    });

    it("backward compat: singular substance still populates substanceId and substanceIds has 1 element", async () => {
      const input: ComposableEntryInput = {
        substance: {
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Black coffee",
        },
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.substanceId).toBeTruthy();
      expect(result.data.substanceIds).toHaveLength(1);
      expect(result.data.substanceIds[0]).toBe(result.data.substanceId);
    });

    it("substances + intakes with water and salt creates 4 total records", async () => {
      const input: ComposableEntryInput = {
        substances: [
          { type: "caffeine", amountMg: 63, description: "Irish Coffee" },
          { type: "alcohol", amountStandardDrinks: 1.0, description: "Irish Coffee" },
        ],
        intakes: [
          { type: "water", amount: 180 },
          { type: "salt", amount: 50 },
        ],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.substanceIds).toHaveLength(2);
      expect(result.data.intakeIds).toHaveLength(2);

      // All 4 records share same groupId
      for (const sid of result.data.substanceIds) {
        const rec = await db.substanceRecords.get(sid);
        expect(rec?.groupId).toBe(result.data.groupId);
      }
      for (const iid of result.data.intakeIds) {
        const rec = await db.intakeRecords.get(iid);
        expect(rec?.groupId).toBe(result.data.groupId);
      }
    });

    it("substances path does NOT auto-create water intake", async () => {
      const input: ComposableEntryInput = {
        substances: [
          { type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee" },
        ],
      };
      const result = await addComposableEntry(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // No water intake auto-created — intakeIds should be empty
      expect(result.data.intakeIds).toHaveLength(0);
      expect(result.data.substanceIds).toHaveLength(1);
    });
  });

  // ─── recalculateFromCurrentValues (stub) ────────────────────────────

  describe("syncLiquidEntrySubstances", () => {
    it("creates caffeine substance + groupId when entry has none", async () => {
      const intake = makeIntakeRecord({ type: "water", amount: 300, source: "manual" });
      await db.intakeRecords.add(intake);

      const result = await syncLiquidEntrySubstances(intake.id, {
        timestamp: intake.timestamp,
        waterMl: 300,
        description: "Cold brew",
        caffeineMg: 150,
        alcoholAbv: null,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const updated = await db.intakeRecords.get(intake.id);
      expect(updated?.groupId).toBeTruthy();

      const subs = await db.substanceRecords
        .where("groupId")
        .equals(updated!.groupId!)
        .toArray();
      expect(subs).toHaveLength(1);
      expect(subs[0]?.type).toBe("caffeine");
      expect(subs[0]?.amountMg).toBe(150);
      expect(subs[0]?.description).toBe("Cold brew");
      expect(subs[0]?.volumeMl).toBe(300);
    });

    it("updates an existing caffeine substance in the group", async () => {
      const { groupId, intakeIds } = await seedComposableGroup({
        intakes: [{ type: "water", amount: 250 }],
        substance: { type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee" },
      });

      const result = await syncLiquidEntrySubstances(intakeIds[0]!, {
        timestamp: 1700000000000,
        waterMl: 400,
        description: "Big coffee",
        caffeineMg: 200,
        alcoholAbv: null,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const subs = await db.substanceRecords
        .where("groupId").equals(groupId).toArray();
      const active = subs.filter((s) => s.deletedAt === null);
      expect(active).toHaveLength(1);
      expect(active[0]?.amountMg).toBe(200);
      expect(active[0]?.description).toBe("Big coffee");
      expect(active[0]?.volumeMl).toBe(400);
    });

    it("soft-deletes caffeine when patch sets it to 0", async () => {
      const { groupId, intakeIds } = await seedComposableGroup({
        intakes: [{ type: "water", amount: 250 }],
        substance: { type: "caffeine", amountMg: 95, description: "Coffee" },
      });

      const result = await syncLiquidEntrySubstances(intakeIds[0]!, {
        timestamp: 1700000000000,
        waterMl: 250,
        caffeineMg: 0,
        alcoholAbv: null,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const subs = await db.substanceRecords
        .where("groupId").equals(groupId).toArray();
      expect(subs).toHaveLength(1);
      expect(subs[0]?.deletedAt).not.toBeNull();
    });

    it("creates an alcohol substance with derived standard drinks", async () => {
      const intake = makeIntakeRecord({ type: "water", amount: 500, source: "manual" });
      await db.intakeRecords.add(intake);

      const result = await syncLiquidEntrySubstances(intake.id, {
        timestamp: intake.timestamp,
        waterMl: 500,
        caffeineMg: null,
        alcoholAbv: 5,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const updated = await db.intakeRecords.get(intake.id);
      const subs = await db.substanceRecords
        .where("groupId").equals(updated!.groupId!).toArray();
      expect(subs).toHaveLength(1);
      expect(subs[0]?.type).toBe("alcohol");
      expect(subs[0]?.abvPercent).toBe(5);
      expect(subs[0]?.amountStandardDrinks).toBeGreaterThan(0);
      expect(subs[0]?.volumeMl).toBe(500);
    });

    it("creates a sugar IntakeRecord linked by groupId", async () => {
      const intake = makeIntakeRecord({ type: "water", amount: 330, source: "beverage:soda" });
      await db.intakeRecords.add(intake);

      const result = await syncLiquidEntrySubstances(intake.id, {
        timestamp: intake.timestamp,
        waterMl: 330,
        caffeineMg: null,
        alcoholAbv: null,
        sugarG: 35,
      });
      expect(result.success).toBe(true);

      const updated = await db.intakeRecords.get(intake.id);
      const groupIntakes = await db.intakeRecords
        .where("groupId").equals(updated!.groupId!).toArray();
      const sugar = groupIntakes.find((r) => r.type === "sugar");
      expect(sugar?.amount).toBe(35);
      expect(sugar?.source).toBe("manual:sugar");
    });

    it("leaves existing substance untouched when corresponding patch field is null", async () => {
      const { groupId, intakeIds } = await seedComposableGroup({
        intakes: [{ type: "water", amount: 250 }],
        substance: { type: "caffeine", amountMg: 95, description: "Coffee" },
      });

      const result = await syncLiquidEntrySubstances(intakeIds[0]!, {
        timestamp: 1700000000000,
        waterMl: 250,
        caffeineMg: null, // leave caffeine alone
        alcoholAbv: null,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const subs = await db.substanceRecords
        .where("groupId").equals(groupId).toArray();
      expect(subs).toHaveLength(1);
      expect(subs[0]?.amountMg).toBe(95);
      expect(subs[0]?.deletedAt).toBeNull();
    });

    it("does not generate a groupId when no substance/sugar values are supplied", async () => {
      const intake = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
      await db.intakeRecords.add(intake);

      const result = await syncLiquidEntrySubstances(intake.id, {
        timestamp: intake.timestamp,
        waterMl: 250,
        caffeineMg: 0,
        alcoholAbv: 0,
        sugarG: 0,
      });
      expect(result.success).toBe(true);

      const updated = await db.intakeRecords.get(intake.id);
      expect(updated?.groupId).toBeUndefined();
    });
  });

  describe("recalculateFromCurrentValues", () => {
    it("Test 28: returns err with 'Not implemented' message and no side effects", async () => {
      const { groupId } = await seedComposableGroup({
        eating: { note: "No recalc" },
        intakes: [{ type: "water", amount: 100 }],
      });

      const result = await recalculateFromCurrentValues(groupId);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain("Not implemented");

      // Verify no side effects — records unchanged
      const group = await getEntryGroup(groupId);
      expect(group!.eatings).toHaveLength(1);
      expect(group!.intakes).toHaveLength(1);
    });
  });

  // ─── Edit path: must update, never duplicate ────────────────────────

  describe("syncLiquidEntrySubstances does not duplicate a grouped substance", () => {
    it("updates the existing alcohol record instead of creating a second one", async () => {
      // The deterministic half of issue #322: one tap, one typed number,
      // doubled standard drinks. It happened because the drink's two halves
      // carried no shared groupId, so this reconciler — which keys only on
      // groupId — found nothing and took its create branch.
      const drink = await logDrink({
        volumeMl: 568,
        description: "Pint of lager",
        abvPercent: 5,
      });
      expect(drink.success).toBe(true);
      if (!drink.success) return;

      const result = await syncLiquidEntrySubstances(drink.data.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 568,
        description: "Pint of lager",
        caffeineMg: null,
        alcoholAbv: 5.5,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const alcohols = (await db.substanceRecords.toArray()).filter(
        (r) => r.type === "alcohol" && r.deletedAt === null,
      );
      expect(alcohols).toHaveLength(1);
      expect(alcohols[0]!.abvPercent).toBe(5.5);
    });

    it("updates the existing caffeine record instead of creating a second one", async () => {
      const drink = await logDrink({
        volumeMl: 250,
        description: "Latte",
        caffeineMg: 80,
      });
      expect(drink.success).toBe(true);
      if (!drink.success) return;

      await syncLiquidEntrySubstances(drink.data.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 250,
        caffeineMg: 95,
        alcoholAbv: null,
        sugarG: null,
      });

      const caffeines = (await db.substanceRecords.toArray()).filter(
        (r) => r.type === "caffeine" && r.deletedAt === null,
      );
      expect(caffeines).toHaveLength(1);
      expect(caffeines[0]!.amountMg).toBe(95);
    });

    it("keeps the drink at one water row through an edit", async () => {
      const drink = await logDrink({
        volumeMl: 500,
        description: "Beer",
        abvPercent: 5,
      });
      expect(drink.success).toBe(true);
      if (!drink.success) return;

      await syncLiquidEntrySubstances(drink.data.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 500,
        caffeineMg: null,
        alcoholAbv: 6,
        sugarG: 3,
      });

      const water = (await db.intakeRecords.where("type").equals("water").toArray())
        .filter((r) => r.deletedAt === null);
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(500);
    });
  });

  // ─── Drink volume ≠ water amount (ai-routes-models#9) ───────────────

  describe("syncLiquidEntrySubstances keeps the drink volume separate from the water", () => {
    async function logSpirit() {
      // 45 ml at 60% water → a 27 ml water row; the alcohol stays at 45 ml.
      const drink = await logDrink({
        volumeMl: 45,
        description: "Vodka",
        abvPercent: 40,
        waterContentPercent: 60,
      });
      if (!drink.success) throw new Error("logDrink failed");
      return drink.data;
    }

    it("does not shrink the alcohol dose on a time-only edit", async () => {
      const drink = await logSpirit();
      const before = (await db.substanceRecords.get(drink.substanceIds[0]!))!;

      await syncLiquidEntrySubstances(drink.waterIntakeId, {
        timestamp: Date.now() - 60_000,
        waterMl: 27,
        previousWaterMl: 27,
        caffeineMg: null,
        alcoholAbv: 40,
        sugarG: null,
      });

      const after = (await db.substanceRecords.get(drink.substanceIds[0]!))!;
      expect(after.volumeMl).toBe(45);
      expect(after.amountStandardDrinks).toBe(before.amountStandardDrinks);
      expect(after.amountStandardDrinks).toBe(
        parseFloat(standardDrinksFromAbv(40, 45).toFixed(2)),
      );
    });

    it("scales the drink volume with the water when the amount changes", async () => {
      const drink = await logSpirit();

      // Doubling the water (27 → 54 ml) means a double measure: 90 ml.
      await syncLiquidEntrySubstances(drink.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 54,
        previousWaterMl: 27,
        caffeineMg: null,
        alcoholAbv: 40,
        sugarG: null,
      });

      const after = (await db.substanceRecords.get(drink.substanceIds[0]!))!;
      expect(after.volumeMl).toBe(90);
      expect(after.amountStandardDrinks).toBe(
        parseFloat(standardDrinksFromAbv(40, 90).toFixed(2)),
      );
    });

    it("gives a newly added substance the drink's volume, not the water amount", async () => {
      const drink = await logSpirit();

      await syncLiquidEntrySubstances(drink.waterIntakeId, {
        timestamp: Date.now(),
        waterMl: 27,
        previousWaterMl: 27,
        caffeineMg: 20,
        alcoholAbv: null,
        sugarG: null,
      });

      const caffeine = (await db.substanceRecords.toArray()).find(
        (r) => r.type === "caffeine" && r.deletedAt === null,
      );
      expect(caffeine!.volumeMl).toBe(45);
    });
  });

  // ─── Delete scope ───────────────────────────────────────────────────

  describe("classifyLiquidDelete", () => {
    it("takes the whole group for a drink", async () => {
      // Deleting a drink's fluid row used to leave its caffeine/alcohol record
      // alive and still counting, while deleting the substance cascaded — the
      // two directions disagreed.
      const drink = await logDrink({
        volumeMl: 250,
        description: "Coffee",
        caffeineMg: 95,
      });
      expect(drink.success).toBe(true);
      if (!drink.success) return;

      const scope = await classifyLiquidDelete(drink.data.waterIntakeId);
      expect(scope.scope).toBe("group");
      if (scope.scope !== "group") return;
      expect(scope.groupId).toBe(drink.data.groupId);
    });

    it("deletes only the row for a meal's water-content component", async () => {
      // A meal must survive having its water-content row removed.
      const meal = await addComposableEntry({
        eating: { note: "Soup", grams: 400 },
        intakes: [
          { type: "water", amount: 300, source: "manual:food_water_content" },
          { type: "salt", amount: 900, source: "manual:sodium" },
        ],
      });
      expect(meal.success).toBe(true);
      if (!meal.success) return;

      const waterId = meal.data.intakeIds[0]!;
      expect((await classifyLiquidDelete(waterId)).scope).toBe("record");
    });

    it("deletes only the row for an ungrouped plain water entry", async () => {
      const record = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
      await db.intakeRecords.add(record);
      expect((await classifyLiquidDelete(record.id)).scope).toBe("record");
    });

    it("takes the whole group for a beverage with sugar but no substance", async () => {
      // Deleting the water row alone left the drink's sugar counting toward
      // the daily total with no Liquids entry to reach it from.
      const entry = await addComposableEntry({
        intakes: [
          { type: "water", amount: 330, source: "beverage:Juice" },
          { type: "sugar", amount: 30, source: "manual:sugar" },
        ],
      });
      expect(entry.success).toBe(true);
      if (!entry.success) return;
      expect((await classifyLiquidDelete(entry.data.intakeIds[0]!)).scope).toBe("group");
    });

    it("takes the whole group for a solute-only drink logged via logDrink", async () => {
      const drink = await logDrink({ volumeMl: 250, description: "Broth", saltMg: 400, sugarG: 5 });
      if (!drink.success) throw new Error("logDrink failed");
      const scope = await classifyLiquidDelete(drink.data.waterIntakeId);
      expect(scope.scope).toBe("group");

      if (scope.scope !== "group") return;
      await deleteEntryGroup(scope.groupId);
      const live = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
      expect(live).toHaveLength(0);
    });

    it("deletes only the row for a non-water member of a drink group", async () => {
      const drink = await logDrink({ volumeMl: 250, description: "Cola", sugarG: 27 });
      if (!drink.success) throw new Error("logDrink failed");
      const sugarId = drink.data.intakeIds.find((id) => id !== drink.data.waterIntakeId)!;
      expect((await classifyLiquidDelete(sugarId)).scope).toBe("record");
    });
  });

  // ─── Meal (eating) group operations ─────────────────────────────────

  describe("deleteEatingEntry", () => {
    it("tombstones the meal and every live row in its group", async () => {
      const meal = await addComposableEntry({
        eating: { note: "Pizza" },
        intakes: [
          { type: "salt", amount: 1200, source: "manual:sodium" },
          { type: "water", amount: 150, source: "manual:food_water_content" },
          { type: "sugar", amount: 8, source: "manual:sugar" },
        ],
      });
      if (!meal.success) throw new Error("add failed");

      const result = await deleteEatingEntry(meal.data.eatingId!);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.deletedCount).toBe(4);

      const liveIntakes = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
      expect(liveIntakes).toHaveLength(0);
      expect((await db.eatingRecords.get(meal.data.eatingId!))!.deletedAt).toBe(result.data.deletedAt);
    });

    it("undo restores the meal group but not a row removed earlier", async () => {
      const meal = await addComposableEntry({
        eating: { note: "Salad" },
        intakes: [
          { type: "salt", amount: 300, source: "manual:sodium" },
          { type: "water", amount: 100, source: "manual:food_water_content" },
        ],
      });
      if (!meal.success) throw new Error("add failed");
      const [saltId, waterId] = meal.data.intakeIds;
      await db.intakeRecords.update(waterId!, { deletedAt: 1700000000000 });

      const del = await deleteEatingEntry(meal.data.eatingId!);
      if (!del.success) throw new Error("delete failed");
      const undo = await undoDeleteEatingEntry(meal.data.eatingId!, del.data.deletedAt);
      expect(undo.success).toBe(true);

      expect((await db.eatingRecords.get(meal.data.eatingId!))!.deletedAt).toBeNull();
      expect((await db.intakeRecords.get(saltId!))!.deletedAt).toBeNull();
      expect((await db.intakeRecords.get(waterId!))!.deletedAt).toBe(1700000000000);
    });

    it("deletes and restores an ungrouped plain meal", async () => {
      const record = makeEatingRecord({ note: "Toast" });
      await db.eatingRecords.add(record);

      const del = await deleteEatingEntry(record.id);
      if (!del.success) throw new Error("delete failed");
      expect((await db.eatingRecords.get(record.id))!.deletedAt).toBeTypeOf("number");
      await undoDeleteEatingEntry(record.id, del.data.deletedAt);
      expect((await db.eatingRecords.get(record.id))!.deletedAt).toBeNull();
    });

    it("returns an error for a missing eating record", async () => {
      expect((await deleteEatingEntry("nope")).success).toBe(false);
    });
  });

  describe("updateEatingEntry", () => {
    it("moves every live group member to the new time and can clear the note", async () => {
      const ts = Date.now() - 3 * 86_400_000;
      const meal = await addComposableEntry(
        {
          eating: { note: "Dinner" },
          intakes: [
            { type: "salt", amount: 1400, source: "manual:sodium" },
            { type: "water", amount: 200, source: "manual:food_water_content" },
          ],
        },
        ts,
      );
      if (!meal.success) throw new Error("add failed");

      const newTs = ts - 3_600_000;
      const result = await updateEatingEntry(meal.data.eatingId!, { timestamp: newTs, note: undefined });
      expect(result.success).toBe(true);

      const eating = await db.eatingRecords.get(meal.data.eatingId!);
      expect(eating!.timestamp).toBe(newTs);
      expect(eating!.note).toBeUndefined();
      for (const id of meal.data.intakeIds) {
        expect((await db.intakeRecords.get(id))!.timestamp).toBe(newTs);
      }
    });

    it("leaves the note alone when the key is absent", async () => {
      const meal = await addComposableEntry({ eating: { note: "Keep me" } });
      if (!meal.success) throw new Error("add failed");
      await updateEatingEntry(meal.data.eatingId!, { timestamp: 1_700_000_000_000 });
      expect((await db.eatingRecords.get(meal.data.eatingId!))!.note).toBe("Keep me");
    });

    it("returns an error for a missing eating record", async () => {
      expect((await updateEatingEntry("nope", { timestamp: 1 })).success).toBe(false);
    });
  });

  describe("syncEatingGroup reconciles legacy-sourced rows", () => {
    it("updates a legacy food:ai_parse salt row instead of adding a second one", async () => {
      const { eatingId } = await seedComposableGroup({
        eating: { note: "Old meal" },
        intakes: [
          { type: "salt", amount: 800, source: "food:ai_parse" },
          { type: "water", amount: 100, source: "food:ai_parse" },
        ],
      });

      const result = await syncEatingGroup(eatingId!, {
        timestamp: Date.now(),
        note: "Old meal",
        grams: undefined,
        sodiumMg: 800,
        sodiumKind: "sodium",
        waterMl: 100,
      });
      expect(result.success).toBe(true);

      const live = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
      expect(live.filter((r) => r.type === "salt").map((r) => r.amount)).toEqual([800]);
      expect(live.filter((r) => r.type === "water").map((r) => r.amount)).toEqual([100]);
    });

    it("moves an untouched sugar row with the meal when the tracker is off", async () => {
      const ts = Date.now() - 86_400_000;
      const meal = await addComposableEntry(
        {
          eating: { note: "Cake" },
          intakes: [
            { type: "salt", amount: 200, source: "manual:sodium" },
            { type: "sugar", amount: 30, source: "manual:sugar" },
          ],
        },
        ts,
      );
      if (!meal.success) throw new Error("add failed");
      const newTs = Date.now();
      await syncEatingGroup(meal.data.eatingId!, {
        timestamp: newTs,
        note: "Cake",
        grams: undefined,
        sodiumMg: 200,
        sodiumKind: "sodium",
        waterMl: 0,
      });
      const sugar = (await db.intakeRecords.toArray()).find((r) => r.type === "sugar")!;
      expect(sugar.deletedAt).toBeNull();
      expect(sugar.amount).toBe(30);
      expect(sugar.timestamp).toBe(newTs);
    });
  });

  describe("syncLiquidEntrySubstances keeps the group together", () => {
    it("moves salt, potassium and untouched sugar rows with the drink", async () => {
      const ts = Date.now() - 3 * 86_400_000;
      const drink = await logDrink({
        volumeMl: 250,
        description: "Sports drink",
        caffeineMg: 80,
        sugarG: 10,
        saltMg: 100,
        potassiumMg: 50,
        timestamp: ts,
      });
      if (!drink.success) throw new Error("logDrink failed");
      const newTs = Date.now();
      await db.intakeRecords.update(drink.data.waterIntakeId, { timestamp: newTs });

      const result = await syncLiquidEntrySubstances(drink.data.waterIntakeId, {
        timestamp: newTs,
        waterMl: 250,
        caffeineMg: 80,
        alcoholAbv: null,
        sugarG: null,
      });
      expect(result.success).toBe(true);

      const intakes = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
      expect(intakes).toHaveLength(4);
      for (const r of intakes) expect(r.timestamp).toBe(newTs);
      const subs = (await db.substanceRecords.toArray()).filter((r) => r.deletedAt === null);
      for (const r of subs) expect(r.timestamp).toBe(newTs);
    });

    it("re-times a meal as a whole and leaves its sugar alone when its water row is edited", async () => {
      const ts = Date.now() - 86_400_000;
      const meal = await addComposableEntry(
        {
          eating: { note: "Banana" },
          intakes: [
            { type: "water", amount: 90, source: "manual:food_water_content" },
            { type: "sugar", amount: 14, source: "manual:sugar" },
            { type: "potassium", amount: 420, source: "manual:potassium" },
          ],
        },
        ts,
      );
      if (!meal.success) throw new Error("add failed");
      const waterId = meal.data.intakeIds[0]!;
      const newTs = Date.now();
      await db.intakeRecords.update(waterId, { timestamp: newTs });

      await syncLiquidEntrySubstances(waterId, {
        timestamp: newTs,
        waterMl: 90,
        caffeineMg: 50,
        alcoholAbv: null,
        sugarG: 0,
      });

      // No substance is attached to a meal, and its sugar is not cleared.
      expect(await db.substanceRecords.count()).toBe(0);
      const sugar = await db.intakeRecords.get(meal.data.intakeIds[1]!);
      expect(sugar!.deletedAt).toBeNull();
      expect(sugar!.amount).toBe(14);
      // The meal moved as one unit.
      expect((await db.eatingRecords.get(meal.data.eatingId!))!.timestamp).toBe(newTs);
      for (const id of meal.data.intakeIds) {
        expect((await db.intakeRecords.get(id))!.timestamp).toBe(newTs);
      }
    });
  });

  describe("single-record helpers check the row exists", () => {
    it("returns an error and queues nothing for a missing id", async () => {
      const before = await db._syncQueue.count();
      expect((await deleteSingleGroupRecord("intakeRecords", "nope")).success).toBe(false);
      expect((await undoDeleteSingleRecord("intakeRecords", "nope")).success).toBe(false);
      expect(await db._syncQueue.count()).toBe(before);
    });
  });
});
