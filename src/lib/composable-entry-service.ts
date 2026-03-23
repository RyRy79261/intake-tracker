import { db } from "./db";
import type { IntakeRecord, EatingRecord, SubstanceRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";

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
  originalInputText?: string;
  groupSource?: string;
}

export interface ComposableEntryResult {
  groupId: string;
  eatingId?: string;
  intakeIds: string[];
  substanceId?: string;
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
    let eatingId: string | undefined;
    let substanceId: string | undefined;

    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
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
        }
      }

      // ── Substance record ──
      if (input.substance) {
        const id = crypto.randomUUID();
        substanceId = id;
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
          // originalInputText goes on substance if no eating record
          ...(!input.eating && input.originalInputText !== undefined && { originalInputText: input.originalInputText }),
          ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
          ...fields,
        };
        await db.substanceRecords.add(record);

        // If substance has volumeMl, create a linked water intake record
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
        }
      }
    });

    return ok({ groupId, eatingId, intakeIds, substanceId });
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

    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const record of records) {
          if (record.deletedAt === null) {
            await table.update(record.id, { deletedAt: now, updatedAt: now });
            deletedCount++;
          }
        }
      }
    });

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

    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const record of records) {
          if (record.deletedAt !== null) {
            await table.update(record.id, { deletedAt: null, updatedAt: now });
            restoredCount++;
          }
        }
      }
    });

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
    await dexieTable.update(id, { deletedAt: now, updatedAt: now });
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
    await dexieTable.update(id, { deletedAt: null, updatedAt: now });
    return ok({ table, id });
  } catch (e) {
    return err("Failed to undo delete single record", e);
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
