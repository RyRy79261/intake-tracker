/**
 * Schema parity gate — Dexie ↔ Drizzle drift detector.
 *
 * This test runs as part of `pnpm test` and therefore in every CI run. It fails
 * when Dexie (@intake/types/records interfaces) and Drizzle (@intake/db/schema)
 * fall out of sync — which is the moment a future phase adds a field to one side
 * without the other.
 *
 * The core comparator is STRUCTURAL (field name presence). Union types in
 * Dexie and text+CHECK in Drizzle are considered equivalent because both
 * encode the same set of values.
 *
 * On top of presence it also checks the drift classes that actually break
 * sync (audit server-schema-parity#9):
 *   - optionality: a TS-optional/nullable field on a NOT NULL column with no
 *     default is rejected by the push; a nullable column behind a required,
 *     non-null TS field hands `null` to code that does not expect it on pull;
 *   - numeric shape: every scalar `number` field is classified as integer or
 *     real in `sync-column-types` (itself parity-checked against Drizzle by
 *     sync-column-types.test.ts), so a fraction can never reach an integer
 *     column unnoticed;
 *   - table lists: the Dexie stores in db.ts, TABLE_PUSH_ORDER and the
 *     extractor's TABLE_TO_INTERFACE map name the same synced tables.
 *
 * The permitted Drizzle-only columns are `userId` (single-user Dexie has no
 * user ownership field — see 42-CONTEXT.md D-12) and `serverUpdatedAt` (the
 * server-assigned pull cursor, audit sync-engine#3).
 *
 * Run: pnpm exec vitest run src/__tests__/schema-parity.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { z } from "zod";
import { describe, it, expect } from "vitest";
import { getTableColumns, is, Column } from "drizzle-orm";
import type { SQL, Table } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { BACKUP_SCHEMAS, type BackupTableName } from "@/lib/backup-schemas";
import * as drizzleSchema from "@intake/db/schema";
import {
  extractDexieSchema,
  TABLE_TO_INTERFACE,
  type DexieTableSchema,
} from "@/__tests__/dexie-schema-extractor";
import { parseDbSchema } from "@/__tests__/integrity/parse-schema";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import {
  INTEGER_SYNC_FIELDS,
  FLOAT_SYNC_FIELDS,
} from "@/lib/sync-column-types";

// Computed once at module load — zero IO redundancy across parameterized tests.
const DEXIE_TABLES: DexieTableSchema[] = extractDexieSchema();

// Fields that exist on the Drizzle side but must NEVER match a Dexie field —
// the exemption list for the "no extra Drizzle columns" check.
// T-42-12: This set must remain a compile-time constant with no env-var escape hatch.
const DRIZZLE_ONLY_EXEMPTIONS = new Set<string>(["userId", "serverUpdatedAt"]);

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
  it("extracts exactly 18 Dexie tables from @intake/types/records", () => {
    expect(DEXIE_TABLES).toHaveLength(18);
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
    expect(names).toContain("userProfile");
    expect(names).toContain("insightReports");
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
        `Missing Drizzle export: drizzleSchema.${tableName} — add pgTable("...") to @intake/db/schema`,
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
          `Fix: add the missing column(s) to @intake/db/schema and run pnpm db:generate`,
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
          `(only ${[...DRIZZLE_ONLY_EXEMPTIONS].join(", ")} are exempt). Extra: [${extras.join(", ")}]. ` +
          `Fix: add the field to the Dexie interface in @intake/types/records ` +
          `OR remove the column from @intake/db/schema`,
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

// ─────────────────────────────────────────────────────────────────────────
// Optionality — TS `?:` / `| null` vs Drizzle notNull / hasDefault.
// ─────────────────────────────────────────────────────────────────────────

type ColumnMeta = { notNull: boolean; hasDefault: boolean };

function getColumnMeta(table: Table): Record<string, ColumnMeta> {
  return getTableColumns(table) as unknown as Record<string, ColumnMeta>;
}

describe("Dexie ↔ Drizzle optionality parity", () => {
  it.each(DEXIE_TABLES)(
    "$tableName: a field the client may omit or null is not a NOT NULL column without a default",
    ({ tableName, optionalFields, nullableFields }) => {
      const cols = getColumnMeta(getDrizzleTable(tableName)!);
      const mayBeAbsent = new Set([...optionalFields, ...nullableFields]);
      // The push route turns undefined (and "") into NULL, so such a field
      // makes the INSERT fail and the op is eventually dropped.
      const violations = [...mayBeAbsent].filter(
        (f) => cols[f] && cols[f]!.notNull && !cols[f]!.hasDefault,
      );
      expect(
        violations,
        `${tableName}: field(s) optional/nullable in @intake/types/records but NOT NULL ` +
          `(no default) in @intake/db/schema: [${violations.join(", ")}]. ` +
          `Fix: make the column nullable (or give it a default), or make the field required.`,
      ).toEqual([]);
    },
  );

  it.each(DEXIE_TABLES)(
    "$tableName: a nullable column is not declared as a required, non-null field",
    ({ tableName, fields, optionalFields, nullableFields }) => {
      const cols = getColumnMeta(getDrizzleTable(tableName)!);
      const mayBeAbsent = new Set([...optionalFields, ...nullableFields]);
      // A pull hands back NULL for such a column; code typed against a
      // required field would not expect it.
      const violations = fields.filter(
        (f) => cols[f] && !cols[f]!.notNull && !mayBeAbsent.has(f),
      );
      expect(
        violations,
        `${tableName}: field(s) required in @intake/types/records but nullable ` +
          `in @intake/db/schema: [${violations.join(", ")}]. ` +
          `Fix: mark the field optional/nullable, or make the column NOT NULL.`,
      ).toEqual([]);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Numeric shape — every scalar number field is classified int-vs-real.
// ─────────────────────────────────────────────────────────────────────────

describe("Dexie number fields ↔ sync-column-types", () => {
  it.each(DEXIE_TABLES)(
    "$tableName: every number field is classified as integer or real, and nothing else is",
    ({ tableName, numberFields }) => {
      const t = tableName as TableName;
      const classified = [...INTEGER_SYNC_FIELDS[t], ...FLOAT_SYNC_FIELDS[t]];
      expect(
        [...numberFields].sort(),
        `${tableName}: the scalar number fields of the interface must be listed in ` +
          `exactly one of INTEGER_SYNC_FIELDS / FLOAT_SYNC_FIELDS (src/lib/sync-column-types.ts). ` +
          `Decide deliberately: an integer column rejects fractions.`,
      ).toEqual([...classified].sort());
    },
  );

  it.each(DEXIE_TABLES)(
    "$tableName: no field is classified as both integer and real",
    ({ tableName }) => {
      const t = tableName as TableName;
      const ints = new Set(INTEGER_SYNC_FIELDS[t]);
      expect(FLOAT_SYNC_FIELDS[t].filter((f) => ints.has(f))).toEqual([]);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Table lists — db.ts stores vs TABLE_PUSH_ORDER vs TABLE_TO_INTERFACE.
// ─────────────────────────────────────────────────────────────────────────

describe("synced table lists agree", () => {
  const versions = parseDbSchema();
  const latest = versions[versions.length - 1]!;
  // `_`-prefixed stores (_syncQueue, _syncMeta, _errorLogs) are device-local.
  const syncedStores = latest.tables.filter((t) => !t.startsWith("_")).sort();

  it("db.ts latest-version stores == TABLE_PUSH_ORDER", () => {
    expect(syncedStores).toEqual([...TABLE_PUSH_ORDER].sort());
  });

  it("db.ts latest-version stores == TABLE_TO_INTERFACE keys", () => {
    expect(syncedStores).toEqual(Object.keys(TABLE_TO_INTERFACE).sort());
  });

  it("every synced store has a Drizzle table", () => {
    const missing = syncedStores.filter((t) => !getDrizzleTable(t));
    expect(missing).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Backup schema — enum and optionality parity with the record types.
//
// A backup row the validator rejects is silently skipped on restore, so a
// backup enum missing a value (intake "potassium") or a key required by the
// backup but optional in the record type (a PRN dose's phaseId) drops real
// data (audit server-schema-parity#4).
// ─────────────────────────────────────────────────────────────────────────

const RECORDS_TS_PATH = path.resolve(process.cwd(), "../../packages/types/src/records.ts");

/** interfaceName → field → sorted string-literal union (aliases resolved). */
function extractLiteralUnions(): Map<string, Map<string, string[]>> {
  const sf = ts.createSourceFile(
    RECORDS_TS_PATH,
    fs.readFileSync(RECORDS_TS_PATH, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const aliases = new Map<string, ts.TypeNode>();
  sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n.type);
  });
  const literals = (type: ts.TypeNode): string[] | null => {
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const target = aliases.get(type.typeName.text);
      return target ? literals(target) : null;
    }
    const members = ts.isUnionTypeNode(type) ? [...type.types] : [type];
    const values: string[] = [];
    for (const m of members) {
      if (m.kind === ts.SyntaxKind.UndefinedKeyword) continue;
      if (!ts.isLiteralTypeNode(m)) return null;
      if (m.literal.kind === ts.SyntaxKind.NullKeyword) continue;
      if (!ts.isStringLiteral(m.literal)) return null;
      values.push(m.literal.text);
    }
    return values.length > 0 ? values.sort() : null;
  };
  const out = new Map<string, Map<string, string[]>>();
  sf.forEachChild((n) => {
    if (!ts.isInterfaceDeclaration(n)) return;
    const fields = new Map<string, string[]>();
    for (const m of n.members) {
      if (!ts.isPropertySignature(m) || !m.type || !ts.isIdentifier(m.name)) continue;
      const values = literals(m.type);
      if (values) fields.set(m.name.text, values);
    }
    out.set(n.name.text, fields);
  });
  return out;
}

/** field → sorted values of every `<column> IN ('a','b')` CHECK on the table. */
function drizzleCheckLists(table: Table): Map<string, string[]> {
  const keyBySqlName = new Map(
    Object.entries(getTableColumns(table)).map(([key, col]) => [col.name, key]),
  );
  const out = new Map<string, string[]>();
  for (const check of getTableConfig(table as PgTable).checks) {
    const chunks = (check.value as SQL).queryChunks;
    chunks.forEach((chunk, i) => {
      if (!is(chunk, Column)) return;
      const next = chunks[i + 1] as { value?: string[] } | undefined;
      const m = /^\s*IN \(([^)]*)\)\s*$/.exec(next?.value?.join("") ?? "");
      const key = keyBySqlName.get(chunk.name);
      if (!m || !key) return;
      out.set(key, m[1]!.split(",").map((v) => v.trim().replace(/^'|'$/g, "")).sort());
    });
  }
  return out;
}

/** Sorted literal values a zod field accepts, or null if it is not an enum. */
function zodLiterals(schema: z.ZodTypeAny): string[] | null {
  let s: z.ZodTypeAny = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
    s = s.unwrap() as z.ZodTypeAny;
  }
  if (s instanceof z.ZodEnum) return [...(s.options as string[])].sort();
  if (s instanceof z.ZodLiteral) return [...s.values].map(String).sort();
  if (s instanceof z.ZodUnion) {
    const values: string[] = [];
    for (const o of s.options as z.ZodTypeAny[]) {
      if (!(o instanceof z.ZodLiteral)) return null;
      values.push(...[...o.values].map(String));
    }
    return values.sort();
  }
  return null;
}

function backupShape(tableName: string): Record<string, z.ZodTypeAny> {
  const schema = BACKUP_SCHEMAS[tableName as BackupTableName];
  return (schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
}

describe("backup schema ↔ record types parity", () => {
  const LITERAL_UNIONS = extractLiteralUnions();

  it("every synced table has a backup schema", () => {
    expect(Object.keys(BACKUP_SCHEMAS).sort()).toEqual([...TABLE_PUSH_ORDER].sort());
  });

  it.each(DEXIE_TABLES)(
    "$tableName: backup enum literals match the TS unions and Drizzle CHECK lists",
    ({ tableName, interfaceName }) => {
      const tsUnions = LITERAL_UNIONS.get(interfaceName) ?? new Map<string, string[]>();
      const checks = drizzleCheckLists(getDrizzleTable(tableName)!);
      for (const [field, fieldSchema] of Object.entries(backupShape(tableName))) {
        const backup = zodLiterals(fieldSchema);
        if (!backup) continue;
        expect(backup, `${tableName}.${field}: backup enum vs TS union`).toEqual(
          tsUnions.get(field),
        );
        if (checks.has(field)) {
          expect(backup, `${tableName}.${field}: backup enum vs Drizzle CHECK`).toEqual(
            checks.get(field),
          );
        }
      }
    },
  );

  it.each(DEXIE_TABLES)(
    "$tableName: backup required keys match the required fields of the record type",
    ({ tableName, fields, optionalFields, nullableFields }) => {
      const cols = getColumnMeta(getDrizzleTable(tableName)!);
      const violations: string[] = [];
      for (const [field, fieldSchema] of Object.entries(backupShape(tableName))) {
        if (!fields.includes(field)) {
          violations.push(`${field}: not a field of the record type`);
          continue;
        }
        if (optionalFields.includes(field) && !fieldSchema.safeParse(undefined).success) {
          violations.push(`${field}: optional in the record type but required by the backup`);
        }
        // Pulled rows carry NULL for a nullable column, and a backup exported
        // after a pull carries it on.
        const mayBeNull = nullableFields.includes(field) || cols[field]?.notNull === false;
        if (mayBeNull && !fieldSchema.safeParse(null).success) {
          violations.push(`${field}: nullable but the backup rejects null`);
        }
      }
      expect(violations, `${tableName}: backup schema is stricter than the record`).toEqual([]);
    },
  );
});
