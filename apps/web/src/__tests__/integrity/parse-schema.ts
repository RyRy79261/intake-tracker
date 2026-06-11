/**
 * Static schema parser for db.ts.
 *
 * Reads the raw file from disk (no Dexie import) and extracts all
 * realDb.version(N).stores(...) blocks. Used by integrity tests to verify
 * schema consistency and three-way sync.
 *
 * Handles two forms:
 *   1. Inline object literal:  realDb.version(N).stores({ foo: "...", ... })
 *   2. Named constant:         realDb.version(N).stores(V12_STORES)
 *
 * Named-constant resolution understands references (`const V11 = V10;`)
 * and spreads (`const V12 = { ...V11, foo: "..." };`).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

export interface VersionSchema {
  version: number;
  tables: string[];
}

function extractTablesFromObjectBody(body: string): string[] {
  const tablePattern = /^\s*(\w+)\s*:/gm;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tablePattern.exec(body)) !== null) {
    tables.push(m[1]!);
  }
  return tables;
}

/**
 * Parse `const NAME = ... ;` declarations whose value is either a store
 * object literal, a reference to another constant, or a spread combination.
 * Returns a map of constant-name → table list.
 */
function parseStoreConstants(source: string): Map<string, string[]> {
  const constants = new Map<string, string[]>();

  // Match: const NAME = { ... } as const;  OR  const NAME = OTHER_NAME;
  // `[^}]+` is safe because Dexie index strings never contain `}`.
  const declPattern = /const\s+(\w+_STORES)\s*=\s*(\{[^}]*\}|\w+)(?:\s+as\s+const)?\s*;/gs;

  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(source)) !== null) {
    const name = m[1]!;
    const rhs = m[2]!.trim();

    if (rhs.startsWith("{")) {
      // Object literal — may contain `...OTHER_STORES` spreads
      const tables = new Set<string>();
      const spreadPattern = /\.\.\.(\w+_STORES)/g;
      let s: RegExpExecArray | null;
      const body = rhs;
      while ((s = spreadPattern.exec(body)) !== null) {
        const parent = constants.get(s[1]!);
        if (!parent) {
          throw new Error(
            `parse-schema: spread references unknown constant ${s[1]} in ${name}`
          );
        }
        parent.forEach((t) => tables.add(t));
      }
      // Own keys (skip spread lines)
      const lineKeys = /^\s*(\w+)\s*:/gm;
      let k: RegExpExecArray | null;
      while ((k = lineKeys.exec(body)) !== null) {
        tables.add(k[1]!);
      }
      constants.set(name, [...tables]);
    } else {
      // Plain reference to another constant
      const ref = constants.get(rhs);
      if (!ref) {
        throw new Error(
          `parse-schema: reference to unknown constant ${rhs} in ${name}`
        );
      }
      constants.set(name, [...ref]);
    }
  }

  return constants;
}

/**
 * Parse all realDb.version(N).stores(...) blocks from src/lib/db.ts.
 * Returns an array of { version, tables } sorted by version ascending.
 *
 * Throws if no version blocks are found (parser regression guard).
 */
export function parseDbSchema(): VersionSchema[] {
  const dbPath = resolve(__dirname, "../../lib/db.ts");
  const source = readFileSync(dbPath, "utf-8");

  const constants = parseStoreConstants(source);

  // Match realDb.version(N).stores(ARG) where ARG is `{...}` or an identifier.
  const versionPattern = /realDb\.version\((\d+)\)\.stores\(\s*(\{[^}]+\}|\w+)\s*\)/gs;

  const results: VersionSchema[] = [];
  let match: RegExpExecArray | null;

  while ((match = versionPattern.exec(source)) !== null) {
    const version = parseInt(match[1]!, 10);
    const arg = match[2]!.trim();

    let tables: string[];
    if (arg.startsWith("{")) {
      tables = extractTablesFromObjectBody(arg);
    } else {
      const resolved = constants.get(arg);
      if (!resolved) {
        throw new Error(
          `parse-schema: db.version(${version}).stores(${arg}) references unknown constant`
        );
      }
      tables = [...resolved];
    }

    results.push({ version, tables });
  }

  if (results.length === 0) {
    throw new Error(
      "parse-schema: Failed to parse any version blocks from db.ts. " +
        "Check that realDb.version(N).stores({...}) pattern is intact."
    );
  }

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
