/**
 * Parity + behaviour tests for `src/lib/sync-column-types.ts`.
 *
 * `INTEGER_SYNC_FIELDS` / `FLOAT_SYNC_FIELDS` are hand-maintained mirrors of
 * the Drizzle schema's numeric columns — the push loop runs in the browser and
 * must not import drizzle-orm (see the module header). Hand-maintained means
 * drift-prone, so PARITY-* derive the real column types straight from
 * `schemaByTableName` and fail the build the moment a schema change is not
 * mirrored here. This is the same arrangement `sync-topology.ts` has.
 *
 * NORMALIZE-* cover the behaviour itself, including the exact shape of
 * issue #354: a fractional `grams` on an EatingRecord made the record's push
 * op — and then its tombstone — fail server validation, so a deleted entry
 * could never sync.
 */
import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { schemaByTableName, opSchema_ } from "@intake/db/sync-payload";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import {
  INTEGER_SYNC_FIELDS,
  FLOAT_SYNC_FIELDS,
  normalizeRowForPush,
} from "@/lib/sync-column-types";

/** Postgres column types that reject a fractional value. */
const INTEGER_COLUMN_TYPES = ["PgInteger", "PgSmallInt", "PgBigInt53"];
/** Postgres column types that accept fractions but not NaN/Infinity. */
const FLOAT_COLUMN_TYPES = ["PgReal", "PgDoublePrecision", "PgNumeric"];

/**
 * The table's column names of the given Postgres types, read from the Drizzle
 * schema — the ground truth the hand-maintained maps are checked against.
 * `userId` is excluded: the client never sends it, so no map covers it.
 */
function columnsOfType(tableName: TableName, types: string[]): string[] {
  const table = schemaByTableName[tableName];
  const columns = getTableColumns(table as never) as Record<
    string,
    { columnType: string }
  >;
  return Object.entries(columns)
    .filter(([name, col]) => name !== "userId" && types.includes(col.columnType))
    .map(([name]) => name)
    .sort();
}

describe("sync column-type maps — parity with the Drizzle schema", () => {
  it("PARITY-1: covers every syncable table", () => {
    expect(Object.keys(INTEGER_SYNC_FIELDS).sort()).toEqual(
      [...TABLE_PUSH_ORDER].sort(),
    );
    expect(Object.keys(FLOAT_SYNC_FIELDS).sort()).toEqual(
      [...TABLE_PUSH_ORDER].sort(),
    );
  });

  it.each(TABLE_PUSH_ORDER)(
    "PARITY-2: %s integer fields match the schema's integer/bigint columns",
    (tableName) => {
      expect([...INTEGER_SYNC_FIELDS[tableName]].sort()).toEqual(
        columnsOfType(tableName, INTEGER_COLUMN_TYPES),
      );
    },
  );

  it.each(TABLE_PUSH_ORDER)(
    "PARITY-3: %s float fields match the schema's real columns",
    (tableName) => {
      expect([...FLOAT_SYNC_FIELDS[tableName]].sort()).toEqual(
        columnsOfType(tableName, FLOAT_COLUMN_TYPES),
      );
    },
  );
});

describe("normalizeRowForPush", () => {
  const eatingRow = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: "eat-1",
    timestamp: 1_757_000_000_000,
    createdAt: 1_757_000_000_000,
    updatedAt: 1_757_000_000_000,
    deletedAt: null,
    deviceId: "device-1",
    timezone: "Europe/Berlin",
    note: "Mio Mate",
    ...overrides,
  });

  it("NORMALIZE-1: rounds a fractional integer-column value", () => {
    expect(normalizeRowForPush("eatingRecords", eatingRow({ grams: 330.5 })))
      .toMatchObject({ grams: 331 });
    expect(normalizeRowForPush("eatingRecords", eatingRow({ grams: 330.4 })))
      .toMatchObject({ grams: 330 });
  });

  it("NORMALIZE-2: leaves integers, null and absent fields untouched", () => {
    expect(normalizeRowForPush("eatingRecords", eatingRow({ grams: 330 })))
      .toMatchObject({ grams: 330 });
    expect(normalizeRowForPush("eatingRecords", eatingRow({ grams: null })))
      .toMatchObject({ grams: null });
    expect(normalizeRowForPush("eatingRecords", eatingRow())).not.toHaveProperty(
      "grams",
    );
  });

  it("NORMALIZE-3: nulls non-finite numbers in numeric columns", () => {
    expect(normalizeRowForPush("eatingRecords", eatingRow({ grams: NaN })))
      .toMatchObject({ grams: null });
    expect(
      normalizeRowForPush("weightRecords", {
        id: "w-1",
        weight: Infinity,
        timestamp: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        deviceId: "device-1",
        timezone: "Europe/Berlin",
      }),
    ).toMatchObject({ weight: null });
  });

  it("NORMALIZE-4: keeps fractions in real columns", () => {
    expect(
      normalizeRowForPush("weightRecords", {
        id: "w-1",
        weight: 72.5,
        timestamp: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        deviceId: "device-1",
        timezone: "Europe/Berlin",
      }),
    ).toMatchObject({ weight: 72.5 });
  });

  it("NORMALIZE-5: does not mutate the caller's row", () => {
    const row = eatingRow({ grams: 330.5 });
    normalizeRowForPush("eatingRecords", row);
    expect(row.grams).toBe(330.5);
  });

  it("NORMALIZE-6: leaves non-numeric values alone", () => {
    const row = eatingRow({ grams: "330.5" });
    expect(normalizeRowForPush("eatingRecords", row)).toMatchObject({
      grams: "330.5",
      note: "Mio Mate",
    });
  });

  // The regression itself: before normalization a delete op carrying the
  // soft-deleted row was rejected by the push validator with
  // "Record failed validation and cannot be synced", the engine dropped it as
  // permanently invalid, and the deletion never reached the server.
  it("NORMALIZE-7: a tombstone with fractional grams now passes push validation", () => {
    const tombstone = eatingRow({ grams: 330.5, deletedAt: 1_757_000_000_001 });

    const before = opSchema_.safeParse({
      queueId: 1,
      op: "delete",
      tableName: "eatingRecords",
      row: tombstone,
    });
    expect(before.success).toBe(false);

    const after = opSchema_.safeParse({
      queueId: 1,
      op: "delete",
      tableName: "eatingRecords",
      row: normalizeRowForPush("eatingRecords", tombstone),
    });
    expect(after.success).toBe(true);
  });
});
