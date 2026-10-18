import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeEatingRecord, makeIntakeRecord, seedComposableGroup } from "@/__tests__/fixtures/db-fixtures";
import { logDrink, editDrink } from "@/lib/drink-service";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  getEntryGroup,
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

    it("Test 3: refuses a drink, which only logDrink may write (issue #322)", async () => {
      // A water row with no meal is a drink. Writing one here would skip the
      // Drink module, which books a drink's fluid exactly once.
      const drink = await addComposableEntry({
        intakes: [
          { type: "water", amount: 330, source: "beverage" },
          { type: "sugar", amount: 20, source: "manual:sugar" },
        ],
        substance: { type: "caffeine", amountMg: 95, description: "Cola" },
      });
      expect(drink.success).toBe(false);
      expect(await db.intakeRecords.count()).toBe(0);
      expect(await db.substanceRecords.count()).toBe(0);
    });

    it("Test 3b: records a dose and its solutes, with no water", async () => {
      const result = await addComposableEntry({
        substance: { type: "caffeine", amountMg: 95, description: "Black coffee" },
        intakes: [{ type: "sugar", amount: 5, source: "manual:sugar" }],
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.eatingId).toBeUndefined();
      expect(await db.intakeRecords.where("type").equals("water").count()).toBe(0);
      const substance = await db.substanceRecords.get(result.data.substanceId!);
      expect(substance?.groupId).toBe(result.data.groupId);
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
      await editDrink(drink.data.waterIntakeId, {
        volumeMl: 250,
        timestamp: Date.now(),
        caffeineMg: 0,
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

  // ─── doses ──────────────────────────────────────────────────────────

  describe("doses", () => {
    it("a dose fills substanceId, and substanceIds has 1 element", async () => {
      const result = await addComposableEntry({
        substance: { type: "caffeine", amountMg: 95, description: "Black coffee" },
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.substanceId).toBeTruthy();
      expect(result.data.substanceIds).toEqual([result.data.substanceId]);
      expect(result.data.intakeIds).toHaveLength(0);
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

  // Salt is not sodium: a sodium row keeps what the user typed (2 g of salt)
  // next to the converted sodium mg it stores in `amount`.
  describe("sodium entered as salt, MSG or sodium", () => {
    it("addComposableEntry stores the entered source on the sodium row", async () => {
      const result = await addComposableEntry({
        eating: { note: "Soup" },
        intakes: [
          {
            type: "salt",
            amount: 786,
            source: "manual:salt",
            sodiumSource: "salt",
            sourceAmount: 2,
            sourceUnit: "g",
          },
        ],
      });
      if (!result.success) throw new Error("add failed");
      const row = (await db.intakeRecords.toArray()).find((r) => r.type === "salt")!;
      expect(row).toMatchObject({
        amount: 786,
        sodiumSource: "salt",
        sourceAmount: 2,
        sourceUnit: "g",
      });
    });

    it("syncEatingGroup writes the new entered source when sodium is edited", async () => {
      const { eatingId } = await seedComposableGroup({
        eating: { note: "Stir fry" },
        intakes: [{ type: "salt", amount: 500, source: "manual:sodium" }],
      });
      await syncEatingGroup(eatingId!, {
        timestamp: Date.now(),
        note: "Stir fry",
        grams: undefined,
        sodiumMg: 123,
        sodiumKind: "msg",
        sodiumEntry: { amount: 1, unit: "g" },
        waterMl: 0,
      });
      const row = (await db.intakeRecords.toArray()).find((r) => r.type === "salt")!;
      expect(row).toMatchObject({
        amount: 123,
        source: "manual:msg",
        sodiumSource: "msg",
        sourceAmount: 1,
        sourceUnit: "g",
      });
    });

    it("leaves a legacy sodium row's value and source untouched when its sodium is not edited", async () => {
      // Legacy row: sodium mg typed as salt before the source fields existed.
      const { eatingId } = await seedComposableGroup({
        eating: { note: "Chips" },
        intakes: [{ type: "salt", amount: 780, source: "manual:salt" }],
      });
      await syncEatingGroup(eatingId!, {
        timestamp: Date.now(),
        note: "Chips, salted",
        grams: undefined,
        sodiumMg: 780,
        sodiumKind: "sodium",
        waterMl: 0,
      });
      const row = (await db.intakeRecords.toArray()).find((r) => r.type === "salt")!;
      expect(row.amount).toBe(780);
      expect(row.source).toBe("manual:salt");
      expect(row.sodiumSource).toBeUndefined();
      expect(row.sourceAmount).toBeUndefined();
    });

    it("drops a stale entered source when the sodium mg changes without one", async () => {
      const result = await addComposableEntry({
        eating: { note: "Soup" },
        intakes: [
          { type: "salt", amount: 786, source: "manual:salt", sodiumSource: "salt", sourceAmount: 2, sourceUnit: "g" },
        ],
      });
      if (!result.success) throw new Error("add failed");
      await syncEatingGroup(result.data.eatingId!, {
        timestamp: Date.now(),
        note: "Soup",
        grams: undefined,
        sodiumMg: 900,
        sodiumKind: "sodium",
        waterMl: 0,
      });
      const row = (await db.intakeRecords.toArray()).find((r) => r.type === "salt")!;
      expect(row.amount).toBe(900);
      expect(row.sodiumSource).toBeUndefined();
      expect(row.sourceAmount).toBeUndefined();
      expect(row.sourceUnit).toBeUndefined();
    });
  });
});

describe("composable-entry-service: soft deletes queue as deletes", () => {
  const opsById = async () =>
    new Map((await db._syncQueue.toArray()).map((q) => [q.recordId, q.op]));

  it("deleteEntryGroup queues every tombstoned row as a delete op", async () => {
    const meal = await addComposableEntry({
      eating: { note: "Soup", grams: 300 },
      intakes: [
        { type: "water", amount: 200, source: "manual:food_water_content" },
        { type: "salt", amount: 600, source: "manual:sodium" },
      ],
    });
    expect(meal.success).toBe(true);
    if (!meal.success) return;
    await db._syncQueue.clear();

    expect((await deleteEntryGroup(meal.data.groupId)).success).toBe(true);

    const ops = await opsById();
    for (const id of [meal.data.eatingId!, ...meal.data.intakeIds]) {
      expect(ops.get(id)).toBe("delete");
    }
  });

  it("deleteEatingEntry queues an ungrouped meal as a delete op", async () => {
    await db.eatingRecords.add(makeEatingRecord({ id: "lone-meal" }));

    expect((await deleteEatingEntry("lone-meal")).success).toBe(true);

    expect((await opsById()).get("lone-meal")).toBe("delete");
  });

  it("syncEatingGroup queues a removed nutrient row as a delete op", async () => {
    const meal = await addComposableEntry({
      eating: { note: "Crisps", grams: 50 },
      intakes: [{ type: "salt", amount: 400, source: "manual:sodium" }],
    });
    expect(meal.success).toBe(true);
    if (!meal.success) return;
    await db._syncQueue.clear();

    const result = await syncEatingGroup(meal.data.eatingId!, {
      timestamp: Date.now(),
      note: "Crisps",
      grams: 50,
      sodiumMg: 0,
      sodiumKind: "sodium",
      waterMl: 0,
    });
    expect(result.success).toBe(true);

    const salt = meal.data.intakeIds[0]!;
    expect((await db.intakeRecords.get(salt))!.deletedAt).toBeTypeOf("number");
    const ops = await opsById();
    expect(ops.get(salt)).toBe("delete");
    expect(ops.get(meal.data.eatingId!)).toBe("upsert");
  });
});
