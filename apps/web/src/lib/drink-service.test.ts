import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { logDrink } from "@/lib/drink-service";
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
