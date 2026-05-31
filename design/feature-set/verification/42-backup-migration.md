# Verification — 42-backup-migration

**Verdict:** minor-gaps · checked 92 claims, verified 84.

The document is highly accurate on values, enums, ordering arrays, and UI flow.
Every digit-level claim (BATCH_SIZE, MAX_RETRIES, crypto constants, version
numbers, push order, deletion order, ignore-fields) checks out. The gaps are
(1) two functions whose total-record sum is computed over a different number of
counters than the doc implies, (2) several backup functions that exist but are
not wired to any UI, and (3) some "destructive wipe" wording that overstates
what `clearAllData` actually does (soft-delete of one table). None of these
break the core narrative, hence minor-gaps.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|----------|-----------|--------------|-----------|
| low | "Import success / `Imported N records (M skipped, K conflicts)`" toast total covers the import | The **toast** total sums only 16 `*Imported` counters — it omits `userProfileImported` and `insightReportsImported`, so the toast undercounts when those tables import. (The inline "Last import: N new" panel does sum all 18.) | `src/hooks/use-backup-queries.ts:40-56` (16 fields) vs `src/components/settings/data-management-section.tsx:92-111` (18 fields) |
| low | "Clear all data … destructive wipe of intake records" / wizard step "wipes data" | `clearAllData()` is a **soft-delete with tombstones** of `intakeRecords` only (sets `deletedAt`/`updatedAt`, enqueues `delete` ops, schedulePush) — not a hard `.clear()`. Other tables are untouched. | `src/lib/intake-service.ts:241-260` |
| low | Storage card "total record count" | `useStorageInfo` counts only **16** tables (intakeRecords…auditLogs); it excludes `userProfile` and `insightReports`, so the displayed count can be lower than the true total. | `src/hooks/use-storage-info.ts:33-51` |
| low | Backup envelope metadata includes "optional `appVersion`" | `appVersion` exists on the `BackupData` interface but `exportBackup()` never writes it — the constructed object (lines 207-229) omits it, so it is always absent in real exports. | `src/lib/backup-service.ts:40` (decl) / `:207-229` (never set) |
| low | "Verify select chunk (server): `SELECT_CHUNK_SIZE = 200`" | Correct for **verify-hash** (200). But the **push** route uses a different `SELECT_CHUNK_SIZE = 100`, and caps batches at `.max(500)`. The doc only surfaces the 200 constant; the push-side 100/500 limits are unmentioned. | verify-hash `src/app/api/sync/verify-hash/route.ts:10`; push `src/app/api/sync/push/route.ts:54` (100), `:14` (500 cap) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|----------|------------------------------|-----------|
| medium | **`verifyMigration` / `verifying` phase / `verificationResults` are not wired into the production flow.** The wizard never sets phase `verifying`, never calls `verifyMigration`, and `completeMigration` does NOT verify before finalizing. `verifyMigration` and `setVerificationResult` are exercised only by unit tests. The doc hedges ("`verifying` is a defined phase value but not rendered"), but a designer should know integrity verification is effectively dormant — there is no verify screen, button, or pass/fail UI to design. | `src/lib/migration-service.ts:184-228` (only test callers); `src/components/migration/migration-wizard.tsx` (no verifying branch); `src/__tests__/migration-service.test.ts:258,294` |
| medium | **Encrypted backup has no UI.** `exportEncryptedBackup`, `importEncryptedBackup`, and the entire `crypto.ts` PIN path are not referenced by any component or hook — only by tests. There is no PIN-entry field, no "encrypt" toggle. The doc lists encrypted export/import as features without noting they are unreachable from the current UI. | `exportEncryptedBackup`/`importEncryptedBackup` `src/lib/backup-service.ts:278,300`; no component/hook references found |
| low | **`getBackupStats` is dead UI-wise** — exported and tested but not consumed by any component (the storage card uses `useStorageInfo`, not `getBackupStats`). Listed as a helper in the doc's sub-components without this caveat. | `src/lib/backup-service.ts:638` (only test usage) |
| low | **`replace` import mode is not user-reachable.** `importBackup`/`importEncryptedBackup` accept `mode: "merge" | "replace"`, but the only UI caller (`handleConfirmImport`) hard-codes `mode: "merge"`. The doc documents replace semantics fully (correct as an engine capability) but does not note no UI path triggers replace. | `src/components/settings/data-management-section.tsx:62` (hard-coded `"merge"`) |
| low | **Conflict resolution `useBackup:false` writes nothing.** `resolveConflicts` only `table.put`s for `useBackup:true`; "keep current" entries are skipped (no-op). Audit logs `Resolved N conflicts (M kept current)`. Doc states "keeps current" but not that keep-current is a literal no-op (no DB write). | `src/lib/backup-service.ts:619-627` |
| low | **`clearAllData` does NOT write an audit-log entry** (no `logAudit` call). The doc's audit-trail claim (line 219) correctly scopes to "exports, imports, conflict resolutions" and excludes clear — so this is consistent — but worth recording that clear-all is intentionally un-audited. | `src/lib/intake-service.ts:241-260` (no logAudit) |
| low | **`AuditAction` includes a `data_clear` member** that is defined but never emitted by this unit's code (clear-all does not log). Enum member exists in the type union. | `src/lib/db.ts:24-30` (`data_clear` at :30) |

## Spot-confirmed

- `CURRENT_BACKUP_VERSION = 5`; encrypted envelope `{ encrypted: true, payload, version: 5 }` — `src/lib/backup-service.ts:94,283-287`.
- Export reads all **18** tables (intakeRecords…insightReports), pretty-printed `JSON.stringify(data, null, 2)`, MIME `application/json`, filename `intake-tracker-backup-<YYYY-MM-DD>.json` from `toISOString().split("T")[0]` — `:163-252`. (The stale code header at :2 says "17 tables"; the doc's "18" matches the actual read set.)
- Browser download via temp `<a download>` + `createObjectURL`/`revokeObjectURL` — `:257-272`.
- Encrypted-vs-plaintext guards and exact error strings: `"This backup is encrypted. Please use importEncryptedBackup() with your PIN."` (`:451`), `"File is not an encrypted backup…"` (`:323`), `"Decryption failed - incorrect PIN or corrupted data"` (`crypto.ts:139`), `"Invalid JSON format"` (`:440`), `"Invalid backup file format"` (`:469`).
- Legacy v1 upgrade (`{records}` → `intakeRecords`, empty weight/BP) — `:457-466`.
- Health tables skip-merge vs medication/system + userProfile + insightReports conflict-aware merge; replace clears all **18** then bulk-imports with `new Set()` — `:497-563,474-494`.
- `IGNORE_FIELDS = {createdAt, updatedAt, deletedAt, deviceId, timezone}` for content-equality and diff display — `:132`, `conflict-review-drawer.tsx:27-33`.
- Conflict diff display: first **3** fields then `+N more`; id `slice(0,8)`; selected button gets primary fill + `Check` icon; default decision `useBackup ?? false` (keep current) — `conflict-review-drawer.tsx:116-165,51`.
- Migration constants: `BATCH_SIZE = 100`, `MAX_RETRIES = 3`, backoff `Math.pow(2, attempt) * 1000`, `PROGRESS_KEY = "intake-tracker-migration-progress"` — `migration-service.ts:9-11,75`.
- Push failure throws `Push failed after ${retries + 1} attempts: ${res.status} ${text}` (`= 4` total attempts incl. initial; doc's "up to 3 [retries]" matches) — `:80-83`.
- `TABLE_PUSH_ORDER` 18 entries, exact order matches doc line 172 — `sync-topology.ts:28-55`.
- Server `DELETION_ORDER` 16 tables, exact order matches doc line 173 (userProfile/insightReports excluded) — `cleanup/route.ts:9-26`.
- Empty table records `{total:0, uploaded:0, lastBatchIndex:-1}`; percentage guard `totalRecords > 0 ? … : 0` — `migration-service.ts:144,156`, `upload-progress-step.tsx:42`.
- `tableStatus` "done" iff `uploaded >= total && total >= 0 && lastBatchIndex >= 0` — `upload-progress-step.tsx:24`.
- Resume: skip when `uploaded >= records.length`, restart at `lastBatchIndex + 1`, `queueId` = sum of uploaded — `migration-service.ts:276-282,266-268`.
- Deterministic verify: sort by id, sorted object keys + `undefined→null`, SHA-256; server strips `userId` before hashing — `migration-service.ts:36-56,200-215`, `verify-hash/route.ts:12-25,53`.
- `cancelMigration` → POST `/api/sync/cleanup`, clearProgress, `setStorageMode("local")`, phase `cancelled` — `:230-244`. `completeMigration` → `setStorageMode("cloud-sync")`, `markPushed()`, clearProgress, phase `complete` — `:294-300`.
- Crypto: AES-GCM, `KEY_LENGTH=256`, `IV_LENGTH=12`, `SALT_LENGTH=16`, `PBKDF2_ITERATIONS=100000`, hash SHA-256, `EncryptedData.version=1` — `crypto.ts:18-21,105`.
- Wizard blocking during `uploading`: `[&>button]:hidden`, `onPointerDownOutside`/`onEscapeKeyDown` preventDefault when `isBlocking` — `migration-wizard.tsx:63-82`.
- Backup gate: `canProceed = hasDownloaded || acknowledged`; download label `Downloading…`; ack label "I have downloaded and saved my backup"; ShieldCheck amber — `backup-gate-step.tsx:19,33,49,58-60`.
- Completion: green CheckCircle2, `N records uploaded in <duration>`, duration `<60s ? Ns : Nm Ss`, rows with `total===0` hidden — `completion-summary-step.tsx:17-23,40-51`.
- MigrationGuard lazy-loaded, mounted in providers (ErrorBoundary→QueryClient→Theme→TimezoneGuard) — `migration-guard.tsx:7-9`, `providers.tsx:87-101`.
- Storage states: green "Cloud Sync" / secondary "Local only" badges; full-copy (CheckCircle2) / downloading (Loader2, online) / offline-waiting (CloudOff); "Last synced …"; "Storage info unavailable"; `N records` localized — `storage-info-section.tsx:47-149`.
- Entry CTAs: "Switch to Cloud Sync" (resume=false), "Resume Migration" (resume=true), "Sign In" → `router.push("/auth")` — `storage-info-section.tsx:97,110,123,32-35`.
- Incomplete-export guard: `storageMode === "cloud-sync" && !initialSyncComplete` → amber warning with Cancel / Export Anyway — `data-management-section.tsx:36-50,127-157`.
- `storageMode` default `"local"`; `setStorageMode` setter — `settings-store.ts:114,216,425`. `markPushed` sets `lastPushedAt = Date.now()`; `initialSyncComplete` default false — `sync-status-store.ts:44,60`.
- `DB_SCHEMA_VERSION = 21`, versions 14–21 defined — `db.ts:719-906`.
- Validator literals: intake `water|salt|sugar`; substance `caffeine|alcohol`; BP `position sitting|standing`, `arm left|right`; `finiteNumber = z.number().finite()`; `.passthrough()` on every schema — `backup-schemas.ts:20,43,61-62,80,47…164`.
- Audit messages: encrypted export `"Exported encrypted backup"`; import `Imported N records (M skipped, K conflicts)`; resolve `Resolved N conflicts (M kept current)` — `backup-service.ts:289,574,627`.

## Low-confidence / could-not-verify

- The doc's MIME/picker/filename claims are all confirmed in code; no items remained unverifiable.
- "18 vs 17 tables" labeling: the doc uses 18 consistently and that matches the actual export/clear/push surface. The only "17" reference is a stale comment in `backup-service.ts:2` ("17 data tables") — the doc is more accurate than that comment, so this is not counted against the doc.
