/**
 * Schema parity gate — Dexie ↔ Drizzle drift detector.
 *
 * This test runs as part of `pnpm test` and therefore in every CI run. It fails
 * when Dexie (src/lib/db.ts v15 interfaces) and Drizzle (src/db/schema.ts) fall
 * out of sync — which is the moment a future phase adds a field to one side
 * without the other.
 *
 * The comparator is STRUCTURAL (field name presence) — not type-based. Union
 * types in Dexie and text+CHECK in Drizzle are considered equivalent because
 * both encode the same set of values. If this decision ever reverses, switch
 * to drizzle-zod + expect-type for compile-time type comparison.
 *
 * The only permitted Drizzle-only column is `userId` (single-user Dexie
 * has no user ownership field — see 42-CONTEXT.md D-12).
 *
 * Run: pnpm exec vitest run src/__tests__/schema-parity.test.ts
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import * as drizzleSchema from "@/db/schema";
import { extractDexieSchema, type DexieTableSchema } from "./dexie-schema-extractor";

// Computed once at module load — zero IO redundancy across parameterized tests.
const DEXIE_TABLES: DexieTableSchema[] = extractDexieSchema();

// Fields that exist on the Drizzle side but must NEVER match a Dexie field —
// the exemption list for the "no extra Drizzle columns" check.
// T-42-12: This set must remain a compile-time constant with no env-var escape hatch.
const DRIZZLE_ONLY_EXEMPTIONS = new Set<string>(["userId"]);

function getDrizzleTable(tableName: string): Table | undefined {
  // drizzleSchema is a module shape with specific exports; cast through unknown
  // to enable dynamic string-key lookup. Test-only code — TS-safe escape hatch.
  return (drizzleSchema as unknown as Record<string, Table>)[tableName];
}

function getDrizzleColumnNames(table: Table): string[] {
  // getTableColumns returns TS property names (camelCase), not SQL column names.
  // This ensures apples-to-apples comparison with the Dexie interface field list.
  return Object.keys(getTableColumns(table));
}

// ─────────────────────────────────────────────────────────────────────────
// Extractor sanity — confirms the extractor itself works before we rely on it.
// ─────────────────────────────────────────────────────────────────────────

describe("Dexie schema extractor sanity", () => {
  it("extracts exactly 16 Dexie tables from src/lib/db.ts", () => {
    expect(DEXIE_TABLES).toHaveLength(16);
  });

  it("extracted table list contains all expected table names", () => {
    const names = DEXIE_TABLES.map((t) => t.tableName);
    expect(names).toContain("intakeRecords");
    expect(names).toContain("weightRecords");
    expect(names).toContain("bloodPressureRecords");
    expect(names).toContain("eatingRecords");
    expect(names).toContain("urinationRecords");
    expect(names).toContain("defecationRecords");
    expect(names).toContain("substanceRecords");
    expect(names).toContain("prescriptions");
    expect(names).toContain("medicationPhases");
    expect(names).toContain("phaseSchedules");
    expect(names).toContain("inventoryItems");
    expect(names).toContain("inventoryTransactions");
    expect(names).toContain("doseLogs");
    expect(names).toContain("dailyNotes");
    expect(names).toContain("auditLogs");
    expect(names).toContain("titrationPlans");
  });

  it("intakeRecords interface includes all expected sync-scaffold and domain fields", () => {
    const intake = DEXIE_TABLES.find((t) => t.tableName === "intakeRecords");
    expect(intake).toBeDefined();
    const fields = intake!.fields;
    // Sync scaffolding (present on every table)
    expect(fields).toContain("id");
    expect(fields).toContain("createdAt");
    expect(fields).toContain("updatedAt");
    expect(fields).toContain("deletedAt");
    expect(fields).toContain("deviceId");
    expect(fields).toContain("timezone");
    // Domain-specific fields for intakeRecords
    expect(fields).toContain("type");
    expect(fields).toContain("amount");
    expect(fields).toContain("timestamp");
    expect(fields).toContain("source");
    expect(fields).toContain("note");
    expect(fields).toContain("groupId");
    expect(fields).toContain("originalInputText");
    expect(fields).toContain("groupSource");
  });

  it("prescriptions interface does NOT include timezone (correct per Dexie definition)", () => {
    const prescriptions = DEXIE_TABLES.find((t) => t.tableName === "prescriptions");
    expect(prescriptions).toBeDefined();
    expect(prescriptions!.fields).not.toContain("timezone");
  });

  it("phaseSchedules interface has anchorTimezone but NOT timezone", () => {
    const phaseSchedules = DEXIE_TABLES.find((t) => t.tableName === "phaseSchedules");
    expect(phaseSchedules).toBeDefined();
    expect(phaseSchedules!.fields).toContain("anchorTimezone");
    expect(phaseSchedules!.fields).not.toContain("timezone");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Core parity tests — one test case per Dexie table × parity dimension.
// ─────────────────────────────────────────────────────────────────────────

describe("Dexie ↔ Drizzle schema parity", () => {
  it.each(DEXIE_TABLES)(
    "Dexie table '$tableName' has a matching Drizzle export",
    ({ tableName }) => {
      const drizzleTable = getDrizzleTable(tableName);
      expect(
        drizzleTable,
        `Missing Drizzle export: drizzleSchema.${tableName} — add pgTable("...") to src/db/schema.ts`,
      ).toBeDefined();
    },
  );

  it.each(DEXIE_TABLES)(
    "Dexie table '$tableName': every Dexie field is present in the Drizzle table",
    ({ tableName, fields }) => {
      const drizzleTable = getDrizzleTable(tableName);
      if (!drizzleTable) {
        throw new Error(
          `Drizzle table '${tableName}' not found — see 'has a matching Drizzle export' test above`,
        );
      }
      const drizzleCols = new Set(getDrizzleColumnNames(drizzleTable));
      const missing = fields.filter((f) => !drizzleCols.has(f));
      expect(
        missing,
        `${tableName}: Dexie field(s) missing from Drizzle columns. ` +
          `Missing: [${missing.join(", ")}]. ` +
          `Drizzle has: [${Array.from(drizzleCols).join(", ")}]. ` +
          `Fix: add the missing column(s) to src/db/schema.ts and run pnpm db:generate`,
      ).toEqual([]);
    },
  );

  it.each(DEXIE_TABLES)(
    "Dexie table '$tableName': Drizzle has no extra columns beyond the exemption list",
    ({ tableName, fields }) => {
      const drizzleTable = getDrizzleTable(tableName);
      if (!drizzleTable) {
        throw new Error(
          `Drizzle table '${tableName}' not found — see 'has a matching Drizzle export' test above`,
        );
      }
      const dexieFieldSet = new Set(fields);
      const extras = getDrizzleColumnNames(drizzleTable).filter(
        (col) => !dexieFieldSet.has(col) && !DRIZZLE_ONLY_EXEMPTIONS.has(col),
      );
      expect(
        extras,
        `${tableName}: Drizzle has column(s) not in Dexie interface and not in the exemption list ` +
          `(only 'userId' is exempt). Extra: [${extras.join(", ")}]. ` +
          `Fix: add the field to the Dexie interface in src/lib/db.ts ` +
          `OR remove the column from src/db/schema.ts`,
      ).toEqual([]);
    },
  );

  it.each(DEXIE_TABLES)(
    "Dexie table '$tableName': Drizzle table has a userId column",
    ({ tableName }) => {
      const drizzleTable = getDrizzleTable(tableName);
      if (!drizzleTable) {
        throw new Error(
          `Drizzle table '${tableName}' not found — see 'has a matching Drizzle export' test above`,
        );
      }
      const cols = getDrizzleColumnNames(drizzleTable);
      expect(
        cols,
        `${tableName}: missing required 'userId' column — every app table must have a user_id FK`,
      ).toContain("userId");
    },
  );
});
