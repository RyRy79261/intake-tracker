import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  logDrink,
  editDrink,
  deleteDrink,
  getDrink,
  findDrinkWaterId,
  drinkAmounts,
  drinkFromRecipe,
  formatStandardDrinks,
  standardDrinks,
  type EditDrinkInput,
} from "@/lib/drink-service";
import { addComposableEntry, undoDeleteEntryGroup } from "@/lib/composable-entry-service";
import { addSubstanceRecord } from "@/lib/substance-service";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import { standardDrinksFromAbv } from "@intake/core/alcohol";

/**
 * Count every live water row, unscoped by source.
 *
 * The assertion that matters for issue #322 is the *total*. The suite already
 * had `where("source").equals("substance:<id>")` counts, and they passed
 * throughout the bug: a second water row written by another caller carries a
 * different source, so a source-scoped count is structurally blind to exactly
 * the duplicate we care about.
 */
async function waterRows() {
  return (await db.intakeRecords.where("type").equals("water").toArray()).filter(
    (r) => r.deletedAt === null,
  );
}

describe("drink-service: logDrink", () => {
  describe("the water-count invariant", () => {
    it("writes exactly one water row for a caffeinated drink", async () => {
      const result = await logDrink({
        volumeMl: 250,
        description: "Latte",
        caffeineMg: 80,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const water = await waterRows();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(250);
    });

    it("writes exactly one water row for an alcoholic drink", async () => {
      // The headline repro from #322: a 500 ml beer must move hydration by
      // 500 ml, not 1000.
      const result = await logDrink({
        volumeMl: 500,
        description: "Beer",
        abvPercent: 5,
      });
      expect(result.success).toBe(true);

      const water = await waterRows();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(500);
      expect(water.reduce((sum, r) => sum + r.amount, 0)).toBe(500);
    });

    it("writes exactly one water row for a drink with every solute set", async () => {
      const result = await logDrink({
        volumeMl: 330,
        description: "Sweet iced coffee",
        caffeineMg: 90,
        sugarG: 25,
        saltMg: 40,
        potassiumMg: 120,
      });
      expect(result.success).toBe(true);

      const water = await waterRows();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(330);
    });

    it("does not let dissolved solutes displace the fluid volume", async () => {
      await logDrink({ volumeMl: 60, description: "Ice lolly", sugarG: 10 });
      const water = await waterRows();
      expect(water[0]!.amount).toBe(60);
    });

    it("rejects a drink with no positive volume rather than writing a half-entry", async () => {
      for (const volumeMl of [0, -100, Number.NaN]) {
        const result = await logDrink({ volumeMl, description: "Nothing" });
        expect(result.success).toBe(false);
      }
      expect(await waterRows()).toHaveLength(0);
      expect(await db.substanceRecords.count()).toBe(0);
    });
  });

  describe("the group invariant", () => {
    it("stamps one shared groupId on every record it writes", async () => {
      const result = await logDrink({
        volumeMl: 500,
        description: "Cider",
        abvPercent: 4.5,
        sugarG: 20,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const { groupId } = result.data;
      expect(groupId).toBeTruthy();

      for (const id of result.data.intakeIds) {
        expect((await db.intakeRecords.get(id))!.groupId).toBe(groupId);
      }
      for (const id of result.data.substanceIds) {
        expect((await db.substanceRecords.get(id))!.groupId).toBe(groupId);
      }
      // A group with no groupId on one half is what let the edit reconciler
      // create a duplicate substance instead of updating the existing one.
      expect(result.data.substanceIds.length).toBeGreaterThan(0);
    });

    it("returns the derived water row's id", async () => {
      const result = await logDrink({ volumeMl: 200, description: "Juice" });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const water = await db.intakeRecords.get(result.data.waterIntakeId);
      expect(water!.type).toBe("water");
      expect(water!.amount).toBe(200);
      expect(result.data.intakeIds).toContain(result.data.waterIntakeId);
    });
  });

  describe("substance records", () => {
    it("stores volumeMl on the substance as data", async () => {
      const result = await logDrink({
        volumeMl: 568,
        description: "Pint of lager",
        abvPercent: 5,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const alcohol = await db.substanceRecords.get(result.data.substanceIds[0]!);
      // Callers used to omit this to suppress the auto-water side effect,
      // leaving nothing for a later volume edit to sync against.
      expect(alcohol!.volumeMl).toBe(568);
      expect(alcohol!.abvPercent).toBe(5);
    });

    it("derives amountStandardDrinks from abv + volume at one precision", async () => {
      const result = await logDrink({
        volumeMl: 568,
        description: "Pint",
        abvPercent: 5,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const alcohol = await db.substanceRecords.get(result.data.substanceIds[0]!);
      expect(alcohol!.amountStandardDrinks).toBe(
        parseFloat(standardDrinksFromAbv(5, 568).toFixed(2)),
      );
    });

    it("writes both substances for a drink that is caffeinated and alcoholic", async () => {
      const result = await logDrink({
        volumeMl: 300,
        description: "Espresso martini",
        caffeineMg: 60,
        abvPercent: 15,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.substanceIds).toHaveLength(2);
      // Still exactly one water row — two substances, one fluid.
      expect(await waterRows()).toHaveLength(1);
    });

    it("books the full drink volume as fluid intake, ethanol included", async () => {
      // Clinical intake/output charts and fluid restrictions count a drink at
      // its whole volume: 1000 ml of 5% beer is 1000 ml of fluid, not 950.
      const result = await logDrink({
        volumeMl: 1000,
        description: "Beer",
        abvPercent: 5,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const water = await waterRows();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(1000);
      const alcohol = await db.substanceRecords.get(result.data.substanceIds[0]!);
      expect(alcohol!.volumeMl).toBe(1000);
      expect(alcohol!.amountStandardDrinks).toBe(
        parseFloat(standardDrinksFromAbv(5, 1000).toFixed(2)),
      );
    });

    it("books a spirit at its full measure", async () => {
      await logDrink({ volumeMl: 45, description: "Vodka", abvPercent: 40 });
      expect((await waterRows())[0]!.amount).toBe(45);
    });

    it("books a non-alcoholic drink at its full volume", async () => {
      await logDrink({ volumeMl: 330, description: "Cola" });
      expect((await waterRows())[0]!.amount).toBe(330);
    });

    it("never books less than 1 ml of water for a tiny drink", async () => {
      await logDrink({ volumeMl: 0.4, description: "Drop" });
      expect((await waterRows())[0]!.amount).toBe(1);
    });

    it("omits substances when the drink has none", async () => {
      const result = await logDrink({ volumeMl: 250, description: "Herbal tea" });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.substanceIds).toHaveLength(0);
      expect(await waterRows()).toHaveLength(1);
    });
  });

  describe("solute rows", () => {
    it("writes salt / sugar / potassium as separate grouped intakes", async () => {
      const result = await logDrink({
        volumeMl: 330,
        description: "Sports drink",
        saltMg: 200,
        sugarG: 21,
        potassiumMg: 60,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const rows = await Promise.all(
        result.data.intakeIds.map((id) => db.intakeRecords.get(id)),
      );
      const byType = new Map(rows.map((r) => [r!.type, r!]));
      expect(byType.get("salt")!.amount).toBe(200);
      expect(byType.get("sugar")!.amount).toBe(21);
      expect(byType.get("potassium")!.amount).toBe(60);
      expect(byType.get("water")!.amount).toBe(330);
      expect(result.data.intakeIds).toHaveLength(4);
    });

    it("records the salt/MSG a drink's sodium was entered as", async () => {
      const result = await logDrink({
        volumeMl: 250,
        description: "Broth",
        saltMg: 786,
        sodiumEntry: { source: "salt", amount: 2, unit: "g" },
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const rows = await Promise.all(
        result.data.intakeIds.map((id) => db.intakeRecords.get(id)),
      );
      const sodium = rows.find((r) => r!.type === "salt")!;
      expect(sodium.amount).toBe(786);
      expect(sodium.source).toBe("manual:salt");
      expect(sodium).toMatchObject({ sodiumSource: "salt", sourceAmount: 2, sourceUnit: "g" });
      // The entered source never leaks onto the other rows of the group.
      const water = rows.find((r) => r!.type === "water")!;
      expect(water.sodiumSource).toBeUndefined();
    });

    it("leaves the source unknown when no sodium entry is given", async () => {
      const result = await logDrink({ volumeMl: 250, description: "Broth", saltMg: 300 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const rows = await Promise.all(
        result.data.intakeIds.map((id) => db.intakeRecords.get(id)),
      );
      const sodium = rows.find((r) => r!.type === "salt")!;
      expect(sodium.source).toBe("manual:sodium");
      expect("sodiumSource" in sodium).toBe(false);
      expect("sourceAmount" in sodium).toBe(false);
    });

    it("skips solute values that round to zero", async () => {
      // These columns are Postgres integers. Checking `> 0` on the raw value
      // and rounding afterwards wrote a solute row recording none of it.
      const result = await logDrink({
        volumeMl: 250,
        description: "Black coffee",
        caffeineMg: 95,
        sugarG: 0.4,
        saltMg: 0.2,
        potassiumMg: 0.49,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.intakeIds).toHaveLength(1);
      const rows = await db.intakeRecords.toArray();
      expect(rows.every((r) => r.amount > 0)).toBe(true);
    });

    it("keeps a solute that rounds up to a whole unit", async () => {
      const result = await logDrink({
        volumeMl: 250,
        description: "Lightly sweetened tea",
        sugarG: 0.6,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const sugar = await db.intakeRecords.where("type").equals("sugar").toArray();
      expect(sugar).toHaveLength(1);
      expect(sugar[0]!.amount).toBe(1);
    });

    it("skips zero and negative solute values", async () => {
      const result = await logDrink({
        volumeMl: 250,
        description: "Black coffee",
        caffeineMg: 95,
        sugarG: 0,
        saltMg: 0,
        potassiumMg: -5,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.intakeIds).toHaveLength(1);
    });
  });

  describe("sync + storage hygiene", () => {
    it("enqueues every record it writes", async () => {
      const result = await logDrink({
        volumeMl: 500,
        description: "Beer",
        abvPercent: 5,
        sugarG: 10,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queued = await db._syncQueue.toArray();
      const total =
        result.data.intakeIds.length + result.data.substanceIds.length;
      expect(queued).toHaveLength(total);
      const ids = new Set(queued.map((r) => r.recordId));
      for (const id of [...result.data.intakeIds, ...result.data.substanceIds]) {
        expect(ids.has(id)).toBe(true);
      }
    });

    it("rounds a fractional volume so the integer column cannot drop it", async () => {
      // `intake_records.amount` is a Postgres integer; a fractional value is
      // rejected by push validation and the op is silently dropped. "8 oz of
      // water" converts to 236.588 ml, so this is reachable in normal use.
      const result = await logDrink({ volumeMl: 236.588, description: "Water" });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const water = await db.intakeRecords.get(result.data.waterIntakeId);
      expect(water!.amount).toBe(237);
      expect(Number.isInteger(water!.amount)).toBe(true);
    });

    it("honours an explicit timestamp across every record", async () => {
      const ts = 1700000000000;
      const result = await logDrink({
        volumeMl: 250,
        description: "Tea",
        caffeineMg: 47,
        sugarG: 5,
        timestamp: ts,
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      for (const id of result.data.intakeIds) {
        expect((await db.intakeRecords.get(id))!.timestamp).toBe(ts);
      }
      for (const id of result.data.substanceIds) {
        expect((await db.substanceRecords.get(id))!.timestamp).toBe(ts);
      }
    });

    it("carries waterSource and groupSource through", async () => {
      const result = await logDrink({
        volumeMl: 250,
        description: "Flat white",
        caffeineMg: 80,
        waterSource: "preset:abc",
        groupSource: "preset:abc",
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const water = await db.intakeRecords.get(result.data.waterIntakeId);
      expect(water!.source).toBe("preset:abc");
      expect(water!.groupSource).toBe("preset:abc");
      const substance = await db.substanceRecords.get(result.data.substanceIds[0]!);
      expect(substance!.groupSource).toBe("preset:abc");
    });
  });
});

// ─── Edit ─────────────────────────────────────────────────────────────

async function live() {
  const intakes = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
  const substances = (await db.substanceRecords.toArray()).filter((r) => r.deletedAt === null);
  return { intakes, substances };
}

async function logged(input: Parameters<typeof logDrink>[0]) {
  const result = await logDrink(input);
  if (!result.success) throw new Error("logDrink failed");
  return result.data;
}

async function edited(waterId: string, input: Partial<EditDrinkInput>) {
  const water = (await db.intakeRecords.get(waterId))!;
  const result = await editDrink(waterId, {
    volumeMl: water.amount,
    timestamp: water.timestamp,
    note: water.note,
    ...input,
  });
  if (!result.success) throw new Error(result.error);
}

describe("drink-service: editDrink", () => {
  it("moves every row of the drink to the new time", async () => {
    const ts = Date.now() - 3 * 86_400_000;
    const drink = await logged({
      volumeMl: 250,
      description: "Sports drink",
      caffeineMg: 80,
      sugarG: 10,
      saltMg: 100,
      potassiumMg: 50,
      timestamp: ts,
    });
    const moved = Date.now() - 60_000;

    await edited(drink.waterIntakeId, { timestamp: moved });

    const { intakes, substances } = await live();
    expect(intakes).toHaveLength(4);
    expect(substances).toHaveLength(1);
    for (const r of [...intakes, ...substances]) expect(r.timestamp).toBe(moved);
  });

  it("keeps the strength when the volume changes", async () => {
    const drink = await logged({
      volumeMl: 250,
      description: "Cola",
      caffeineMg: 30,
      sugarG: 26,
      saltMg: 10,
      potassiumMg: 8,
    });

    await edited(drink.waterIntakeId, { volumeMl: 500 });

    const { intakes, substances } = await live();
    const amount = (type: string) => intakes.find((r) => r.type === type)!.amount;
    expect(amount("water")).toBe(500);
    expect(amount("sugar")).toBe(52);
    expect(amount("salt")).toBe(20);
    expect(amount("potassium")).toBe(16);
    expect(substances[0]!.amountMg).toBe(60);
    expect(substances[0]!.volumeMl).toBe(500);
  });

  it("keeps ABV and works out standard drinks again from the new volume", async () => {
    const drink = await logged({ volumeMl: 330, description: "Beer", abvPercent: 5 });

    await edited(drink.waterIntakeId, { volumeMl: 500 });

    const alcohol = (await live()).substances[0]!;
    expect(alcohol.abvPercent).toBe(5);
    expect(alcohol.volumeMl).toBe(500);
    expect(alcohol.amountStandardDrinks).toBe(standardDrinks(5, 500));
  });

  it("uses a typed value instead of the scaled one", async () => {
    const drink = await logged({ volumeMl: 250, description: "Latte", caffeineMg: 80, sugarG: 10 });

    await edited(drink.waterIntakeId, { volumeMl: 500, caffeineMg: 95, sugarG: 12 });

    const { intakes, substances } = await live();
    expect(substances[0]!.amountMg).toBe(95);
    expect(intakes.find((r) => r.type === "sugar")!.amount).toBe(12);
  });

  it("rounds a typed caffeine value to whole mg", async () => {
    const drink = await logged({ volumeMl: 250, description: "Latte", caffeineMg: 80 });
    await edited(drink.waterIntakeId, { caffeineMg: 95.6 });
    expect((await live()).substances[0]!.amountMg).toBe(96);
  });

  it("removes a substance set to 0 and keeps the others", async () => {
    const drink = await logged({
      volumeMl: 250,
      description: "Irish coffee",
      caffeineMg: 80,
      abvPercent: 10,
      sugarG: 5,
    });

    await edited(drink.waterIntakeId, { caffeineMg: 0, sugarG: 0 });

    const { intakes, substances } = await live();
    expect(substances.map((s) => s.type)).toEqual(["alcohol"]);
    expect(intakes.map((r) => r.type)).toEqual(["water"]);
  });

  it("adds a substance to plain water and groups it", async () => {
    const water = makeIntakeRecord({ type: "water", amount: 300, source: "manual" });
    await db.intakeRecords.add(water);

    await edited(water.id, { description: "Cold brew", caffeineMg: 150 });

    const { intakes, substances } = await live();
    expect(intakes[0]!.groupId).toBeTruthy();
    expect(substances).toHaveLength(1);
    expect(substances[0]).toMatchObject({
      type: "caffeine",
      amountMg: 150,
      volumeMl: 300,
      description: "Cold brew",
      groupId: intakes[0]!.groupId,
    });
  });

  it("does not group plain water when nothing is added", async () => {
    const water = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
    await db.intakeRecords.add(water);
    await edited(water.id, { volumeMl: 300, caffeineMg: 0, abvPercent: 0, sugarG: 0 });
    const after = (await db.intakeRecords.get(water.id))!;
    expect(after.amount).toBe(300);
    expect(after.groupId).toBeUndefined();
  });

  it("updates the existing substance and never writes a second one", async () => {
    // Issue #322: an edit that found nothing by groupId created a duplicate.
    const drink = await logged({ volumeMl: 568, description: "Pint of lager", abvPercent: 5 });
    await edited(drink.waterIntakeId, { abvPercent: 5.5, sugarG: 3 });

    const { intakes, substances } = await live();
    expect(substances).toHaveLength(1);
    expect(substances[0]!.abvPercent).toBe(5.5);
    expect(intakes.filter((r) => r.type === "water")).toHaveLength(1);
  });

  it("fixes an old drink whose water was less than its volume", async () => {
    // Before #401 a 45 ml spirit booked only 27 ml of water.
    const drink = await logged({ volumeMl: 45, description: "Vodka", abvPercent: 40 });
    await db.intakeRecords.update(drink.waterIntakeId, { amount: 27 });

    const snapshot = await getDrink(drink.waterIntakeId);
    expect(snapshot!.volumeMl).toBe(45);

    await edited(drink.waterIntakeId, { volumeMl: snapshot!.volumeMl });

    const { intakes, substances } = await live();
    expect(intakes[0]!.amount).toBe(45);
    expect(substances[0]!.volumeMl).toBe(45);
    expect(substances[0]!.amountStandardDrinks).toBe(standardDrinks(40, 45));
  });

  it("moves a meal as a whole and leaves its sugar alone when its water row is edited", async () => {
    const ts = Date.now() - 86_400_000;
    const meal = await addComposableEntry(
      {
        eating: { note: "Banana" },
        intakes: [
          { type: "water", amount: 90, source: "manual:food_water_content" },
          { type: "sugar", amount: 14, source: "manual:sugar" },
        ],
      },
      ts,
    );
    if (!meal.success) throw new Error("add failed");
    const waterId = meal.data.intakeIds[0]!;
    const moved = Date.now();

    await edited(waterId, { timestamp: moved, volumeMl: 180, caffeineMg: 50, sugarG: 0 });

    expect(await db.substanceRecords.count()).toBe(0);
    const sugar = (await db.intakeRecords.get(meal.data.intakeIds[1]!))!;
    expect(sugar.deletedAt).toBeNull();
    expect(sugar.amount).toBe(14);
    expect((await db.intakeRecords.get(waterId))!.amount).toBe(180);
    expect((await db.eatingRecords.get(meal.data.eatingId!))!.timestamp).toBe(moved);
    for (const id of meal.data.intakeIds) {
      expect((await db.intakeRecords.get(id))!.timestamp).toBe(moved);
    }
  });

  it("edits one row of a group with two water rows, and moves the group", async () => {
    // An old shape no write path makes now; seeded as stored rows.
    const groupId = crypto.randomUUID();
    const rows = [200, 100].map((amount) =>
      makeIntakeRecord({ type: "water", amount, source: "drink", groupId }),
    );
    await db.intakeRecords.bulkAdd(rows);
    const [first, second] = rows.map((r) => r.id);
    const moved = Date.now() - 60_000;

    expect((await getDrink(first!))!.kind).toBe("other");
    await edited(first!, { volumeMl: 250, timestamp: moved });

    expect((await db.intakeRecords.get(first!))!.amount).toBe(250);
    expect((await db.intakeRecords.get(second!))).toMatchObject({ amount: 100, timestamp: moved });
  });

  it("refuses a volume that is not positive", async () => {
    const drink = await logged({ volumeMl: 250, description: "Tea" });
    const result = await editDrink(drink.waterIntakeId, { volumeMl: 0, timestamp: Date.now() });
    expect(result.success).toBe(false);
  });
});

// ─── Read ─────────────────────────────────────────────────────────────

describe("drink-service: getDrink and findDrinkWaterId", () => {
  it("reads a drink's name, caffeine, ABV and sugar", async () => {
    const drink = await logged({
      volumeMl: 250,
      description: "Irish coffee",
      caffeineMg: 80,
      abvPercent: 10,
      sugarG: 5,
    });
    expect(await getDrink(drink.waterIntakeId)).toMatchObject({
      kind: "drink",
      volumeMl: 250,
      description: "Irish coffee",
      caffeineMg: 80,
      abvPercent: 10,
      sugarG: 5,
    });
  });

  it("finds the drink from any of its rows", async () => {
    const drink = await logged({ volumeMl: 250, description: "Latte", caffeineMg: 80, sugarG: 10 });
    const sugarId = drink.intakeIds.find((id) => id !== drink.waterIntakeId)!;
    expect(await findDrinkWaterId("intakeRecords", drink.waterIntakeId)).toBe(drink.waterIntakeId);
    expect(await findDrinkWaterId("intakeRecords", sugarId)).toBe(drink.waterIntakeId);
    expect(await findDrinkWaterId("substanceRecords", drink.substanceIds[0]!)).toBe(
      drink.waterIntakeId,
    );
  });

  it("finds no drink for a meal or a caffeine dose with no volume", async () => {
    const meal = await addComposableEntry({
      eating: { note: "Soup" },
      intakes: [{ type: "water", amount: 300, source: "manual:food_water_content" }],
    });
    if (!meal.success) throw new Error("add failed");
    const dose = await addSubstanceRecord({ type: "caffeine", amountMg: 100, description: "Pill" });
    if (!dose.success) throw new Error("add failed");

    expect(await findDrinkWaterId("intakeRecords", meal.data.intakeIds[0]!)).toBeNull();
    expect(await findDrinkWaterId("substanceRecords", dose.data.id)).toBeNull();
  });
});

// ─── Delete ───────────────────────────────────────────────────────────

describe("drink-service: deleteDrink", () => {
  it("takes the whole drink from its water row, and undo restores it", async () => {
    const drink = await logged({ volumeMl: 250, description: "Broth", saltMg: 400, caffeineMg: 5 });

    const result = await deleteDrink(drink.waterIntakeId);
    if (!result.success || result.data.scope !== "group") throw new Error("expected a group delete");
    const after = await live();
    expect(after.intakes).toHaveLength(0);
    expect(after.substances).toHaveLength(0);

    await undoDeleteEntryGroup(result.data.groupId, result.data.deletedAt);
    const restored = await live();
    expect(restored.intakes).toHaveLength(2);
    expect(restored.substances).toHaveLength(1);
  });

  it("takes the whole group for a beverage with sugar but no substance", async () => {
    const groupId = crypto.randomUUID();
    const water = makeIntakeRecord({ type: "water", amount: 330, source: "beverage:Juice", groupId });
    const sugar = makeIntakeRecord({ type: "sugar", amount: 30, source: "manual:sugar", groupId });
    await db.intakeRecords.bulkAdd([water, sugar]);
    const result = await deleteDrink(water.id);
    expect(result.success && result.data.scope).toBe("group");
    expect((await live()).intakes).toHaveLength(0);
  });

  it("deletes only the row for a meal's water", async () => {
    const meal = await addComposableEntry({
      eating: { note: "Soup", grams: 400 },
      intakes: [
        { type: "water", amount: 300, source: "manual:food_water_content" },
        { type: "salt", amount: 900, source: "manual:sodium" },
      ],
    });
    if (!meal.success) throw new Error("add failed");
    const result = await deleteDrink(meal.data.intakeIds[0]!);
    expect(result.success && result.data.scope).toBe("record");
    expect((await live()).intakes.map((r) => r.type)).toEqual(["salt"]);
  });

  it("deletes only the row for plain water, or for a non-water row of a drink", async () => {
    const water = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
    await db.intakeRecords.add(water);
    const drink = await logged({ volumeMl: 250, description: "Cola", sugarG: 27 });
    const sugarId = drink.intakeIds.find((id) => id !== drink.waterIntakeId)!;

    expect((await deleteDrink(water.id)).success).toBe(true);
    expect((await deleteDrink(sugarId)).success).toBe(true);

    expect((await live()).intakes.map((r) => r.id)).toEqual([drink.waterIntakeId]);
  });
});

// ─── Preset maths ─────────────────────────────────────────────────────

describe("drink-service: preset maths", () => {
  it("scales per-100 ml amounts to the volume and rounds them", () => {
    expect(
      drinkAmounts({
        volumeMl: 330,
        caffeinePer100ml: 9.7,
        abvPercent: 5,
        saltPer100ml: 4,
        sugarPer100ml: 10.6,
      }),
    ).toEqual({
      caffeineMg: 32,
      abvPercent: 5,
      standardDrinks: standardDrinks(5, 330),
      saltMg: 13,
      sugarG: 35,
    });
  });

  it("uses typed sugar instead of the per-100 ml figure", () => {
    expect(drinkAmounts({ volumeMl: 330, sugarPer100ml: 10.6, sugarG: 4 }).sugarG).toBe(4);
  });

  it("leaves out amounts that round to zero", () => {
    const input = drinkFromRecipe(
      { volumeMl: 250, caffeinePer100ml: 0.1, sugarPer100ml: 0 },
      { description: "Decaf" },
    );
    expect(input).toEqual({ volumeMl: 250, description: "Decaf" });
  });

  it("stores standard drinks with 2 decimal places and shows 1", () => {
    expect(standardDrinks(40, 45)).toBe(parseFloat(standardDrinksFromAbv(40, 45).toFixed(2)));
    expect(formatStandardDrinks(1.42)).toBe("1.4");
    expect(formatStandardDrinks(2)).toBe("2");
  });
});
