/**
 * Schema consistency tests (DATA-04).
 *
 * Verifies that every Dexie version block includes all tables from the
 * prior version. Dexie requires repeating ALL table definitions in each
 * version -- omitting a table silently deletes it on upgrade.
 *
 * Static analysis only: reads db.ts from disk, never imports Dexie.
 */

import { describe, it, expect } from "vitest";
import { parseDbSchema } from "./parse-schema";

describe("schema parser self-test", () => {
  it("parses all version blocks from db.ts", () => {
    const versions = parseDbSchema();
    expect(versions).toHaveLength(7);
    expect(versions.map((v) => v.version)).toEqual([10, 11, 12, 13, 14, 15, 16]);
  });

  it("latest version has 16 tables", () => {
    const versions = parseDbSchema();
    const latest = versions[versions.length - 1]!;
    expect(latest.tables).toHaveLength(16);
  });
});

describe("schema consistency across versions", () => {
  it("each version includes all tables from the prior version", () => {
    const versions = parseDbSchema();

    for (let i = 1; i < versions.length; i++) {
      const prev = versions[i - 1]!;
      const current = versions[i]!;

      const missingTables = prev.tables.filter(
        (t) => !current.tables.includes(t)
      );

      expect(
        missingTables,
        [
          `x [Schema Consistency]: Version ${current.version} is missing tables that existed in version ${prev.version}`,
          `  Missing: ${missingTables.join(", ")}`,
          `  Fix: Add the missing table(s) to the db.version(${current.version}).stores({...}) block in src/lib/db.ts`,
          `  Note: Dexie requires every version to repeat ALL table definitions from prior versions`,
        ].join("\n")
      ).toHaveLength(0);
    }
  });

  it("versions can add new tables", () => {
    const versions = parseDbSchema();

    // At least one version should have MORE tables than its predecessor
    // (e.g., v12 adds substanceRecords, v14 adds titrationPlans)
    let someVersionAddsTable = false;

    for (let i = 1; i < versions.length; i++) {
      const prev = versions[i - 1]!;
      const current = versions[i]!;

      if (current.tables.length > prev.tables.length) {
        someVersionAddsTable = true;
        break;
      }
    }

    expect(someVersionAddsTable).toBe(true);
  });
});
