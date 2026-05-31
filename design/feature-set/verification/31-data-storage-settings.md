# Verification — 31-data-storage-settings

**Verdict:** minor-gaps  ·  checked 92 claims, verified 84.

The document is largely accurate and well-researched: enums, presets, thresholds, table lists, conflict logic, soft-delete semantics, and migration phases all match the source. The notable defects are (a) a digit-wrong table count for `TABLE_PUSH_ORDER` (says 19, code has 18), (b) toast-copy strings that don't match the real implementation, and (c) a missed real bug where the import-success toast under-counts (omits userProfile/insightReports) while the inline summary counts all 18.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "`TABLE_PUSH_ORDER` … **19 tables** in FK-tier order" (line 175) then lists 18 names | Array has exactly **18** entries; the list of names is correct (18). The source file's own type comment also says "18 valid table names". Count "19" is wrong. | `src/lib/sync-topology.ts:28-58` (type comment `:57`) |
| medium | Import toast: "Imported {n} records ({skipped} skipped[, {c} conflicts])" / "Import failed: {msg}" (lines 143) | Toast **title** is `"Import successful"` / `"Import failed"`; **description** is ``Imported ${total} records (${skipped} skipped[, ${c} conflicts])`` on success and `` `Failed to import data: ${error.message}` `` on error — not "Import failed: {msg}". | `src/hooks/use-backup-queries.ts:57-68` |
| low | Export toast: "Export successful" / "Export failed: {msg}" (line 136) | Title `"Export successful"`/`"Export failed"`; success description is `"Your data has been downloaded"`, error description is `` `Failed to export data: ${error.message}` ``. Doc conflates title and a non-existent "Export failed: {msg}" string. | `src/hooks/use-backup-queries.ts:15-28` |
| low | Clear toast "Data cleared" / "Error: Failed to clear data: {msg}" (line 148) | Title `"Data cleared"` (desc `"All intake records have been deleted"`) and on error title `"Error"`, desc `` `Failed to clear data: ${error.message}` ``. The doc's "Error: Failed to clear data:" merges title+desc; minor formatting only. | `src/hooks/use-backup-queries.ts:100-113` |
| low | Resolve-conflicts toast: "{resolved} records updated" (line 153) | Description is `` `${data.resolved} records updated` `` (title `"Conflicts resolved"`). Confirmed; doc omits the title only. | `src/hooks/use-backup-queries.ts:79-85` |
| low | Backup-service "Read function … export/import of all 17 data tables" framing in doc-aligned prose; doc says "All 18 data arrays" (line 54) | Export writes **18** arrays (matches doc's 18). The *service file header comment* says "17 data tables (including userProfile)" — a stale comment in source (misses insightReports), not a doc error. Doc's 18 is correct. | `src/lib/backup-service.ts:1-9` vs `:207-229` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| medium | **Import-success toast under-counts.** `useUploadBackup` sums only 16 `*Imported` fields (stops at `auditLogsImported`) — it omits `userProfileImported` and `insightReportsImported`. So the toast total can be lower than the inline "Last import: {N} new" summary (which sums all 18). The doc flags the record-count display mismatch but not this separate toast mismatch. | `src/hooks/use-backup-queries.ts:40-56` vs `src/components/settings/data-management-section.tsx:92-111` |
| low | `MigrationWizard` error/cancelled "Close" buttons also call `reset()` (resets migration store) before `onOpenChange(false)`. Doc says "tap 'Close' to reset + dismiss" (line 103) — actually accurate; included for completeness. | `src/components/migration/migration-wizard.tsx:107-115, 126-134` |
| low | Completion-summary duration format is conditional: `<60s` → `"{s}s"` (no minutes); otherwise `"{m}m {s}s"`. Doc only shows the `"{Xm Ys}"` form (lines 102, 158). | `src/components/migration/completion-summary-step.tsx:17-23` |
| low | Completion screen heading is literally `"Migration Complete"`; doc describes it as "complete: green CheckCircle2 … 'Done'" without the heading. | `src/components/migration/completion-summary-step.tsx:41` |
| low | `UploadProgressStep.tableStatus()` has nuanced precedence: a table with `progress` where `uploaded >= total && total >= 0 && lastBatchIndex >= 0` shows "done"; tables with no progress yet show "uploading" if `index <= currentIndex`, else "pending". Doc summarizes states but not this exact rule. | `src/components/migration/upload-progress-step.tsx:18-28` |
| low | `clearAllData()` skips rows already tombstoned (`if (record.deletedAt !== null) continue`) and runs inside a `db.transaction("rw", intakeRecords, _syncQueue)` then calls `schedulePush()`. Doc captures soft-delete + enqueue but not the already-deleted skip or schedulePush. | `src/lib/intake-service.ts:247-255` |
| low | `getBackupStats()` exists in backup-service and computes per-table counts + oldest/newest record across 10 timestamp-bearing tables. Doc lists `getBackupStats` in sub-components (line 231) but gives no behavior; not surfaced in the covered UI. | `src/lib/backup-service.ts:638-728` |
| low | Cancel path is destructive via `apiFetch("/api/sync/cleanup", {method:"POST"})` then `setStorageMode("local")`; on cleanup failure it transitions to **error** phase (not cancelled). Doc says cancel "deletes uploaded server data, returns to Local" but omits the error-on-cleanup-failure branch. | `src/lib/migration-service.ts:230-244` |
| low | `checkInterruptedMigration()` is `loadProgress() !== null` where progress key is `"intake-tracker-migration-progress"` in localStorage. Doc says "presence of persisted progress in localStorage" — accurate; key name omitted. | `src/lib/migration-service.ts:10, 302-304` |

## Spot-confirmed

- Section header "Storage" + `HardDrive` icon, `text-amber-600 dark:text-amber-400` — `storage-info-section.tsx:39-42`.
- Sync badge: cloud-sync → green "Cloud Sync"; local → secondary "Local only" — `storage-info-section.tsx:47-55`.
- Three cloud-copy sub-states (CheckCircle2 green / Loader2 amber spin / CloudOff amber) with exact strings "Full copy of your data on this device", "Downloading your full data to this device…", "Waiting to download your data (offline)" — `storage-info-section.tsx:58-81`.
- Last-synced line gated on `cloud-sync && lastPushedAt`, uses `toLocaleString()` — `storage-info-section.tsx:83-87`.
- Sign-in card gated on `local && ready && !authenticated`, "Sign In" → `router.push("/auth")` — `storage-info-section.tsx:89-103`.
- Resume vs Switch buttons gated on `local && authenticated && hasInterrupted` (Upload icon, resume=true) / `!hasInterrupted` (Cloud icon, resume=false) — `storage-info-section.tsx:105-127, 32-35`.
- Estimated usage `{usage}` / `{usage} of {quota}` / "Storage info unavailable" — `storage-info-section.tsx:129-141`.
- Record count `{totalRecords.toLocaleString()} records`, gated on `!== null` — `storage-info-section.tsx:143-149`.
- Export incomplete guard: `storageMode === "cloud-sync" && !initialSyncComplete` → amber warning panel with "Cancel" / "Export Anyway"; exact warning copy matches — `data-management-section.tsx:36-44, 127-157`.
- Import: hidden `input accept=".json"`, merge-confirm panel "New records will be added, duplicates skipped", "Continue Import"/"Cancel", file input cleared on settle/cancel — `data-management-section.tsx:159-204, 67-84`.
- Import always `mode: "merge"` from UI — `data-management-section.tsx:62`.
- Last-import summary "Last import: {N} new, {skipped} skipped, {conflicts} conflicts" + conditional "Review {N} conflicts" — `data-management-section.tsx:206-221`.
- Clear All Data two-step inline confirm (Cancel / Confirm Delete, destructive) — `data-management-section.tsx:224-250`.
- `clearAllData()` soft-deletes **only intakeRecords** (tombstone + sync-queue delete), not a hard wipe — `intake-service.ts:241-260`.
- Backup payload `version: 5`, `exportedAt` ISO, optional `appVersion`, all 18 arrays + `settings` from `localStorage["intake-tracker-settings"]` (`.state` only) — `backup-service.ts:94, 207-229, 192-205`.
- Filename `intake-tracker-backup-${YYYY-MM-DD}.json` via `toISOString().split("T")[0]` — `backup-service.ts:249-252`.
- Encrypted variant `{ encrypted: true, payload, version }`, AES-GCM via PIN, `exportEncryptedBackup`/`importEncryptedBackup` — `backup-service.ts:96-100, 278-344`; not wired in the covered UI (confirmed: DataManagementSection only imports merge/clear).
- ConflictReviewDrawer: title "{N} Conflicts Found" (AlertTriangle amber), desc "Review each conflict and choose which version to keep.", "Keep All Current"/"Use All Backup", per-conflict capitalized table + `id.slice(0,8)`, Keep/Use Backup toggle w/ Check, "Changed: {first 3} +{N} more", footer "Apply Decisions"/"Applying..." — `conflict-review-drawer.tsx:86-179`.
- Conflict decision default unset → keep-current (`?? false`); only `useBackup` rows written via `table.put(backupRecord)` — `conflict-review-drawer.tsx:51`, `backup-service.ts:615-632`.
- Diff/ignore fields `createdAt, updatedAt, deletedAt, deviceId, timezone` in BOTH drawer and service — `conflict-review-drawer.tsx:27-33`, `backup-service.ts:132`.
- `isContentEqual` treats missing/undefined as equal, compares via `JSON.stringify` — `backup-service.ts:134-157`.
- Health tables (skip-existing) = intake/weight/bp/eating/urination/defecation/substance; conflict-aware tables = prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports — `backup-service.ts:497-540`.
- Replace mode clears all 18 tables first; not reachable from UI — `backup-service.ts:474-495`.
- Validation: "Invalid JSON format", encrypted-detected message, legacy `{records}` upgrade, numeric `version`+string `exportedAt`, present-array checks — `backup-service.ts:437-471, 349-379`.
- MigrationPhase enum `idle|backup|uploading|verifying|complete|cancelled|error` — `migration-store.ts:3-10`.
- Per-table upload status `"pending"|"uploading"|"done"` — `upload-progress-step.tsx:21-28`.
- `storageMode: "local"|"cloud-sync"`, default `"local"` — `settings-store.ts:114, 216`.
- `formatBytes` thresholds: `<1024`→"B"; `<1024*1024`→KB toFixed(1); else MB toFixed(1) — `use-storage-info.ts:4-8` (digit-for-digit correct).
- Record-count tables = exactly 16 (intake, weight, bp, eating, urination, defecation, substance, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs) — `use-storage-info.ts:33-50`; userProfile/insightReports excluded (doc's mismatch note is correct).
- sync-status-store name `"intake-tracker-sync-status"`, version 2, persists `lastPushedAt/lastPulledAt/initialSyncComplete`, ephemeral `isOnline/isSyncing/queueDepth/lastError` — `sync-status-store.ts:64-82`.
- MigrationWizard `max-w-lg`, `min-h-[60vh]`, blocking only in `uploading` (Esc/overlay/close suppressed via `[&>button]:hidden`, `onPointerDownOutside`/`onEscapeKeyDown` preventDefault) — `migration-wizard.tsx:63-83`.
- BackupGateStep: ShieldCheck, "Download Backup"/"Downloading…", checkbox "I have downloaded and saved my backup", `canProceed = hasDownloaded || acknowledged` gates "Proceed to Migration" — `backup-gate-step.tsx:14-66`.
- UploadProgressStep: progress bar %, "Uploading {Table}…"/"Counting records…", "{x} / {y} records ({%})", Show/Hide details, done(green)/uploading(spinner)/pending(grey) icons, Cancel → CancelConfirmDialog — `upload-progress-step.tsx:30-104`.
- CancelConfirmDialog: "Cancel migration?", "Go Back"/"Cancel Migration" (destructive) — `cancel-confirm-dialog.tsx:20-47`.
- Audit logging `logAudit("data_export"|"data_import", …)` on export, import, resolve — `backup-service.ts:231, 289, 574, 627`; `AuditAction` type valid — `audit.ts:12-27`.
- Mounted under "Data & Storage" accordion group with StorageInfoSection then DataManagementSection — `src/app/settings/page.tsx:89-92`.

## Low-confidence / could-not-verify

- "amber-colored" header claim is for StorageInfoSection ("Storage"); the **DataManagementSection** "Data Management" header has no color class (`<h3 className="font-semibold">`), which the doc does not claim either way — confirmed neutral at `data-management-section.tsx:115`.
- The doc's framing that the encrypted backup is "wired in code but not exposed by these UI components today" — confirmed for the covered components, but I did not exhaustively grep the entire repo for *other* callers of `exportEncryptedBackup`/`importEncryptedBackup`; they may be invoked by a separate PIN/security settings unit outside this unit's scope.
- "completion summary" elapsed time is measured from `startTimeRef.current` set when the wizard `open` flips true (re-set on each open) — accurate for a single session but resumed migrations measure from reopen, not original start; doc does not address this nuance (out of scope / low impact).
