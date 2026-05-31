# 42 — Backup, Restore & Cloud-Sync Migration

**Files covered:**
- `src/lib/backup-service.ts` — export/import/restore engine for all 18 data tables (+ settings)
- `src/lib/backup-schemas.ts` — Zod validators for every backup table shape
- `src/hooks/use-backup-queries.ts` — React Query mutations (download, upload, resolve conflicts, clear all)
- `src/lib/migration-service.ts` — local → cloud-sync migration engine (batched upload, verify, resume, cancel)
- `src/stores/migration-store.ts` — Zustand store for migration phase/progress/verification state
- `src/components/migration/migration-wizard.tsx` — wizard dialog shell + phase router
- `src/components/migration/backup-gate-step.tsx` — "back up first" gate before migration
- `src/components/migration/upload-progress-step.tsx` — per-table upload progress UI
- `src/components/migration/completion-summary-step.tsx` — post-migration summary
- `src/components/migration/cancel-confirm-dialog.tsx` — cancel-migration confirmation
- `src/components/migration/migration-guard.tsx` — auto-resume interrupted migration on app load
- `src/components/settings/data-management-section.tsx` — Export / Import / Clear-all UI in Settings
- `src/components/settings/storage-info-section.tsx` — Storage card: mode, usage, record count, migration entry points
- `src/components/settings/conflict-review-drawer.tsx` — per-conflict keep/use-backup resolution drawer
- `src/lib/crypto.ts` — AES-GCM encryption used by encrypted backups
- `src/lib/sync-topology.ts` — `TABLE_PUSH_ORDER` (FK-safe table ordering) used by migration
- `src/hooks/use-storage-info.ts` — storage estimate + record count
- Supporting APIs: `src/app/api/sync/push/route.ts`, `src/app/api/sync/verify-hash/route.ts`, `src/app/api/sync/cleanup/route.ts`

**Purpose:** Lets the single user export their entire local health dataset to a JSON file (optionally PIN-encrypted), import/restore it back with merge or replace semantics and interactive conflict resolution, and one-time migrate their local-only IndexedDB data up to cloud sync via a resumable, verified, batched upload wizard.

---

## Features

### Backup / Export
- **Full-dataset export** to a single JSON `Blob` (`application/json`). Covers all 18 Dexie tables plus a `settings` snapshot read from `localStorage` key `intake-tracker-settings` (`{ state }` Zustand persisted object).
- Tables exported: intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports.
- **Backup envelope metadata:** `version` (`CURRENT_BACKUP_VERSION = 5`) and `exportedAt` (ISO string). `appVersion` is declared optional on the `BackupData` interface but `exportBackup()` never sets it, so it is always absent from real exports.
- **JSON is pretty-printed** (`JSON.stringify(data, null, 2)`).
- **Auto-generated filename:** `intake-tracker-backup-<YYYY-MM-DD>.json` (date portion of `new Date().toISOString()`).
- **Browser download** via temporary `<a download>` element + `URL.createObjectURL` / `revokeObjectURL`.
- **Encrypted export** (`exportEncryptedBackup(pin)`) — engine-only, **no UI**. The function exists (exports plaintext blob, then AES-GCM encrypts the JSON string with a PIN-derived key; produces an `EncryptedBackup` envelope `{ encrypted: true, payload: EncryptedData, version: 5 }`) but it is not referenced by any component or hook — there is no PIN-entry field and no "encrypt" toggle, so it is unreachable from the current UI (used only by tests).
- **Audit logging:** every export writes an audit entry (`data_export`) with per-table counts; encrypted export logs `"Exported encrypted backup"`.

### Restore / Import
- **Import from file** (`importBackup(file, mode)`), default mode `"merge"`.
- **Two import modes (engine):**
  - **merge** — never clears existing data; adds new records, skips duplicates; runs conflict detection on medication/system tables.
  - **replace** — clears all 18 tables first, then bulk-imports everything with no ID/conflict checks. **Engine-only / not user-reachable:** the sole UI caller (`handleConfirmImport`) hard-codes `mode: "merge"`, so no UI path triggers replace.
- **Per-table validation** — every record validated through its Zod schema (`BACKUP_VALIDATORS`); invalid records are counted as `skipped`, never imported.
- **Legacy-format upgrade** — old version-1 backups (`{ version, records }` with no `intakeRecords`) are transparently reshaped into the current `BackupData` form (records → intakeRecords; empty weight/BP arrays).
- **Encrypted-backup detection** — a plaintext import of an encrypted file returns an informative error (`"This backup is encrypted. Please use importEncryptedBackup() with your PIN."`); inverse guard exists for `importEncryptedBackup` on non-encrypted files.
- **Encrypted import** (`importEncryptedBackup(file, pin, mode)`) — engine-only, **no UI**. The function exists (decrypts payload, rebuilds a `File`, delegates to `importBackup`) but, like `exportEncryptedBackup` and the entire `crypto.ts` PIN path, it is not referenced by any component or hook — unreachable from the current UI (used only by tests).
- **Conflict detection (merge mode)** — for medication/system tables + userProfile + insightReports, existing-ID records are content-compared (ignoring sync metadata); identical → skipped, different → recorded as a `ConflictRecord` (NOT auto-overwritten).
- **Conflict resolution** (`resolveConflicts`) — applies user decisions; `useBackup: true` overwrites the local record via `table.put`. "Keep current" (`useBackup: false`) is a literal **no-op** — those entries are skipped with no DB write. Logs `"Resolved N conflicts (M kept current)"`.
- **Per-table import counts** in `ImportResult` (one `*Imported` counter per table) plus `skipped`, `conflicts[]`, `errors[]`, `success`.
- **Clear all data** (`useClearAllData` → `clearAllData()`): a **soft-delete with tombstones** of the `intakeRecords` table only (sets `deletedAt`/`updatedAt`, enqueues `delete` sync ops, then `schedulePush()`) — not a hard `.clear()`, and it touches no other table. The soft-delete tombstones exist so the next sync pull does not resurrect the records. It writes **no** audit-log entry.

### Cloud-Sync Migration (local → cloud)
- **One-time migration** of all local IndexedDB tables to Neon Postgres, switching `storageMode` from `"local"` to `"cloud-sync"`.
- **Mandatory backup gate** before upload (download backup or explicitly acknowledge).
- **FK-safe ordering** — uploads tables in `TABLE_PUSH_ORDER` so every FK parent lands before its children.
- **Batched upload** — `BATCH_SIZE = 100` records per POST to `/api/sync/push` as `upsert` ops with incrementing `queueId`.
- **Retry with backoff** — `postWithRetry`, `MAX_RETRIES = 3`, exponential delay `2^attempt * 1000ms` (1s, 2s, 4s).
- **Pre-count** all tables before upload to compute the total denominator.
- **Live progress** — per-table `{ total, uploaded, lastBatchIndex }` and an aggregate percentage.
- **Persistent resumable progress** — written to `localStorage` key `intake-tracker-migration-progress` after every batch; survives reload/crash.
- **Auto-resume on app load** — `MigrationGuard` (mounted in `providers.tsx`) detects interrupted progress and reopens the wizard in resume mode.
- **Resume logic** — skips fully-uploaded tables, restarts partially-uploaded tables at `lastBatchIndex + 1`, restores `queueId` counter.
- **Integrity verification** (`verifyMigration`) — DORMANT / test-only. The function exists (client computes deterministic SHA-256 per table, compares to server hashes from `POST /api/sync/verify-hash`; records per-table `{ clientHash, serverHash, match }`; returns whether ALL match), but it is **not wired into the production flow**: the wizard never enters the `verifying` phase, never calls `verifyMigration`, and `completeMigration` finalizes **without** verifying. `verifyMigration` / `setVerificationResult` / the `verificationResults` state are exercised only by unit tests. There is no verify screen, button, or pass/fail UI.
- **Cancel & rollback** (`cancelMigration`) — calls `POST /api/sync/cleanup` to delete all uploaded server rows, clears local progress, resets `storageMode` to `"local"`, sets phase `cancelled`.
- **Completion** (`completeMigration`) — sets `storageMode` `"cloud-sync"`, marks `lastPushedAt` (`markPushed`), clears progress, phase `complete`.
- **Completion summary** — total records uploaded + elapsed duration (`Ns` or `Nm Ss`), per-table counts.

### Storage info (Settings)
- Shows sync status badge (Cloud Sync vs Local only), full-copy/downloading/offline state, last-synced timestamp, estimated storage usage/quota (`navigator.storage.estimate`), total record count. The displayed total record count (`useStorageInfo`) sums only **16** tables (intakeRecords…auditLogs) — it excludes `userProfile` and `insightReports`, so the shown count can be lower than the true dataset size.
- Entry points: "Switch to Cloud Sync", "Resume Migration", or "Sign In" depending on auth + interrupted state.
- **Incomplete-export guard** — when `storageMode === "cloud-sync"` and `initialSyncComplete === false`, exporting warns that this device may not yet hold the full cloud dataset.

---

## User actions & interactions

### Data Management section (`/settings`)
- **Tap "Export Data"** → downloads backup JSON. If export may be incomplete (cloud-sync + not fully synced), shows an inline amber warning instead with **Cancel** / **Export Anyway**. Button label cycles `Export Data` → `Exporting...` while pending.
- **Tap "Import Data"** → opens native file picker (`accept=".json"`). On file select, shows an inline amber merge-confirmation panel.
  - **Tap "Continue Import"** → runs merge import; label → `Importing...`. Resets the file input afterward.
  - **Tap "Cancel"** → dismisses, clears pending file + file input.
- **After import** → a result panel shows `Last import: N new, M skipped, K conflicts`. If `K > 0`, a **"Review K conflicts"** button appears.
- **Tap "Review conflicts"** → opens the Conflict Review Drawer.
- **Tap "Clear All Data"** → swaps the button row to inline **Cancel** / **Confirm Delete**.
  - **Tap "Confirm Delete"** → soft-deletes the `intakeRecords` table (tombstones + enqueued delete ops; no other table affected), collapses the confirm row.

### Conflict Review Drawer
- **Tap "Keep All Current"** / **"Use All Backup"** → bulk-sets every conflict's decision.
- **Per-conflict toggle "Keep" / "Use Backup"** → sets that record's decision (selected button gets primary fill + check icon). Default decision = Keep current (`useBackup` false).
- Each row shows `Table` name, first 8 chars of `id`, and `Changed: field1, field2, field3 +N more` (first 3 differing fields, ignoring sync metadata).
- **Tap "Apply Decisions"** → resolves; label → `Applying...`; on success clears decisions and closes/clears the result panel.

### Migration Wizard
- **Backup gate step:**
  - **Tap "Download Backup"** → downloads backup; label → `Downloading…`; on success sets internal `hasDownloaded`.
  - **Check "I have downloaded and saved my backup"** → sets `acknowledged`.
  - **Tap "Proceed to Migration"** → enabled only when `hasDownloaded OR acknowledged`; starts upload.
- **Upload progress step:**
  - **Tap "Show details" / "Hide details"** → expands/collapses per-table list (chevron up/down).
  - **Tap "Cancel"** → opens cancel-confirm dialog.
  - During uploading, the dialog is **blocking**: outside-click, Escape, and the close (X) button are all disabled.
- **Cancel-confirm dialog:**
  - **Tap "Go Back"** → dismisses.
  - **Tap "Cancel Migration"** (destructive) → runs server cleanup + rollback, closes wizard.
- **Completion step:**
  - **Tap "Done"** → finalizes migration (sets cloud-sync), closes wizard.
- **Error step:** **Tap "Close"** → resets store, closes.
- **Cancelled step:** **Tap "Close"** → resets store, closes.

### Storage Info section
- **Tap "Switch to Cloud Sync"** → opens migration wizard fresh (`resume=false`).
- **Tap "Resume Migration"** → opens wizard in resume mode (`resume=true`).
- **Tap "Sign In"** → routes to `/auth`.

---

## States & presentations

### Migration wizard phases (`MigrationPhase`)
`idle` | `backup` | `uploading` | `verifying` | `complete` | `cancelled` | `error`
- **backup** — ShieldCheck (amber) hero, backup-gate copy, download button, ack checkbox, proceed button (disabled until gate satisfied).
- **uploading** — title "Uploading data", current-table subline (`Uploading <Table>…` or `Counting records…`), `uploaded / total records (percentage%)` (tabular-nums), `<Progress>` bar (h-3), Show/Hide details toggle, Cancel button. **Blocking** (cannot dismiss).
- **complete** — green CheckCircle2 hero, "Migration Complete", `N records uploaded in <duration>`, per-table list (rows with `total === 0` hidden), Done button.
- **error** — destructive heading "Migration Error", error message text, Close link.
- **cancelled** — "Migration Cancelled", "All uploaded data has been removed from the server.", Close link.
- (`verifying` is a defined phase value but is **never set** in the production flow and not rendered as a distinct wizard screen. Integrity verification — `verifyMigration` / `verificationResults` — is dormant/test-only and has no UI; `completeMigration` finalizes without it.)

### Per-table upload row status (`tableStatus`)
- **pending** — outline Circle (muted).
- **uploading** — spinning Loader2 (primary).
- **done** — green CheckCircle2. Computed done when `uploaded >= total && total >= 0 && lastBatchIndex >= 0`, or when index < current table index.
- Each row shows `uploaded / total` (tabular-nums) or `—` when no progress yet.

### Import / export inline states (Data Management)
- **Export warning** — amber bordered panel (incomplete cloud-sync export risk).
- **Import confirm** — amber bordered panel (merge explanation).
- **Pending** — buttons disabled, labels swap to `Exporting...` / `Importing...`.
- **Last-import result** — bordered panel; conditional "Review N conflicts" button.
- **Clear-all** — default single button vs expanded Cancel/Confirm-Delete row.
- **Toasts:** Export success/fail, Import success/fail (`Imported N records (M skipped, K conflicts)`), Conflicts resolved (`N records updated`), Resolution failed, Data cleared, Clear error — variants `success` / `destructive`. Note: the import-success toast total sums only **16** `*Imported` counters (it omits `userProfileImported` and `insightReportsImported`), so the toast undercounts when those two tables import. The inline "Last import: N new" panel sums all 18 and is accurate.

### Storage info states
- **Local only** — secondary "Local only" badge; shows Switch-to-Cloud / Resume / Sign-In CTA.
- **Cloud Sync** — green "Cloud Sync" badge; plus one of:
  - **Full copy** (`initialSyncComplete`) — green check, "Full copy of your data on this device".
  - **Downloading** (online, not complete) — spinner, "Downloading your full data to this device…".
  - **Offline waiting** (offline, not complete) — CloudOff, "Waiting to download your data (offline)".
- **Last synced** line when `lastPushedAt` set.
- **Estimated usage** — `usage of quota` or "Storage info unavailable".
- **Record count** — `N records` (localized) or hidden when null. `N` sums only 16 tables (excludes `userProfile`/`insightReports`).

### Conflict drawer states
- Header badge `N Conflicts Found` (amber AlertTriangle).
- Selected decision button → primary fill + check icon.
- Apply button → disabled + `Applying...` while pending.

---

## Enums, options & configurable values

- **Backup version:** `CURRENT_BACKUP_VERSION = 5`.
- **Import modes:** `"merge"` (default) | `"replace"`. Only `"merge"` is reachable from the UI; `"replace"` is an engine capability with no UI trigger (the import handler hard-codes `"merge"`).
- **Migration phases:** `idle`, `backup`, `uploading`, `verifying`, `complete`, `cancelled`, `error`.
- **`storageMode`:** `"local"` (default) | `"cloud-sync"`.
- **Batch size:** `BATCH_SIZE = 100`.
- **Max retries:** `MAX_RETRIES = 3`; backoff `2^attempt * 1000ms`.
- **Server select chunk sizes:** verify-hash route `SELECT_CHUNK_SIZE = 200`; push route `SELECT_CHUNK_SIZE = 100` (distinct value), and the push route additionally caps each request to **500** ops via Zod `.max(500)`.
- **localStorage keys:** settings `intake-tracker-settings`; migration progress `intake-tracker-migration-progress`.
- **Fields ignored in content-equality / diffs:** `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`.
- **Conflict-diff display:** first **3** changed fields, then `+N more`; id shown as first **8** chars.
- **`TABLE_PUSH_ORDER` (18 tables, FK-safe):** prescriptions, titrationPlans, medicationPhases, phaseSchedules, inventoryItems, doseLogs, inventoryTransactions, dailyNotes, intakeRecords, substanceRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, auditLogs, userProfile, insightReports.
- **Server cleanup `DELETION_ORDER` (reverse FK, 16 tables):** doseLogs, inventoryTransactions, inventoryItems, phaseSchedules, medicationPhases, titrationPlans, prescriptions, substanceRecords, auditLogs, dailyNotes, defecationRecords, urinationRecords, eatingRecords, bloodPressureRecords, weightRecords, intakeRecords.
- **Encryption (AES-GCM):** `KEY_LENGTH = 256`, `IV_LENGTH = 12`, `SALT_LENGTH = 16`, `PBKDF2_ITERATIONS = 100000`, hash `SHA-256`; `EncryptedData.version = 1`.
- **Backup filename pattern:** `intake-tracker-backup-<YYYY-MM-DD>.json`; MIME `application/json`; file picker `accept=".json"`.
- **Duration format:** `<N>s` under 60s, else `<N>m <N>s`.
- **Storage byte formatting:** `B` / `KB` (1 dp) / `MB` (1 dp).
- **Dexie schema version (current):** `DB_SCHEMA_VERSION = 21` (versions 14–21 defined; Dexie multiplies by 10 internally).
- **Audit actions used by this unit:** `data_export`, `data_import` (also used for conflict resolution). The `AuditAction` type union also defines a `data_clear` member, but it is **never emitted** by this unit's code — `clearAllData` writes no audit entry, so `data_clear` is currently dead within backup/migration.
- **Validator field literals** (from Zod schemas):
  - intakeRecords `type`: `water` | `salt` | `sugar`.
  - substanceRecords `type`: `caffeine` | `alcohol`.
  - bloodPressureRecords `position`: `sitting` | `standing`; `arm`: `left` | `right`.

---

## Data model touched

Reads/writes all 18 Dexie tables (`src/lib/db.ts`) and the localStorage settings snapshot:
- **Health tables (skip-based merge):** intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords.
- **Medication/system tables (conflict-aware merge):** prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports.
- **Key interfaces:** `BackupData`, `EncryptedBackup`, `ImportResult`, `ConflictRecord` (`backup-service.ts`); `EncryptedData` (`crypto.ts`); `MigrationPhase`, `TableProgress`, `VerificationResult`, `MigrationState` (`migration-store.ts`); `PersistedProgress` (`migration-service.ts`); `PushOp` (`sync-payload.ts`).
- **Common record shape:** every record has `id: string` plus optional sync metadata (`createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`). Backup schemas use `.passthrough()` so unknown/forward-compatible fields survive round-trips.
- **Server side:** Neon Postgres via Drizzle (`schemaByTableName`); migration pushes to `/api/sync/push`, verifies via `/api/sync/verify-hash`, rolls back via `/api/sync/cleanup` (all `withAuth`, scoped by `userId`).
- **Stores:** `settings-store` (`storageMode`, `setStorageMode`), `sync-status-store` (`lastPushedAt`, `markPushed`, `initialSyncComplete`, `isOnline`), `migration-store`.

---

## Validation, edge cases & business rules

- **Required envelope fields:** `version` (number) and `exportedAt` (string); else `"Invalid backup file format"`. Any present table field that isn't an array also fails validation.
- **All record arrays optional** — older backups can omit any table; missing arrays treated as `[]`.
- **Finite-number enforcement** — Zod `finiteNumber` rejects `NaN`/`±Infinity` (fixes a real bug vs old `typeof === "number"`); `deletedAt` must be `number | null` when present.
- **Invalid JSON** → `"Invalid JSON format"` error, no throw (returns `ok(result)`).
- **Encrypted/plaintext mismatch** → informative error, no partial import.
- **Decryption failure** (wrong PIN/corrupt) → `"Decryption failed - incorrect PIN or corrupted data"`.
- **Merge never deletes;** replace clears all 18 tables first (irreversible).
- **Content-equality ignores sync metadata** — identical content (different timestamps) = skip, not conflict.
- **Conflicts are not auto-applied** — merge records them; user must explicitly resolve. Replace mode never produces conflicts.
- **Health vs medication merge differ** — health tables skip-only (no conflict surfacing); medication/system tables surface conflicts.
- **Migration ordering is FK-correct** in both directions (push parent-first, delete child-first).
- **Resume correctness** — fully-uploaded tables skipped; partial tables resume at `lastBatchIndex + 1`; `queueId` reconstructed from sum of uploaded.
- **Upload is blocking** — wizard cannot be dismissed mid-upload (no outside-click/Esc/X).
- **Verification is deterministic** — both sides sort by `id`, serialize with sorted object keys + `undefined → null`, SHA-256; `userId` stripped server-side before hashing.
- **Incomplete-export guard** — cloud-sync + `!initialSyncComplete` ⇒ warn before export (local copy may be partial).
- **Cancel performs true rollback** — server rows deleted, local progress cleared, mode reverted to local.
- **Percentage guard** — `totalRecords === 0` ⇒ `0%` (no divide-by-zero).
- **Empty-table progress** — tables with zero records still record `{ total: 0, uploaded: 0, lastBatchIndex: -1 }` and are hidden in the completion summary.
- **Push retry** — non-2xx retried up to 3 times with backoff; final failure throws `Push failed after N attempts: <status> <text>` → error phase.
- **Audit trail** — exports, imports, and conflict resolutions all write audit-log entries. Clear-all (`clearAllData`) is intentionally **un-audited** — it writes no `logAudit` entry.

---

## Sub-components / variants

- `MigrationWizard` — Dialog shell; routes phase → step component; blocks dismissal during upload.
- `BackupGateStep` — "back up first" gate (download / acknowledge / proceed).
- `UploadProgressStep` — aggregate + expandable per-table progress; cancel trigger.
- `CompletionSummaryStep` — success hero, duration, per-table uploaded counts.
- `CancelConfirmDialog` — AlertDialog confirming destructive cancel/rollback.
- `MigrationGuard` — lazy-loaded auto-resume detector mounted in the provider stack.
- `DataManagementSection` — Export / Import / Clear-all controls + inline confirms + last-import result.
- `StorageInfoSection` — storage mode/usage/count + migration entry points.
- `ConflictReviewDrawer` — bulk + per-record keep/use-backup resolution.
- `useDownloadBackup` / `useUploadBackup` / `useResolveConflicts` / `useClearAllData` — React Query mutations with toasts.
- `exportBackup` / `exportEncryptedBackup` / `downloadBackup` / `generateBackupFilename` — export helpers.
- `importBackup` / `importEncryptedBackup` / `resolveConflicts` / `getBackupStats` — import/restore helpers. (`getBackupStats` is dead UI-wise: exported and tested but consumed by no component — the storage card uses `useStorageInfo`, not `getBackupStats`. `importEncryptedBackup` is also unwired, per above.)
- `startMigration` / `resumeMigration` / `completeMigration` / `cancelMigration` / `verifyMigration` / `checkInterruptedMigration` — migration engine.
- `crypto.ts` (`encrypt` / `decrypt`) — AES-GCM PIN encryption for encrypted backups. Dormant: only consumed by the unwired `exportEncryptedBackup` / `importEncryptedBackup` engine functions and tests; no UI path reaches it.
- `BACKUP_SCHEMAS` / `BACKUP_VALIDATORS` — per-table Zod schemas + boolean validators.
- `useStorageInfo` — storage estimate + total record count.
