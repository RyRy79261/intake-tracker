import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { softDeleteRecord, undoSoftDeleteRecord } from "@/lib/record-crud";
import { makeEatingRecord } from "@/__tests__/fixtures/db-fixtures";

describe("record-crud: soft-delete helpers check the row exists", () => {
  it("softDeleteRecord returns an error and queues nothing for a missing id", async () => {
    const result = await softDeleteRecord(db.eatingRecords, "eatingRecords", "nope", "Failed");
    expect(result.success).toBe(false);
    expect(await db._syncQueue.filter((r) => r.recordId === "nope").count()).toBe(0);
  });

  it("undoSoftDeleteRecord returns an error and queues nothing for a missing id", async () => {
    const result = await undoSoftDeleteRecord(db.eatingRecords, "eatingRecords", "nope", "Failed");
    expect(result.success).toBe(false);
    expect(await db._syncQueue.filter((r) => r.recordId === "nope").count()).toBe(0);
  });

  it("still deletes and restores an existing row", async () => {
    const record = makeEatingRecord();
    await db.eatingRecords.add(record);

    expect((await softDeleteRecord(db.eatingRecords, "eatingRecords", record.id, "Failed")).success).toBe(true);
    expect((await db.eatingRecords.get(record.id))!.deletedAt).toBeTypeOf("number");

    expect((await undoSoftDeleteRecord(db.eatingRecords, "eatingRecords", record.id, "Failed")).success).toBe(true);
    expect((await db.eatingRecords.get(record.id))!.deletedAt).toBeNull();
  });
});
