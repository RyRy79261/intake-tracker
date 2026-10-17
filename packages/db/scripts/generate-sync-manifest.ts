/**
 * Write packages/db/src/sync-manifest.generated.ts from the Drizzle schema.
 * Run by `pnpm db:generate`, or alone with `pnpm --filter @intake/db sync-manifest`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSyncManifest } from "../src/sync-manifest-builder";

const out = fileURLToPath(new URL("../src/sync-manifest.generated.ts", import.meta.url));
writeFileSync(out, renderSyncManifest());
console.log(`Wrote ${out}`);
