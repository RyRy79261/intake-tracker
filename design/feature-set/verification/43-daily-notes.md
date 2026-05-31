# Verification — 43-daily-notes

**Verdict:** accurate · checked 47 claims, verified 46.

The document is an unusually faithful description of the daily-notes data/sync/backup/query
surface. Every line-number citation in the "Files covered" list resolves to the exact code it
claims. The hook behavior, Dexie/Postgres schema, backup round-trip, sync-topology placement,
sync-metadata defaults, and the "no UI mounts these hooks yet" gap analysis are all confirmed
against source. The only blemish is a wrong identifier name for the backup registries (prose
only — the cited line numbers are correct).

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Registered in `backupTableSchemas.dailyNotes` and `tableValidators.dailyNotes`." | The actual exported registries are named `BACKUP_SCHEMAS` and `BACKUP_VALIDATORS`. No symbol named `backupTableSchemas` or `tableValidators` exists anywhere in the repo. (The cited line numbers 201/228 themselves are correct — they point at the real `BACKUP_SCHEMAS.dailyNotes` / `BACKUP_VALIDATORS.dailyNotes` entries.) | `src/lib/backup-schemas.ts:186-205, 213-232` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The `dailyNotes` table is also surfaced in a Debug-panel table list and counted into the device storage-usage total — a real (diagnostic) read surface beyond the import-summary count the doc mentions. Not part of the journaling feature spec but does touch user-visible diagnostics. | `src/hooks/use-storage-info.ts:48`, `src/components/debug-panel.tsx:101` |
| low | The table participates in the live sync pipeline beyond the topology ordering the doc notes: a Drizzle insert row-schema (`dailyNotesRowSchema`, userId omitted), a sync op-envelope literal, the pull table map, and the server-side `/api/sync/cleanup` tombstone purge list. Confirms "Multi-device sync" but the doc never lists these concrete surfaces. | `src/lib/sync-payload.ts:80-82, 171-172, 234, 286`, `src/app/api/sync/cleanup/route.ts:19` |
| low | A schema-parity unit test asserts `dailyNotes` is in the Dexie/Postgres parity set (build-failing guard). Not behavior, but it is the enforcement mechanism behind the doc's "field-for-field parity" framing. | `src/__tests__/schema-parity.test.ts:70` |

## Spot-confirmed

- **`useDailyNotes` reactive date query + in-memory prescription filter + `[]` seed** — `useLiveQuery` over `db.dailyNotes.where("date").equals(date)`, post-filtered by `n.prescriptionId === prescriptionId` only when `prescriptionId` is truthy, third arg `[]` as the seed/default. Confirms "reactive", "filtered-per-prescription drops general notes", "seeds []". `src/hooks/use-daily-notes-queries.ts:8-20`
- **No `deletedAt` predicate in the read** — the query returns whatever the date index yields; tombstones are NOT filtered out by the hook. Doc claim (states §Deleted, rules §Soft-delete-not-filtered) confirmed verbatim. `src/hooks/use-daily-notes-queries.ts:8-20`
- **`useAddDailyNote` insert contract** — builds `{ id: crypto.randomUUID(), date, ...(prescriptionId !== undefined && {...}), ...(doseLogId !== undefined && {...}), note, ...syncFields() }` and `db.dailyNotes.add(entry)`; optional FK keys spread conditionally so `undefined` is omitted, not stored. Confirms "conditional spread / undefined omitted". `src/hooks/use-daily-notes-queries.ts:29-44`
- **`AddDailyNoteInput` = `{ date: string; prescriptionId?: string; doseLogId?: string; note: string }`** — exact. `src/hooks/use-daily-notes-queries.ts:22-27`
- **`syncFields()` defaults** — `createdAt == updatedAt == Date.now()`, `deletedAt: null`, `deviceId: getDeviceId()`, `timezone: getDeviceTimezone()`. `src/lib/utils.ts:49-52`
- **`getDeviceId()`** reads localStorage key `"intake-tracker-device-id"`, generates a `crypto.randomUUID()` if absent, returns `"server"` under SSR. `src/lib/utils.ts:33-47`
- **`getDeviceTimezone()`** returns the IANA string from `Intl.DateTimeFormat().resolvedOptions().timeZone` (e.g. "Europe/Berlin"), `"UTC"` under SSR. Doc's "Africa/Johannesburg" is a valid example IANA value. `src/lib/timezone.ts:18-23`
- **`DailyNote` interface fields/types** — `id, date(YYYY-MM-DD comment), prescriptionId?, doseLogId?, note, createdAt:number, updatedAt:number, deletedAt:number|null, deviceId:string, timezone:string`. Matches the doc's data-model table exactly. `src/lib/db.ts:271-282`
- **Dexie store index** `"id, date, prescriptionId, doseLogId, updatedAt"` — present in `V10_STORES` (line 480) and repeated verbatim in inline v16–v21 store maps (746, 773, 801, 830, 860, 890). Confirms "present from v10, repeated across v16–21". `src/lib/db.ts:480, 746, 773, 801, 830, 860, 890`
- **Migration backfills** `backfill("dailyNotes", "createdAt")` (v10) and `backfillTimezone("dailyNotes", "createdAt")` (v11). `src/lib/db.ts:552, 617`
- **Postgres `daily_notes` table** — columns and constraints match the doc digit-for-digit: `id` pk; `user_id` notNull FK→`usersSync.id` `onDelete: cascade`; `date` notNull; `prescription_id` FK→`prescriptions.id` (no cascade); `dose_log_id` FK→`doseLogs.id` (no cascade); `note` notNull; `created_at`/`updated_at` bigint notNull; `deleted_at` bigint nullable; `device_id`/`timezone` notNull. Indexes: `idx_daily_notes_user_updated(user_id, updated_at)`, `idx_daily_notes_date(date)`, `idx_daily_notes_prescription(prescription_id)`. `src/db/schema.ts:574-599`
- **`dailyNoteSchema`** = `baseRecord.extend({ date: z.string(), note: z.string() }).passthrough()`. `src/lib/backup-schemas.ts:137-142`
- **Sync push order** — `dailyNotes` in Tier 5, after `doseLogs` (line 38) and adjacent to `inventoryTransactions` (line 40). `src/lib/sync-topology.ts:39-41`
- **`makeDailyNote()` fixture** — default `date: "2023-11-14"`, `note: "Test note"`, `prescriptionId: undefined`, `doseLogId: undefined`, `deletedAt: null`. `src/__tests__/fixtures/db-fixtures.ts:221-234`
- **`dailyNotesImported`** summed into the import-summary total. `src/components/settings/data-management-section.tsx:107`
- **Backup round-trip** — exported via `db.dailyNotes.toArray()`, imported with `BACKUP_VALIDATORS.dailyNotes` (both merge and replace paths), cleared on replace-import. `src/lib/backup-service.ts:185, 490, 537, 559`
- **`DoseLog.note?` is a separate inline field** on the dose record, distinct from the `dailyNotes` table that links via `doseLogId`. `src/lib/db.ts:296`
- **`DoseStatus` exists; daily notes have no equivalent categorical field** — `DoseStatus = "taken" | "skipped" | "rescheduled" | "pending"`; `DailyNote` has no status/type member. `src/lib/db.ts:138, 271-282`
- **"No end-user UI mounts these hooks"** — repo-wide grep for `useDailyNotes` / `useAddDailyNote` returns ZERO importers outside the hook file and its own test. Confirmed. `src/hooks/use-daily-notes-queries.ts` (sole definition site)
- **"Only read + create; no update/delete hook"** — file contains exactly two exports (`useDailyNotes`, `useAddDailyNote`); no update/delete/soft-delete mutation present. `src/hooks/use-daily-notes-queries.ts:8, 29`

## Low-confidence / could-not-verify

- None. Every cited line resolved and every quantitative claim (field types, enum values, index
  column lists, defaults, fixture literals) was checked digit-for-digit against source.
