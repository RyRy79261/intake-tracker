# Verification — 38-sync

**Verdict:** accurate · checked 88 claims, verified 88.

This document is an unusually faithful, digit-for-digit accurate description of the
sync unit. Every constant, enum member, table list, state-priority rule, label string,
LWW precedence rule, and gating condition was traced to the source and confirmed. No
inaccuracies and no material omissions were found.

## Inaccuracies

_(none)_

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| — | — | — | — |

## Omissions

The few items below are intentionally-minor and arguably out of scope for a feature-set
doc. None change user-facing behavior in a way that would mislead a design rebuild;
listed for completeness at low severity.

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The engine's network/HTTP-error pull path sets `lastError` but does **not** reschedule the pull (no backoff on pull, unlike push). The doc describes push backoff in detail but never states that pull failures are one-shot (next pull only comes from a chained push / trigger). | `src/lib/sync-engine.ts:410-431` |
| low | Push route emits the full Zod `flatten()` to server logs on a 400 (`[sync/push] Zod validation failed`), whereas the client receives only generic `{ error: "Invalid request" }`. The doc's "no schema leakage" claim is about *DB* errors (accurate) but the validation-error log path is undocumented. | `src/app/api/sync/push/route.ts:87-92` |
| low | Pull route returns `details: parsed.error.flatten()` to the **client** on a 400 (unlike push, which returns only a generic error). Asymmetry not noted by the doc. | `src/app/api/sync/pull/route.ts:58-63` |
| low | `markPushed` / `markPulled` store actions exist and are listed by the doc as actions, but the engine never calls them — it sets `lastPushedAt`/`lastPulledAt` via `setState` directly. (The doc lists them correctly as actions; this is just a note that they are effectively dead.) | `src/stores/sync-status-store.ts:60-61` vs `src/lib/sync-engine.ts:307,499` |
| low | `DataManagementSection` also gates **import** behind a separate confirm dialog and surfaces an import-conflict review drawer; the doc scopes this component to the export gate only (consistent with the unit's framing, so borderline). | `src/components/settings/data-management-section.tsx:176-222` |

## Spot-confirmed

A representative sample of key claims confirmed against source:

- Pulse states + priority `error → offline → syncing → synced` and the exact ternary —
  `src/components/sync/sync-pulse-indicator.tsx:67-73`.
- `COLOR` map (`syncing bg-yellow-400`, `synced bg-emerald-500`, `offline bg-slate-400`,
  `error bg-red-500`) — `sync-pulse-indicator.tsx:12-17`. `PulseState` union — line 10.
- `LABEL_DURATION_MS = 1800` — `sync-pulse-indicator.tsx:20`. Flash-on-sync-start effect —
  lines 50-53; flash-on-tap — line 95.
- Syncing label variants: `!initialSyncComplete` → "Downloading your data…",
  `queueDepth>0` → "Syncing N change(s)…" (singular at N===1), else "Syncing…" —
  `sync-pulse-indicator.tsx:75-86`.
- Render gate (`storageMode==="cloud-sync" && authenticated && !pathname startsWith /auth`)
  — `sync-pulse-indicator.tsx:60-62`. Wrapper `z-[2147483647]`, `pointer-events-none`;
  button `pointer-events-auto` — lines 91-97. Ping ring `opacity-60` only while syncing —
  lines 100-107. `transition-colors duration-500` — line 110.
- Error banner: `bottom-4 left-4 right-4 max-w-md mx-auto z-50`,
  `slide-in-from-bottom-4 duration-300`, `AlertTriangle`, "Sync failed" heading,
  `lastError` at `text-xs opacity-80 break-words`, session-local `dismissed` —
  `src/components/sync/sync-error-banner.tsx:15-34`.
- `DEBOUNCE_MS=3000`, `PUSH_BATCH_CAP=50`, `BACKOFF_BASE_MS=2000`, `BACKOFF_CAP_MS=60_000`,
  `JITTER_RATIO=0.2`, `SKEW_MARGIN_MS=30_000` — `src/lib/sync-engine.ts:48-58`.
- Backoff formula `round(min(2000·2^attempts,60000)·(0.8+random·0.4))` —
  `sync-engine.ts:86-93`.
- Server-ack guard `local.updatedAt <= serverUpdatedAt` — `sync-engine.ts:208`.
- Rejected message `"N record(s) failed: <table>: <error>"` + `[sync] N op(s) rejected`
  log — `sync-engine.ts:290-309`.
- 401 → clears `lastError`, silent return (push line 253-255, pull line 418-419).
- Re-drain only when `accepted.length > 0` and queue still non-empty — `sync-engine.ts:325-330`.
- Pull skew clamp `serverTime - 30s`, id reset to `""`, only when `!hasMore` —
  `sync-engine.ts:462-480`. Loop until `!anyHasMore` — line 492. On drain: sets
  `lastPulledAt`, clears `lastError`, `initialSyncComplete=true`, `invalidateQueries()` —
  lines 499-507.
- Startup pull on `startEngine` (line 611); dev hook `window.__syncEngine` under
  `NODE_ENV !== "production"` guard with `{pushNow, pullNow, getQueueDepth}` — lines 613-621.
- Network listener: online → `schedulePush(0)` + `schedulePull()` (lines 533-536);
  visibility → `schedulePush(0)` only (lines 539-547). Suspend cancels push timer/gates
  (lines 584-588); stop cancels timer, resets, clears error+syncing (lines 571-576).
- Queue coalesce 4-rule table (none/add, same-op/enqueuedAt-only, op-flip/reset-attempts)
  — `src/lib/sync-queue.ts:51-74`. `writeWithSync` single rw tx — lines 114-129.
  `ack` bulkDelete idempotent — lines 94-97. `getQueueDepth` count — lines 100-102.
- `SyncOp = "upsert" | "delete"` — `sync-queue.ts:24`.
- Push body `z.array(opSchema).max(500)` — `src/lib/sync-payload.ts:201-203`.
  `PULL_SOFT_CAP = 500`, `limit(PULL_SOFT_CAP+1)` detection — line 266 + pull route line 100.
  Cursor `id` capped `.max(200)`, `updatedAt` `.int().min(0)` — lines 306-314.
  `__proto__`/unknown-key rejection via `z.preprocess` — lines 345-361. Every row schema
  `.omit({userId:true})` — lines 44-97.
- `TABLE_PUSH_ORDER` 18 tables in exact doc order — `src/lib/sync-topology.ts:28-55`.
  Pull excludes `auditLogs` (`t !== 'auditLogs'`) — pull route line 69. Cleanup
  `DELETION_ORDER` = 16 tables, userProfile/insightReports omitted —
  `src/app/api/sync/cleanup/route.ts:9-26`. Status `PROBE_TABLES` =
  intakeRecords, weightRecords, prescriptions, doseLogs, auditLogs —
  `src/app/api/sync/status/route.ts:22-28`.
- Push route `MAX_FUTURE_MS=60_000`, `SELECT_CHUNK_SIZE=100` — push route lines 53-54.
  `clampedUpdatedAt = min(op.row.updatedAt, serverNow + 60_000)` — lines 162-165.
  D-12 rules 1 / 2 / 2b tombstone-tie / 3 — lines 168-235. `users_sync` onConflictDoNothing —
  lines 97-100. `sanitizeRow` undefined/"" → null — lines 56-63. Generic
  "Server rejected the write" — lines 154-155, 222-224. `maxDuration = 60` on push/pull/
  cleanup/verify-hash. Verify-hash `SELECT_CHUNK_SIZE=200` — verify-hash route line 10.
- Pull keyset filter `updatedAt > c OR (updatedAt = c AND id > cid)`, order
  `(updatedAt ASC, id ASC)`, `serverTime` before SELECT, tombstones not filtered —
  pull route lines 67-100.
- Store: persist key `intake-tracker-sync-status`, `version: 2`, partialize =
  {lastPushedAt, lastPulledAt, initialSyncComplete}, ephemeral defaults
  (isOnline=true, isSyncing=false, queueDepth=0, lastError=null), migrate v<2:
  `initialSyncComplete = lastPulledAt != null` — `src/stores/sync-status-store.ts:41-82`.
- `storageMode: "local" | "cloud-sync"`, default `"local"` —
  `src/stores/settings-store.ts:114,216`.
- `_syncQueue` index `++id, [tableName+recordId], tableName, enqueuedAt` (v16) +
  `SyncQueueRow {id?, tableName, recordId, op, enqueuedAt, attempts}`; `_syncMeta` PK
  `tableName` + `{lastPulledUpdatedAt, lastPulledId?}` — `src/lib/db.ts:329-351,727-753`.
- Auto-detect: one-shot `checked` ref, `GET /api/sync/status`, flips to `cloud-sync` on
  `hasSyncedData`, silent on failure — `src/hooks/use-sync-auto-detect.ts:13-33`.
- Lifecycle: starts engine only when `authenticated && storageMode==="cloud-sync"`, else
  clears `lastError`/`isSyncing`; cleanup calls `stopEngine` + `detachLifecycleListeners`
  — `src/hooks/use-sync-lifecycle.ts:11-21`.
- Storage panel: badge (green "Cloud Sync" / secondary "Local only"), three cloud sub-states
  (CheckCircle2 full copy / Loader2 spinner downloading / CloudOff waiting offline),
  "Last synced" from `lastPushedAt`, Resume Migration vs Switch to Cloud Sync vs Sign In,
  usage/quota + record count — `src/components/settings/storage-info-section.tsx:44-149`.
- Export gate: `storageMode==="cloud-sync" && !initialSyncComplete` → confirm-anyway
  warning dialog — `src/components/settings/data-management-section.tsx:36-44,127-157`.
- Mount points: `SyncLifecycleMount`, `SyncPulseIndicator`, `SyncErrorBanner` in providers
  — `src/app/providers.tsx:92-94`.

## Low-confidence / could-not-verify

- The doc's general pull-cursor formula `min(maxRowUpdatedAt, serverTime − 30s)` (line 233)
  is quoted from the route/payload JSDoc; the engine's *actual* implementation applies the
  `serverTime − 30s` clamp only on a drained table whose newest row sits inside the skew
  window, and otherwise advances to the exact tuple (`sync-engine.ts:462-480`). Both
  reduce to the same value on a drained table, so the doc is not wrong, but the one-line
  formula understates the conditional. Treated as accurate-summary, not flagged.
- Note: the `sync-engine.ts` file-header JSDoc says "≤200 ops/cycle" (line 12), which
  contradicts the actual `PUSH_BATCH_CAP = 50`. The doc under verification correctly states
  **50** (lines 51, 150, 171), so this is a stale comment in the *source*, not a doc
  inaccuracy. Flagged here only so a future editor isn't misled by the source comment.
