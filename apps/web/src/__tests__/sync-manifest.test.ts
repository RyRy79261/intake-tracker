/**
 * The generated sync manifest (`@intake/db/sync-manifest`) must match the
 * Drizzle schema it is generated from. This one freshness test replaces the
 * parity tests that held each hand-kept copy (column types, nullable columns,
 * FK order) in place.
 *
 * If it fails: run `pnpm db:generate` (or `pnpm --filter @intake/db
 * sync-manifest`) and commit `packages/db/src/sync-manifest.generated.ts`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderSyncManifest } from "@intake/db/sync-manifest-builder";
import { SYNC_TABLES, TABLE_PUSH_ORDER } from "@intake/db/sync-manifest";
import { schemaByTableName } from "@intake/db/sync-payload";

const GENERATED = path.resolve(
  process.cwd(),
  "../../packages/db/src/sync-manifest.generated.ts",
);

describe("sync manifest", () => {
  it("is fresh: the generated file matches the schema", () => {
    expect(fs.readFileSync(GENERATED, "utf8")).toBe(renderSyncManifest());
  });

  it("lists every synced table once", () => {
    expect([...TABLE_PUSH_ORDER].sort()).toEqual(Object.keys(schemaByTableName).sort());
    expect(new Set(TABLE_PUSH_ORDER).size).toBe(TABLE_PUSH_ORDER.length);
    expect(Object.keys(SYNC_TABLES).sort()).toEqual([...TABLE_PUSH_ORDER].sort());
  });

  it("pushes every FK parent before its children", () => {
    const at = (t: string) => TABLE_PUSH_ORDER.indexOf(t as (typeof TABLE_PUSH_ORDER)[number]);
    for (const child of TABLE_PUSH_ORDER) {
      for (const [column, parent] of SYNC_TABLES[child].fkParents) {
        expect(at(parent), `${child}.${column} → ${parent}`).toBeLessThan(at(child));
      }
    }
  });

  it("knows the medication FK graph", () => {
    // A spot check that the generator reads foreign keys at all.
    expect(SYNC_TABLES.doseLogs.fkParents.map(([, p]) => p).sort()).toEqual([
      "inventoryItems",
      "medicationPhases",
      "phaseSchedules",
      "prescriptions",
    ]);
    expect(SYNC_TABLES.substanceRecords.fkParents).toEqual([["sourceRecordId", "intakeRecords"]]);
  });
});
