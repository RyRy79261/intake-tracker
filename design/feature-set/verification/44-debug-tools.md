# Verification — 44-debug-tools

**Verdict:** accurate · checked 96 claims, verified 92.

Every source file listed under "Files covered:" was read in full
(`debug-panel.tsx`, `debug/error-log-viewer.tsx`, `debug/environment-info.tsx`,
`debug/service-worker-diagnostics.tsx`, `lib/error-log-service.ts`, plus the
relevant slices of `lib/db.ts`, `app/settings/page.tsx`, `app/providers.tsx`,
`components/error-boundary.tsx`, `lib/api-fetch.ts`, `lib/inventory-service.ts`,
`lib/push-notification-service.ts`). The document is overwhelmingly faithful to
the implementation. The only defects are a single off-by-one digit in a NOTE
callout and a couple of toast-wording paraphrases.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | NOTE (line 164): "The `AUDIT_ACTIONS` array … currently lists **26** of these and is missing `dose_time_edited`, `titration_plan_updated`, and `timezone_adjusted` (the full `AuditAction` type has 30)." | The array actually lists **27** entries, not 26. It does omit exactly those 3 named actions, and the type does have 30 members — so only the count "26" is wrong (should be 27). | `src/components/debug-panel.tsx:54-82` (27 entries); `src/lib/db.ts:24-54` (30 members) |
| low | Unregister toast (lines 68, 132): "`N registration(s) removed`" / "Service workers unregistered — N removed". | Toast is two-part: `title: "Service workers unregistered"`, `description: "${regs.length} registration(s) removed"`. The em-dash single-string forms in the doc are paraphrases of a title+description pair; wording "registration(s) removed" matches but the combined rendering differs. | `src/components/service-worker-diagnostics.tsx:161-164` |
| low | Force update toast (line 66): "Force update check → `reg.update()`, toast 'Update check requested'; disabled if not registered." Also "every SW/push action … shows a toast." | When no registration is found, the handler short-circuits with toast `"No service worker registered"` (not the panel-disabled path); on actual error it shows a destructive `"Update failed"` toast. The happy-path "Update check requested" claim is correct, but the doc omits these two alternate toasts. | `src/components/service-worker-diagnostics.tsx:118-133` |
| low | Drift-highlight description (line 136) ties amber drift to "Stock comparisons and recalc drift rows." For recalc, the amber styling is only the "Drifted Items:" label, and the per-item drift rows are listed unconditionally (font-mono, no amber per-row); recalc has no per-row `> 0.001` color gate — that gate is comparison-only. | Recalc drift rows render plain `font-mono` (no amber); only the "Drifted Items:" heading is amber. The `Math.abs(...) > 0.001` amber gate exists solely in `Compare Cached vs Derived`. Minor over-generalization. | `src/components/debug-panel.tsx:360-371` (recalc, no per-row amber) vs `382-396` (comparison amber gate) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Stock "Compare Cached vs Derived" renders a card header `"Stock Comparison (N active items)"` — the doc describes the per-item rows but never mentions this header/count line. | `src/components/debug-panel.tsx:376-379` |
| low | `cachedStock` uses `item.currentStock ?? 0` (null-coalesced to 0) when building comparisons; doc says it compares stored `currentStock` but omits the `?? 0` fallback. Same `?? 0` fallback applies in `recalculateAllStock` (`oldStock = item.currentStock ?? 0`). | `src/components/debug-panel.tsx:313`; `src/lib/inventory-service.ts:309` |
| low | `formatBytes` returns raw `"${bytes} B"` for values < 1024 (no decimal), and `"—"` when `bytes == null`. Doc's "formatted B/KB/MB/GB to 1 decimal" glosses over that the bare-bytes branch has no decimal. | `src/components/environment-info.tsx:17-28` |
| low | Skip-waiting handler does NOT set `busy` (no `setBusy(true)`), unlike the other 3 SW maintenance actions — so it isn't gated by the global busy spinner. Doc's blanket "All actions show a busy state … and disable while busy" (line 71) over-generalizes; Skip waiting is disabled only by `!sw.waitingState`. | `src/components/service-worker-diagnostics.tsx:136-153` |
| low | `recalculateAllStock` also calls `schedulePush()` and writes a `stock_recalculated` audit log (with `totalItems`, `driftedCount`, `driftedItems`) as a side effect of the debug action. Doc mentions sync enqueue but not the push-schedule or audit-log side effects. | `src/lib/inventory-service.ts:330-341` |
| low | Error Log Viewer Export filename uses `new Date().toISOString().slice(0, 19)` (chars 0-18, i.e. `YYYY-MM-DDTHH:MM:SS`). Doc says "ISO datetime sliced to seconds" — correct, but the literal `.slice(0,19)` (not 0,16) is the load-bearing detail and matches. (Confirm, not a gap — noted for completeness.) | `src/components/debug/error-log-viewer.tsx:86` |
| low | `exportErrorLogs()` wraps logs in an envelope `{ exportedAt, appVersion, logs }` rather than a bare array. Doc says "serializes ALL error logs … to a pretty-printed JSON blob" but omits the wrapper object shape. | `src/lib/error-log-service.ts:119-129` |
| low | `recalcResult.items.length > 0` gates the "Drifted Items:" block; when zero drift the result card shows only the summary line. Doc implies the drifted list always renders. | `src/components/debug-panel.tsx:360` |
| low | `isCapacitorMode()` is driven by `process.env.NEXT_PUBLIC_API_BASE_URL` (truthiness), not a Capacitor runtime probe. Doc says "Mode row reflects `isCapacitorMode()`" (correct) but the underlying signal is an env var. | `src/lib/api-fetch.ts:29-31` |

## Spot-confirmed

- Six collapsible sections in exact order Error Logs (`AlertOctagon`), Environment (`Info`), Service Worker & Push (`Cog`), Audit Logs (`FileText`), Stock Management (`Package`), Raw Records (`Database`). — `src/components/debug-panel.tsx:556-718`
- Accordion-of-one: single `activeSection: string | null`; opening sets the key, `onOpenChange(open ? key : null)`. — `debug-panel.tsx:534, 558-561`
- Dialog title "Debug Panel", description "Errors, environment info, service worker state, audit logs, stock, and raw records.", content `max-w-2xl max-h-[85vh] overflow-y-auto`. — `debug-panel.tsx:547-552`
- Settings mount: under accordion group `value="debug"`, `icon={Bug}`, `iconColorClass="text-slate-600 dark:text-slate-400"`; trigger is full-width ghost button labeled "Debug Panel" with `Bug` icon + `text-muted-foreground`. — `app/settings/page.tsx:134-136`; `debug-panel.tsx:539-545`
- `installErrorCapture()` called once from a `useEffect` in providers via dynamic import. — `app/providers.tsx:66-68`
- Error capture sources & hooks all confirmed: `window error` → `window-error`, `unhandledrejection` → `unhandled-rejection`, patched `console.error`/`console.warn` (originals called first) → `console-error`/`console-warn`, `ErrorBoundary.componentDidCatch` → `error-boundary` (with componentStack), `api-fetch` → `api-error`. — `error-log-service.ts:140-172`, `error-boundary.tsx:34-43`, `api-fetch.ts:41-45`
- Constants digit-exact: `MAX_ENTRIES = 500`, `MESSAGE_MAX = 2000`, `STACK_MAX = 8000`, `CLIENT_VERSION = NEXT_PUBLIC_APP_VERSION || "0.0.0"`, `getErrorLogs(limit = 200)`. — `error-log-service.ts:18-21, 111`
- LRU trim runs only when `count > MAX_ENTRIES`; deletes exactly `count - MAX_ENTRIES` oldest primaryKeys. — `error-log-service.ts:94-102`
- Reentrancy guard `writingDepth`; `rawConsoleError` bypasses patched console (used by ErrorBoundary). — `error-log-service.ts:32, 71, 177-179`
- Route privacy: only `window.location.pathname` persisted, query strings stripped. — `error-log-service.ts:53-58`
- Truncation appends "…" ellipsis at `MESSAGE_MAX`/`STACK_MAX`. — `error-log-service.ts:34-37`
- Error Log Viewer: live query newest-first `.limit(200)`; header `Error Logs ({filtered.length})`; source filter from `SOURCES` (all + 6); Export disabled at `logs.length === 0`; Clear two-step confirm disabled at 0; row `hasDetail` chevron gate = stack||componentStack||route||userAgent; expanded reveals Route/Stack/`Component stack:`/`UA:`; empty "No errors captured." — `error-log-viewer.tsx:57-235`
- `SOURCE_COLOR` map digit-exact for all 6 sources (window-error & unhandled-rejection `red`, error-boundary `rose`, console-error & api-error `orange`, console-warn `amber`). — `error-log-viewer.tsx:37-44`
- Environment fields in exact order (14 fields) including DB version `String(DB_SCHEMA_VERSION)`; Copy → `ClipboardCheck` + "Copied" for 2000ms via `setTimeout`, try/catch swallow. — `environment-info.tsx:56-102`
- `DB_SCHEMA_VERSION = 21` — confirmed digit-exact. — `db.ts:906`
- SW diagnostics: `readSWState`/`readPushState` run in `Promise.all` on mount and Refresh; conditional `Row`s; 4 maintenance buttons with disabled gates (`!sw.registered`, `!sw.waitingState`, `cacheNames.length === 0`, `!sw.registered`); Unregister styled `text-red-600 dark:text-red-400`; Push sub-block with `BellRing`, border-top; Send test notification disabled unless `permission !== "granted"` and dynamic-imports `sendTestNotification`. — `service-worker-diagnostics.tsx:98-303`
- Push permission type `NotificationPermission | "unsupported"`. — `service-worker-diagnostics.tsx:21-24, 69-72`
- Audit Log Viewer: live `orderBy("timestamp").reverse().limit(100)`; header `Audit Logs ({filteredLogs.length})`; "All Actions" + `AUDIT_ACTIONS`; Clear All two-step confirm wipes `db.auditLogs.clear()`; chevron only when `parseDetails` succeeds; expand shows pretty JSON; empty "No audit logs found." — `debug-panel.tsx:126-256`
- `parseDetails` safe JSON parse returning null on failure. — `debug-panel.tsx:113-120`
- Stock Management reads active items via `db.inventoryItems.where("isActive").equals(1)`; recalc card "Recalculation Result: X items updated, Y drifted" + `brandName: oldStock → newStock`; comparison drift gate `Math.abs(cached - derived) > 0.001` flags `(DRIFT)` amber. — `debug-panel.tsx:280-399`
- `recalculateAllStock` return shape `{ updated, drifted, items[] }` with `Math.abs(oldStock - newStock) > 0.001` drift gate. — `inventory-service.ts:298-344`
- Raw Record Viewer: `TABLE_NAMES` = 14 tables (exact list & order), default `TABLE_NAMES[0]` = `intakeRecords`; live count; `orderBy("updatedAt").reverse().limit(50)` with try/catch in-memory fallback sort by `updatedAt ?? timestamp ?? createdAt`; per-row best timestamp `timestamp → updatedAt → createdAt`; empty "No records in this table." — `debug-panel.tsx:88-103, 408-527`
- `_errorLogs` store key `"id, timestamp, source"`, Dexie v17+, local-only. — `db.ts:756, 780-917, 363-373`
- `ErrorLogSource` 6-member union and `AuditAction` 30-member union match the doc's enum sections. — `db.ts:24-54, 354-360`

## Low-confidence / could-not-verify

- The doc's "Storage quota/usage fetched via `navigator.storage.estimate()`" and "Live-updates `Online` status via `online`/`offline` window events" are confirmed in code (`environment-info.tsx:39-54`); no runtime device verification was performed (static read only).
- Toast exact title-vs-description rendering (e.g. whether the UI joins title+description with an em-dash) is a presentation concern not determinable from code alone; the code clearly uses separate `title`/`description` fields, so the doc's combined "X — Y" strings are paraphrases rather than literals. Treated as low-severity wording notes above.
- "Excluded from sync/backup" for `_errorLogs` is asserted by the service header comment and the store living under the `_` prefix convention; I did not exhaustively trace the sync/backup serializers to prove the exclusion, but no `_errorLogs` enqueue/backup reference was found in the files read.
