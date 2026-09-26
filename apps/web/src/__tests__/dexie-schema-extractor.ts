/**
 * Dexie schema extractor — TypeScript compiler API walker.
 *
 * Reads the Dexie record interfaces (packages/types/src/records.ts) without
 * executing them and extracts:
 *   - Per-table interface field lists (property names only, no type info)
 *   (The canonical Dexie table NAME list still comes from the static
 *    TABLE_TO_INTERFACE map below — the stores({...}) blocks stay in db.ts.)
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
 *   - Optional fields (?:) are included in the returned field list. Their
 *     optionality, nullability (`| null`) and scalar-number type are reported
 *     separately so the parity test can compare them with Drizzle's
 *     notNull/hasDefault and integer/real column types.
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
  /** Fields declared with `?:`. */
  optionalFields: string[];
  /** Fields whose declared type is a union containing `null`. */
  nullableFields: string[];
  /** Fields typed as a scalar `number` (optionally `| null`/`| undefined`). Arrays excluded. */
  numberFields: string[];
}

/**
 * Static mapping from Dexie table name (camelCase, as keyed in db.version().stores())
 * to the TypeScript interface name (PascalCase singular) exported from db.ts.
 *
 * Must be kept in sync with the record interfaces in @intake/types/records. If the
 * extractor throws on a new table, add the mapping here AND add the corresponding
 * Drizzle table in @intake/db/schema.
 */
export const TABLE_TO_INTERFACE: Record<string, string> = {
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
  userProfile: "UserProfile",
  insightReports: "InsightReport",
  userSettings: "UserSettings",
};

/**
 * Default path to the Dexie record interfaces. They moved out of `src/lib/db.ts`
 * into `@intake/types/records` in Phase 3a (the Dexie runtime stayed in db.ts),
 * so the extractor parses the records file directly. process.cwd() in Vitest is
 * the app project root (apps/web); the package sits two levels up. We prefer
 * cwd() over __dirname/import.meta because Vitest may transform the file and
 * change the effective __dirname — the project root is always the anchor.
 */
const DB_TS_DEFAULT_PATH = path.resolve(
  process.cwd(),
  "../../packages/types/src/records.ts",
);

/**
 * Walk the records file (packages/types/src/records.ts) using the TypeScript
 * compiler API and return one DexieTableSchema per table declared in the static
 * TABLE_TO_INTERFACE mapping.
 *
 * @param dbTsPath - Optional override for the path to the records file.
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

  // Collect every interface declaration's property names (+ shape flags).
  // Map: interfaceName → field info
  type FieldInfo = Omit<DexieTableSchema, "tableName" | "interfaceName">;
  const interfaceFields = new Map<string, FieldInfo>();

  const unionMembers = (type: ts.TypeNode | undefined): ts.TypeNode[] =>
    type && ts.isUnionTypeNode(type) ? [...type.types] : type ? [type] : [];
  const isNullType = (t: ts.TypeNode): boolean =>
    ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword;
  const isUndefinedType = (t: ts.TypeNode): boolean =>
    t.kind === ts.SyntaxKind.UndefinedKeyword;

  function walk(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const info: FieldInfo = {
        fields: [],
        optionalFields: [],
        nullableFields: [],
        numberFields: [],
      };
      for (const member of node.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const field = member.name.text;
          info.fields.push(field);
          if (member.questionToken) info.optionalFields.push(field);
          const members = unionMembers(member.type);
          if (members.some(isNullType)) info.nullableFields.push(field);
          const core = members.filter((t) => !isNullType(t) && !isUndefinedType(t));
          if (core.length === 1 && core[0]!.kind === ts.SyntaxKind.NumberKeyword) {
            info.numberFields.push(field);
          }
        }
      }
      interfaceFields.set(name, info);
    }
    ts.forEachChild(node, walk);
  }

  ts.forEachChild(sourceFile, walk);

  // Validate the static mapping — every expected interface must exist in the file.
  const result: DexieTableSchema[] = [];
  for (const [tableName, interfaceName] of Object.entries(TABLE_TO_INTERFACE)) {
    const info = interfaceFields.get(interfaceName);
    if (!info) {
      throw new Error(
        `Cannot resolve Dexie interface for table '${tableName}' — ` +
          `expected interface '${interfaceName}' not found in ${resolvedPath}`,
      );
    }
    result.push({ tableName, interfaceName, ...info });
  }

  return result;
}
