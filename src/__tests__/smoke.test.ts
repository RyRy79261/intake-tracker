import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

describe("test infrastructure", () => {
  it("can open and read an empty database", async () => {
    const records = await db.intakeRecords.toArray();
    expect(records).toEqual([]);
  });

  it("can insert and retrieve a record", async () => {
    await db.intakeRecords.add({
      id: "smoke-test-id",
      type: "water",
      amount: 250,
      timestamp: Date.now(),
    } as any);
    const record = await db.intakeRecords.get("smoke-test-id");
    expect(record).toBeDefined();
    expect(record?.amount).toBe(250);
  });
});
