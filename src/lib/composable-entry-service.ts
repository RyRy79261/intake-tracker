import { db } from "./db";
import type { IntakeRecord, EatingRecord, SubstanceRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { enqueueInsideTx } from "./sync-queue";
import { schedulePush } from "./sync-engine";

const COMPOSABLE_TABLES = [db.intakeRecords, db.eatingRecords, db.substanceRecords] as const;

// ─── Input / Output types ─────────────────────────────────────────────

export interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: Array<{ type: "water" | "salt"; amount: number; source?: string; note?: string }>;
  substance?: {
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    volumeMl?: number;
    description: string;
  };
  substances?: Array<{
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
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
        const record: EatingRecord = {
          id,
          timestamp: ts,
          groupId,
          ...(input.eating.grams !== undefined && { grams: input.eating.grams }),
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
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await db.intakeRecords.add(record);
          await enqueueInsideTx("intakeRecords", id, "upsert");
        }
      }

      // ── Substance record (singular — backward compat) ──
      if (input.substance) {
        const id = crypto.randomUUID();
        substanceId = id;
        substanceIds.push(id);
        const record: SubstanceRecord = {
          id,
          type: input.substance.type,
          ...(input.substance.amountMg !== undefined && { amountMg: input.substance.amountMg }),
          ...(input.substance.amountStandardDrinks !== undefined && { amountStandardDrinks: input.substance.amountStandardDrinks }),
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

        if (input.substance.volumeMl) {
          const waterId = crypto.randomUUID();
          intakeIds.push(waterId);
          const waterRecord: IntakeRecord = {
            id: waterId,
            type: "water",
            amount: input.substance.volumeMl,
            timestamp: ts,
            source: `substance:${id}`,
            note: input.substance.description,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await db.intakeRecords.add(waterRecord);
          await enqueueInsideTx("intakeRecords", waterId, "upsert");
        }
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

// ─── deleteEntryGroup ─────────────────────────────────────────────────

export async function deleteEntryGroup(
  groupId: string,
): Promise<ServiceResult<{ deletedCount: number }>> {
  try {
    let deletedCount = 0;
    const now = Date.now();

    const tableNameMap = {
      intakeRecords: "intakeRecords" as const,
      eatingRecords: "eatingRecords" as const,
      substanceRecords: "substanceRecords" as const,
    };

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const record of records) {
          if (record.deletedAt === null) {
            await table.update(record.id, { deletedAt: now, updatedAt: now });
            await enqueueInsideTx(tableNameMap[table.name as keyof typeof tableNameMap], record.id, "upsert");
            deletedCount++;
          }
        }
      }
    });

    schedulePush();
    return ok({ deletedCount });
  } catch (e) {
    return err("Failed to delete entry group", e);
  }
}

// ─── undoDeleteEntryGroup ─────────────────────────────────────────────

export async function undoDeleteEntryGroup(
  groupId: string,
): Promise<ServiceResult<{ restoredCount: number }>> {
  try {
    let restoredCount = 0;
    const now = Date.now();

    const tableNameMap = {
      intakeRecords: "intakeRecords" as const,
      eatingRecords: "eatingRecords" as const,
      substanceRecords: "substanceRecords" as const,
    };

    await db.transaction("rw", [...COMPOSABLE_TABLES, db._syncQueue], async () => {
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const record of records) {
          if (record.deletedAt !== null) {
            await table.update(record.id, { deletedAt: null, updatedAt: now });
            await enqueueInsideTx(tableNameMap[table.name as keyof typeof tableNameMap], record.id, "upsert");
            restoredCount++;
          }
        }
      }
    });

    schedulePush();
    return ok({ restoredCount });
  } catch (e) {
    return err("Failed to undo delete entry group", e);
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

// ─── deleteSingleGroupRecord ──────────────────────────────────────────

export async function deleteSingleGroupRecord(
  table: RecordTable,
  id: string,
): Promise<ServiceResult<{ table: RecordTable; id: string }>> {
  try {
    const now = Date.now();
    const dexieTable = db[table];
    await db.transaction("rw", [dexieTable, db._syncQueue], async () => {
      await dexieTable.update(id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx(table, id, "upsert");
    });
    schedulePush();
    return ok({ table, id });
  } catch (e) {
    return err("Failed to delete single group record", e);
  }
}

// ─── undoDeleteSingleRecord ───────────────────────────────────────────

export async function undoDeleteSingleRecord(
  table: RecordTable,
  id: string,
): Promise<ServiceResult<{ table: RecordTable; id: string }>> {
  try {
    const now = Date.now();
    const dexieTable = db[table];
    await db.transaction("rw", [dexieTable, db._syncQueue], async () => {
      await dexieTable.update(id, { deletedAt: null, updatedAt: now });
      await enqueueInsideTx(table, id, "upsert");
    });
    schedulePush();
    return ok({ table, id });
  } catch (e) {
    return err("Failed to undo delete single record", e);
  }
}

// ─── syncEatingGroup ──────────────────────────────────────────────────

export type SodiumKind = "sodium" | "salt" | "msg";

const FOOD_WATER_SOURCE = "manual:food_water_content";
const SODIUM_KINDS: ReadonlyArray<SodiumKind> = ["sodium", "salt", "msg"];

function isSodiumKindSource(source: string | undefined): boolean {
  if (!source) return false;
  return SODIUM_KINDS.some((k) => source === `manual:${k}`);
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
    waterMl: number;
  },
): Promise<ServiceResult<void>> {
  try {
    const fields = syncFields();
    const now = fields.updatedAt;

    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      const eating = await db.eatingRecords.get(eatingId);
      if (!eating) throw new Error("Eating record not found");

      let groupId = eating.groupId;
      if (!groupId && (patch.sodiumMg > 0 || patch.waterMl > 0)) {
        groupId = crypto.randomUUID();
      }

      // ── Update the eating record itself ──
      // Note: Dexie's update accepts undefined to clear optional fields,
      // but exactOptionalPropertyTypes rejects that on Partial<EatingRecord>.
      const eatingUpdates: Record<string, unknown> = {
        timestamp: patch.timestamp,
        note: patch.note,
        grams: patch.grams,
        updatedAt: now,
      };
      if (!eating.groupId && groupId) eatingUpdates.groupId = groupId;
      await db.eatingRecords.update(eatingId, eatingUpdates);

      if (!groupId) return; // Nothing else to sync

      // ── Find existing linked records ──
      const groupIntakes = await db.intakeRecords
        .where("groupId")
        .equals(groupId)
        .toArray();

      // Some legacy data may have multiple linked salt/water rows in one
      // group. Reconcile the first match with the new value, soft-delete
      // the rest so duplicates don't keep contributing to totals.
      const existingSalts = groupIntakes.filter(
        (r) => r.type === "salt" && r.deletedAt === null && isSodiumKindSource(r.source),
      );
      const existingWaters = groupIntakes.filter(
        (r) => r.type === "water" && r.deletedAt === null && r.source === FOOD_WATER_SOURCE,
      );
      const [existingSalt, ...extraSalts] = existingSalts;
      const [existingWater, ...extraWaters] = existingWaters;

      const sodiumSource = `manual:${patch.sodiumKind}`;
      const groupSource = eating.groupSource ?? "manual_food_entry";

      // ── Sodium intake ──
      if (patch.sodiumMg > 0) {
        if (existingSalt) {
          await db.intakeRecords.update(existingSalt.id, {
            amount: patch.sodiumMg,
            source: sodiumSource,
            timestamp: patch.timestamp,
            updatedAt: now,
          });
        } else {
          const record: IntakeRecord = {
            id: crypto.randomUUID(),
            type: "salt",
            amount: patch.sodiumMg,
            timestamp: patch.timestamp,
            source: sodiumSource,
            groupId,
            groupSource,
            ...fields,
          };
          await db.intakeRecords.add(record);
        }
      } else if (existingSalt) {
        await db.intakeRecords.update(existingSalt.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
      for (const dup of extraSalts) {
        await db.intakeRecords.update(dup.id, {
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
          await db.intakeRecords.update(existingWater.id, waterUpdates);
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
          await db.intakeRecords.add(record);
        }
      } else if (existingWater) {
        await db.intakeRecords.update(existingWater.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
      for (const dup of extraWaters) {
        await db.intakeRecords.update(dup.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
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

// ─── syncLiquidGroup ──────────────────────────────────────────────────

/**
 * Apply edits to the linked substance records of a liquid intake entry.
 * Used when editing a coffee/alcohol/preset entry inline — keeps the
 * substance amount (mg / std drinks) and description in sync with the
 * water IntakeRecord.
 *
 * Pass `volumeMl` so any substance record that tracks liquid volume
 * stays consistent with the edited IntakeRecord amount.
 */
export async function syncLiquidGroup(
  groupId: string,
  patch: {
    timestamp: number;
    description?: string;
    volumeMl: number;
    amountMg?: number;
    amountStandardDrinks?: number;
  },
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.substanceRecords], async () => {
      const substances = await db.substanceRecords
        .where("groupId")
        .equals(groupId)
        .toArray();

      for (const sub of substances) {
        if (sub.deletedAt !== null) continue;
        const updates: Partial<SubstanceRecord> = {
          timestamp: patch.timestamp,
          updatedAt: now,
        };
        if (patch.description !== undefined) updates.description = patch.description;
        if (sub.volumeMl !== undefined) updates.volumeMl = patch.volumeMl;
        if (sub.type === "caffeine" && patch.amountMg !== undefined) {
          updates.amountMg = patch.amountMg;
        }
        if (sub.type === "alcohol" && patch.amountStandardDrinks !== undefined) {
          updates.amountStandardDrinks = patch.amountStandardDrinks;
        }
        await db.substanceRecords.update(sub.id, updates);
      }
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to sync liquid group", e);
  }
}

// ─── recalculateFromCurrentValues (stub) ──────────────────────────────

export async function recalculateFromCurrentValues(
  groupId: string,
): Promise<ServiceResult<void>> {
  return err(
    "Not implemented — deferred to Phase 13/14. Requires preset data and recalculation logic not yet available.",
  );
}
