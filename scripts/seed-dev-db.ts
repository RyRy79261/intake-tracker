#!/usr/bin/env tsx
/**
 * Dev seed script — validates DEV_SEED_JSON and prints browser-side instructions.
 *
 * IndexedDB is browser-only, so this script cannot write directly to Dexie.
 * Instead it validates the fixture path and prints the URL the dev UI should
 * fetch to retrieve the seed data for client-side import.
 *
 * Usage:
 *   DEV_SEED_JSON=.private-fixtures/intake-tracker-backup-2026-04-17.json pnpm seed:dev
 */

import * as fs from "fs";
import * as path from "path";

const seedPath = process.env.DEV_SEED_JSON;

if (!seedPath) {
  console.error(
    "ERROR: DEV_SEED_JSON env var is not set.\n" +
      "Usage: DEV_SEED_JSON=.private-fixtures/intake-tracker-backup-2026-04-17.json pnpm seed:dev",
  );
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), seedPath);

if (!fs.existsSync(resolved)) {
  console.error(`ERROR: Fixture file not found at ${resolved}`);
  process.exit(1);
}

let data: unknown;
try {
  data = JSON.parse(fs.readFileSync(resolved, "utf-8"));
} catch (e) {
  console.error(`ERROR: Failed to parse JSON at ${resolved}:`, e);
  process.exit(1);
}

const typedData = data as { records?: unknown[]; intakeRecords?: unknown[] };
const records = typedData.records ?? typedData.intakeRecords;
const count = Array.isArray(records) ? records.length : 0;

console.log(`\n✓ Fixture validated: ${resolved}`);
console.log(`  Records: ${count}`);
console.log(`\nTo seed the dev database:`);
console.log(`  1. Start the dev server: pnpm dev`);
console.log(`  2. Open the browser console on http://localhost:3000`);
console.log(`  3. Run:`);
console.log(
  `     fetch('/api/dev/seed', { method: 'POST' })`,
);
console.log(
  `       .then(r => r.json())`,
);
console.log(
  `       .then(({ data }) => {`,
);
console.log(
  `         // data.records is the array to import via intake-service importData()`,
);
console.log(`       })`);
console.log();
