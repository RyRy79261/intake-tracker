/**
 * Static schema parser for db.ts.
 *
 * Reads the raw file from disk (no Dexie import) and extracts all
 * db.version(N).stores({...}) blocks via regex. Used by integrity tests
 * to verify schema consistency and three-way sync.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

export interface VersionSchema {
  version: number;
  tables: string[];
}

/**
 * Parse all db.version(N).stores({...}) blocks from src/lib/db.ts.
 * Returns an array of { version, tables } sorted by version ascending.
 *
 * Throws if no version blocks are found (parser regression guard).
 */
export function parseDbSchema(): VersionSchema[] {
  const dbPath = resolve(__dirname, "../../lib/db.ts");
  const source = readFileSync(dbPath, "utf-8");

  // Match all db.version(N).stores({...}) blocks.
  // The `s` flag enables dotAll so `.` matches newlines.
  // `[^}]+` is safe because Dexie index definition strings never contain `}`.
  const versionPattern = /db\.version\((\d+)\)\.stores\(\{([^}]+)\}\)/gs;

  const results: VersionSchema[] = [];
  let match: RegExpExecArray | null;

  while ((match = versionPattern.exec(source)) !== null) {
    const version = parseInt(match[1]!, 10);
    const storesBlock = match[2]!;

    // Extract table names: the word before the colon on each line.
    const tablePattern = /^\s*(\w+)\s*:/gm;
    const tables: string[] = [];
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tablePattern.exec(storesBlock)) !== null) {
      tables.push(tableMatch[1]!);
    }

    results.push({ version, tables });
  }

  if (results.length === 0) {
    throw new Error(
      "parse-schema: Failed to parse any version blocks from db.ts. " +
        "Check that db.version(N).stores({...}) pattern is intact."
    );
  }

  // Sort by version ascending
  results.sort((a, b) => a.version - b.version);

  return results;
}

/**
 * Convenience function: returns the table names from the latest (highest)
 * version block in db.ts.
 */
export function getLatestTables(): string[] {
  const versions = parseDbSchema();
  return versions[versions.length - 1]!.tables;
}
