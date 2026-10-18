/**
 * Sync topology — the synced tables in foreign-key order (parents before
 * children), so every FK parent lands on the server before a child that
 * references it.
 *
 * Generated from the Drizzle schema into `@intake/db/sync-manifest`
 * (`pnpm db:generate`); this module only re-exports it under the names the
 * client code uses. Per-table facts (numeric and nullable columns, FK
 * parents, timezone column) are in `SYNC_TABLES` there.
 */

import { TABLE_PUSH_ORDER, type SyncTableName } from "@intake/db/sync-manifest";

export { TABLE_PUSH_ORDER };

/** Literal union of the synced table names. */
export type TableName = SyncTableName;
