# 31 — Data & Storage Settings

**Files covered:**
- `src/components/settings/storage-info-section.tsx`
- `src/components/settings/data-management-section.tsx`
- `src/components/settings/conflict-review-drawer.tsx`
- `src/hooks/use-storage-info.ts`
- `src/lib/backup-service.ts` (export/import/conflict engine behind the UI)
- `src/hooks/use-backup-queries.ts` (mutation hooks + toasts)
- `src/lib/intake-service.ts` → `clearAllData()` (soft-delete wipe)
- `src/components/migration/migration-wizard.tsx` + steps (`backup-gate-step.tsx`, `upload-progress-step.tsx`, `completion-summary-step.tsx`, `cancel-confirm-dialog.tsx`)
- `src/stores/sync-status-store.ts`, `src/stores/migration-store.ts`, `src/stores/settings-store.ts` (`storageMode`)
- `src/lib/sync-topology.ts` (`TABLE_PUSH_ORDER`)
- Mounted inside `src/app/settings/page.tsx` under the "Data & Storage" accordion group.

**Purpose:** The Data & Storage area of Settings lets the single user see how much device storage their data uses, view cloud-sync status, switch local-only data to Cloud Sync (via a migration wizard), and back up / restore / import / wipe all health data — including a conflict-review flow for merge imports.

This unit is two stacked sections inside one accordion ("Data & Storage"): **StorageInfoSection** (status + usage + sync mode) and **DataManagementSection** (export / import / clear), plus the **ConflictReviewDrawer** and the **MigrationWizard** they launch.

---

## Features

### StorageInfoSection (status & usage)
- **Section header:** "Storage" with a HardDrive icon, amber-colored (`text-amber-600 / dark:text-amber-400`).
- **Sync-status row:** Cloud icon + label "Sync status" + a badge:
  - `cloud-sync` mode → green badge "Cloud Sync".
  - `local` mode → secondary/grey badge "Local only".
- **Full-copy / download status** (only in `cloud-sync` mode), one of three states:
  - Initial sync complete → CheckCircle2 (green) + "Full copy of your data on this device".
  - Online but not yet complete → spinning Loader2 (amber) + "Downloading your full data to this device…".
  - Offline and not yet complete → CloudOff (amber) + "Waiting to download your data (offline)".
- **Last-synced line** (only `cloud-sync` + a `lastPushedAt` timestamp exists): "Last synced {localized date-time}".
- **Sign-in prompt** (only `local` mode + auth ready + not authenticated): bordered muted card "Sign in to enable cloud sync across your devices." + a "Sign In" button (LogIn icon) that navigates to `/auth`.
- **Migration trigger** (only `local` mode + authenticated):
  - If an interrupted migration exists → outline "Resume Migration" button (Upload icon) → opens wizard in resume mode.
  - Otherwise → outline "Switch to Cloud Sync" button (Cloud icon) → opens wizard fresh.
- **Estimated usage block:** "Estimated usage" label + `{usage}` or `{usage} of {quota}` (formatted B/KB/MB), or fallback "Storage info unavailable".
- **Record count:** `{totalRecords.toLocaleString()} records` (sum across 16 Dexie tables), shown only when count is known.

### DataManagementSection (backup / restore / wipe)
- **Section header:** "Data Management".
- **Export Data** button (Upload icon) → downloads a full JSON backup of all tables + settings. Shows "Exporting..." while pending.
  - **Incomplete-export guard:** in `cloud-sync` mode before the first full pull finishes, tapping Export shows an inline amber warning instead of exporting immediately (export reads only local IndexedDB, which may be partial).
- **Import Data** button (Download icon) → opens a hidden file picker (`accept=".json"`). Shows "Importing..." while pending.
  - Selecting a file shows an inline amber merge-confirmation panel before importing.
  - Import always runs in **merge** mode from this UI ("New records will be added, duplicates skipped").
- **Last-import summary** (after an import): "Last import: {N} new, {skipped} skipped, {conflicts} conflicts". If conflicts > 0, a "Review {N} conflicts" button opens the ConflictReviewDrawer.
- **Clear All Data** button (Trash2 icon, red styling) → two-step inline confirm (Cancel / Confirm Delete). Performs a **soft-delete** of intake records (tombstones + sync-queue entries), not a hard wipe.
- Success/error feedback for all three operations surfaces via toast (export/import/clear/resolve).

### Backup file contents (export payload)
- Versioned JSON (`version: 5`, `exportedAt` ISO string, optional `appVersion`).
- All 18 data arrays: intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports.
- `settings` object: the persisted Zustand settings state from `localStorage["intake-tracker-settings"]`.
- Filename pattern: `intake-tracker-backup-YYYY-MM-DD.json`.
- An **encrypted** variant exists (`exportEncryptedBackup` / `importEncryptedBackup`, AES-GCM with a PIN; payload shape `{ encrypted: true, payload, version }`) — wired in code but not exposed by these UI components today.

### ConflictReviewDrawer
- Bottom Drawer titled "{N} Conflicts Found" (AlertTriangle icon, amber) + description "Review each conflict and choose which version to keep."
- Bulk actions: "Keep All Current" and "Use All Backup".
- Per-conflict card: table name (capitalized) + truncated id (first 8 chars) + two toggle buttons ("Keep" / "Use Backup", the active one highlighted with a Check), plus a "Changed: {fields}" line (first 3 differing fields + "+N more").
- Footer "Apply Decisions" button writes chosen backup records over current ones.

### MigrationWizard (Local → Cloud Sync)
- Multi-step modal launched from StorageInfoSection. Steps: backup gate → upload progress → completion summary; plus error and cancelled terminal states. Cancel removes all uploaded data from the server and returns to Local mode.

---

## User actions & interactions

### StorageInfoSection
- **Tap "Sign In"** → `router.push("/auth")`.
- **Tap "Switch to Cloud Sync"** → opens MigrationWizard (`resume = false`).
- **Tap "Resume Migration"** → opens MigrationWizard (`resume = true`).
- (No direct edit/delete here; this section is read-only status + navigation.)

### DataManagementSection
- **Tap "Export Data"**:
  - If safe → triggers `downloadBackup()` → browser download.
  - If `cloud-sync` + not fully pulled → shows inline export warning; user then taps **"Cancel"** (dismiss) or **"Export Anyway"** (forces `downloadBackup()`).
- **Tap "Import Data"** → opens the OS file picker.
  - **Select a `.json` file** → stores it as `pendingFile`, shows merge-confirm panel.
  - **Tap "Cancel"** (in confirm) → clears pending file + resets the file input.
  - **Tap "Continue Import"** → runs `importBackup(file, "merge")`; on settle, resets the file input and closes the panel.
- **Tap "Review {N} conflicts"** → opens ConflictReviewDrawer.
- **Tap "Clear All Data"** → reveals inline Cancel / Confirm Delete buttons.
  - **Tap "Cancel"** → hides confirm.
  - **Tap "Confirm Delete"** → runs `clearAllData()`, then hides confirm.

### ConflictReviewDrawer
- **Tap "Keep All Current"** → set every conflict decision to keep-current (useBackup=false).
- **Tap "Use All Backup"** → set every conflict decision to use-backup (useBackup=true).
- **Tap per-conflict "Keep" / "Use Backup"** → toggle that single record's decision.
- **Tap "Apply Decisions"** → `resolveConflicts(resolutions)`; only `useBackup=true` rows are overwritten; on success clears decisions and closes drawer.
- **Swipe-down / overlay tap** → dismiss drawer (standard Drawer behavior).

### MigrationWizard
- **Backup gate:** tap "Download Backup" (downloads, sets hasDownloaded), or check "I have downloaded and saved my backup". "Proceed to Migration" enabled only when one of those is true.
- **Upload progress:** tap "Show details / Hide details" to expand the per-table list; tap "Cancel" → opens CancelConfirmDialog. Dialog is **blocking** while uploading (Esc/overlay/close suppressed).
- **Cancel confirm:** "Go Back" (dismiss) or "Cancel Migration" (destructive) → `POST /api/sync/cleanup` deletes uploaded server data, clears progress, and sets storage mode back to Local (phase → cancelled). If cleanup fails, the phase transitions to **error** (not cancelled) with the failure message.
- **Completion:** heading "Migration Complete"; tap "Done" → calls `completeMigration()`, closes wizard. Elapsed duration is formatted conditionally: under 60s shows `"{s}s"`; otherwise `"{m}m {s}s"`.
- **Error / Cancelled terminal screens:** tap "Close" to reset + dismiss.

---

## States & presentations

### Sync-status row
| State | Visual |
|---|---|
| Cloud Sync mode | green "Cloud Sync" badge |
| Local only mode | grey "Local only" badge |

### Cloud-sync data-copy sub-state (cloud-sync only)
| State | Icon | Text |
|---|---|---|
| Initial sync complete | CheckCircle2 (green) | "Full copy of your data on this device" |
| Online, syncing | spinning Loader2 (amber) | "Downloading your full data to this device…" |
| Offline, not complete | CloudOff (amber) | "Waiting to download your data (offline)" |

### Storage usage
- **Known:** "{usage}" or "{usage} of {quota}".
- **Unknown / Storage API unavailable:** "Storage info unavailable".
- **Record count:** shown only when not null; hidden while still resolving.

### Migration entry button (local + authenticated)
- **No interrupted migration:** "Switch to Cloud Sync".
- **Interrupted migration present:** "Resume Migration".
- **Local + unauthenticated:** sign-in card instead of either button.

### Export
- **Idle:** "Export Data".
- **Pending:** disabled, label "Exporting...".
- **Warning open (incomplete cloud copy):** amber panel with Cancel / "Export Anyway".
- **Success / failure:** toast — title "Export successful" (desc "Your data has been downloaded") / title "Export failed" (desc "Failed to export data: {msg}").

### Import
- **Idle:** "Import Data".
- **File chosen:** amber merge-confirm panel.
- **Pending:** disabled, label "Importing..." (button and Continue button).
- **After import:** last-import summary line; conditional "Review conflicts" button.
- **Success / failure:** toast — title "Import successful" (desc "Imported {n} records ({skipped} skipped[, {c} conflicts])") / title "Import failed" (desc "Failed to import data: {msg}").
  - **Toast total under-counts:** the success desc's `{n}` sums only **16** `*Imported` fields (stops at `auditLogsImported`); it omits `userProfileImported` and `insightReportsImported`. So the toast total can be lower than the inline "Last import: {N} new" summary, which sums all 18.

### Clear All Data
- **Default:** single red "Clear All Data" button.
- **Confirming:** two-button row (Cancel / Confirm Delete, destructive).
- **Success / failure:** toast — title "Data cleared" (desc "All intake records have been deleted") / title "Error" (desc "Failed to clear data: {msg}").

### ConflictReviewDrawer
- **Per-conflict toggle:** active choice button gets primary fill + leading Check icon.
- **Applying:** "Apply Decisions" → disabled, label "Applying...".
- **Resolved:** toast — title "Conflicts resolved" (desc "{resolved} records updated"); drawer closes; last-import result cleared.

### MigrationWizard phases
- **backup:** ShieldCheck icon, download button states ("Downloading…" while pending), checkbox, gated "Proceed".
- **uploading:** progress bar (%), "Uploading {Table}…" / "Counting records…", "{x} / {y} records ({%})", expandable per-table list with done(green check)/uploading(spinner)/pending(grey circle) icons. Blocking modal.
  - **Per-table status precedence** (`tableStatus()`): a table with `progress` where `uploaded >= total && total >= 0 && lastBatchIndex >= 0` → "done"; a table with no progress yet → "uploading" if `tableIndex <= currentIndex`, else "pending"; otherwise the current index is "uploading", indexes below it "done", above it "pending".
- **complete:** heading "Migration Complete", green CheckCircle2, "{n} records uploaded in {duration}" (duration is `"{s}s"` under 60s, else `"{m}m {s}s"`), per-table record counts, "Done".
- **error:** destructive heading "Migration Error" + message + "Close".
- **cancelled:** "Migration Cancelled" + "All uploaded data has been removed from the server." + "Close".

### Theming
- All panels have explicit light/dark variants (amber warning panels, red destructive states, green success states). Mobile-first, max-w-lg container; drawer is bottom-sheet, wizard is centered dialog (`max-w-lg`, `min-h-[60vh]`).

---

## Enums, options & configurable values

- **`storageMode`** (`settings-store.ts`): `"local"` | `"cloud-sync"`. Default `"local"`.
- **Import mode** (UI only uses `"merge"`; service supports both): `"merge"` | `"replace"`.
- **Backup version constant:** `CURRENT_BACKUP_VERSION = 5`.
- **Encrypted backup shape:** `{ encrypted: true, payload, version }` (AES-GCM via PIN).
- **MigrationPhase enum** (`migration-store.ts`): `"idle"` | `"backup"` | `"uploading"` | `"verifying"` | `"complete"` | `"cancelled"` | `"error"`.
- **Per-table upload status** (`upload-progress-step.tsx`): `"pending"` | `"uploading"` | `"done"`.
- **`TABLE_PUSH_ORDER`** (migration upload order, also used for the per-table progress/summary lists), 18 tables in FK-tier order:
  `prescriptions, titrationPlans, medicationPhases, phaseSchedules, inventoryItems, doseLogs, inventoryTransactions, dailyNotes, intakeRecords, substanceRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, auditLogs, userProfile, insightReports`.
- **Tables counted for "records" total** (`use-storage-info.ts`, 16 tables): intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs. (Note: `userProfile` and `insightReports` are NOT in this count, so the displayed "records" can under-count what export writes.)
- **Byte formatting thresholds** (`formatBytes`): `< 1024` → "B"; `< 1MB` → "KB" (1 decimal); else "MB" (1 decimal).
- **Conflict diff ignore-fields** (both drawer and service): `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`.
- **Conflict card display caps:** id truncated to 8 chars; changed-fields list shows first 3 + "+N more".
- **File picker accept:** `.json`.
- **Backup filename:** `intake-tracker-backup-{YYYY-MM-DD}.json`.
- **Sync-status persisted store** (`intake-tracker-sync-status`, version 2): persists `lastPushedAt`, `lastPulledAt`, `initialSyncComplete`; ephemeral `isOnline`, `isSyncing`, `queueDepth`, `lastError`.
- **Conflict-aware (medication/system) tables vs skip-only (health) tables** — see business rules.

---

## Data model touched

Reads/writes every Dexie table (`src/lib/db.ts`); export/import touch all 18 arrays. Conflict-relevant interfaces:

- **Read for usage/counts:** all 16 counted tables via `db.<table>.count()`; `navigator.storage.estimate()` for usage/quota.
- **Export (`exportBackup`)** reads all 18 tables via `toArray()` + `localStorage["intake-tracker-settings"]`.
- **Import (`importBackup`)** writes via `bulkPut`:
  - **Health tables** (skip-existing-ids merge): intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords.
  - **Medication/system tables** (conflict-aware merge): prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports.
- **`clearAllData()`** runs inside a `db.transaction("rw", intakeRecords, _syncQueue)`: for each non-tombstoned row (`if (record.deletedAt !== null) continue` skips already-deleted rows) it sets `deletedAt`/`updatedAt` and enqueues a delete into `db._syncQueue` (sync tombstones), then calls `schedulePush()`.
- **`resolveConflicts()`** `db.table(table).put(backupRecord)` for `useBackup` rows.
- **`ConflictRecord`** type: `{ table: string; id: string; current: Record<string,unknown>; backup: Record<string,unknown> }`.
- **`ImportResult`** type: per-table `*Imported` counts + `skipped`, `conflicts[]`, `errors[]`, `success`.
- **Audit logging:** `logAudit("data_export" | "data_import", …)` records every export, import, and conflict-resolution.

---

## Validation, edge cases & business rules

- **Export incompleteness guard:** export reads only local IndexedDB; in `cloud-sync` before `initialSyncComplete`, the file may be partial → warning panel ("Cloud Sync hasn't finished downloading all your data…") forces an explicit "Export Anyway".
- **Record-count vs export mismatch:** the "{N} records" display excludes `userProfile` and `insightReports`, so it can be lower than what export actually writes.
- **Import is non-destructive in merge mode:** merge never clears; only adds/updates. **Replace** mode (`importBackup(file,"replace")`) clears all 18 tables first — not reachable from current UI.
- **Validation pipeline:** invalid JSON → error "Invalid JSON format"; encrypted file via plain import → error directing to `importEncryptedBackup()`; legacy v1 (`{records}` shape) is auto-upgraded to the new shape; structural validation requires numeric `version` + string `exportedAt`, and any present array field must be an array; per-record `BACKUP_VALIDATORS` reject malformed rows (counted as `skipped`).
- **Conflict detection scope:** only medication/system tables (+ userProfile/insightReports) raise conflicts; health tables silently skip existing ids. A conflict is raised only when an existing id has *content-different* data (sync-metadata fields ignored). Identical content → counted as `skipped`, no conflict.
- **Content equality** (`isContentEqual`) ignores `createdAt/updatedAt/deletedAt/deviceId/timezone` and treats missing vs `undefined` as equal; compares via `JSON.stringify`.
- **Conflict resolution default:** unset decisions default to **keep current** (`?? false`). Only `useBackup` rows are written; keep-current rows are no-ops.
- **Clear All Data is a soft delete:** it tombstones intake records and enqueues sync deletes (a hard `.clear()` would be resurrected on the next pull). It runs in a transaction over `intakeRecords` + `_syncQueue`, skips rows already tombstoned (`deletedAt !== null`), and calls `schedulePush()` afterward. Despite the button label "Clear All Data" / toast "All intake records have been deleted", it only soft-deletes the **intakeRecords** table.
- **Migration backup gate:** cannot proceed to upload until the user downloads a backup or checks the acknowledgement.
- **Migration is blocking while uploading:** modal cannot be dismissed (Esc/overlay/close suppressed) during the `uploading` phase.
- **Migration cancel is destructive server-side:** confirming cancel calls `apiFetch("/api/sync/cleanup", {method:"POST"})` to delete all uploaded data from the server, clears progress, and reverts to Local (phase → cancelled). If the cleanup request throws, the wizard moves to the **error** phase (showing the error message) instead of cancelled.
- **Interrupted migration:** detected via `checkInterruptedMigration()` (`loadProgress() !== null`, i.e. presence of persisted progress under localStorage key `"intake-tracker-migration-progress"`); surfaces "Resume Migration" instead of "Switch to Cloud Sync".
- **Storage API graceful degradation:** if `navigator.storage.estimate` is missing/throws, usage/quota stay null → "Storage info unavailable"; if Dexie counts throw, record count stays hidden.
- **File input reset:** the hidden `<input type=file>` value is cleared after every import (success or cancel) so re-selecting the same file re-fires `onChange`.

---

## Sub-components / variants

- **`StorageInfoSection`** — storage status panel: sync mode badge, cloud-copy progress, usage/quota, record count, sign-in / switch-to-cloud / resume-migration entry points.
- **`DataManagementSection`** — export / import / clear-all controls with inline confirm + warning panels and last-import summary.
- **`ConflictReviewDrawer`** — bottom-sheet for resolving per-record import conflicts (bulk + per-row keep/use-backup, diff fields).
- **`useStorageInfo`** — hook computing formatted usage/quota (`navigator.storage.estimate`) + summed record count across 16 tables.
- **`use-backup-queries`** (`useDownloadBackup` / `useUploadBackup` / `useResolveConflicts` / `useClearAllData`) — React Query mutations wrapping the backup service with success/error toasts.
- **`backup-service`** — export/import/conflict engine: `exportBackup`, `downloadBackup`, `importBackup` (merge/replace, health vs conflict-aware tables), `resolveConflicts`, plus encrypted `exportEncryptedBackup` / `importEncryptedBackup`, and `getBackupStats` (computes per-table counts across all 18 tables plus oldest/newest record over the 10 timestamp-bearing tables; **not surfaced by any covered UI**).
- **`MigrationWizard`** — modal orchestrating the Local→Cloud migration phases.
  - **`BackupGateStep`** — forces a backup download/acknowledgement before migrating.
  - **`UploadProgressStep`** — progress bar + expandable per-table upload status (pending/uploading/done).
  - **`CompletionSummaryStep`** — success screen with per-table uploaded counts + elapsed duration.
  - **`CancelConfirmDialog`** — destructive confirm that wipes uploaded server data and reverts to Local.
- **`sync-status-store`** — persisted sync timestamps + `initialSyncComplete`; ephemeral online/syncing/queue/error.
- **`migration-store`** — migration phase, current table index, per-table progress, verification results.
- **`TABLE_PUSH_ORDER`** (`sync-topology`) — FK-ordered table list driving upload + summary lists.
