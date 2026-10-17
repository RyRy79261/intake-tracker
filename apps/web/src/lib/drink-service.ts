import { db } from "@/lib/db";
import type {
  IntakeRecord,
  SubstanceRecord,
  SodiumSource,
  SodiumSourceUnit,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { syncedWrite, type SyncedChanges } from "@/lib/synced-write";
import { standardDrinksFromAbv, abvFromStandardDrinks } from "@intake/core/alcohol";
import { isLive } from "@intake/core/lifecycle";
import {
  COMPOSABLE_TABLES,
  deleteEntryGroup,
  retimeGroup,
} from "@/lib/composable-entry-service";
import { deleteIntakeRecord } from "@/lib/intake-service";

/** Everything needed to record one drink. See {@link logDrink}. */
export interface LogDrinkInput {
  /**
   * Volume of the drink in ml. The water row is derived from it; callers never
   * pass their own water intake alongside this.
   */
  volumeMl: number;
  /** User-facing name of the drink ("Latte", "Pint of lager"). */
  description: string;
  /** The water row's note. Defaults to `description`. */
  note?: string;
  /** Caffeine content in mg. Omit or 0 for a non-caffeinated drink. */
  caffeineMg?: number;
  /** Alcohol by volume %. Omit or 0 for a non-alcoholic drink. */
  abvPercent?: number;
  /** Sodium dissolved in the drink, in mg. */
  saltMg?: number;
  /**
   * What `saltMg` was typed as (e.g. 2 g of salt), stored on the sodium row
   * beside the converted mg. Omit when only sodium mg is known (presets,
   * voice): the row then reads as sodium with an unknown source.
   */
  sodiumEntry?: { source: SodiumSource; amount: number; unit: SodiumSourceUnit };
  /** Total sugars in the drink, in grams. */
  sugarG?: number;
  /** Potassium in the drink, in mg. */
  potassiumMg?: number;
  /** `source` tag written onto the derived water IntakeRecord. */
  waterSource?: string;
  /** Provenance of the whole group (e.g. `preset:<id>`, `voice_drink`). */
  groupSource?: string;
  /** Raw user/AI input text, retained for auditability. */
  originalInputText?: string;
  timestamp?: number;
}

/** Identifiers of everything {@link logDrink} wrote. */
export interface LogDrinkResult {
  groupId: string;
  /** The one derived water record. Always present. */
  waterIntakeId: string;
  /** Every intake record written, water included. */
  intakeIds: string[];
  substanceIds: string[];
}

/** Precision for the stored `amountStandardDrinks` value, in decimal places. */
const STANDARD_DRINKS_DP = 2;
/** Precision for showing standard drinks on screen, in decimal places. */
const STANDARD_DRINKS_DISPLAY_DP = 1;

const SUGAR_SOURCE = "manual:sugar";
const POTASSIUM_SOURCE = "manual:potassium";
const SODIUM_SOURCE = "manual:sodium";

// ─── Drink maths (pure) ───────────────────────────────────────────────

/**
 * Standard drinks in `volumeMl` of a drink at `abvPercent`, at the one
 * precision every stored value uses.
 */
export function standardDrinks(abvPercent: number, volumeMl: number): number {
  return parseFloat(
    standardDrinksFromAbv(abvPercent, volumeMl).toFixed(STANDARD_DRINKS_DP),
  );
}

/** Standard drinks as shown on screen ("1.4"). */
export function formatStandardDrinks(value: number): string {
  return parseFloat(value.toFixed(STANDARD_DRINKS_DISPLAY_DP)).toString();
}

/** An amount given per 100 ml, scaled to `volumeMl`. Not rounded. */
export function amountForVolume(per100ml: number, volumeMl: number): number {
  return (volumeMl / 100) * per100ml;
}

/** A drink described per 100 ml, as a preset or an AI lookup gives it. */
export interface DrinkRecipe {
  volumeMl: number;
  caffeinePer100ml?: number;
  /** % ABV. */
  abvPercent?: number;
  /** mg sodium per 100 ml. */
  saltPer100ml?: number;
  /** g sugar per 100 ml. */
  sugarPer100ml?: number;
  /** Grams typed by the user. Replaces `sugarPer100ml` when set. */
  sugarG?: number;
}

/** What a {@link DrinkRecipe} logs, rounded as it is stored. */
export interface DrinkAmounts {
  caffeineMg: number;
  abvPercent: number;
  standardDrinks: number;
  saltMg: number;
  sugarG: number;
}

/** The amounts one {@link DrinkRecipe} logs. Zero means "none". */
export function drinkAmounts(recipe: DrinkRecipe): DrinkAmounts {
  const { volumeMl } = recipe;
  const abvPercent = recipe.abvPercent ?? 0;
  return {
    caffeineMg: Math.round(amountForVolume(recipe.caffeinePer100ml ?? 0, volumeMl)),
    abvPercent,
    standardDrinks:
      abvPercent > 0 && volumeMl > 0 ? standardDrinks(abvPercent, volumeMl) : 0,
    saltMg: Math.round(amountForVolume(recipe.saltPer100ml ?? 0, volumeMl)),
    sugarG: Math.round(
      recipe.sugarG ?? amountForVolume(recipe.sugarPer100ml ?? 0, volumeMl),
    ),
  };
}

/**
 * The {@link logDrink} input for a recipe. Amounts that round to zero are
 * left out, so they write no row.
 */
export function drinkFromRecipe(
  recipe: DrinkRecipe,
  details: Pick<LogDrinkInput, "description" | "waterSource" | "groupSource" | "timestamp">,
): LogDrinkInput {
  const amounts = drinkAmounts(recipe);
  return {
    volumeMl: recipe.volumeMl,
    ...details,
    ...(amounts.caffeineMg > 0 && { caffeineMg: amounts.caffeineMg }),
    ...(amounts.abvPercent > 0 && { abvPercent: amounts.abvPercent }),
    ...(amounts.saltMg > 0 && { saltMg: amounts.saltMg }),
    ...(amounts.sugarG > 0 && { sugarG: amounts.sugarG }),
  };
}

// ─── logDrink ─────────────────────────────────────────────────────────

/**
 * Record one drink — the single owner of liquid volume.
 *
 * Before this existed, "a drink" could be written by three different callers
 * (`addSubstanceRecord`, `addComposableEntry`, or a hand-built `intakes`
 * array), and `SubstanceRecord.volumeMl` doubled as an implicit *command* —
 * "also create a water record for me". Every caller had to decide on its own
 * whether to trip that side effect, and the invariant it protected (exactly
 * one water IntakeRecord per logged drink) lived in a comment rather than in
 * code. Two callers booking the same volume produced duplicate hydration
 * (issue #322); none booking it produced silent under-counting.
 *
 * `logDrink` removes the choice. It takes the drink's fluid volume once and
 * *derives* the water IntakeRecord from it. `volumeMl` on the SubstanceRecords
 * it writes is pure denormalised data — never a trigger. Every drink-logging
 * surface must go through here.
 *
 * Invariants guaranteed by this function:
 *  1. Exactly one water IntakeRecord per call, with `amount` = the drink's
 *     full `volumeMl`. Fluid intake is charted the way a clinical
 *     intake/output chart or a fluid restriction counts it: every drink at its
 *     whole volume, alcohol and dissolved solids included. Nothing is
 *     subtracted for ethanol or for a "water content" share.
 *  2. Every record it writes shares one non-null `groupId`, so the group is
 *     editable and deletable as a unit by the reconcilers.
 *  3. `amountStandardDrinks` is derived here from `abvPercent` + `volumeMl`,
 *     at one fixed precision, so it cannot drift between write paths.
 *
 * @param input The drink's volume, name, substances and dissolved solutes.
 * @returns The new group id, the derived water row's id, and every id written.
 *   Fails without writing anything when `volumeMl` is not a positive number.
 */
export async function logDrink(
  input: LogDrinkInput,
): Promise<ServiceResult<LogDrinkResult>> {
  if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
    return err("A drink needs a positive volume in ml");
  }
  try {
    const groupId = crypto.randomUUID();
    const ts = input.timestamp ?? Date.now();
    const fields = syncFields();
    // Postgres stores intake amounts as `integer`; a fractional value is
    // rejected by the push validator and silently dropped by the sync engine,
    // so round at the only place that mints these rows.
    const volumeMl = Math.round(input.volumeMl);
    const intakeIds: string[] = [];
    const substanceIds: string[] = [];
    const waterIntakeId = crypto.randomUUID();

    await syncedWrite(
      ["intakeRecords", "substanceRecords"],
      async (w) => {
        // ── The derived water record — invariant 1 ──
        const water: IntakeRecord = {
          id: waterIntakeId,
          type: "water",
          amount: Math.max(1, volumeMl),
          timestamp: ts,
          source: input.waterSource ?? "drink",
          note: input.note ?? input.description,
          groupId,
          ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
          ...(input.originalInputText !== undefined && {
            originalInputText: input.originalInputText,
          }),
          ...fields,
        };
        await w.insert("intakeRecords", water);
        intakeIds.push(waterIntakeId);

        // ── Dissolved solutes ──
        // These never displace fluid volume: the water record above is the
        // full drink volume regardless of what is dissolved in it.
        const solutes: Array<{
          type: "salt" | "sugar" | "potassium";
          amount: number;
          source: string;
        }> = [];
        // Round BEFORE the positive check, not after. These columns are
        // Postgres integers, so 0.4 g of sugar passed a `> 0` guard on the raw
        // value and then rounded to zero — writing a solute row recording none
        // of the solute.
        const soluteCandidates: Array<{
          type: "salt" | "sugar" | "potassium";
          raw: number | undefined;
          source: string;
        }> = [
          { type: "salt", raw: input.saltMg, source: SODIUM_SOURCE },
          { type: "sugar", raw: input.sugarG, source: SUGAR_SOURCE },
          { type: "potassium", raw: input.potassiumMg, source: POTASSIUM_SOURCE },
        ];
        for (const candidate of soluteCandidates) {
          const amount =
            candidate.raw !== undefined ? Math.round(candidate.raw) : 0;
          if (amount <= 0) continue;
          solutes.push({
            type: candidate.type,
            amount,
            source: candidate.source,
          });
        }
        const entry = input.sodiumEntry;
        for (const solute of solutes) {
          const id = crypto.randomUUID();
          const sodiumEntry = solute.type === "salt" ? entry : undefined;
          const record: IntakeRecord = {
            id,
            type: solute.type,
            amount: solute.amount,
            timestamp: ts,
            source: sodiumEntry ? `manual:${sodiumEntry.source}` : solute.source,
            ...(sodiumEntry && {
              sodiumSource: sodiumEntry.source,
              sourceAmount: sodiumEntry.amount,
              sourceUnit: sodiumEntry.unit,
            }),
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await w.insert("intakeRecords", record);
          intakeIds.push(id);
        }

        // ── Substances ──
        // `volumeMl` here is denormalised data describing the drink these
        // milligrams came in. It is never read as a request to create water.
        const substances: SubstanceRecord[] = [];
        if (input.caffeineMg !== undefined && input.caffeineMg > 0) {
          substances.push({
            id: crypto.randomUUID(),
            type: "caffeine",
            amountMg: Math.round(input.caffeineMg),
            volumeMl,
            description: input.description,
            source: "standalone",
            aiEnriched: false,
            timestamp: ts,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          });
        }
        if (input.abvPercent !== undefined && input.abvPercent > 0) {
          substances.push({
            id: crypto.randomUUID(),
            type: "alcohol",
            abvPercent: input.abvPercent,
            amountStandardDrinks: standardDrinks(input.abvPercent, volumeMl),
            volumeMl,
            description: input.description,
            source: "standalone",
            aiEnriched: false,
            timestamp: ts,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          });
        }
        for (const record of substances) {
          await w.insert("substanceRecords", record);
          substanceIds.push(record.id);
        }
      },
    );

    return ok({ groupId, waterIntakeId, intakeIds, substanceIds });
  } catch (e) {
    return err("Failed to log drink", e);
  }
}

// ─── Reading a drink ──────────────────────────────────────────────────

/**
 * How a liquid row is edited and deleted.
 *
 * - `drink`: a water row with no group, or the only water row of a group with
 *   no live meal. The water row speaks for the whole drink.
 * - `meal-water`: the water content of a meal. Its time moves the meal; its
 *   other values belong to the Food card.
 * - `other`: a water row that shares its group with another water row (old
 *   data only). It is edited on its own, but still moves with its group.
 */
export type DrinkKind = "drink" | "meal-water" | "other";

/** One drink as the edit form shows it. */
export interface DrinkSnapshot {
  kind: DrinkKind;
  water: IntakeRecord;
  /**
   * The drink's real volume. Old drinks stored less water than the volume,
   * so a stored caffeine/alcohol volume wins over the water amount.
   */
  volumeMl: number;
  /** The drink's name, from its caffeine or alcohol record. */
  description?: string;
  caffeineMg?: number;
  abvPercent?: number;
  sugarG?: number;
}

interface DrinkGroup {
  kind: DrinkKind;
  water: IntakeRecord;
  intakes: IntakeRecord[];
  substances: SubstanceRecord[];
}

/**
 * Load a water row with the live rows of its group, and decide its kind. This
 * is the one place that tells a drink from a meal: nothing stored marks a
 * group as a drink.
 */
async function loadDrinkGroup(waterIntakeId: string): Promise<DrinkGroup | null> {
  const water = await db.intakeRecords.get(waterIntakeId);
  if (!water || !isLive(water) || water.type !== "water") return null;
  if (!water.groupId) return { kind: "drink", water, intakes: [], substances: [] };

  const groupId = water.groupId;
  const [intakes, eatings, substances] = await Promise.all([
    db.intakeRecords.where("groupId").equals(groupId).toArray(),
    db.eatingRecords.where("groupId").equals(groupId).toArray(),
    db.substanceRecords.where("groupId").equals(groupId).toArray(),
  ]);
  const liveIntakes = intakes.filter((r) => isLive(r) && r.id !== water.id);
  const liveSubstances = substances.filter(isLive);
  let kind: DrinkKind = "drink";
  if (eatings.some(isLive)) kind = "meal-water";
  else if (liveIntakes.some((r) => r.type === "water")) kind = "other";
  return { kind, water, intakes: liveIntakes, substances: liveSubstances };
}

function drinkVolume(group: DrinkGroup): number {
  const volumes = group.substances
    .map((s) => s.volumeMl)
    .filter((v): v is number => v !== undefined && v > 0);
  return volumes.length > 0 ? Math.max(...volumes) : group.water.amount;
}

function storedAbv(alcohol: SubstanceRecord, volumeMl: number): number | undefined {
  if (alcohol.abvPercent !== undefined) return alcohol.abvPercent;
  if (alcohol.amountStandardDrinks === undefined || volumeMl <= 0) return undefined;
  const derived = abvFromStandardDrinks(
    alcohol.amountStandardDrinks,
    alcohol.volumeMl ?? volumeMl,
  );
  return Number.isFinite(derived) ? derived : undefined;
}

/**
 * The drink a water row belongs to, as the edit form shows it, or `null` when
 * the row is gone or is not a water row.
 */
export async function getDrink(waterIntakeId: string): Promise<DrinkSnapshot | null> {
  const group = await loadDrinkGroup(waterIntakeId);
  if (!group) return null;
  const volumeMl = drinkVolume(group);
  const snapshot: DrinkSnapshot = { kind: group.kind, water: group.water, volumeMl };
  if (group.kind !== "drink") return snapshot;

  const caffeine = group.substances.find((s) => s.type === "caffeine");
  const alcohol = group.substances.find((s) => s.type === "alcohol");
  const sugar = group.intakes.find((r) => r.type === "sugar");
  const description = caffeine?.description || alcohol?.description;
  if (description) snapshot.description = description;
  if (caffeine?.amountMg !== undefined) snapshot.caffeineMg = caffeine.amountMg;
  const abv = alcohol ? storedAbv(alcohol, volumeMl) : undefined;
  if (abv !== undefined) snapshot.abvPercent = abv;
  if (sugar) snapshot.sugarG = sugar.amount;
  return snapshot;
}

/**
 * The water row of the drink that a row belongs to, or `null` when the row is
 * not part of a drink (a meal, a caffeine dose with no volume, old data with
 * two water rows).
 */
export async function findDrinkWaterId(
  table: "intakeRecords" | "substanceRecords",
  id: string,
): Promise<string | null> {
  const row =
    table === "intakeRecords"
      ? await db.intakeRecords.get(id)
      : await db.substanceRecords.get(id);
  if (!row || !isLive(row)) return null;
  if (table === "intakeRecords" && (row as IntakeRecord).type === "water") {
    const group = await loadDrinkGroup(id);
    return group?.kind === "drink" ? id : null;
  }
  if (!row.groupId) return null;
  const waters = (
    await db.intakeRecords.where("groupId").equals(row.groupId).toArray()
  ).filter((r) => isLive(r) && r.type === "water");
  if (waters.length !== 1) return null;
  const group = await loadDrinkGroup(waters[0]!.id);
  return group?.kind === "drink" ? group.water.id : null;
}

// ─── editDrink ────────────────────────────────────────────────────────

/** A change to one drink. See {@link editDrink}. */
export interface EditDrinkInput {
  volumeMl: number;
  timestamp: number;
  /** The water row's note. `undefined` clears it. */
  note?: string | undefined;
  /** A new `source` tag for the water row (a renamed beverage). */
  waterSource?: string;
  /** The drink's name, written onto its caffeine/alcohol records. */
  description?: string;
  /**
   * For `caffeineMg`, `abvPercent` and `sugarG`: leave out to keep the drink's
   * strength (the amount follows the volume), `0` to remove it, or a positive
   * value to set it.
   */
  caffeineMg?: number;
  abvPercent?: number;
  sugarG?: number;
}

/**
 * Change one drink. Every row of the drink moves to the new time, and the
 * water row always equals the drink volume.
 *
 * When the volume changes, the drink keeps its strength: caffeine, sugar,
 * sodium and potassium scale with it, ABV stays, and standard drinks are
 * worked out again. A caffeine, ABV or sugar value in `input` wins over the
 * scaled one.
 *
 * A meal's water row, or a water row that shares its group with another one,
 * is edited on its own (amount, note, time) and its group moves to the new
 * time with it. Caffeine, ABV and sugar are ignored for those rows.
 *
 * @param waterIntakeId The drink's water row.
 */
export async function editDrink(
  waterIntakeId: string,
  input: EditDrinkInput,
): Promise<ServiceResult<void>> {
  if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
    return err("A drink needs a positive volume in ml");
  }
  try {
    const fields = syncFields();
    const volumeMl = Math.max(1, Math.round(input.volumeMl));
    const ts = input.timestamp;

    await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      const group = await loadDrinkGroup(waterIntakeId);
      if (!group) throw new Error("Drink not found");
      const { water } = group;

      const tombstone = (table: "intakeRecords" | "substanceRecords", id: string) =>
        w.tombstone(table, id);

      // ── The water row: always the full drink volume ──
      // An `undefined` note clears it.
      const waterPatch: SyncedChanges<"intakeRecords"> = {
        amount: volumeMl,
        timestamp: ts,
        note: input.note,
      };
      if (input.waterSource !== undefined) waterPatch.source = input.waterSource;

      if (group.kind !== "drink") {
        await w.patch("intakeRecords", water.id, waterPatch);
        if (water.groupId) await retimeGroup(w, water.groupId, ts);
        return;
      }

      const ratio = volumeMl / drinkVolume(group);
      const scale = (amount: number) => (ratio === 1 ? amount : amount * ratio);
      const description = input.description?.trim() || undefined;

      let groupId = water.groupId;
      const adds =
        (input.caffeineMg ?? 0) > 0 || (input.abvPercent ?? 0) > 0 || (input.sugarG ?? 0) > 0;
      if (!groupId && adds) {
        groupId = crypto.randomUUID();
        waterPatch.groupId = groupId;
      }
      await w.patch("intakeRecords", water.id, waterPatch);
      if (!groupId) return;
      const groupSource = water.groupSource;

      // ── Caffeine and alcohol: one record each ──
      const upsertSubstance = async (
        type: "caffeine" | "alcohol",
        values: Partial<SubstanceRecord> | null,
      ) => {
        const [existing, ...extra] = group.substances.filter((s) => s.type === type);
        for (const dup of extra) await tombstone("substanceRecords", dup.id);
        if (values === null) {
          if (existing) await tombstone("substanceRecords", existing.id);
          return;
        }
        const common = {
          ...values,
          volumeMl,
          timestamp: ts,
          ...(description !== undefined && { description }),
        };
        if (existing) {
          await w.patch("substanceRecords", existing.id, common);
          return;
        }
        const record: SubstanceRecord = {
          id: crypto.randomUUID(),
          type,
          description: description ?? water.note ?? "Drink",
          source: "standalone",
          aiEnriched: false,
          groupId,
          ...(groupSource !== undefined && { groupSource }),
          ...fields,
          ...common,
        };
        await w.insert("substanceRecords", record);
      };

      const caffeine = group.substances.find((s) => s.type === "caffeine");
      const caffeineMg = Math.round(
        input.caffeineMg ?? (caffeine?.amountMg !== undefined ? scale(caffeine.amountMg) : 0),
      );
      if (caffeineMg > 0) await upsertSubstance("caffeine", { amountMg: caffeineMg });
      else if (input.caffeineMg !== undefined || caffeine?.amountMg !== undefined) {
        await upsertSubstance("caffeine", null);
      } else if (caffeine) {
        // A caffeine record with no amount (old data): keep it with the drink.
        await upsertSubstance("caffeine", {});
      }

      const alcohol = group.substances.find((s) => s.type === "alcohol");
      const abv = input.abvPercent ?? (alcohol ? storedAbv(alcohol, drinkVolume(group)) : undefined);
      if (abv !== undefined && abv > 0) {
        await upsertSubstance("alcohol", {
          abvPercent: abv,
          amountStandardDrinks: standardDrinks(abv, volumeMl),
        });
      } else if (input.abvPercent !== undefined) {
        await upsertSubstance("alcohol", null);
      } else if (alcohol) {
        // No ABV to work from: scale the stored standard drinks instead.
        await upsertSubstance(
          "alcohol",
          alcohol.amountStandardDrinks !== undefined
            ? {
                amountStandardDrinks: parseFloat(
                  scale(alcohol.amountStandardDrinks).toFixed(STANDARD_DRINKS_DP),
                ),
              }
            : {},
        );
      }

      // ── Dissolved solutes ──
      const sugars = group.intakes.filter((r) => r.type === "sugar");
      if (input.sugarG !== undefined) {
        const [existing, ...extra] = sugars;
        for (const dup of extra) await tombstone("intakeRecords", dup.id);
        const amount = Math.round(input.sugarG);
        if (amount <= 0) {
          if (existing) await tombstone("intakeRecords", existing.id);
        } else if (existing) {
          await w.patch("intakeRecords", existing.id, { amount, timestamp: ts });
        } else {
          const record: IntakeRecord = {
            id: crypto.randomUUID(),
            type: "sugar",
            amount,
            timestamp: ts,
            source: SUGAR_SOURCE,
            groupId,
            ...(groupSource !== undefined && { groupSource }),
            ...fields,
          };
          await w.insert("intakeRecords", record);
        }
      }
      if (ratio !== 1) {
        const scaled = group.intakes.filter(
          (r) =>
            r.type === "salt" ||
            r.type === "potassium" ||
            (r.type === "sugar" && input.sugarG === undefined),
        );
        for (const row of scaled) {
          const amount = Math.round(scale(row.amount));
          if (amount <= 0) {
            await tombstone("intakeRecords", row.id);
            continue;
          }
          const patch: SyncedChanges<"intakeRecords"> = { amount, timestamp: ts };
          if (row.sourceAmount !== undefined) {
            patch.sourceAmount = parseFloat(scale(row.sourceAmount).toFixed(2));
          }
          await w.patch("intakeRecords", row.id, patch);
        }
      }

      // Every row left (and any the patch did not touch) moves with the drink.
      await retimeGroup(w, groupId, ts);
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to edit drink", e);
  }
}

// ─── deleteDrink ──────────────────────────────────────────────────────

export type DeleteDrinkResult =
  | { scope: "group"; groupId: string; deletedAt: number; deletedCount: number }
  | { scope: "record" };

/**
 * Delete what a liquid row stands for. A drink's water row takes the whole
 * drink with it (substances and solutes too). A meal's water row, or any row
 * that is not a drink's water row, is deleted on its own, so the meal stays.
 */
export async function deleteDrink(
  intakeId: string,
): Promise<ServiceResult<DeleteDrinkResult>> {
  try {
    const group = await loadDrinkGroup(intakeId);
    if (group?.kind === "drink" && group.water.groupId) {
      const result = await deleteEntryGroup(group.water.groupId);
      if (!result.success) return result;
      return ok({ scope: "group", groupId: group.water.groupId, ...result.data });
    }
    const result = await deleteIntakeRecord(intakeId);
    if (!result.success) return result;
    return ok({ scope: "record" });
  } catch (e) {
    return err("Failed to delete drink", e);
  }
}
