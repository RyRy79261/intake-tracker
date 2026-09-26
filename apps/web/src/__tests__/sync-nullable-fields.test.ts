/**
 * Parity + behaviour tests for `src/lib/sync-nullable-fields.ts`.
 *
 * `NULLABLE_SYNC_FIELDS` mirrors the Drizzle schema's nullable columns by hand
 * (the push loop runs in the browser and must not import drizzle-orm), so
 * PARITY-* derive the real list from `schemaByTableName` and fail the build
 * when a schema change is not mirrored — the `sync-column-types` arrangement.
 */
import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { schemaByTableName, opSchema_ } from "@intake/db/sync-payload";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import {
  NULLABLE_SYNC_FIELDS,
  fillClearedFieldsForPush,
  normalizePulledRow,
} from "@/lib/sync-nullable-fields";

const SERVER_ONLY_COLUMNS = new Set(["userId", "serverUpdatedAt"]);

function nullableColumns(tableName: TableName): string[] {
  const columns = getTableColumns(schemaByTableName[tableName] as never) as Record<
    string,
    { notNull: boolean }
  >;
  return Object.entries(columns)
    .filter(([name, col]) => !SERVER_ONLY_COLUMNS.has(name) && !col.notNull)
    .map(([name]) => name)
    .sort();
}

describe("sync nullable fields — parity with the Drizzle schema", () => {
  it("PARITY-1: covers every syncable table", () => {
    expect(Object.keys(NULLABLE_SYNC_FIELDS).sort()).toEqual(
      [...TABLE_PUSH_ORDER].sort(),
    );
  });

  it.each(TABLE_PUSH_ORDER)(
    "PARITY-2: %s nullable fields match the schema's nullable columns",
    (tableName) => {
      expect([...NULLABLE_SYNC_FIELDS[tableName]].sort()).toEqual(
        nullableColumns(tableName),
      );
    },
  );
});

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
