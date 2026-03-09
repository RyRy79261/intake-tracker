import { db, type SubstanceRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";

export type AddSubstanceInput = {
  type: 'caffeine' | 'alcohol';
  amountMg?: number;
  amountStandardDrinks?: number;
  volumeMl?: number;
  description: string;
  source?: 'standalone';
  timestamp?: number;
};

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
      ...(input.volumeMl !== undefined && { volumeMl: input.volumeMl }),
      description: input.description,
      source: input.source ?? "standalone",
      aiEnriched: false,
      timestamp,
      ...fields,
    };

    if (input.volumeMl) {
      // Create substance + linked intake record atomically
      await db.transaction("rw", [db.substanceRecords, db.intakeRecords], async () => {
        await db.substanceRecords.add(record);
        await db.intakeRecords.add({
          id: crypto.randomUUID(),
          type: "water",
          amount: input.volumeMl!,
          timestamp,
          source: `substance:${substanceId}`,
          note: input.description,
          ...fields,
        });
      });
    } else {
      await db.substanceRecords.add(record);
    }

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

    await db.transaction("rw", [db.substanceRecords, db.intakeRecords], async () => {
      // Soft-delete the substance record
      await db.substanceRecords.update(id, { deletedAt: now, updatedAt: now });

      // Soft-delete linked intake record if exists
      const linkedIntakes = await db.intakeRecords
        .where("source")
        .equals(`substance:${id}`)
        .toArray();

      for (const intake of linkedIntakes) {
        await db.intakeRecords.update(intake.id, { deletedAt: now, updatedAt: now });
      }
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete substance record", e);
  }
}

export async function updateSubstanceRecord(
  id: string,
  updates: Partial<SubstanceRecord>
): Promise<ServiceResult<void>> {
  try {
    await db.substanceRecords.update(id, {
      ...updates,
      updatedAt: Date.now(),
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
