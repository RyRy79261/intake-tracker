import { db, type IntakeRecord, type SubstanceRecord } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import { isLive } from "@intake/core/lifecycle";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { syncedWrite } from "@/lib/synced-write";
import { COMPOSABLE_TABLES, retimeGroup } from "@/lib/composable-entry-service";

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

    await syncedWrite(["substanceRecords"], (w) => w.insert("substanceRecords", record));
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
      .between([type, startTime], [type, endTime])
      .toArray();
  } else {
    records = await db.substanceRecords
      .where("timestamp")
      .between(startTime, endTime)
      .toArray();
  }

  return records.filter((r) => r.deletedAt === null);
}

/**
 * The live rows, other than the substance itself, that
 * {@link deleteSubstanceRecord} would take with it — so a caller can confirm a
 * one-tap delete that removes a whole drink.
 */
export async function previewSubstanceDelete(
  id: string
): Promise<{ intakes: IntakeRecord[]; substances: SubstanceRecord[] }> {
  const substance = await db.substanceRecords.get(id);
  const intakes: IntakeRecord[] = (
    await db.intakeRecords.where("source").equals(`substance:${id}`).toArray()
  ).filter(isLive);
  const substances: SubstanceRecord[] = [];

  const groupId = substance?.groupId;
  if (groupId) {
    const groupEatings = await db.eatingRecords.where("groupId").equals(groupId).toArray();
    if (!groupEatings.some(isLive)) {
      const grouped = await db.intakeRecords.where("groupId").equals(groupId).toArray();
      for (const intake of grouped) {
        if (isLive(intake) && !intakes.some((r) => r.id === intake.id)) intakes.push(intake);
      }
      const siblings = await db.substanceRecords.where("groupId").equals(groupId).toArray();
      substances.push(...siblings.filter((s) => s.id !== id && isLive(s)));
    }
  }
  return { intakes, substances };
}

/**
 * Soft-delete a substance record and, for a drink, the rest of the drink.
 * Returns the tombstone stamp for {@link undoDeleteSubstanceRecord}.
 */
export async function deleteSubstanceRecord(
  id: string
): Promise<ServiceResult<{ deletedAt: number }>> {
  try {
    const now = await syncedWrite(
      ["substanceRecords", "intakeRecords", "eatingRecords"],
      async (w) => {
        const substance = await db.substanceRecords.get(id);
        await w.tombstone("substanceRecords", id);

        // Rows written by the old implicit auto-water path are linked only by
        // this source string, one-to-one with the substance, so they always
        // follow it regardless of grouping.
        const linkedIntakes = await db.intakeRecords
          .where("source")
          .equals(`substance:${id}`)
          .toArray();

        // The group cascade applies only to a *drink* group. `groupId` is also
        // how composable entries tie a meal together — an eating record plus
        // its water-content and sodium rows, and possibly a substance. Taking
        // the whole group there would soft-delete the meal's components while
        // leaving the meal itself alive, which is incoherent. Presence of a
        // live eating record is what distinguishes the two, matching
        // the Drink module (`deleteDrink`).
        const groupId = substance?.groupId;
        if (groupId) {
          const groupEatings = await db.eatingRecords
            .where("groupId")
            .equals(groupId)
            .toArray();
          const isDrinkGroup = !groupEatings.some((r) => r.deletedAt === null);

          if (isDrinkGroup) {
            const grouped = await db.intakeRecords
              .where("groupId")
              .equals(groupId)
              .toArray();
            for (const intake of grouped) {
              if (!linkedIntakes.some((r) => r.id === intake.id)) {
                linkedIntakes.push(intake);
              }
            }

            // Sibling substances go too. One group can hold both a caffeine and
            // an alcohol record (an Irish coffee, an espresso martini). Removing
            // only the one the user tapped left the other counting toward its
            // daily total with no fluid attached — and unreachable from the
            // Liquids card, since the water row it was reached through is gone.
            const siblings = await db.substanceRecords
              .where("groupId")
              .equals(groupId)
              .toArray();
            for (const sibling of siblings) {
              if (sibling.id === id) continue;
              await w.tombstone("substanceRecords", sibling.id);
            }
          }
        }

        for (const intake of linkedIntakes) {
          await w.tombstone("intakeRecords", intake.id);
        }
        return w.now;
      },
    );

    return ok({ deletedAt: now });
  } catch (e) {
    return err("Failed to delete substance record", e);
  }
}

/**
 * Reverse a {@link deleteSubstanceRecord}. Every row that delete tombstoned
 * shares its `deletedAt` stamp, so only those come back — a row removed
 * earlier stays removed.
 */
export async function undoDeleteSubstanceRecord(
  id: string,
  deletedAt: number
): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(
      ["substanceRecords", "intakeRecords"],
      async (w) => {
        const substance = await db.substanceRecords.get(id);
        if (!substance) throw new Error("Substance record not found");

        const substances = substance.groupId
          ? await db.substanceRecords.where("groupId").equals(substance.groupId).toArray()
          : [substance];
        for (const s of substances) {
          if (s.deletedAt !== deletedAt) continue;
          await w.restore("substanceRecords", s.id);
        }

        const intakes = await db.intakeRecords
          .where("source")
          .equals(`substance:${id}`)
          .toArray();
        if (substance.groupId) {
          const grouped = await db.intakeRecords
            .where("groupId")
            .equals(substance.groupId)
            .toArray();
          for (const r of grouped) {
            if (!intakes.some((i) => i.id === r.id)) intakes.push(r);
          }
        }
        for (const intake of intakes) {
          if (intake.deletedAt !== deletedAt) continue;
          await w.restore("intakeRecords", intake.id);
        }
      },
    );

    return ok(undefined);
  } catch (e) {
    return err("Failed to undo delete substance record", e);
  }
}

/**
 * Update a SubstanceRecord that is not part of a drink: a caffeine dose with
 * no volume, or a substance in a meal. Drinks are edited through the Drink
 * module (`editDrink`), which keeps the water row equal to the volume.
 *
 * A new time moves the rest of the record's group with it, so a meal is
 * never split across two times. Amounts are rounded: the columns are
 * Postgres integers, and a fractional value is rejected by the push.
 */
export async function updateSubstanceRecord(
  id: string,
  updates: Partial<SubstanceRecord>
): Promise<ServiceResult<void>> {
  try {
    const { id: _id, updatedAt: _updatedAt, ...patch } = updates;
    if (patch.amountMg !== undefined) patch.amountMg = Math.round(patch.amountMg);
    if (patch.volumeMl !== undefined) patch.volumeMl = Math.round(patch.volumeMl);
    await syncedWrite(COMPOSABLE_TABLES, async (w) => {
      const written = await w.patch("substanceRecords", id, patch);
      const groupId = written?.groupId;
      if (groupId && updates.timestamp !== undefined) {
        await retimeGroup(w, groupId, updates.timestamp);
      }
    });
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
