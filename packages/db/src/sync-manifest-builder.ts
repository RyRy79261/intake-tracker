/**
 * Builds the per-table sync manifest (`sync-manifest.generated.ts`) from the
 * Drizzle schema.
 *
 * The client's sync code (push, pull, backup) needs facts about each synced
 * table: which columns are integers, which are nullable, which tables a row
 * points at, the order to push in. It must not import drizzle (the push loop
 * runs in the browser), so those facts used to be hand-copied into several
 * modules, each held in place by its own parity test, and two sync bugs
 * (#327, #354) were a copy that drifted. Now they are generated from
 * `schema.ts` into one pure-data file, and one freshness test checks the file
 * matches the schema.
 *
 * Regenerate with `pnpm db:generate` (or `pnpm --filter @intake/db
 * sync-manifest`). Server-side only: imports drizzle.
 */
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { schemaByTableName, type TableName } from "./sync-payload";

/** Postgres column types that reject a fractional value. */
const INTEGER_COLUMN_TYPES = new Set(["PgInteger", "PgSmallInt", "PgBigInt53"]);
/** Postgres column types that accept fractions but not NaN/Infinity. */
const FLOAT_COLUMN_TYPES = new Set(["PgReal", "PgDoublePrecision", "PgNumeric"]);
/**
 * Columns only the server writes: the client never sends them (the push
 * route stamps both), so they are left out of every client-facing list.
 */
const SERVER_ONLY_COLUMNS = new Set(["userId", "serverUpdatedAt"]);

export interface SyncTableManifest {
  /** Columns backed by `integer`/`bigint`: a fraction is rejected. */
  integerFields: string[];
  /** Columns backed by `real`: fractions are fine, NaN/Infinity are not. */
  floatFields: string[];
  /** Columns without NOT NULL. */
  nullableFields: string[];
  /** Whether the table has a `timezone` column. */
  hasTimezone: boolean;
  /** Foreign keys to other synced tables: [column, parent table]. */
  fkParents: Array<[string, TableName]>;
}

export interface SyncManifest {
  /** Every synced table, parents before children (FK order). */
  pushOrder: TableName[];
  tables: Record<TableName, SyncTableManifest>;
}

type ColumnLike = { columnType: string; notNull: boolean };

function describeTable(
  name: TableName,
  table: PgTable,
  nameOfTable: Map<string, TableName>,
): SyncTableManifest {
  const columns = Object.entries(getTableColumns(table) as Record<string, ColumnLike>).filter(
    ([key]) => !SERVER_ONLY_COLUMNS.has(key),
  );
  const keyOfColumn = new Map<unknown, string>(
    Object.entries(getTableColumns(table)).map(([key, col]) => [col, key]),
  );

  const fkParents: Array<[string, TableName]> = [];
  for (const fk of getTableConfig(table).foreignKeys) {
    const ref = fk.reference();
    const parent = nameOfTable.get(getTableName(ref.foreignTable));
    if (!parent || parent === name || ref.columns.length !== 1) continue;
    const key = keyOfColumn.get(ref.columns[0]);
    if (key) fkParents.push([key, parent]);
  }
  fkParents.sort(([a], [b]) => a.localeCompare(b));

  return {
    integerFields: columns.filter(([, c]) => INTEGER_COLUMN_TYPES.has(c.columnType)).map(([k]) => k),
    floatFields: columns.filter(([, c]) => FLOAT_COLUMN_TYPES.has(c.columnType)).map(([k]) => k),
    nullableFields: columns.filter(([, c]) => !c.notNull).map(([k]) => k),
    hasTimezone: columns.some(([k]) => k === "timezone"),
    fkParents,
  };
}

/**
 * A deterministic parents-first order: repeatedly take, in name order, every
 * table whose parents are all placed already.
 */
function parentsFirst(tables: Record<TableName, SyncTableManifest>): TableName[] {
  const remaining = new Set(Object.keys(tables) as TableName[]);
  const order: TableName[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((t) => tables[t].fkParents.every(([, p]) => !remaining.has(p)))
      .sort();
    if (ready.length === 0) {
      throw new Error(`Foreign-key cycle among: ${[...remaining].join(", ")}`);
    }
    for (const t of ready) {
      order.push(t);
      remaining.delete(t);
    }
  }
  return order;
}

export function buildSyncManifest(): SyncManifest {
  const entries = Object.entries(schemaByTableName) as Array<[TableName, PgTable]>;
  const nameOfTable = new Map(entries.map(([name, table]) => [getTableName(table), name]));
  const tables = Object.fromEntries(
    entries
      .map(([name, table]) => [name, describeTable(name, table, nameOfTable)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  ) as Record<TableName, SyncTableManifest>;
  return { pushOrder: parentsFirst(tables), tables };
}

const HEADER = `/**
 * GENERATED from packages/db/src/schema.ts by sync-manifest-builder.ts.
 * Do not edit: run \`pnpm db:generate\` (or \`pnpm --filter @intake/db
 * sync-manifest\`) after changing the schema. A test fails if this file is
 * stale.
 *
 * Pure data, safe for the client bundle (no drizzle import).
 */
`;

/** The source text of `sync-manifest.generated.ts`. */
export function renderSyncManifest(manifest: SyncManifest = buildSyncManifest()): string {
  const list = (xs: readonly string[]) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
  const lines: string[] = [HEADER];
  lines.push("export const TABLE_PUSH_ORDER = [");
  for (const t of manifest.pushOrder) lines.push(`  ${JSON.stringify(t)},`);
  lines.push("] as const;", "");
  lines.push("/** One synced table name. */");
  lines.push("export type SyncTableName = (typeof TABLE_PUSH_ORDER)[number];", "");
  lines.push("export interface SyncTableFacts {");
  lines.push("  /** Columns backed by `integer`/`bigint`: a fraction is rejected. */");
  lines.push("  readonly integerFields: readonly string[];");
  lines.push("  /** Columns backed by `real`: fractions are fine, NaN/Infinity are not. */");
  lines.push("  readonly floatFields: readonly string[];");
  lines.push("  /** Columns without NOT NULL (server-only columns left out). */");
  lines.push("  readonly nullableFields: readonly string[];");
  lines.push("  /** Whether the table has a `timezone` column. */");
  lines.push("  readonly hasTimezone: boolean;");
  lines.push("  /** Foreign keys to other synced tables: [column, parent table]. */");
  lines.push("  readonly fkParents: ReadonlyArray<readonly [string, SyncTableName]>;");
  lines.push("}", "");
  lines.push("export const SYNC_TABLES: Record<SyncTableName, SyncTableFacts> = {");
  for (const [name, t] of Object.entries(manifest.tables)) {
    lines.push(`  ${name}: {`);
    lines.push(`    integerFields: ${list(t.integerFields)},`);
    lines.push(`    floatFields: ${list(t.floatFields)},`);
    lines.push(`    nullableFields: ${list(t.nullableFields)},`);
    lines.push(`    hasTimezone: ${t.hasTimezone},`);
    lines.push(
      `    fkParents: [${t.fkParents.map(([c, p]) => `[${JSON.stringify(c)}, ${JSON.stringify(p)}]`).join(", ")}],`,
    );
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}
