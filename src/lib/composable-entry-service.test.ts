import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { makeEatingRecord, makeIntakeRecord, makeSubstanceRecord, seedComposableGroup } from "@/__tests__/fixtures/db-fixtures";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  getEntryGroup,
  deleteSingleGroupRecord,
  undoDeleteSingleRecord,
  recalculateFromCurrentValues,
  type ComposableEntryInput,
} from "./composable-entry-service";

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
      const intake = await db.intakeRecords.get(result.data.intakeIds[0]);
      expect(eating?.groupId).toBe(result.data.groupId);
      expect(intake?.groupId).toBe(result.data.groupId);
    });

    it("Test 3: creates only substance + linked water intake when eating is undefined", async () => {
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
      // substance with volumeMl creates a linked water intake
      expect(result.data.intakeIds.length).toBeGreaterThanOrEqual(1);

      // Verify all share groupId
      const substance = await db.substanceRecords.get(result.data.substanceId!);
      expect(substance?.groupId).toBe(result.data.groupId);

      for (const id of result.data.intakeIds) {
        const intake = await db.intakeRecords.get(id);
        expect(intake?.groupId).toBe(result.data.groupId);
      }
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
      const intake = await db.intakeRecords.get(result.data.intakeIds[0]);
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

      const intake = await db.intakeRecords.get(result.data.intakeIds[0]);
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

      const intake = await db.intakeRecords.get(result.data.intakeIds[0]);
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
      const originalRandomUUID = crypto.randomUUID;
      let callCount = 0;
      crypto.randomUUID = () => {
        callCount++;
        // First call = groupId, second call = eating record, third call = intake record
        if (callCount === 3) return existingRecord.id;
        return originalRandomUUID.call(crypto);
      };

      try {
        const result = await addComposableEntry(input);
        expect(result.success).toBe(false);
      } finally {
        crypto.randomUUID = originalRandomUUID;
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
      const { groupId, eatingId } = await seedComposableGroup({
        eating: { note: "Pre-deleted", deletedAt: 1700000000000 },
        intakes: [{ type: "water", amount: 200 }],
      });

      const result = await deleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;
      // Only the intake record should be counted (eating already deleted)
      expect(result.data.deletedCount).toBe(1);
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

      const intake = await db.intakeRecords.get(intakeIds[0]);
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
      await deleteEntryGroup(groupId);
      const result = await undoDeleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();

      const intake = await db.intakeRecords.get(intakeIds[0]);
      expect(intake?.deletedAt).toBeNull();
    });

    it("Test 15: returns restoredCount matching total restored", async () => {
      const { groupId } = await seedComposableGroup({
        eating: { note: "Count me" },
        intakes: [{ type: "water", amount: 100 }, { type: "salt", amount: 200 }],
      });

      await deleteEntryGroup(groupId);
      const result = await undoDeleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.restoredCount).toBe(3); // eating + 2 intakes
    });

    it("Test 16: only restores records with non-null deletedAt", async () => {
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Active" },
        intakes: [{ type: "water", amount: 100 }],
      });

      // Only soft-delete the eating record manually
      await db.eatingRecords.update(eatingId!, { deletedAt: Date.now() });

      const result = await undoDeleteEntryGroup(groupId);
      expect(result.success).toBe(true);
      if (!result.success) return;
      // Only eating was deleted, so only 1 restored
      expect(result.data.restoredCount).toBe(1);

      // The intake that was never deleted should still be fine
      const intake = await db.intakeRecords.get(intakeIds[0]);
      expect(intake?.deletedAt).toBeNull();
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
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Keep eating" },
        intakes: [{ type: "water", amount: 200 }, { type: "salt", amount: 300 }],
      });

      const result = await deleteSingleGroupRecord("intakeRecords", intakeIds[0]);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.table).toBe("intakeRecords");
      expect(result.data.id).toBe(intakeIds[0]);

      // Deleted record
      const deleted = await db.intakeRecords.get(intakeIds[0]);
      expect(deleted?.deletedAt).toBeTypeOf("number");

      // Other group members intact
      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeNull();

      const otherIntake = await db.intakeRecords.get(intakeIds[1]);
      expect(otherIntake?.deletedAt).toBeNull();
    });

    it("Test 22: soft-deletes a single eating record, leaving other group members intact", async () => {
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Delete just me" },
        intakes: [{ type: "water", amount: 100 }],
      });

      const result = await deleteSingleGroupRecord("eatingRecords", eatingId!);
      expect(result.success).toBe(true);

      const eating = await db.eatingRecords.get(eatingId!);
      expect(eating?.deletedAt).toBeTypeOf("number");

      const intake = await db.intakeRecords.get(intakeIds[0]);
      expect(intake?.deletedAt).toBeNull();
    });

    it("Test 23: soft-deletes a single substance record, leaving other group members intact", async () => {
      const { groupId, eatingId, substanceId } = await seedComposableGroup({
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

      const result = await deleteSingleGroupRecord("intakeRecords", intakeIds[0]);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({ table: "intakeRecords", id: intakeIds[0] });
    });
  });

  // ─── undoDeleteSingleRecord ─────────────────────────────────────────

  describe("undoDeleteSingleRecord", () => {
    it("Test 25: restores a single soft-deleted intake record, other group members unchanged", async () => {
      const { groupId, eatingId, intakeIds } = await seedComposableGroup({
        eating: { note: "Untouched" },
        intakes: [{ type: "water", amount: 200 }],
      });

      // Delete then undo
      await deleteSingleGroupRecord("intakeRecords", intakeIds[0]);
      const result = await undoDeleteSingleRecord("intakeRecords", intakeIds[0]);
      expect(result.success).toBe(true);

      const intake = await db.intakeRecords.get(intakeIds[0]);
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

      await deleteSingleGroupRecord("intakeRecords", intakeIds[0]);
      const result = await undoDeleteSingleRecord("intakeRecords", intakeIds[0]);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({ table: "intakeRecords", id: intakeIds[0] });
    });
  });

  // ─── recalculateFromCurrentValues (stub) ────────────────────────────

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
});
