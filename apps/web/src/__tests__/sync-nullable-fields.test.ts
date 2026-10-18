/**
 * Behaviour tests for `src/lib/sync-nullable-fields.ts`. The nullable-column
 * lists come from the generated sync manifest, whose freshness
 * `sync-manifest.test.ts` checks.
 */
import { describe, it, expect } from "vitest";
import { opSchema_ } from "@intake/db/sync-payload";
import {
  fillClearedFieldsForPush,
  normalizePulledRow,
} from "@/lib/sync-nullable-fields";

describe("fillClearedFieldsForPush (audit health-records-inputs#4)", () => {
  const cleared = {
    id: "w1",
    weight: 72.5,
    timestamp: 1000,
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: null,
    deviceId: "d",
    timezone: "UTC",
    // `note` was cleared locally: Dexie deleted the key.
  };

  it("sends an explicit null for a cleared optional field", () => {
    const row = fillClearedFieldsForPush("weightRecords", cleared);
    expect(row).toHaveProperty("note", null);
    expect(cleared).not.toHaveProperty("note");
  });

  it("keeps values that are set", () => {
    const row = fillClearedFieldsForPush("weightRecords", {
      ...cleared,
      note: "voice",
    });
    expect(row.note).toBe("voice");
  });

  it("the filled row still passes the server's push validation", () => {
    const parsed = opSchema_.safeParse({
      queueId: 1,
      tableName: "weightRecords",
      op: "upsert",
      row: fillClearedFieldsForPush("weightRecords", cleared),
    });
    expect(parsed.success).toBe(true);
  });
});

describe("normalizePulledRow (audit core-duplication#3)", () => {
  it("drops null optional fields and server-only keys, keeps null-typed ones", () => {
    const row = normalizePulledRow({
      id: "s1",
      userId: "u1",
      abvPercent: null,
      amountMg: 80,
      deletedAt: null,
    });
    expect(row).toEqual({ id: "s1", amountMg: 80, deletedAt: null });
    expect("abvPercent" in row).toBe(false);
  });
});
