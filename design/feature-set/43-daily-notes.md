# 43 — Daily Notes

**Files covered:**
- `src/hooks/use-daily-notes-queries.ts` (read + create hooks)
- `src/hooks/use-daily-notes-queries.test.tsx` (behavioral contract)
- `src/lib/db.ts` — `DailyNote` interface (lines 271–282), Dexie store index `dailyNotes` (line 480, repeated each schema version), migration backfills (lines 552, 617)
- `src/db/schema.ts` — `dailyNotes` Postgres table (lines 574–599)
- `src/lib/backup-schemas.ts` — `dailyNoteSchema` (lines 137–142), validator registration (lines 181, 201, 228)
- `src/lib/sync-topology.ts` — push-order placement (lines 39–41)
- `src/lib/utils.ts` — `syncFields()` helper (lines 49–52)
- `src/__tests__/fixtures/db-fixtures.ts` — `makeDailyNote()` fixture (lines 221–234)
- `src/components/settings/data-management-section.tsx` — `dailyNotesImported` count surface (line 107)

**Purpose:** Free-text dated notes the user can attach to a day, optionally scoped to a specific medication (prescription) and/or a specific dose event (dose log). It is the app's general-purpose journaling primitive for recording how a day felt, side-effects, context, or commentary that does not fit the structured trackers. The data layer, sync, backup, and query/create hooks are fully built; **no end-user UI currently mounts these hooks** — this brief is the spec for the screen/surface that should consume them.

## Features

- **Date-scoped note list.** Reads every non-deleted note whose `date` equals a given `YYYY-MM-DD` calendar day via a live (reactive) query. Results auto-refresh whenever the underlying Dexie table changes — no manual refetch.
- **Optional prescription filtering.** When a `prescriptionId` is supplied, the list narrows to only notes tagged to that medication for that date; notes with no prescription are excluded from the filtered view.
- **Three association scopes per note**, recorded as independent optional fields:
  - **Day-level (general):** `date` only — a free journal entry for the whole day.
  - **Medication-level:** `date` + `prescriptionId` — a note about a specific prescription on that day.
  - **Dose-level:** `date` + `doseLogId` (typically alongside `prescriptionId`) — a note tied to one individual scheduled/taken dose event.
- **Create note.** Adds a new note for a date with free-text body and optional `prescriptionId` / `doseLogId` linkage. New note becomes visible to any open live query immediately (reactive insert).
- **Reactive cross-surface sync.** Because reads use `useLiveQuery`, a note added from one surface appears in all other mounted lists for that date without prop drilling or invalidation.
- **Multiple notes per day.** No uniqueness constraint — a day (and a day+prescription pair) can hold any number of notes.
- **Soft-delete aware.** Every note carries `deletedAt`; the model supports tombstoning rather than hard deletion (consistent with all sync-backed tables), though no delete hook is exposed yet (see gaps below).
- **Backup round-trip.** Notes are included in JSON export/import; the import summary in Settings counts `dailyNotesImported`.
- **Diagnostic surfaces.** Beyond the import-summary count, the `dailyNotes` row count is read into the device storage-usage total (`src/hooks/use-storage-info.ts` line 48) and the table appears in the Debug panel's per-table list (`src/components/debug-panel.tsx` line 101). These are diagnostic read surfaces, not part of the journaling feature itself.
- **Multi-device sync.** Notes mirror to Neon Postgres (`daily_notes`) and back, ordered correctly relative to their FK parents.

## User actions & interactions

> The hooks define what the UI must support. The following are the actions the consuming surface should expose:

- **View notes for a day** — load/scroll the list of notes for the currently selected date. Result is an array (possibly empty).
- **Filter by medication** — when viewing a prescription context, see only that prescription's notes for the day.
- **Add a note** — enter free text and submit; optionally pre-tagged with the current prescription and/or dose. On submit, the note is written and instantly appears in the list.
- **Type / edit the note body** — multi-line free-text input; `note` is a plain string with no enforced length cap in code.
- **Tag association (implicit/explicit)** — the calling context supplies `prescriptionId` / `doseLogId`; a general note omits both.
- **Cancel / dismiss entry** — abandon a draft without writing (UI concern; no persistence side-effect).
- *Not yet supported in code (gaps the design may need to add):* **edit existing note**, **delete note**, **undo delete**, **date navigation/picker**, **confirm-on-delete**. There is no update or delete mutation hook — only read (`useDailyNotes`) and create (`useAddDailyNote`).

## States & presentations

- **Default / populated** — list of one or more note cards/rows for the selected date, each showing body text and (optionally) which medication/dose it is linked to.
- **Empty** — the live query returns `[]` (its initial value is also `[]`). UI should show an empty state for "no notes for this day" and an affordance to add the first note.
- **Loading** — `useLiveQuery` seeds with `[]` before the first result resolves, so there is no separate spinner state from the hook; the initial frame is indistinguishable from empty. A skeleton/placeholder is a UI choice, not enforced by data.
- **Filtered (per-prescription)** — same list, scoped to one medication; should communicate the active filter.
- **Adding / submitting** — `useAddDailyNote` exposes React Query mutation state (`isPending`, `isSuccess`, `isError`) for in-flight, success, and failure presentation.
- **Success** — after add, the new note appears reactively; no toast is built in.
- **Validation-error** — empty body is the primary client-side concern (see rules); no validation is enforced in the hook today.
- **Offline** — fully functional offline: writes land in IndexedDB immediately; sync metadata is stamped and the record syncs to Postgres on reconnect. No degraded state for the user.
- **Syncing** — note carries `updatedAt` / `deviceId` / `timezone`; conflict resolution is handled by the sync engine (last-writer-wins via `updatedAt`), not surfaced in this feature's UI.
- **Deleted (tombstone)** — `deletedAt` non-null records exist in the table; the read query in this feature does **not** filter them out itself (no `deletedAt` predicate in `useDailyNotes`), so the consuming UI or upstream filtering must account for soft-deletes.

## Enums, options & configurable values

- **`date` format:** string, `YYYY-MM-DD` (calendar day; per `DailyNote.date` comment and fixtures e.g. `"2023-11-14"`).
- **Association fields (all optional):**
  - `prescriptionId?: string` — FK to a prescription.
  - `doseLogId?: string` — FK to a dose log event.
- **`note`:** required non-empty string in practice; arbitrary free text. **No enum, no preset list, no length limit** defined in code.
- **Sync-metadata defaults** (from `syncFields()`):
  - `createdAt` = `Date.now()` (Unix ms)
  - `updatedAt` = `Date.now()` (Unix ms)
  - `deletedAt` = `null`
  - `deviceId` = device UUID from localStorage key `intake-tracker-device-id` (or `"server"`)
  - `timezone` = device IANA timezone string (e.g. `"Africa/Johannesburg"`)
- **`id`:** `crypto.randomUUID()`.
- **Dexie store index:** `"id, date, prescriptionId, doseLogId, updatedAt"` — queryable by id, date, prescriptionId, doseLogId, updatedAt.
- **No status/type enum** — unlike dose logs (which have a `DoseStatus`), daily notes have no categorical state field; they are pure free text.
- **Distinct from per-dose `note`:** `DoseLog.note?` is a separate inline note attached directly to a dose record — daily notes are a separate, additive table that *links to* a dose via `doseLogId` rather than living on it.

## Data model touched

**Dexie interface — `DailyNote` (`src/lib/db.ts` 271–282):**
| field | type | notes |
|---|---|---|
| `id` | `string` | primary key (UUID) |
| `date` | `string` | `YYYY-MM-DD` |
| `prescriptionId?` | `string` | optional FK → prescription |
| `doseLogId?` | `string` | optional FK → dose log |
| `note` | `string` | required free text |
| `createdAt` | `number` | Unix ms |
| `updatedAt` | `number` | Unix ms |
| `deletedAt` | `number \| null` | soft-delete tombstone |
| `deviceId` | `string` | originating device |
| `timezone` | `string` | IANA tz at write time |

**Dexie table:** `db.dailyNotes` (`EntityTable<DailyNote, "id">`, line 437); store string repeated identically across schema versions 16–21 (and present from v10).

**Postgres mirror — `daily_notes` (`src/db/schema.ts` 574–599):** columns `id` (pk), `user_id` (FK → `usersSync.id`, `onDelete: cascade`), `date` (not null), `prescription_id` (FK → `prescriptions.id`), `dose_log_id` (FK → `doseLogs.id`), `note` (not null), `created_at`/`updated_at` (bigint, not null), `deleted_at` (bigint, nullable), `device_id` (not null), `timezone` (not null). Indexes: `idx_daily_notes_user_updated (user_id, updated_at)`, `idx_daily_notes_date (date)`, `idx_daily_notes_prescription (prescription_id)`.

**Backup schema — `dailyNoteSchema` (`src/lib/backup-schemas.ts` 137–142):** `baseRecord` (id + optional sync fields) extended with `date: string`, `note: string`, `.passthrough()` (unknown keys preserved for forward-compat). Registered in `BACKUP_SCHEMAS.dailyNotes` (line 201) and `BACKUP_VALIDATORS.dailyNotes` (line 228).

**Sync push order (`src/lib/sync-topology.ts`):** `dailyNotes` sits in Tier 5 (after `doseLogs`, alongside `inventoryTransactions`) because it can FK-reference both `prescriptions` and `doseLogs`, so its parents must push first.

**Live sync pipeline surfaces (`src/lib/sync-payload.ts`):** beyond topology ordering, the table is wired through the full push/pull pipeline — a Drizzle insert row-schema `dailyNotesRowSchema` (built from `schema.dailyNotes` with `userId` omitted, lines 80–82), a sync op-envelope literal (lines 171–172), the pull table map (line 234), and a pull/apply entry (line 286). The server-side `/api/sync/cleanup` route also lists `dailyNotes` in its tombstone-purge set (`src/app/api/sync/cleanup/route.ts` line 19).

**Parity enforcement (`src/__tests__/schema-parity.test.ts` line 70):** a build-failing unit test asserts `dailyNotes` is present in the Dexie/Postgres parity set — this is the guard behind the field-for-field parity requirement.

## Validation, edge cases & business rules

- **`note` body:** required string; the hook does not trim or reject empty strings — empty-body prevention is a UI responsibility. Postgres enforces `not null` but not non-empty.
- **`date`:** must be a `YYYY-MM-DD` calendar-day string; equality match against `date` is exact (no range/timezone normalization in the query). The day-string is the responsibility of the caller — note that the app uses a configurable day-start hour elsewhere, so "today" should be derived consistently with that logic when generating `date`.
- **Optional FKs:** `prescriptionId` and `doseLogId` are only written when explicitly provided (the add hook spreads them conditionally, so `undefined` keys are omitted entirely rather than stored as `undefined`).
- **Filtering semantics:** `useDailyNotes(date, prescriptionId)` filters in-memory after the date-indexed query; when `prescriptionId` is given, notes lacking that exact `prescriptionId` (including general/day-level notes) are dropped from the result.
- **Soft-delete not filtered in read:** `useDailyNotes` returns whatever the date query yields and does **not** exclude `deletedAt != null` records itself — a consuming surface relying on it must filter tombstones, or this is a latent bug to fix when wiring the UI.
- **Sync metadata stamping:** every create stamps `createdAt == updatedAt == Date.now()`, `deletedAt: null`, plus device id and timezone via `syncFields()`.
- **Last-writer-wins:** cross-device conflicts resolve on `updatedAt`; this feature does no merge logic of its own.
- **No update/delete mutation:** the only write path is insert. Editing or deleting requires new hooks (and the soft-delete pattern: set `deletedAt`, bump `updatedAt`).
- **Multiplicity:** unbounded notes per `(date)` and per `(date, prescriptionId)`; no dedupe.
- **Offline-first:** all reads/writes are IndexedDB-local; nothing blocks on network.

## Sub-components / variants

- `useDailyNotes(date, prescriptionId?)` — reactive Dexie live query returning `DailyNote[]` for a date, optionally narrowed to one prescription; seeds `[]`.
- `useAddDailyNote()` — React Query mutation that builds a `DailyNote` (UUID + `syncFields()`) and inserts it into `db.dailyNotes`, returning the created entry.
- `AddDailyNoteInput` (internal type) — `{ date: string; prescriptionId?: string; doseLogId?: string; note: string }`; the create contract.
- `dailyNoteSchema` (`backup-schemas.ts`) — Zod validator gating imported notes.
- `makeDailyNote()` (`db-fixtures.ts`) — test fixture; default `date: "2023-11-14"`, `note: "Test note"`, no FKs.
- `dailyNotesImported` (Settings → Data Management import summary) — count surface contributed by an import.
- **Missing variants the design likely needs:** a note editor/composer component, a note list-item/card, an empty state, a delete/edit affordance, and a day-context provider (date picker or "today" binding aligned to day-start-hour).
