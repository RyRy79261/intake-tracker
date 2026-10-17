import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  logParsedEntry,
  type ParsedEntry,
  type ParsedEntryContext,
  type Trackers,
} from "@/lib/parsed-entry-service";

const TS = 1_760_000_000_000;
const ALL: Trackers = { sugar: true, potassium: true };

function ctx(over: Partial<ParsedEntryContext> = {}): ParsedEntryContext {
  return { timestamp: TS, trackers: ALL, origin: "voice", ...over };
}

async function log(entry: ParsedEntry, over: Partial<ParsedEntryContext> = {}) {
  const result = await logParsedEntry(entry, ctx(over));
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt === null);

/** Live intake rows, sorted by type (ids are random, so table order is not). */
async function intakes() {
  return live(await db.intakeRecords.toArray()).sort((a, b) => a.type.localeCompare(b.type));
}

describe("logParsedEntry: one record per reading", () => {
  it("writes each reading kind to its own table, tagged voice", async () => {
    await log({ kind: "blood_pressure", systolic: 118, diastolic: 76, heartRate: 60 });
    await log({ kind: "weight", weightKg: 80.4 });
    await log({ kind: "urination", amountEstimate: "medium" });
    await log({ kind: "defecation" });

    const [bp] = await db.bloodPressureRecords.toArray();
    expect(bp).toMatchObject({ systolic: 118, diastolic: 76, heartRate: 60, position: "sitting", arm: "left", source: "voice", timestamp: TS });
    const [weight] = await db.weightRecords.toArray();
    expect(weight).toMatchObject({ weight: 80.4, source: "voice", timestamp: TS });
    expect((await db.urinationRecords.toArray())[0]).toMatchObject({ amountEstimate: "medium", source: "voice" });
    expect(await db.defecationRecords.count()).toBe(1);
  });

  it("writes water and sodium as whole numbers", async () => {
    // 8 fl oz by the prompt's own conversion.
    await log({ kind: "water", ml: 236.588 });
    await log({ kind: "salt", sodiumMg: 393.4 });
    const rows = await intakes();
    expect(rows.map((r) => [r.type, r.amount, r.source])).toEqual([
      ["salt", 393, "voice"],
      ["water", 237, "voice"],
    ]);
  });
});

describe("logParsedEntry: a meal", () => {
  it("groups the meal with its water content and nutrients, as whole numbers", async () => {
    const result = await log({
      kind: "food",
      description: "smoothie",
      grams: 300.4,
      waterMl: 236.6,
      sodiumMg: 41.5,
      sugarG: 12.4,
      potassiumMg: 380.7,
    });
    expect(result.logged).toBe("meal");

    const [meal] = await db.eatingRecords.toArray();
    expect(meal).toMatchObject({ note: "smoothie", grams: 300, groupSource: "ai_food_parse" });
    const rows = await intakes();
    expect(Object.fromEntries(rows.map((r) => [r.type, r.amount]))).toEqual({
      water: 237,
      salt: 42,
      sugar: 12,
      potassium: 381,
    });
    expect(rows.every((r) => r.groupId === meal!.groupId && r.note === "smoothie")).toBe(true);
    expect(rows.find((r) => r.type === "water")!.source).toBe("manual:food_water_content");
  });

  it("writes no row for a nutrient that rounds to zero", async () => {
    await log({ kind: "food", description: "crackers", sugarG: 0.4, sodiumMg: 0.3 });
    expect(await intakes()).toHaveLength(0);
    expect(await db.eatingRecords.count()).toBe(1);
  });

  it("leaves out sugar and potassium when those trackers are off", async () => {
    await log(
      { kind: "food", description: "banana", sodiumMg: 1, sugarG: 14, potassiumMg: 420 },
      { trackers: { sugar: false, potassium: false } },
    );
    expect((await intakes()).map((r) => r.type)).toEqual(["salt"]);
  });

  it("keeps a hand-typed Food card meal with no nutrients as one plain record", async () => {
    await log({ kind: "food", description: "toast", grams: 40 }, { origin: "food_form" });
    const [meal] = await db.eatingRecords.toArray();
    expect(meal).toMatchObject({ note: "toast", grams: 40 });
    expect(meal!.groupId).toBeUndefined();
  });

  it("tags a hand-typed Food card meal with nutrients as a manual entry", async () => {
    await log(
      {
        kind: "food",
        description: "chips",
        sodiumMg: 800,
        sodiumEntry: { source: "salt", amount: 2, unit: "g" },
      },
      { origin: "food_form" },
    );
    const [meal] = await db.eatingRecords.toArray();
    expect(meal!.groupSource).toBe("manual_food_entry");
    const [salt] = await intakes();
    expect(salt).toMatchObject({
      amount: 800,
      source: "manual:salt",
      sodiumSource: "salt",
      sourceAmount: 2,
      sourceUnit: "g",
    });
  });

  it("keeps the AI's input text on an AI-parsed Food card meal", async () => {
    await log(
      { kind: "food", description: "pie", originalInputText: "pie" },
      { origin: "food_form" },
    );
    const [meal] = await db.eatingRecords.toArray();
    expect(meal).toMatchObject({ groupSource: "ai_food_parse", originalInputText: "pie" });
  });
});

describe("logParsedEntry: drinks go through the Drink module", () => {
  it("logs a caffeine item with a volume as one drink", async () => {
    const result = await log({
      kind: "caffeine",
      description: "latte",
      caffeineMg: 80.4,
      volumeMl: 250,
      sugarG: 12,
    });
    expect(result.logged).toBe("drink");
    const rows = await intakes();
    expect(rows.filter((r) => r.type === "water").map((r) => [r.amount, r.source])).toEqual([[250, "voice"]]);
    const [caffeine] = await db.substanceRecords.toArray();
    expect(caffeine).toMatchObject({ amountMg: 80, volumeMl: 250, groupSource: "voice_drink" });
    expect(rows.every((r) => r.groupId === caffeine!.groupId)).toBe(true);
  });

  it("logs an alcohol item as one drink at its full volume", async () => {
    await log({ kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 });
    expect((await intakes()).map((r) => [r.type, r.amount])).toEqual([["water", 500]]);
    expect((await db.substanceRecords.toArray())[0]).toMatchObject({ abvPercent: 5, volumeMl: 500 });
  });

  it("logs a Food card drink through the Drink module, with how its sodium was typed", async () => {
    const result = await log(
      {
        kind: "food",
        description: "cola",
        waterMl: 330,
        sodiumMg: 20,
        sodiumEntry: { source: "sodium", amount: 20, unit: "mg" },
        sugarG: 35,
        drink: { caffeineMg: 34 },
        originalInputText: "can of cola",
      },
      { origin: "food_form" },
    );
    expect(result.logged).toBe("drink");
    expect(await db.eatingRecords.count()).toBe(0);
    const rows = await intakes();
    expect(rows.filter((r) => r.type === "water")).toHaveLength(1);
    expect(rows.find((r) => r.type === "salt")).toMatchObject({ amount: 20, sodiumSource: "sodium" });
    expect((await db.substanceRecords.toArray())[0]).toMatchObject({
      amountMg: 34,
      groupSource: "ai_food_parse",
    });
  });

  it("logs a Food card drink with no volume as a meal", async () => {
    await log(
      { kind: "food", description: "espresso", drink: { caffeineMg: 63 }, originalInputText: "espresso" },
      { origin: "food_form" },
    );
    expect(await db.eatingRecords.count()).toBe(1);
    expect(await db.substanceRecords.count()).toBe(0);
  });
});

describe("logParsedEntry: a dose (caffeine with no volume)", () => {
  it("records the dose only, inventing no hydration", async () => {
    const result = await log({ kind: "caffeine", description: "coffee", caffeineMg: 95.6 });
    expect(result.logged).toBe("dose");
    expect(await intakes()).toHaveLength(0);
    expect((await db.substanceRecords.toArray())[0]!.amountMg).toBe(96);
  });

  it("groups the dose's solutes with it, as whole numbers", async () => {
    await log({ kind: "caffeine", description: "sweet espresso", caffeineMg: 63, sugarG: 8.4, sodiumMg: 12 });
    const [dose] = await db.substanceRecords.toArray();
    const rows = await intakes();
    expect(rows.map((r) => [r.type, r.amount])).toEqual([
      ["salt", 12],
      ["sugar", 8],
    ]);
    expect(rows.every((r) => r.groupId === dose!.groupId)).toBe(true);
    expect(dose!.groupSource).toBe("voice_drink");
  });
});

describe("logParsedEntry: failure", () => {
  it("fails without throwing and writes nothing", async () => {
    // A drink with no positive volume is refused by the Drink module.
    const result = await logParsedEntry(
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 0 },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(await db.intakeRecords.count()).toBe(0);
    expect(await db.substanceRecords.count()).toBe(0);
  });
});
