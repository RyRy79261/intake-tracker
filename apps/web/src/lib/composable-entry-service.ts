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
import { syncedWrite, type SyncedChanges, type SyncedWriter } from "@/lib/synced-write";
import { roundGrams } from "@/lib/eating-service";
import { isLive } from "@intake/core/lifecycle";

/** The tables a composable entry (a meal or a drink) writes to. */
export const COMPOSABLE_TABLES = ["intakeRecords", "eatingRecords", "substanceRecords"] as const;

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

    await syncedWrite(COMPOSABLE_TABLES, async (w) => {
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
        await w.insert("eatingRecords", record);
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
          await w.insert("intakeRecords", record);
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
        await w.insert("substanceRecords", record);
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
          await w.insert("substanceRecords", record);
        }
      }
    });

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
// counting toward daily totals, or stranded on another day. These helpers run
// inside a caller's synced write over COMPOSABLE_TABLES.

type GroupRow = { id: string; timestamp: number; deletedAt: number | null };

function groupRows(table: RecordTable, groupId: string): Promise<GroupRow[]> {
  return db.table<GroupRow, string>(table).where("groupId").equals(groupId).toArray();
}

/** Tombstone every live row in the group with the write's `now` stamp. */
async function tombstoneGroup(w: SyncedWriter, groupId: string): Promise<number> {
  let count = 0;
  for (const table of COMPOSABLE_TABLES) {
    for (const record of await groupRows(table, groupId)) {
      if (await w.tombstone(table, record.id)) count++;
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
async function restoreGroup(
  w: SyncedWriter,
  groupId: string,
  deletedAt: number,
): Promise<number> {
  let count = 0;
  for (const table of COMPOSABLE_TABLES) {
    for (const record of await groupRows(table, groupId)) {
      if (record.deletedAt !== deletedAt) continue;
      if (await w.restore(table, record.id)) count++;
    }
  }
  return count;
}

/**
 * Move every live row in the group to `timestamp`. Runs inside a caller's
 * synced write over COMPOSABLE_TABLES.
 */
export async function retimeGroup(
  w: SyncedWriter,
  groupId: string,
  timestamp: number,
): Promise<void> {
  for (const table of COMPOSABLE_TABLES) {
    for (const record of await groupRows(table, groupId)) {
      if (!isLive(record) || record.timestamp === timestamp) continue;
      await w.patch(table, record.id, { timestamp });
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
    const { deletedCount, deletedAt } = await syncedWrite(COMPOSABLE_TABLES, async (w) => ({
      deletedCount: await tombstoneGroup(w, groupId),
      deletedAt: w.now,
    }));
    return ok({ deletedCount, deletedAt });
  } catch (e) {
    return err("Failed to delete entry group", e);
  }
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
    const restoredCount = await syncedWrite(COMPOSABLE_TABLES, (w) =>
      restoreGroup(w, groupId, deletedAt),
    );
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
    const { deletedCount, deletedAt } = await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      let count = 0;
      if (eating.groupId) count = await tombstoneGroup(w, eating.groupId);
      else if (await w.tombstone("eatingRecords", eatingId)) count = 1;
      return { deletedCount: count, deletedAt: w.now };
    });
    return ok({ deletedCount, deletedAt });
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
    const restoredCount = await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      if (eating.groupId) return restoreGroup(w, eating.groupId, deletedAt);
      if (eating.deletedAt !== deletedAt) return 0;
      return (await w.restore("eatingRecords", eatingId)) ? 1 : 0;
    });
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
    await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      const eatingUpdates: SyncedChanges<"eatingRecords"> = {};
      if (updates.timestamp !== undefined) eatingUpdates.timestamp = updates.timestamp;
      // An `undefined` note clears it.
      if ("note" in updates) eatingUpdates.note = updates.note;
      if (updates.grams !== undefined) {
        const wholeGrams = roundGrams(updates.grams);
        if (wholeGrams !== undefined) eatingUpdates.grams = wholeGrams;
      }
      await w.patch("eatingRecords", eatingId, eatingUpdates);

      if (eating.groupId && updates.timestamp !== undefined) {
        await retimeGroup(w, eating.groupId, updates.timestamp);
      }
    });

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

    await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      // Every intake row this function writes goes through the synced write.
      // A food-card edit that stayed local was reverted by a later full pull,
      // which also resurrected the duplicate rows the reconciliation below
      // tombstones.
      const addIntake = (record: IntakeRecord) => w.insert("intakeRecords", record);
      const patchIntake = (id: string, updates: SyncedChanges<"intakeRecords">) =>
        w.patch("intakeRecords", id, updates);
      const removeIntake = (id: string) => w.tombstone("intakeRecords", id);

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
      // An `undefined` note or grams clears the field.
      const eatingUpdates: SyncedChanges<"eatingRecords"> = {
        timestamp: patch.timestamp,
        note: patch.note,
        grams: roundGrams(patch.grams),
      };
      if (!eating.groupId && groupId) eatingUpdates.groupId = groupId;
      await w.patch("eatingRecords", eatingId, eatingUpdates);

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
          const sodiumUpdates: SyncedChanges<"intakeRecords"> = {
            amount: patch.sodiumMg,
            timestamp: patch.timestamp,
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
        await removeIntake(existingSalt.id);
      }
      for (const dup of extraSalts) {
        await removeIntake(dup.id);
      }

      // ── Water content intake ──
      if (patch.waterMl > 0) {
        const waterNote = patch.note;
        if (existingWater) {
          // Don't clear an existing note when the patch doesn't carry one.
          const waterUpdates: SyncedChanges<"intakeRecords"> = {
            amount: patch.waterMl,
            timestamp: patch.timestamp,
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
        await removeIntake(existingWater.id);
      }
      for (const dup of extraWaters) {
        await removeIntake(dup.id);
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
          await removeIntake(existingSugar.id);
        }
        for (const dup of extraSugars) {
          await removeIntake(dup.id);
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
          await removeIntake(existingPotassium.id);
        }
        for (const dup of extraPotassiums) {
          await removeIntake(dup.id);
        }
      }

      // Rows the patch didn't address (a sugar row while the tracker is off,
      // a substance logged with the meal) still move with it.
      await retimeGroup(w, groupId, patch.timestamp);
    });

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
