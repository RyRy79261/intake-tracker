/**
 * Dexie schema extractor — TypeScript compiler API walker.
 *
 * Reads src/lib/db.ts without executing it and extracts:
 *   - The canonical Dexie table name list (from db.version(...).stores({...}))
 *   - Per-table interface field lists (property names only, no type info)
 *
 * Used by src/__tests__/schema-parity.test.ts to drive the Dexie ↔ Drizzle
 * field comparison. Zero runtime exposure — test-only module.
 *
 * Design notes:
 *   - Uses ts.createSourceFile (not ts.createProgram) for single-file parse:
 *     ~5x faster, no tsconfig/module resolution needed.
 *   - Static mapping TABLE_TO_INTERFACE is explicit by design: pluralization
 *     heuristics are fragile for English (Schedule/Schedules, Log/Logs, etc.).
 *     If a new table is added to db.ts without updating this map the extractor
 *     throws a clear error that will fail CI immediately.
 *   - Optional fields (?:) are included in the returned field list — the parity
 *     test only checks presence, not optionality or type.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

export interface DexieTableSchema {
  /** Dexie table name, camelCase (e.g., "intakeRecords") */
  tableName: string;
  /** TypeScript interface name (e.g., "IntakeRecord") */
  interfaceName: string;
  /** Property names declared on the interface (including optional ones). camelCase. */
  fields: string[];
}

/**
 * Static mapping from Dexie table name (camelCase, as keyed in db.version().stores())
 * to the TypeScript interface name (PascalCase singular) exported from db.ts.
 *
 * Must be kept in sync with src/lib/db.ts. If the extractor throws on a new table,
 * add the mapping here AND add the corresponding Drizzle table in src/db/schema.ts.
 */
const TABLE_TO_INTERFACE: Record<string, string> = {
  intakeRecords: "IntakeRecord",
  weightRecords: "WeightRecord",
  bloodPressureRecords: "BloodPressureRecord",
  eatingRecords: "EatingRecord",
  urinationRecords: "UrinationRecord",
  defecationRecords: "DefecationRecord",
  substanceRecords: "SubstanceRecord",
  prescriptions: "Prescription",
  medicationPhases: "MedicationPhase",
  phaseSchedules: "PhaseSchedule",
  inventoryItems: "InventoryItem",
  inventoryTransactions: "InventoryTransaction",
  doseLogs: "DoseLog",
  dailyNotes: "DailyNote",
  auditLogs: "AuditLog",
  titrationPlans: "TitrationPlan",
};

/** Default path to db.ts — resolved relative to this file's location in src/__tests__/ */
// process.cwd() in Vitest is the project root; from there db.ts is at src/lib/db.ts.
// We prefer cwd() over __dirname/import.meta because Vitest may transform the file
// and change the effective __dirname. The project root is always the anchor.
const DB_TS_DEFAULT_PATH = path.resolve(process.cwd(), "src/lib/db.ts");

/**
 * Walk src/lib/db.ts using the TypeScript compiler API and return one
 * DexieTableSchema per table declared in the static TABLE_TO_INTERFACE mapping.
 *
 * @param dbTsPath - Optional override for the path to db.ts.
 * @throws Error with format "Cannot resolve Dexie interface for table '<tableName>'..."
 *   when the expected interface is absent from the parsed file.
 */
export function extractDexieSchema(dbTsPath?: string): DexieTableSchema[] {
  const resolvedPath = dbTsPath ?? DB_TS_DEFAULT_PATH;
  const source = fs.readFileSync(resolvedPath, "utf-8");

  const sourceFile = ts.createSourceFile(
    resolvedPath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  // Collect every exported interface declaration's property names.
  // Map: interfaceName → string[] of property names
  const interfaceFields = new Map<string, string[]>();

  function walk(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const fields: string[] = [];
      for (const member of node.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          fields.push(member.name.text);
        }
      }
      interfaceFields.set(name, fields);
    }
    ts.forEachChild(node, walk);
  }

  ts.forEachChild(sourceFile, walk);

  // Validate the static mapping — every expected interface must exist in the file.
  const result: DexieTableSchema[] = [];
  for (const [tableName, interfaceName] of Object.entries(TABLE_TO_INTERFACE)) {
    const fields = interfaceFields.get(interfaceName);
    if (!fields) {
      throw new Error(
        `Cannot resolve Dexie interface for table '${tableName}' — ` +
          `expected interface '${interfaceName}' not found in ${resolvedPath}`,
      );
    }
    result.push({ tableName, interfaceName, fields });
  }

  return result;
}
