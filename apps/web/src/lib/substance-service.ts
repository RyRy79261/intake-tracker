import { db, type SubstanceRecord } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

export type AddSubstanceInput = {
  type: 'caffeine' | 'alcohol';
  amountMg?: number;
  amountStandardDrinks?: number;
  abvPercent?: number;
  volumeMl?: number;
  description: string;
  source?: 'standalone';
  timestamp?: number;
  /** Group this substance belongs to. Set by `logDrink` for drink groups. */
  groupId?: string;
};

/**
 * Add a bare SubstanceRecord.
 *
 * This function does NOT create a water IntakeRecord, even when `volumeMl` is
 * supplied — `volumeMl` is denormalised data describing the drink the dose
 * arrived in, not a request to book hydration. It used to auto-create one,
 * which meant any caller that also queued its own water intake double-counted
 * the same fluid (issue #322), and the resulting pair carried no `groupId`, so
 * no reconciler could ever find the two halves again.
 *
 * To log a drink — anything with a fluid volume — call `logDrink` from
 * `@/lib/drink-service`. It is the single owner of liquid volume and derives
 * the water record itself. Use this function only for a substance with no
 * fluid of its own (e.g. a caffeine tablet).
 */
export async function addSubstanceRecord(
  input: AddSubstanceInput
): Promise<ServiceResult<SubstanceRecord>> {
  try {
    const now = Date.now();
    const fields = syncFields();
    const substanceId = crypto.randomUUID();
    const timestamp = input.timestamp ?? now;

    const record: SubstanceRecord = {
      id: substanceId,
      type: input.type,
      ...(input.amountMg !== undefined && { amountMg: input.amountMg }),
      ...(input.amountStandardDrinks !== undefined && { amountStandardDrinks: input.amountStandardDrinks }),
      ...(input.abvPercent !== undefined && { abvPercent: input.abvPercent }),
      ...(input.volumeMl !== undefined && { volumeMl: input.volumeMl }),
      description: input.description,
      source: input.source ?? "standalone",
      aiEnriched: false,
      timestamp,
      ...(input.groupId !== undefined && { groupId: input.groupId }),
      ...fields,
    };

    await db.transaction("rw", [db.substanceRecords, db._syncQueue], async () => {
      await db.substanceRecords.add(record);
      await enqueueInsideTx("substanceRecords", substanceId, "upsert");
    });

    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to add substance record", e);
  }
}

export async function getSubstanceRecords(
  type?: 'caffeine' | 'alcohol',
  limit?: number
): Promise<SubstanceRecord[]> {
  let records: SubstanceRecord[];

  if (type) {
    records = await db.substanceRecords
      .where("type")
      .equals(type)
      .toArray();
  } else {
    records = await db.substanceRecords.toArray();
  }

  // Filter out soft-deleted, sort by timestamp desc
  records = records
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (limit) {
    records = records.slice(0, limit);
  }

  return records;
}

export async function getSubstanceRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: 'caffeine' | 'alcohol'
): Promise<SubstanceRecord[]> {
  let records: SubstanceRecord[];

  if (type) {
    records = await db.substanceRecords
      .where("[type+timestamp]")
      .between([type, startTime], [type, endTime], true, true)
      .toArray();
  } else {
    records = await db.substanceRecords
      .where("timestamp")
      .between(startTime, endTime, true, true)
      .toArray();
  }

  return records.filter((r) => r.deletedAt === null);
}

export async function deleteSubstanceRecord(
  id: string
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.substanceRecords, db.intakeRecords, db._syncQueue], async () => {
      const substance = await db.substanceRecords.get(id);
      await db.substanceRecords.update(id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx("substanceRecords", id, "upsert");

      // Two linkage styles have to be honoured. `groupId` is the current one,
      // written by `logDrink`. `source: "substance:<id>"` is what the old
      // implicit auto-water path produced; rows predating the v22 backfill can
      // still carry it with no group.
      const linkedIntakes = await db.intakeRecords
        .where("source")
        .equals(`substance:${id}`)
        .toArray();

      if (substance?.groupId) {
        const grouped = await db.intakeRecords
          .where("groupId")
          .equals(substance.groupId)
          .toArray();
        for (const intake of grouped) {
          if (!linkedIntakes.some((r) => r.id === intake.id)) {
            linkedIntakes.push(intake);
          }
        }

        // Sibling substances go too. One group can hold both a caffeine and an
        // alcohol record (an Irish coffee, an espresso martini). Removing only
        // the one the user tapped left the other counting toward its daily
        // total with no fluid attached — and unreachable from the Liquids card,
        // since the water row it was reached through is now gone.
        const siblings = await db.substanceRecords
          .where("groupId")
          .equals(substance.groupId)
          .toArray();
        for (const sibling of siblings) {
          if (sibling.id === id || sibling.deletedAt !== null) continue;
          await db.substanceRecords.update(sibling.id, {
            deletedAt: now,
            updatedAt: now,
          });
          await enqueueInsideTx("substanceRecords", sibling.id, "upsert");
        }
      }

      for (const intake of linkedIntakes) {
        if (intake.deletedAt !== null) continue;
        await db.intakeRecords.update(intake.id, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("intakeRecords", intake.id, "upsert");
      }
    });

    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete substance record", e);
  }
}

/**
 * Update a SubstanceRecord, keeping its group's fluid row consistent.
 *
 * `volumeMl` is the drink's fluid, and the group's water IntakeRecord is
 * derived from it. Editing the volume on the substance alone let the two halves
 * of one drink disagree — the substance said 500 ml while hydration still
 * counted 330 — with nothing to reconcile them. Same for `timestamp`: moving
 * the substance without its water stranded the halves on different days.
 */
export async function updateSubstanceRecord(
  id: string,
  updates: Partial<SubstanceRecord>
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction(
      "rw",
      [db.substanceRecords, db.intakeRecords, db._syncQueue],
      async () => {
        const existing = await db.substanceRecords.get(id);
        await db.substanceRecords.update(id, { ...updates, updatedAt: now });
        await enqueueInsideTx("substanceRecords", id, "upsert");

        const groupId = updates.groupId ?? existing?.groupId;
        if (!groupId) return;

        const waterPatch: Record<string, number> = {};
        if (updates.volumeMl !== undefined) {
          waterPatch.amount = Math.round(updates.volumeMl);
        }
        if (updates.timestamp !== undefined) {
          waterPatch.timestamp = updates.timestamp;
        }
        if (Object.keys(waterPatch).length === 0) return;

        const groupIntakes = await db.intakeRecords
          .where("groupId")
          .equals(groupId)
          .toArray();
        for (const intake of groupIntakes) {
          if (intake.type !== "water" || intake.deletedAt !== null) continue;
          await db.intakeRecords.update(intake.id, {
            ...waterPatch,
            updatedAt: now,
          });
          await enqueueInsideTx("intakeRecords", intake.id, "upsert");
        }
      },
    );
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update substance record", e);
  }
}

export async function getUnenrichedSubstanceRecords(): Promise<SubstanceRecord[]> {
  const records = await db.substanceRecords
    .where("source")
    .equals("water_intake")
    .toArray();

  return records.filter((r) => !r.aiEnriched && r.deletedAt === null);
}
