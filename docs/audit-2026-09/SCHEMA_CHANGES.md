# 2026-09 audit: schema changes

## Package 00: schema (branch `audit/00-schema`)

Findings: server-schema-parity#9, sync-engine#3, sync-engine#10, dexie-schema#8, dexie-schema#15.
Every change is additive. Other packages branch from this merge and build on the contract below.

### Dexie v23 (`apps/web/src/lib/db.ts`)
- `doseLogs` gains the compound index `[scheduleId+scheduledDate]`. All existing indexes stay, including `scheduledTime`.
- The dead boolean indexes are dropped: `prescriptions.isActive`, `inventoryItems.isActive` and `phaseSchedules.enabled`. `phaseSchedules.time` stays. Never `.where()` on these fields; use `toArray()` and filter in JS. The debug panel now does this.
- The upgrade repairs tombstones only (rows with `deletedAt != null`). It sets `isActive=false` on prescriptions and inventory items, and `enabled=false` on schedules. Phases that are `active` or `pending` become `cancelled`. Titration plans that are `active`, `draft` or `pending` become `cancelled`. Each changed row gets `updatedAt=now` and is enqueued (the v22 `enqueueRepair` pattern). Live rows are never touched, and nothing is deleted.
- `DB_SCHEMA_VERSION = 23`. `PREVIEW_STORES` matches.

### Record types (`@intake/types/records`) and Postgres (migration `0021_natural_the_spike`)
- `DoseLog` gains the optional snapshot fields `doseAmount?` (in `doseUnit`), `doseUnit?`, `pillsConsumed?` and `pillStrength?`. The matching columns are nullable: `dose_amount real`, `dose_unit text`, `pills_consumed real`, `pill_strength real`. They are also in `FLOAT_SYNC_FIELDS` and in the backup `doseLogSchema` as optional and nullable. Nothing writes them yet.
- `Prescription.indication` is now `indication?: string`, and the column is nullable. Pulled rows may carry `null`, so render `''` and `null` as empty. The backup schema accepts a missing or null value.
- `PhaseSchedule.time` is no longer `@deprecated`. It is the canonical wall-clock `HH:MM` in `anchorTimezone`. `scheduleTimeUTC` is derived from it and is not authoritative.
- `SyncMetaRow.lastPulledUpdatedAt` is now an opaque server cursor value. It is no longer a row's `updatedAt`.

### Server-assigned pull cursor (sync-engine#3)
- Every synced table has `server_updated_at bigint NOT NULL DEFAULT (floor(extract(epoch from now())*1000))::bigint` and an index `(user_id, server_updated_at, id)`. The migration backfills `server_updated_at = updated_at`, so cursors that clients saved earlier stay valid.
- The column is server-only. The push row schemas omit it (`SERVER_ONLY_COLUMNS` in `sync-payload.ts`), so a value sent by the client is stripped. The parity test allowlists it next to `userId`. `verify-hash` excludes it from the digest.
- **Push** (`api/sync/push/route.ts`): every insert, every update, and the #355 tombstone-stub UPDATE set `serverUpdatedAt: Date.now()` at write time. A write that loses LWW does not restamp. LWW still uses the client's `updatedAt`. Any other server-side write to a synced table must also set `serverUpdatedAt` (see `completeInsightJob`).
- **Pull** (`api/sync/pull/route.ts`): uses a keyset on `(serverUpdatedAt, id)`. It returns `result[table].cursor = { updatedAt: <stamp>, id }` when a page is non-empty, and strips `serverUpdatedAt` from rows. The wire name `updatedAt` is kept. The server keyset applies only when the request body carries `cursorKind: "server"`. Without it (an older, service-worker-cached client that builds its cursor from the last row's `updatedAt`) the route keeps paging by `(updatedAt, id)`, so that client cannot loop on a page whose last row's `updatedAt` sits behind the page start.
- **Client** (`sync-engine.ts`): sends `cursorKind: "server"` and stores `slice.cursor` as it arrives. It falls back to the last row only when talking to an older server. The `serverTime - SKEW_MARGIN_MS` clamp stays, because `serverTime` and the stamp now share the server clock.
- sync-client-engine and sync-server-auth must keep all of the above when they edit `sync-engine.ts` and `push/route.ts`.

### Local-only `timezone` (dexie-schema#15)
- `lib/utils.ts` adds `baseSyncFields()`, which returns `createdAt`, `updatedAt`, `deletedAt` and `deviceId` without `timezone`. Use it when writing Prescription, MedicationPhase, PhaseSchedule, TitrationPlan, UserProfile or InsightReport. `syncFields()` keeps adding `timezone` for tables that declare it. There is no data migration; existing values stay.

### Parity test (server-schema-parity#9)
`schema-parity.test.ts` now also checks the following:
- A TS-optional or nullable field must not map to a `NOT NULL` column without a default.
- A nullable column must not back a required, non-null TS field.
- Every scalar `number` field is in exactly one of `INTEGER_SYNC_FIELDS` / `FLOAT_SYNC_FIELDS`.
- The synced stores of the latest `db.ts` version equal `TABLE_PUSH_ORDER`, and both equal the `TABLE_TO_INTERFACE` keys.

The backup-schema enum and optionality comparison is `it.todo`. The backup-and-data-deletion package enables it after fixing server#4.

### Shared contracts
- `@intake/core/lifecycle`: `isLive(row)` returns `row.deletedAt == null`, which treats both null and undefined as live.
- `@intake/core/effective-phase`: pure, and imports nothing from Dexie.
  - `selectEffectivePhase(phases)` works on one prescription's phases. It considers live phases with status `active`, and a titration phase linked to a plan beats the others.
  - `selectEffectivePhases(phases, schedules)` returns `{ prescriptionId, phase, schedules }[]`. The schedules are the live, `enabled` ones of the chosen phase.
  - This mirrors the `getDailyDoseSchedule` precedence. The caller filters active prescriptions.
- `LiquidPreset` gains the optional `sugarPer100ml` (g/100ml) and `potassiumPer100ml` (mg/100ml). `updateLiquidPreset` takes a `LiquidPresetPatch`: a key that is present with the value `undefined` is deleted. No persist-version bump is needed.

### Deferred
These are not part of this package: the dose_logs partial unique index (needs a prod dedupe), CHECK constraints, the salt->sodium rename, the deletedAt sentinel and indexing redesign, a synced userSettings table, and multi-device push_subscriptions.
