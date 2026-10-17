import type { SodiumSource, SodiumSourceUnit } from "@/lib/db";
import type { VoiceItem, VoiceItemOf } from "@intake/core/voice-items";
import { ok, err, unwrap } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { addBloodPressureRecord, addWeightRecord } from "@/lib/health-service";
import { addIntakeRecord } from "@/lib/intake-service";
import { addEstimateRecord } from "@/lib/estimate-tracker-service";
import { addEatingRecord } from "@/lib/eating-service";
import { addSubstanceRecord } from "@/lib/substance-service";
import { addComposableEntry, type ComposableEntryInput } from "@/lib/composable-entry-service";
import { logDrink } from "@/lib/drink-service";

/**
 * The parsed-entry logger: how one parsed item (a voice item, or the Food
 * card's detail form) becomes records.
 *
 * It owns, for every kind:
 * - which records the item writes (a meal, a drink, a dose, a reading),
 * - the `source` and `groupSource` tags on them,
 * - whole numbers for every amount Postgres stores as an integer,
 * - the optional sugar and potassium trackers (an untracked nutrient writes
 *   no row),
 * - one write per item: a meal or a dose is one transaction, a drink goes
 *   through the Drink module (`logDrink`), which is one transaction too.
 *
 * Before this module the mapping lived in two components (VoicePanel and
 * FoodSection), copied, and the food path wrote fractional amounts.
 */

/** A meal (or a drink the AI recognised) from voice or the Food card. */
export type ParsedFood = VoiceItemOf<"food"> & {
  /**
   * What the sodium was typed as (2 g of salt), kept on the sodium row beside
   * the converted mg. Omit when only sodium mg is known.
   */
  sodiumEntry?: { source: SodiumSource; amount: number; unit: SodiumSourceUnit };
  /**
   * Set when the AI said the item is a drink. With a volume (`waterMl`) it is
   * logged as one drink through the Drink module; without one, as a meal.
   */
  drink?: { caffeineMg?: number; abvPercent?: number };
  /** The text the AI parsed. Set only for an AI-parsed Food card entry. */
  originalInputText?: string;
};

/** Anything the logger can write. Extra keys (a voice row's time) are ignored. */
export type ParsedEntry = Exclude<VoiceItem, { kind: "food" }> | ParsedFood;

/** The optional trackers the user has turned on. */
export interface Trackers {
  sugar: boolean;
  potassium: boolean;
}

export interface ParsedEntryContext {
  timestamp: number;
  trackers: Trackers;
  /** Where the entry came from; decides the source tags. */
  origin: "voice" | "food_form";
}

/** What one entry was written as. */
export type ParsedEntryResult = { logged: "reading" | "meal" | "drink" | "dose" };

const WATER_CONTENT_SOURCE = "manual:food_water_content";

/** Postgres keeps intake amounts, grams and caffeine mg as integers. */
function whole(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.round(value);
}

/**
 * The sugar, sodium and potassium rows of an item, rounded first so a value
 * that rounds to 0 writes no row. Sodium is always tracked.
 */
function soluteIntakes(
  item: { sodiumMg?: number; sugarG?: number; potassiumMg?: number },
  trackers: Trackers,
  note: string | undefined,
  sodiumEntry?: ParsedFood["sodiumEntry"],
): NonNullable<ComposableEntryInput["intakes"]> {
  const rows: NonNullable<ComposableEntryInput["intakes"]> = [];
  const withNote = note !== undefined ? { note } : {};
  const sodium = whole(item.sodiumMg);
  if (sodium > 0) {
    rows.push({
      type: "salt",
      amount: sodium,
      source: sodiumEntry ? `manual:${sodiumEntry.source}` : "manual:sodium",
      ...(sodiumEntry && {
        sodiumSource: sodiumEntry.source,
        sourceAmount: sodiumEntry.amount,
        sourceUnit: sodiumEntry.unit,
      }),
      ...withNote,
    });
  }
  const sugar = whole(item.sugarG);
  if (trackers.sugar && sugar > 0) {
    rows.push({ type: "sugar", amount: sugar, source: "manual:sugar", ...withNote });
  }
  const potassium = whole(item.potassiumMg);
  if (trackers.potassium && potassium > 0) {
    rows.push({ type: "potassium", amount: potassium, source: "manual:potassium", ...withNote });
  }
  return rows;
}

/** The solutes of a drink, as `logDrink` takes them (it rounds them itself). */
function drinkSolutes(
  item: { sodiumMg?: number; sugarG?: number; potassiumMg?: number },
  trackers: Trackers,
) {
  return {
    ...(item.sodiumMg !== undefined && { saltMg: item.sodiumMg }),
    ...(trackers.sugar && item.sugarG !== undefined && { sugarG: item.sugarG }),
    ...(trackers.potassium && item.potassiumMg !== undefined && { potassiumMg: item.potassiumMg }),
  };
}

async function logFood(item: ParsedFood, ctx: ParsedEntryContext): Promise<ParsedEntryResult> {
  const { timestamp, trackers, origin } = ctx;
  const description = item.description.trim();
  const note = description !== "" ? description : undefined;
  const waterMl = whole(item.waterMl);
  const aiParsed = origin === "voice" || item.originalInputText !== undefined;
  const originalInputText =
    item.originalInputText !== undefined ? { originalInputText: item.originalInputText } : {};

  // A drink the AI recognised: one drink, its full volume as fluid.
  if (item.drink && waterMl > 0) {
    const caffeineMg = item.drink.caffeineMg ?? 0;
    const abvPercent = item.drink.abvPercent ?? 0;
    unwrap(
      await logDrink({
        volumeMl: waterMl,
        description: description || "Drink",
        ...(caffeineMg > 0 && { caffeineMg }),
        ...(abvPercent > 0 && { abvPercent }),
        ...drinkSolutes(item, trackers),
        ...(item.sodiumEntry && whole(item.sodiumMg) > 0 && { sodiumEntry: item.sodiumEntry }),
        groupSource: "ai_food_parse",
        ...originalInputText,
        timestamp,
      }),
    );
    return { logged: "drink" };
  }

  const intakes = soluteIntakes(item, trackers, note, item.sodiumEntry);
  if (waterMl > 0) {
    intakes.push({
      type: "water",
      amount: waterMl,
      source: WATER_CONTENT_SOURCE,
      ...(note !== undefined && { note }),
    });
  }
  const grams = whole(item.grams);

  // A plain meal typed by hand: one eating record, no group.
  if (intakes.length === 0 && !aiParsed) {
    unwrap(await addEatingRecord(timestamp, note, grams > 0 ? grams : undefined));
    return { logged: "meal" };
  }

  unwrap(
    await addComposableEntry(
      {
        eating: {
          ...(note !== undefined && { note }),
          ...(grams > 0 && { grams }),
        },
        ...(intakes.length > 0 && { intakes }),
        ...originalInputText,
        groupSource: aiParsed ? "ai_food_parse" : "manual_food_entry",
      },
      timestamp,
    ),
  );
  return { logged: "meal" };
}

async function logCaffeine(
  item: VoiceItemOf<"caffeine">,
  ctx: ParsedEntryContext,
): Promise<ParsedEntryResult> {
  const { timestamp, trackers } = ctx;
  if (item.volumeMl !== undefined && item.volumeMl > 0) {
    unwrap(
      await logDrink({
        volumeMl: item.volumeMl,
        description: item.description,
        caffeineMg: item.caffeineMg,
        ...drinkSolutes(item, trackers),
        waterSource: "voice",
        groupSource: "voice_drink",
        timestamp,
      }),
    );
    return { logged: "drink" };
  }
  // No volume: a dose. No hydration is invented, and the review row shows
  // the volume field so the user can supply it. Its solutes share its group.
  const amountMg = whole(item.caffeineMg);
  const intakes = soluteIntakes(item, trackers, item.description);
  if (intakes.length > 0) {
    unwrap(
      await addComposableEntry(
        {
          substance: { type: "caffeine", amountMg, description: item.description },
          intakes,
          groupSource: "voice_drink",
        },
        timestamp,
      ),
    );
  } else {
    unwrap(
      await addSubstanceRecord({
        type: "caffeine",
        amountMg,
        description: item.description,
        timestamp,
      }),
    );
  }
  return { logged: "dose" };
}

/**
 * Write one parsed entry. Fails without throwing; a failed entry writes
 * nothing. Values are expected to have passed the voice item contract's
 * review check (`validateVoiceItem`) or the Food card's own gate.
 */
export async function logParsedEntry(
  entry: ParsedEntry,
  ctx: ParsedEntryContext,
): Promise<ServiceResult<ParsedEntryResult>> {
  const { timestamp, trackers, origin } = ctx;
  const source = origin === "voice" ? "voice" : "manual";
  try {
    switch (entry.kind) {
      case "blood_pressure":
        unwrap(
          await addBloodPressureRecord(
            entry.systolic,
            entry.diastolic,
            entry.position ?? "sitting",
            entry.arm ?? "left",
            entry.heartRate,
            timestamp,
            entry.note,
            undefined,
            source,
          ),
        );
        return ok({ logged: "reading" });
      case "weight":
        unwrap(await addWeightRecord(entry.weightKg, timestamp, entry.note, source));
        return ok({ logged: "reading" });
      case "water":
        unwrap(
          await addIntakeRecord("water", Math.max(1, whole(entry.ml)), source, timestamp, entry.note),
        );
        return ok({ logged: "reading" });
      case "salt":
        unwrap(
          await addIntakeRecord("salt", Math.max(1, whole(entry.sodiumMg)), source, timestamp, entry.note),
        );
        return ok({ logged: "reading" });
      case "food":
        return ok(await logFood(entry, ctx));
      case "caffeine":
        return ok(await logCaffeine(entry, ctx));
      case "alcohol":
        unwrap(
          await logDrink({
            volumeMl: entry.volumeMl,
            description: entry.description,
            abvPercent: entry.abvPercent,
            ...drinkSolutes(entry, trackers),
            waterSource: "voice",
            groupSource: "voice_drink",
            timestamp,
          }),
        );
        return ok({ logged: "drink" });
      case "urination":
      case "defecation":
        unwrap(
          await addEstimateRecord(entry.kind, {
            timestamp,
            source,
            ...(entry.amountEstimate !== undefined && { amountEstimate: entry.amountEstimate }),
            ...(entry.note !== undefined && { note: entry.note }),
          }),
        );
        return ok({ logged: "reading" });
    }
  } catch (e) {
    return err(`Failed to log ${entry.kind}`, e);
  }
}
