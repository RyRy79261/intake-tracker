import { describe, it, expect } from "vitest";
import { reconcileLiquidItems } from "@/lib/voice-reconcile";
import type { VoiceParsedItem } from "@/lib/voice-types";

/** Total fluid the app would book for a parsed item list. */
function totalFluidMl(items: VoiceParsedItem[]): number {
  return items.reduce((sum, item) => {
    switch (item.kind) {
      case "water":
        return sum + item.ml;
      case "food":
        return sum + (item.waterMl ?? 0);
      case "caffeine":
      case "alcohol":
        return sum + (item.volumeMl ?? 0);
      default:
        return sum;
    }
  }, 0);
}

describe("reconcileLiquidItems", () => {
  describe("collapses a drink the parser split in two", () => {
    it("merges a food item describing the same drink (the #322 shape)", () => {
      // "a latte" → the parser has no sugar field on `caffeine`, so it adds a
      // food item to carry the milk sugar. Both volumes are booked as fluid.
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
        { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
      ]);

      expect(items).toHaveLength(1);
      expect(items[0]!.kind).toBe("caffeine");
      expect(totalFluidMl(items)).toBe(250);
      expect(merges).toHaveLength(1);
    });

    it("carries the food item's solutes onto the drink", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
        {
          kind: "food",
          description: "latte",
          waterMl: 250,
          sugarG: 12,
          sodiumMg: 55,
          potassiumMg: 300,
        },
      ]);

      // The reason the parser emitted the food item was its nutrition; merging
      // must not throw that away.
      const drink = items[0] as Extract<VoiceParsedItem, { kind: "caffeine" }>;
      expect(drink.sugarG).toBe(12);
      expect(drink.sodiumMg).toBe(55);
      expect(drink.potassiumMg).toBe(300);
    });

    it("keeps the drink's own solute values over the food item's", () => {
      const { items } = reconcileLiquidItems([
        {
          kind: "alcohol",
          description: "cider",
          abvPercent: 4.5,
          volumeMl: 500,
          sugarG: 20,
        },
        { kind: "food", description: "cider", waterMl: 500, sugarG: 99 },
      ]);

      const drink = items[0] as Extract<VoiceParsedItem, { kind: "alcohol" }>;
      expect(drink.sugarG).toBe(20);
    });

    it("merges when the names share a word and the volumes are close", () => {
      const { items } = reconcileLiquidItems([
        { kind: "alcohol", description: "pale ale", abvPercent: 6, volumeMl: 330 },
        { kind: "food", description: "can of pale ale", waterMl: 300, sugarG: 3 },
      ]);
      expect(items).toHaveLength(1);
      expect(totalFluidMl(items)).toBe(330);
    });
  });

  describe("never silently drops fluid the user may have drunk", () => {
    it("flags a same-volume bare water item instead of dropping it", () => {
      // The shape #322 describes: a 500 ml beer plus a 500 ml water item. But
      // "a 500 ml beer and 500 ml of water" is also an ordinary thing to
      // dictate, and a bare water item carries nothing to tell the two apart.
      // Both rows survive to the review list; the user rejects one.
      const { items, merges, warnings } = reconcileLiquidItems([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "water", ml: 500 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.message).toMatch(/reject one/i);
      // The warning is anchored to both rows it concerns.
      expect(warnings[0]!.itemIndices).toEqual([0, 1]);
    });

    it("does not merge two same-volume items with unrelated names", () => {
      // "a coffee and a glass of milk" — both 250 ml, because that is the
      // figure the prompt gives for "glass" and "cup" alike. Merging on volume
      // alone lost the milk's hydration and grafted its sugar onto the coffee.
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "glass of milk", waterMl: 250, sugarG: 12 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
      expect(totalFluidMl(items)).toBe(500);

      const drink = items[0] as Extract<VoiceParsedItem, { kind: "caffeine" }>;
      expect(drink.sugarG).toBeUndefined();
    });

    it("flags at most one water item per drink", () => {
      const { warnings, items } = reconcileLiquidItems([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "water", ml: 500 },
        { kind: "water", ml: 500 },
      ]);
      expect(items).toHaveLength(3);
      expect(warnings).toHaveLength(1);
    });
  });

  describe("leaves genuinely distinct drinks alone", () => {
    it("keeps a water item of a different volume", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "water", ml: 250 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
      expect(totalFluidMl(items)).toBe(750);
    });

    it("keeps a same-volume water item that carries its own note", () => {
      // A note means the user said something specific about that water; it is
      // not a stray companion the parser invented.
      const { items } = reconcileLiquidItems([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "water", ml: 500, note: "with dinner" },
      ]);
      expect(items).toHaveLength(2);
      expect(totalFluidMl(items)).toBe(1000);
    });

    it("keeps an unrelated food item with its own water content", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "bowl of soup", waterMl: 400, sodiumMg: 900 },
      ]);
      expect(items).toHaveLength(2);
      expect(totalFluidMl(items)).toBe(650);
    });

    it("keeps a same-named solid food whose water content is nothing like the drink's", () => {
      // "a coffee and a slice of coffee cake" — the shared word must not be
      // enough on its own.
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "coffee cake", waterMl: 30, grams: 90 },
      ]);
      expect(items).toHaveLength(2);
      expect(totalFluidMl(items)).toBe(280);
    });

    it("keeps two different drinks", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "alcohol", description: "wine", abvPercent: 13, volumeMl: 175 },
      ]);
      expect(items).toHaveLength(2);
      expect(totalFluidMl(items)).toBe(425);
    });

    it("never merges non-liquid items", () => {
      const items: VoiceParsedItem[] = [
        { kind: "blood_pressure", systolic: 118, diastolic: 76 },
        { kind: "weight", weightKg: 80 },
        { kind: "salt", sodiumMg: 400 },
        { kind: "urination", amountEstimate: "medium" },
        { kind: "defecation" },
      ];
      const result = reconcileLiquidItems(items);
      expect(result.items).toHaveLength(5);
      expect(result.merges).toHaveLength(0);
    });

    it("leaves a drink with no volume alone", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95 },
        { kind: "water", ml: 250 },
      ]);
      expect(items).toHaveLength(2);
    });
  });

  describe("multiple drinks in one utterance", () => {
    it("gives each drink at most one companion", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
        { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "food", description: "beer", waterMl: 500, sugarG: 2 },
      ]);
      expect(items).toHaveLength(2);
      expect(totalFluidMl(items)).toBe(750);
    });

    it("does not let one food companion be absorbed twice", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
        { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
      ]);
      // Two real lattes and one food item: it can only be merged into one.
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(1);
      expect(totalFluidMl(items)).toBe(500);
    });
  });

  it("is a pure function — the input list is not mutated", () => {
    const input: VoiceParsedItem[] = [
      { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
      { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
    ];
    const snapshot = JSON.stringify(input);
    reconcileLiquidItems(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("handles an empty list", () => {
    expect(reconcileLiquidItems([])).toEqual({ items: [], merges: [], warnings: [] });
  });

  describe("identity check is stronger than one shared word", () => {
    it("does not merge 'coffee with milk' and 'a glass of milk'", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee with milk", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "glass of milk", waterMl: 250, sugarG: 12, potassiumMg: 380 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
      expect(totalFluidMl(items)).toBe(500);
      const drink = items[0] as Extract<VoiceParsedItem, { kind: "caffeine" }>;
      expect(drink.sugarG).toBeUndefined();
    });

    it("does not merge a vodka and orange with a separate glass of orange juice", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "alcohol", description: "vodka and orange juice", abvPercent: 10, volumeMl: 250 },
        { kind: "food", description: "glass of orange juice", waterMl: 240, sugarG: 22 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
    });

    it("does not merge a coffee with a coffee milkshake", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "coffee milkshake", waterMl: 300, sugarG: 40 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
      const drink = items[0] as Extract<VoiceParsedItem, { kind: "caffeine" }>;
      expect(drink.sugarG).toBeUndefined();
    });

    it("does not merge whisky and water with coconut water", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "alcohol", description: "whisky and water", abvPercent: 20, volumeMl: 200 },
        { kind: "food", description: "coconut water", waterMl: 250, potassiumMg: 600 },
      ]);
      expect(items).toHaveLength(2);
      expect(merges).toHaveLength(0);
    });

    it("still merges a companion named with a subset of the drink's words", () => {
      const { items, merges } = reconcileLiquidItems([
        { kind: "caffeine", description: "iced oat latte", caffeineMg: 80, volumeMl: 350 },
        { kind: "food", description: "latte", waterMl: 350, sugarG: 10 },
      ]);
      expect(items).toHaveLength(1);
      expect(merges).toHaveLength(1);
      expect(merges[0]!.itemIndices).toEqual([0]);
    });

    it("treats a plural as the same word", () => {
      const { items } = reconcileLiquidItems([
        { kind: "caffeine", description: "two lattes", caffeineMg: 160, volumeMl: 500 },
        { kind: "food", description: "latte", waterMl: 500, sugarG: 24 },
      ]);
      expect(items).toHaveLength(1);
      expect(totalFluidMl(items)).toBe(500);
    });
  });

  describe("suspicious pairings it will not merge are flagged, not passed silently", () => {
    it("flags a companion that names only the milk of a milky drink", () => {
      const { items, warnings } = reconcileLiquidItems([
        { kind: "caffeine", description: "flat white", caffeineMg: 130, volumeMl: 200 },
        { kind: "food", description: "milk", waterMl: 180, sugarG: 9 },
      ]);
      expect(items).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.itemIndices).toEqual([0, 1]);
    });

    it("flags a same-name companion carrying only part of the volume", () => {
      const { items, warnings } = reconcileLiquidItems([
        { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 350 },
        { kind: "food", description: "latte milk", waterMl: 250, sugarG: 12 },
      ]);
      expect(items).toHaveLength(2);
      expect(warnings).toHaveLength(1);
    });

    it("does not flag a same-word solid food with little water", () => {
      const { warnings } = reconcileLiquidItems([
        { kind: "caffeine", description: "coffee", caffeineMg: 95, volumeMl: 250 },
        { kind: "food", description: "coffee cake", waterMl: 30, grams: 90 },
      ]);
      expect(warnings).toHaveLength(0);
    });

    it("flags a water item whose volume is close to, not exactly, the drink's", () => {
      const { items, warnings } = reconcileLiquidItems([
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
        { kind: "water", ml: 473 },
      ]);
      expect(items).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.itemIndices).toEqual([0, 1]);
    });
  });

  describe("merging solutes", () => {
    it("treats the drink's explicit 0 as missing and keeps the companion's value", () => {
      const { items } = reconcileLiquidItems([
        {
          kind: "caffeine",
          description: "latte",
          caffeineMg: 80,
          volumeMl: 250,
          sugarG: 0,
          potassiumMg: 0,
        },
        { kind: "food", description: "latte", waterMl: 250, sugarG: 12, potassiumMg: 380 },
      ]);
      const drink = items[0] as Extract<VoiceParsedItem, { kind: "caffeine" }>;
      expect(drink.sugarG).toBe(12);
      expect(drink.potassiumMg).toBe(380);
    });
  });

  it("anchors notes to indices in the returned (post-merge) list", () => {
    const { items, merges, warnings } = reconcileLiquidItems([
      { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
      { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
      { kind: "water", ml: 500 },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["caffeine", "alcohol", "water"]);
    expect(merges[0]!.itemIndices).toEqual([0]);
    expect(warnings[0]!.itemIndices).toEqual([1, 2]);
  });
});
