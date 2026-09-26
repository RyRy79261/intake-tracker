import { db } from "@/lib/db";
import type {
  IntakeRecord,
  EatingRecord,
  SubstanceRecord,
  SodiumSource,
  SodiumSourceUnit,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { roundGrams } from "@/lib/eating-service";
import { standardDrinksFromAbv } from "@intake/core/alcohol";
import { isLive } from "@intake/core/lifecycle";

const COMPOSABLE_TABLES = [db.intakeRecords, db.eatingRecords, db.substanceRecords] as const;

// ─── Input / Output types ─────────────────────────────────────────────

export interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: Array<{
    type: "water" | "salt" | "sugar" | "potassium";
    amount: number;
    source?: string;
    note?: string;
    /** Sodium rows only: the substance and amount the user typed. */
    sodiumSource?: SodiumSource;
    sourceAmount?: number;
    sourceUnit?: SodiumSourceUnit;
  }>;
  substance?: {
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    abvPercent?: number;
    volumeMl?: number;
    description: string;
  };
  substances?: Array<{
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    abvPercent?: number;
    volumeMl?: number;
    description: string;
  }>;
  originalInputText?: string;
  groupSource?: string;
}

export interface ComposableEntryResult {
  groupId: string;
  eatingId?: string;
  intakeIds: string[];
  substanceId?: string;    // kept for backward compat (single substance)
  substanceIds: string[];  // all substance record IDs
}

export interface EntryGroup {
  groupId: string;
  intakes: IntakeRecord[];
  eatings: EatingRecord[];
  substances: SubstanceRecord[];
}

export type RecordTable = "intakeRecords" | "eatingRecords" | "substanceRecords";

// ─── addComposableEntry ───────────────────────────────────────────────

export async function addComposableEntry(
  input: ComposableEntryInput,
  timestamp?: number,
): Promise<ServiceResult<ComposableEntryResult>> {
  try {
    const groupId = crypto.randomUUID();
    const ts = timestamp ?? Date.now();
    const fields = syncFields();
    const intakeIds: string[] = [];
    const substanceIds: string[] = [];
    let eatingId: string | undefined;
    let substanceId: string | undefined;

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      // ── Eating record ──
      if (input.eating) {
        const id = crypto.randomUUID();
        eatingId = id;
        const wholeGrams = roundGrams(input.eating.grams);
        const record: EatingRecord = {
          id,
          timestamp: ts,
          groupId,
          ...(wholeGrams !== undefined && { grams: wholeGrams }),
          ...(input.eating.note !== undefined && { note: input.eating.note }),
          ...(input.originalInputText !== undefined && { originalInputText: input.originalInputText }),
          ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
          ...fields,
        };
        await db.eatingRecords.add(record);
        await enqueueInsideTx("eatingRecords", id, "upsert");
      }

      // ── Intake records ──
      if (input.intakes) {
        for (const intake of input.intakes) {
          const id = crypto.randomUUID();
          intakeIds.push(id);
          const record: IntakeRecord = {
            id,
            type: intake.type,
            amount: intake.amount,
            timestamp: ts,
            source: intake.source ?? "composable",
            groupId,
            ...(intake.note !== undefined && { note: intake.note }),
            ...(intake.type === "salt" && intake.sodiumSource !== undefined && {
              sodiumSource: intake.sodiumSource,
            }),
            ...(intake.type === "salt" && intake.sourceAmount !== undefined && {
              sourceAmount: intake.sourceAmount,
            }),
            ...(intake.type === "salt" && intake.sourceUnit !== undefined && {
              sourceUnit: intake.sourceUnit,
            }),
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await db.intakeRecords.add(record);
          await enqueueInsideTx("intakeRecords", id, "upsert");
        }
      }

      // ── Substance record (singular — backward compat) ──
      // `volumeMl` is recorded as data only. This branch used to also write a
      // water IntakeRecord from it, which double-counted the fluid whenever
      // the caller had already queued its own water intake (issue #322) and
      // left the plural `substances` branch below behaving differently for
      // identical input. Drinks now go through `logDrink`, the single owner of
      // liquid volume; this path records substances and nothing more.
      if (input.substance) {
        const id = crypto.randomUUID();
        substanceId = id;
        substanceIds.push(id);
        const record: SubstanceRecord = {
          id,
          type: input.substance.type,
          ...(input.substance.amountMg !== undefined && { amountMg: input.substance.amountMg }),
          ...(input.substance.amountStandardDrinks !== undefined && { amountStandardDrinks: input.substance.amountStandardDrinks }),
          ...(input.substance.type === "alcohol" && input.substance.abvPercent !== undefined && { abvPercent: input.substance.abvPercent }),
          ...(input.substance.volumeMl !== undefined && { volumeMl: input.substance.volumeMl }),
          description: input.substance.description,
          source: "standalone" as const,
          aiEnriched: false,
          timestamp: ts,
          groupId,
          ...(!input.eating && input.originalInputText !== undefined && { originalInputText: input.originalInputText }),
          ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
          ...fields,
        };
        await db.substanceRecords.add(record);
        await enqueueInsideTx("substanceRecords", id, "upsert");
      }

      // ── Substance records (plural — multi-substance presets, per D-11) ──
      if (input.substances) {
        for (const sub of input.substances) {
          const id = crypto.randomUUID();
          substanceIds.push(id);
          const record: SubstanceRecord = {
            id,
            type: sub.type,
            ...(sub.amountMg !== undefined && { amountMg: sub.amountMg }),
            ...(sub.amountStandardDrinks !== undefined && { amountStandardDrinks: sub.amountStandardDrinks }),
            ...(sub.type === "alcohol" && sub.abvPercent !== undefined && { abvPercent: sub.abvPercent }),
            ...(sub.volumeMl !== undefined && { volumeMl: sub.volumeMl }),
            description: sub.description,
            source: "standalone" as const,
            aiEnriched: false,
            timestamp: ts,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await db.substanceRecords.add(record);
          await enqueueInsideTx("substanceRecords", id, "upsert");
        }
      }
    });

    schedulePush();
    const result: ComposableEntryResult = { groupId, intakeIds, substanceIds };
    if (eatingId !== undefined) result.eatingId = eatingId;
    if (substanceId !== undefined) result.substanceId = substanceId;
    return ok(result);
  } catch (e) {
    return err("Failed to add composable entry", e);
  }
}

// ─── Group-wide operations (shared) ───────────────────────────────────
//
// A composable entry (a meal, or a drink) is every live row sharing one
// groupId across the three record tables. Delete, undo and time edits have to
// act on all of those rows together — acting on one of them left the rest
// counting toward daily totals, or stranded on another day. These helpers must
// run inside a caller's `rw` transaction over COMPOSABLE_TABLES + _syncQueue.

/** Tombstone every live row in the group with the `now` stamp. */
async function tombstoneGroupInTx(groupId: string, now: number): Promise<number> {
  let count = 0;
  for (const table of COMPOSABLE_TABLES) {
    const records = await table.where("groupId").equals(groupId).toArray();
    for (const record of records) {
      if (!isLive(record)) continue;
      await table.update(record.id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx(table.name as RecordTable, record.id, "upsert");
      count++;
    }
  }
  return count;
}

/**
 * Restore only the rows whose tombstone is exactly `deletedAt` — the ones a
 * single group delete wrote. Rows removed earlier (an edit cleared the
 * caffeine, a duplicate was reconciled away) carry a different stamp and stay
 * deleted; restoring "every deleted row in the group" resurrected them.
 */
async function restoreGroupInTx(
  groupId: string,
  deletedAt: number,
  now: number,
): Promise<number> {
  let count = 0;
  for (const table of COMPOSABLE_TABLES) {
    const records = await table.where("groupId").equals(groupId).toArray();
    for (const record of records) {
      if (record.deletedAt !== deletedAt) continue;
      await table.update(record.id, { deletedAt: null, updatedAt: now });
      await enqueueInsideTx(table.name as RecordTable, record.id, "upsert");
      count++;
    }
  }
  return count;
}

/** Move every live row in the group to `timestamp`. */
async function retimeGroupInTx(
  groupId: string,
  timestamp: number,
  now: number,
): Promise<void> {
  for (const table of COMPOSABLE_TABLES) {
    const records = await table.where("groupId").equals(groupId).toArray();
    for (const record of records) {
      if (!isLive(record) || record.timestamp === timestamp) continue;
      await table.update(record.id, { timestamp, updatedAt: now });
      await enqueueInsideTx(table.name as RecordTable, record.id, "upsert");
    }
  }
}

// ─── deleteEntryGroup ─────────────────────────────────────────────────

/**
 * Soft-delete every live row in a group. Returns the tombstone stamp so the
 * undo can restore exactly these rows (see {@link undoDeleteEntryGroup}).
 */
export async function deleteEntryGroup(
  groupId: string,
): Promise<ServiceResult<{ deletedCount: number; deletedAt: number }>> {
  try {
    let deletedCount = 0;
    const now = Date.now();

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      deletedCount = await tombstoneGroupInTx(groupId, now);
    });

    schedulePush();
    return ok({ deletedCount, deletedAt: now });
  } catch (e) {
    return err("Failed to delete entry group", e);
  }
}

// ─── classifyLiquidDelete ─────────────────────────────────────────────

/**
 * Decide whether deleting a liquid IntakeRecord should take its whole group
 * with it.
 *
 * A drink is stored as its fluid (a water IntakeRecord) plus its substances.
 * Deleting just the water row left the caffeine/alcohol record alive and still
 * counting toward daily totals — and the reverse, deleting the substance,
 * already cascaded, so the two directions disagreed.
 *
 * A meal is different: its water-content row is one component of an eating
 * record, and removing that component must not delete the meal. So the group
 * is taken as a whole whenever it has no live eating record — i.e. it is a
 * drink, whether or not it carries a caffeine/alcohol record. A beverage with
 * only sugar, or a drink with only dissolved salt/potassium, is still one
 * drink; deleting just its water row left those solutes counting with no
 * Liquids entry left to reach them from.
 *
 * Only the drink's water row speaks for the drink. Deleting one of its other
 * rows (from the Records tab) removes just that row.
 */
export async function classifyLiquidDelete(
  intakeId: string,
): Promise<{ scope: "group"; groupId: string } | { scope: "record" }> {
  const intake = await db.intakeRecords.get(intakeId);
  if (!intake?.groupId || intake.type !== "water") return { scope: "record" };

  const eatings = await db.eatingRecords
    .where("groupId")
    .equals(intake.groupId)
    .toArray();

  if (!eatings.some(isLive)) {
    return { scope: "group", groupId: intake.groupId };
  }
  return { scope: "record" };
}

// ─── undoDeleteEntryGroup ─────────────────────────────────────────────

/**
 * Reverse a {@link deleteEntryGroup}. `deletedAt` is the stamp that delete
 * returned; only rows carrying it are restored.
 */
export async function undoDeleteEntryGroup(
  groupId: string,
  deletedAt: number,
): Promise<ServiceResult<{ restoredCount: number }>> {
  try {
    let restoredCount = 0;
    const now = Date.now();

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      restoredCount = await restoreGroupInTx(groupId, deletedAt, now);
    });

    schedulePush();
    return ok({ restoredCount });
  } catch (e) {
    return err("Failed to undo delete entry group", e);
  }
}

// ─── Eating entry (meal) delete / undo / edit ─────────────────────────

/**
 * Delete a meal: its eating record plus every live row in its group (sodium,
 * water content, sugar, potassium, any substance). Deleting the eating record
 * alone left those rows counting toward the daily totals, unreachable from
 * the Food card. An ungrouped eating record is deleted on its own.
 */
export async function deleteEatingEntry(
  eatingId: string,
): Promise<ServiceResult<{ deletedCount: number; deletedAt: number }>> {
  try {
    let deletedCount = 0;
    const now = Date.now();

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      if (eating.groupId) {
        deletedCount = await tombstoneGroupInTx(eating.groupId, now);
      } else if (isLive(eating)) {
        await db.eatingRecords.update(eatingId, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("eatingRecords", eatingId, "upsert");
        deletedCount = 1;
      }
    });

    schedulePush();
    return ok({ deletedCount, deletedAt: now });
  } catch (e) {
    return err("Failed to delete eating entry", e);
  }
}

/** Reverse a {@link deleteEatingEntry} using the stamp it returned. */
export async function undoDeleteEatingEntry(
  eatingId: string,
  deletedAt: number,
): Promise<ServiceResult<{ restoredCount: number }>> {
  try {
    let restoredCount = 0;
    const now = Date.now();

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      if (eating.groupId) {
        restoredCount = await restoreGroupInTx(eating.groupId, deletedAt, now);
      } else if (eating.deletedAt === deletedAt) {
        await db.eatingRecords.update(eatingId, { deletedAt: null, updatedAt: now });
        await enqueueInsideTx("eatingRecords", eatingId, "upsert");
        restoredCount = 1;
      }
    });

    schedulePush();
    return ok({ restoredCount });
  } catch (e) {
    return err("Failed to undo delete eating entry", e);
  }
}

/**
 * Edit a meal's time / note / grams from a surface that does not edit its
 * nutrients (the Records tab). The time moves the whole group, so the meal's
 * sodium and water do not stay behind on the old day.
 *
 * `note`: key present ⇒ set it (`undefined` clears); key absent ⇒ untouched.
 */
export async function updateEatingEntry(
  eatingId: string,
  updates: { timestamp?: number; note?: string | undefined; grams?: number },
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      // Dexie's update accepts undefined to clear optional fields, but
      // exactOptionalPropertyTypes rejects that on Partial<EatingRecord>.
      const eatingUpdates: Record<string, unknown> = { updatedAt: now };
      if (updates.timestamp !== undefined) eatingUpdates.timestamp = updates.timestamp;
      if ("note" in updates) eatingUpdates.note = updates.note;
      if (updates.grams !== undefined) {
        const wholeGrams = roundGrams(updates.grams);
        if (wholeGrams !== undefined) eatingUpdates.grams = wholeGrams;
      }
      await db.eatingRecords.update(eatingId, eatingUpdates);
      await enqueueInsideTx("eatingRecords", eatingId, "upsert");

      if (eating.groupId && updates.timestamp !== undefined) {
        await retimeGroupInTx(eating.groupId, updates.timestamp, now);
      }
    });

    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update eating entry", e);
  }
}

// ─── getEntryGroup ────────────────────────────────────────────────────

export async function getEntryGroup(
  groupId: string | undefined,
): Promise<EntryGroup | null> {
  if (!groupId) return null;

  const [intakes, eatings, substances] = await Promise.all([
    db.intakeRecords.where("groupId").equals(groupId).toArray(),
    db.eatingRecords.where("groupId").equals(groupId).toArray(),
    db.substanceRecords.where("groupId").equals(groupId).toArray(),
  ]);

  return {
    groupId,
    intakes: intakes.filter((r) => r.deletedAt === null),
    eatings: eatings.filter((r) => r.deletedAt === null),
    substances: substances.filter((r) => r.deletedAt === null),
  };
}

// ─── syncEatingGroup ──────────────────────────────────────────────────

export type SodiumKind = SodiumSource;

const FOOD_WATER_SOURCE = "manual:food_water_content";
const SUGAR_SOURCE = "manual:sugar";
const POTASSIUM_SOURCE = "manual:potassium";

/** A meal group's nutrient rows, split into the one to reconcile and extras. */
export interface EatingGroupNutrients {
  salts: IntakeRecord[];
  waters: IntakeRecord[];
  sugars: IntakeRecord[];
  potassiums: IntakeRecord[];
}

/**
 * The live salt / water / sugar / potassium rows of a meal group, whatever
 * their `source`. In a group that holds an eating record every row of these
 * types belongs to the meal, including legacy ones written by older builds
 * (`food:ai_parse`, `manual:<preset name>`).
 *
 * The Food card's edit prefill and {@link syncEatingGroup} both read through
 * this, so they cannot disagree: the prefill used to pick up a legacy salt row
 * the reconcile didn't recognise, and saving then added a second sodium row.
 */
export function pickEatingGroupNutrients(intakes: IntakeRecord[]): EatingGroupNutrients {
  const live = intakes.filter(isLive);
  return {
    salts: live.filter((r) => r.type === "salt"),
    waters: live.filter((r) => r.type === "water"),
    sugars: live.filter((r) => r.type === "sugar"),
    potassiums: live.filter((r) => r.type === "potassium"),
  };
}

/**
 * Apply edits to an eating record and its linked sodium / water-content
 * intake records (linked by groupId). Creates/updates/soft-deletes the
 * linked intake records to match the requested values.
 *
 * - If the eating record has no groupId, one is generated and assigned.
 * - sodiumMg / waterMl of 0 (or undefined) soft-deletes any existing
 *   linked record of that kind.
 */
export async function syncEatingGroup(
  eatingId: string,
  patch: {
    timestamp: number;
    note: string | undefined;
    grams: number | undefined;
    sodiumMg: number;
    sodiumKind: SodiumKind;
    /**
     * The amount/unit of `sodiumKind` the user typed (e.g. 2 g of salt), stored
     * beside the converted `sodiumMg`. Omit when the sodium field was not
     * edited: an unchanged row then keeps its value, source tag and any
     * recorded source; a changed mg without an entry drops the stale source.
     */
    sodiumEntry?: { amount: number; unit: SodiumSourceUnit };
    waterMl: number;
    /** `undefined` ⇒ leave any existing linked sugar record untouched
     *  (used when the optional tracker is disabled). `0` ⇒ soft-delete. */
    sugarG?: number;
    /** Same semantics as `sugarG` for potassium. */
    potassiumMg?: number;
  },
): Promise<ServiceResult<void>> {
  try {
    const fields = syncFields();
    const now = fields.updatedAt;

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      // Every intake row this function writes has to reach the sync engine.
      // Without that, a food-card edit stayed local: a later full pull would
      // silently revert the amounts and resurrect the duplicate rows the
      // reconciliation below tombstones.
      const touchedIntakeIds = new Set<string>();
      const addIntake = async (record: IntakeRecord) => {
        await db.intakeRecords.add(record);
        touchedIntakeIds.add(record.id);
      };
      const patchIntake = async (id: string, updates: Record<string, unknown>) => {
        await db.intakeRecords.update(id, updates);
        touchedIntakeIds.add(id);
      };

      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      let groupId = eating.groupId;
      if (
        !groupId &&
        (patch.sodiumMg > 0 ||
          patch.waterMl > 0 ||
          (patch.sugarG !== undefined && patch.sugarG > 0) ||
          (patch.potassiumMg !== undefined && patch.potassiumMg > 0))
      ) {
        groupId = crypto.randomUUID();
      }

      // ── Update the eating record itself ──
      // Note: Dexie's update accepts undefined to clear optional fields,
      // but exactOptionalPropertyTypes rejects that on Partial<EatingRecord>.
      const eatingUpdates: Record<string, unknown> = {
        timestamp: patch.timestamp,
        note: patch.note,
        grams: roundGrams(patch.grams),
        updatedAt: now,
      };
      if (!eating.groupId && groupId) eatingUpdates.groupId = groupId;
      await db.eatingRecords.update(eatingId, eatingUpdates);
      await enqueueInsideTx("eatingRecords", eatingId, "upsert");

      if (!groupId) return; // Nothing else to sync

      // ── Find existing linked records ──
      const groupIntakes = await db.intakeRecords
        .where("groupId")
        .equals(groupId)
        .toArray();

      // Some legacy data may have multiple linked salt/water rows in one
      // group. Reconcile the first match with the new value, soft-delete
      // the rest so duplicates don't keep contributing to totals.
      const {
        salts: existingSalts,
        waters: existingWaters,
        sugars: existingSugars,
        potassiums: existingPotassiums,
      } = pickEatingGroupNutrients(groupIntakes);
      const [existingSalt, ...extraSalts] = existingSalts;
      const [existingWater, ...extraWaters] = existingWaters;
      const [existingSugar, ...extraSugars] = existingSugars;
      const [existingPotassium, ...extraPotassiums] = existingPotassiums;

      const sodiumSource = `manual:${patch.sodiumKind}`;
      const groupSource = eating.groupSource ?? "manual_food_entry";

      // ── Sodium intake ──
      const entry = patch.sodiumEntry;
      const entryFields = entry
        ? {
            sodiumSource: patch.sodiumKind,
            sourceAmount: entry.amount,
            sourceUnit: entry.unit,
          }
        : undefined;
      if (patch.sodiumMg > 0) {
        if (existingSalt) {
          const sodiumUpdates: Record<string, unknown> = {
            amount: patch.sodiumMg,
            timestamp: patch.timestamp,
            updatedAt: now,
          };
          if (entryFields) {
            sodiumUpdates.source = sodiumSource;
            Object.assign(sodiumUpdates, entryFields);
          } else if (existingSalt.amount !== patch.sodiumMg) {
            // A new mg with no typed entry: whatever was recorded no longer
            // describes this value. Clearing (never rewriting) keeps the row
            // honest; the push sends null for the removed keys.
            sodiumUpdates.source = sodiumSource;
            sodiumUpdates.sodiumSource = undefined;
            sodiumUpdates.sourceAmount = undefined;
            sodiumUpdates.sourceUnit = undefined;
          }
          await patchIntake(existingSalt.id, sodiumUpdates);
        } else {
          const record: IntakeRecord = {
            id: crypto.randomUUID(),
            type: "salt",
            amount: patch.sodiumMg,
            timestamp: patch.timestamp,
            source: sodiumSource,
            ...entryFields,
            groupId,
            groupSource,
            ...fields,
          };
          await addIntake(record);
        }
      } else if (existingSalt) {
        await patchIntake(existingSalt.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
      for (const dup of extraSalts) {
        await patchIntake(dup.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }

      // ── Water content intake ──
      if (patch.waterMl > 0) {
        const waterNote = patch.note;
        if (existingWater) {
          // Don't clear an existing note when the patch doesn't carry one.
          const waterUpdates: Record<string, unknown> = {
            amount: patch.waterMl,
            timestamp: patch.timestamp,
            updatedAt: now,
            ...(waterNote !== undefined && { note: waterNote }),
          };
          await patchIntake(existingWater.id, waterUpdates);
        } else {
          const record: IntakeRecord = {
            id: crypto.randomUUID(),
            type: "water",
            amount: patch.waterMl,
            timestamp: patch.timestamp,
            source: FOOD_WATER_SOURCE,
            groupId,
            groupSource,
            ...(waterNote !== undefined && { note: waterNote }),
            ...fields,
          };
          await addIntake(record);
        }
      } else if (existingWater) {
        await patchIntake(existingWater.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
      for (const dup of extraWaters) {
        await patchIntake(dup.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }

      // ── Sugar intake ──
      // `undefined` ⇒ caller (optional tracker disabled) opted out of the
      // sugar field; preserve any existing linked record untouched.
      if (patch.sugarG !== undefined) {
        if (patch.sugarG > 0) {
          if (existingSugar) {
            await patchIntake(existingSugar.id, {
              amount: patch.sugarG,
              timestamp: patch.timestamp,
              updatedAt: now,
            });
          } else {
            const record: IntakeRecord = {
              id: crypto.randomUUID(),
              type: "sugar",
              amount: patch.sugarG,
              timestamp: patch.timestamp,
              source: SUGAR_SOURCE,
              groupId,
              groupSource,
              ...fields,
            };
            await addIntake(record);
          }
        } else if (existingSugar) {
          await patchIntake(existingSugar.id, {
            deletedAt: now,
            updatedAt: now,
          });
        }
        for (const dup of extraSugars) {
          await patchIntake(dup.id, {
            deletedAt: now,
            updatedAt: now,
          });
        }
      }

      // ── Potassium intake ──
      // `undefined` ⇒ caller opted out; preserve existing linked record.
      if (patch.potassiumMg !== undefined) {
        if (patch.potassiumMg > 0) {
          if (existingPotassium) {
            await patchIntake(existingPotassium.id, {
              amount: patch.potassiumMg,
              timestamp: patch.timestamp,
              updatedAt: now,
            });
          } else {
            const record: IntakeRecord = {
              id: crypto.randomUUID(),
              type: "potassium",
              amount: patch.potassiumMg,
              timestamp: patch.timestamp,
              source: POTASSIUM_SOURCE,
              groupId,
              groupSource,
              ...fields,
            };
            await addIntake(record);
          }
        } else if (existingPotassium) {
          await patchIntake(existingPotassium.id, {
            deletedAt: now,
            updatedAt: now,
          });
        }
        for (const dup of extraPotassiums) {
          await patchIntake(dup.id, {
            deletedAt: now,
            updatedAt: now,
          });
        }
      }

      for (const id of touchedIntakeIds) {
        await enqueueInsideTx("intakeRecords", id, "upsert");
      }

      // Rows the patch didn't address (a sugar row while the tracker is off,
      // a substance logged with the meal) still move with it.
      await retimeGroupInTx(groupId, patch.timestamp, now);
    });

    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to sync eating group", e);
  }
}

/** Sodium kind embedded in the source tag of a linked salt intake record. */
export function parseSodiumKindFromSource(source: string | undefined): SodiumKind {
  if (source === "manual:salt") return "salt";
  if (source === "manual:msg") return "msg";
  return "sodium";
}

// ─── syncLiquidEntrySubstances ────────────────────────────────────────

/**
 * Apply caffeine / alcohol / sugar edits to the group around a liquid
 * IntakeRecord. Creates / updates / soft-deletes linked SubstanceRecords
 * (caffeine, alcohol) and IntakeRecords (sugar) so the group reflects the
 * patch.
 *
 * - If the intake has no groupId and the patch introduces any substance or
 *   sugar, one is generated and assigned to the intake.
 * - `caffeineMg` / `alcoholAbv` / `sugarG`:
 *     - `null` ⇒ leave the field untouched (caller opted out, e.g. sugar
 *       tracker disabled).
 *     - `0` or negative ⇒ soft-delete any existing linked record of that
 *       kind.
 *     - `>0` ⇒ upsert.
 * - `waterMl` is the edited water row's amount and `previousWaterMl` what it
 *   was before the edit. The drink's volume lives on its substance records
 *   and is NOT the water amount: a spirit logged at 60% water has a 27 ml
 *   water row but a 45 ml alcohol record. So the drink volume is only scaled
 *   by `waterMl / previousWaterMl` — a time-only edit leaves it (and the
 *   derived `amountStandardDrinks`) exactly as it was. With no
 *   `previousWaterMl`, or no stored substance volume, the drink is taken to
 *   be all water (drink volume = `waterMl`), as every drink logged before
 *   water content existed was.
 */
export async function syncLiquidEntrySubstances(
  intakeId: string,
  patch: {
    timestamp: number;
    waterMl: number;
    previousWaterMl?: number;
    description?: string;
    caffeineMg: number | null;
    alcoholAbv: number | null;
    sugarG: number | null;
  },
): Promise<ServiceResult<void>> {
  try {
    const fields = syncFields();
    const now = fields.updatedAt;

    await db.transaction(
      "rw",
      [...COMPOSABLE_TABLES, db._syncQueue],
      async () => {
        const intake = await db.intakeRecords.get(intakeId);
        if (!intake) throw new Error("Intake record not found");

        // A meal's water-content row also shows in the Liquids list. Its
        // group's sugar belongs to the meal, and a meal takes no caffeine or
        // alcohol from this form — so only move the meal as a whole, eating
        // record included, instead of splitting it across two times.
        if (intake.groupId) {
          const eatings = await db.eatingRecords
            .where("groupId")
            .equals(intake.groupId)
            .toArray();
          if (eatings.some(isLive)) {
            await retimeGroupInTx(intake.groupId, patch.timestamp, now);
            return;
          }
        }

        const needsGroup =
          (patch.caffeineMg !== null && patch.caffeineMg > 0) ||
          (patch.alcoholAbv !== null && patch.alcoholAbv > 0) ||
          (patch.sugarG !== null && patch.sugarG > 0);

        let groupId = intake.groupId;
        if (!groupId && needsGroup) {
          groupId = crypto.randomUUID();
          await db.intakeRecords.update(intakeId, { groupId, updatedAt: now });
          await enqueueInsideTx("intakeRecords", intakeId, "upsert");
        }

        if (!groupId) return; // nothing to sync

        const groupIntakes = await db.intakeRecords
          .where("groupId")
          .equals(groupId)
          .toArray();
        const groupSubstances = await db.substanceRecords
          .where("groupId")
          .equals(groupId)
          .toArray();

        const groupSource = intake.groupSource;
        const description = patch.description?.trim() || undefined;

        // Drink volume, kept apart from the water amount (see the doc above).
        const scale =
          patch.previousWaterMl !== undefined && patch.previousWaterMl > 0
            ? patch.waterMl / patch.previousWaterMl
            : null;
        const scaledVolume = (stored: number | undefined): number =>
          scale !== null && stored !== undefined
            ? scale === 1
              ? stored
              : Math.round(stored * scale)
            : patch.waterMl;
        // A substance added by this edit takes the drink volume of a live
        // sibling that has one, so a spirit's new caffeine is not booked
        // against its (smaller) water amount.
        const siblingVolume = groupSubstances.find(
          (s) => s.deletedAt === null && s.volumeMl !== undefined,
        )?.volumeMl;
        const newSubstanceVolume = scaledVolume(siblingVolume);

        // ── Caffeine ──
        if (patch.caffeineMg !== null) {
          const existingCaffeines = groupSubstances.filter(
            (s) => s.type === "caffeine" && s.deletedAt === null,
          );
          const [existingCaffeine, ...extraCaffeines] = existingCaffeines;
          if (patch.caffeineMg > 0) {
            const amountMg = Math.round(patch.caffeineMg);
            if (existingCaffeine) {
              const updates: Partial<SubstanceRecord> = {
                amountMg,
                timestamp: patch.timestamp,
                updatedAt: now,
              };
              if (description !== undefined) updates.description = description;
              if (existingCaffeine.volumeMl !== undefined) {
                updates.volumeMl = scaledVolume(existingCaffeine.volumeMl);
              }
              await db.substanceRecords.update(existingCaffeine.id, updates);
              await enqueueInsideTx("substanceRecords", existingCaffeine.id, "upsert");
            } else {
              const record: SubstanceRecord = {
                id: crypto.randomUUID(),
                type: "caffeine",
                amountMg,
                volumeMl: newSubstanceVolume,
                description: description ?? "Drink",
                source: "standalone",
                timestamp: patch.timestamp,
                groupId,
                ...(groupSource !== undefined && { groupSource }),
                ...fields,
              };
              await db.substanceRecords.add(record);
              await enqueueInsideTx("substanceRecords", record.id, "upsert");
            }
          } else if (existingCaffeine) {
            await db.substanceRecords.update(existingCaffeine.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("substanceRecords", existingCaffeine.id, "upsert");
          }
          for (const dup of extraCaffeines) {
            await db.substanceRecords.update(dup.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("substanceRecords", dup.id, "upsert");
          }
        }

        // ── Alcohol ──
        if (patch.alcoholAbv !== null) {
          const existingAlcohols = groupSubstances.filter(
            (s) => s.type === "alcohol" && s.deletedAt === null,
          );
          const [existingAlcohol, ...extraAlcohols] = existingAlcohols;
          if (patch.alcoholAbv > 0) {
            const abvPercent = patch.alcoholAbv;
            const drinkVolume = existingAlcohol
              ? scaledVolume(existingAlcohol.volumeMl)
              : newSubstanceVolume;
            const amountStandardDrinks = parseFloat(
              standardDrinksFromAbv(abvPercent, drinkVolume).toFixed(2),
            );
            if (existingAlcohol) {
              const updates: Partial<SubstanceRecord> = {
                abvPercent,
                amountStandardDrinks,
                timestamp: patch.timestamp,
                updatedAt: now,
              };
              if (description !== undefined) updates.description = description;
              if (existingAlcohol.volumeMl !== undefined) {
                updates.volumeMl = drinkVolume;
              }
              await db.substanceRecords.update(existingAlcohol.id, updates);
              await enqueueInsideTx("substanceRecords", existingAlcohol.id, "upsert");
            } else {
              const record: SubstanceRecord = {
                id: crypto.randomUUID(),
                type: "alcohol",
                abvPercent,
                amountStandardDrinks,
                volumeMl: drinkVolume,
                description: description ?? "Drink",
                source: "standalone",
                timestamp: patch.timestamp,
                groupId,
                ...(groupSource !== undefined && { groupSource }),
                ...fields,
              };
              await db.substanceRecords.add(record);
              await enqueueInsideTx("substanceRecords", record.id, "upsert");
            }
          } else if (existingAlcohol) {
            await db.substanceRecords.update(existingAlcohol.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("substanceRecords", existingAlcohol.id, "upsert");
          }
          for (const dup of extraAlcohols) {
            await db.substanceRecords.update(dup.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("substanceRecords", dup.id, "upsert");
          }
        }

        // ── Sugar ──
        if (patch.sugarG !== null) {
          const existingSugars = groupIntakes.filter(
            (r) =>
              r.type === "sugar" &&
              r.deletedAt === null &&
              r.source === SUGAR_SOURCE,
          );
          const [existingSugar, ...extraSugars] = existingSugars;
          if (patch.sugarG > 0) {
            const amount = Math.round(patch.sugarG);
            if (existingSugar) {
              await db.intakeRecords.update(existingSugar.id, {
                amount,
                timestamp: patch.timestamp,
                updatedAt: now,
              });
              await enqueueInsideTx("intakeRecords", existingSugar.id, "upsert");
            } else {
              const record: IntakeRecord = {
                id: crypto.randomUUID(),
                type: "sugar",
                amount,
                timestamp: patch.timestamp,
                source: SUGAR_SOURCE,
                groupId,
                ...(groupSource !== undefined && { groupSource }),
                ...fields,
              };
              await db.intakeRecords.add(record);
              await enqueueInsideTx("intakeRecords", record.id, "upsert");
            }
          } else if (existingSugar) {
            await db.intakeRecords.update(existingSugar.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("intakeRecords", existingSugar.id, "upsert");
          }
          for (const dup of extraSugars) {
            await db.intakeRecords.update(dup.id, {
              deletedAt: now,
              updatedAt: now,
            });
            await enqueueInsideTx("intakeRecords", dup.id, "upsert");
          }
        }

        // Every other live member (salt / potassium solutes, a sugar row the
        // patch left untouched) moves with the drink.
        await retimeGroupInTx(groupId, patch.timestamp, now);
      },
    );

    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to sync liquid entry substances", e);
  }
}
