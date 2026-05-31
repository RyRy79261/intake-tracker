# 44 — Debug Tools

**Files covered:**
- `src/components/debug-panel.tsx` (main dialog + Audit Log Viewer, Stock Management, Raw Record Viewer sections)
- `src/components/debug/error-log-viewer.tsx`
- `src/components/debug/environment-info.tsx`
- `src/components/debug/service-worker-diagnostics.tsx`
- `src/lib/error-log-service.ts` (capture/persist/export pipeline)
- `src/lib/db.ts` (`ErrorLogEntry`, `ErrorLogSource`, `AuditAction`, `AuditLog`, `_errorLogs` table, `DB_SCHEMA_VERSION`)
- Integration points: `src/app/settings/page.tsx` (mount), `src/app/providers.tsx` (`installErrorCapture()`), `src/components/error-boundary.tsx`, `src/lib/api-fetch.ts`, `src/lib/inventory-service.ts` (`recalculateAllStock`, `getCurrentStock`), `src/lib/push-notification-service.ts` (`sendTestNotification`)

**Purpose:** A developer/power-user diagnostics surface, reachable from the Settings page, that exposes captured runtime errors, device/environment info, service-worker and push state with maintenance actions, audit logs, medication stock integrity checks, and a raw Dexie record inspector — designed so a single-user PWA can be debugged on devices with no devtools (mobile Safari, Capacitor native).

---

## Features

### Entry point & shell
- Lives in Settings under a "Debug" accordion group (`Bug` icon, slate color token). Inside it renders a `<DebugPanel>` trigger button: a full-width ghost button labeled "Debug Panel" with a `Bug` icon, muted-foreground text.
- Clicking opens a modal `Dialog` titled "Debug Panel" with description: "Errors, environment info, service worker state, audit logs, stock, and raw records."
- Dialog content is `max-w-2xl`, `max-h-[85vh]`, vertically scrollable.
- Body is a stack of six **collapsible sections** (shadcn `Collapsible`), each a full-width ghost trigger button (height 9, text-sm) with a leading lucide icon + label on the left and a chevron on the right (`ChevronRight` collapsed / `ChevronDown` expanded).
- **Accordion-of-one behavior:** only one section can be open at a time. `activeSection` is a single string (or `null`); opening a section sets it, closing sets `null`. Opening another swaps it.

The six sections (in order):
1. **Error Logs** — icon `AlertOctagon`
2. **Environment** — icon `Info`
3. **Service Worker & Push** — icon `Cog`
4. **Audit Logs** — icon `FileText`
5. **Stock Management** — icon `Package`
6. **Raw Records** — icon `Database`

### 1. Error Log Viewer (`error-log-viewer.tsx`)
- Reads the device-local `_errorLogs` Dexie table live (`useLiveQuery`), newest-first, capped at 200 rows.
- Header shows "Error Logs (N)" where N = count after filtering.
- **Source filter** dropdown (see enums) — "All sources" or a single source.
- **Export** button: serializes ALL error logs (not just the 200 shown, not filtered) to a pretty-printed JSON blob and triggers a file download named `error-logs-<ISO-datetime-to-seconds>.json`. The JSON is an envelope object `{ exportedAt, appVersion, logs }` (not a bare array); `exportedAt` is an ISO timestamp and `appVersion` is `CLIENT_VERSION`. Disabled when there are zero logs.
- **Clear** button → two-step confirm (Clear → Confirm/Cancel). Confirm wipes the entire `_errorLogs` table. Disabled when zero logs.
- Each row shows: timestamp (locale string), the source (color-coded, monospace), and the message (monospace, wrapped). A chevron appears only when the row has expandable detail (stack / componentStack / route / userAgent present).
- **Expand a row** to reveal: Route (mono), Stack (`<pre>` block), Component stack (`<pre>`, prefixed "Component stack:"), and User agent (UA: …). Multiple rows can be expanded independently (a `Set` of ids).
- Empty state: "No errors captured."

### Error capture pipeline (`error-log-service.ts`) — feeds the viewer
- Installed once on app boot via `installErrorCapture()` (called from `providers.tsx`). Idempotent, no-op on server.
- Captures from 6 sources (see enum). Hooks:
  - `window.addEventListener("error")` → `window-error`
  - `window.addEventListener("unhandledrejection")` → `unhandled-rejection`
  - monkey-patches `console.error` → `console-error` and `console.warn` → `console-warn` (still calls the original first)
  - `ErrorBoundary.componentDidCatch` → `error-boundary` (also logs `componentStack`)
  - `api-fetch.ts` failures → `api-error`
- Each entry persists: id, timestamp, source, message (truncated 2000 chars + ellipsis), optional stack (truncated 8000), optional componentStack (truncated 8000), route (pathname only — query strings stripped to avoid persisting tokens), userAgent, appVersion.
- **LRU cap of 500 entries**: after a write, if count > 500 the oldest overflow rows are bulk-deleted.
- Reentrancy guard (`writingDepth`) prevents the persistence layer's own console.error from recursing; `rawConsoleError` bypasses the patched console.
- Storage is **local-only — never synced, never backed up**.

### 2. Environment Info (`environment-info.tsx`)
- A read-only key/value table of device + build context (see field list in enums).
- **Copy** button copies all fields as `label: value` newline-joined text to clipboard; button swaps to "Copied" (with `ClipboardCheck` icon) for 2 seconds, then reverts. Silently ignores clipboard failures (non-secure contexts).
- Live-updates `Online` status via `online`/`offline` window events. Storage quota/usage fetched via `navigator.storage.estimate()`.

### 3. Service Worker & Push Diagnostics (`service-worker-diagnostics.tsx`)
- On open (and via **Refresh** button) reads SW registration + cache + push state in parallel.
- Displays SW state rows: Supported, Registered, Scope, Script URL, Controller, Active state, Waiting state, Installing state, Caches (comma-joined names or "none"). Conditional rows only render when their value exists.
- SW maintenance actions (4 buttons):
  - **Force update check** → `reg.update()`, toast "Update check requested" on success; disabled if not registered. If no registration is found at click time, short-circuits with toast "No service worker registered"; on error shows a destructive "Update failed" toast (with the error message).
  - **Skip waiting** → posts `{ type: "SKIP_WAITING" }` to the waiting worker; toast confirms or "No waiting worker"; disabled if no waiting worker.
  - **Clear caches** → deletes all Cache Storage entries; toast "Caches cleared — N cache(s) deleted"; disabled if no caches.
  - **Unregister** (red/destructive text) → unregisters all SW registrations; toast is a title+description pair (title "Service workers unregistered", description "N registration(s) removed"); disabled if not registered.
- **Push** sub-block (separated by a top border, `BellRing` icon): rows for Push supported, Permission, Subscribed, Endpoint (conditional).
- **Send test notification** → dynamically imports `push-notification-service` and calls `sendTestNotification()`; toast success/failure; disabled unless permission === "granted".
- Most actions show a `busy` state (spinning `RefreshCw` on the Refresh button) and disable while busy. **Exception:** Skip waiting does NOT set `busy` (no `setBusy(true)`), so it isn't gated by the global busy spinner — it is disabled only by `!sw.waitingState`.

### 4. Audit Log Viewer (`debug-panel.tsx` → `AuditLogViewer`)
- Reads `auditLogs` table live, newest-first, capped at 100.
- Header "Audit Logs (N)".
- **Action filter** dropdown ("All Actions" + every `AuditAction` enum value).
- **Clear All** → two-step confirm (Clear All → Confirm/Cancel); wipes the entire `auditLogs` table.
- Each row: chevron (only if `details` JSON is present and parseable), timestamp, action (monospace). Expand reveals the parsed `details` JSON as pretty-printed `<pre>`. Independent multi-expand.
- Empty: "No audit logs found."

### 5. Stock Management (`debug-panel.tsx` → `StockManagement`)
- Two actions for medication inventory integrity:
  - **Recalculate All Stock** → calls `recalculateAllStock()`; spinner while running. Result card shows "Recalculation Result: X items updated, Y drifted"; only when there is at least one drifted item does it render the (amber) "Drifted Items:" heading followed by each drifted item as `brandName: oldStock → newStock` (oldStock is `currentStock ?? 0`). When zero drift, the card shows only the summary line. Beyond persisting recomputed stock, `recalculateAllStock()` has side effects: it enqueues sync (`_syncQueue`), calls `schedulePush()`, and writes a `stock_recalculated` audit log (with `totalItems`, `driftedCount`, `driftedItems`).
  - **Compare Cached vs Derived** → for each active inventory item, compares the stored `currentStock` (null-coalesced via `currentStock ?? 0`) against the freshly `getCurrentStock()`-derived value. Renders a card with a header `Stock Comparison (N active items)`, then lists each item as `brandName  cached: A | derived: B`, flagging mismatches `(DRIFT)` in amber when `|cached − derived| > 0.001`.
- Reads only active inventory items (`isActive === 1`).

### 6. Raw Record Viewer (`debug-panel.tsx` → `RawRecordViewer`)
- A **table picker** dropdown (14 Dexie tables, see enum) + live total-record count for the selected table.
- Lists up to 50 most-recent records, sorted by `updatedAt` descending (with an in-memory fallback sort by `updatedAt → timestamp → createdAt` if the index is missing).
- Each row: chevron, record `id` (mono, truncated), and the record's best timestamp (locale string). Expand reveals the full record JSON pretty-printed in a `<pre>`. Independent multi-expand.
- Empty: "No records in this table."

---

## User actions & interactions

- **Open Debug Panel** — tap the "Debug Panel" button in Settings → Debug accordion. Opens modal.
- **Expand/collapse a section** — tap a section header; only one section open at a time (opening another collapses the previous).
- **Close dialog** — overlay/Esc/close button (standard shadcn Dialog).
- **Error Logs:**
  - Select source filter (single value).
  - Tap a row to expand/collapse its stack/route/UA detail (multi-expand).
  - Tap Export → downloads JSON file.
  - Tap Clear → reveals Confirm/Cancel; Confirm wipes logs, Cancel aborts.
- **Environment:** tap Copy → copies all fields to clipboard, button shows "Copied" for 2s.
- **Service Worker & Push:**
  - Tap Refresh → re-reads SW/push/cache state.
  - Tap Force update check / Skip waiting / Clear caches / Unregister → performs the action, shows a toast, auto-refreshes state.
  - Tap Send test notification → fires a local test push.
- **Audit Logs:**
  - Select action filter.
  - Tap a row to expand/collapse its JSON details.
  - Tap Clear All → Confirm/Cancel two-step → wipes audit table.
- **Stock Management:**
  - Tap Recalculate All Stock → recomputes + persists stock, shows drift summary.
  - Tap Compare Cached vs Derived → shows per-item comparison without writing.
- **Raw Records:**
  - Select a table from the dropdown.
  - Tap a row to expand/collapse its full JSON.

---

## States & presentations

- **Collapsed section (default):** header button with `ChevronRight`; body hidden.
- **Expanded section:** `ChevronDown`; body rendered. Only one at a time.
- **Loading / async:** SW diagnostics show `busy` (spinning Refresh icon, action buttons disabled) for Refresh, Force update check, Clear caches, and Unregister; Skip waiting is the one action that never sets `busy`. Stock "Recalculate" shows a spinning `RefreshCw` icon while `isRecalculating`. "Compare" disabled while `isLoadingComparisons`.
- **Live-updating:** Error Logs, Audit Logs, Raw Records and active-inventory query are `useLiveQuery` — re-render automatically as the underlying Dexie data changes.
- **Empty states:** Error Logs "No errors captured."; Audit Logs "No audit logs found."; Raw Records "No records in this table." (centered, muted, text-xs).
- **Confirm states:** Clear / Clear All swap into an inline Confirm (destructive variant) + Cancel (ghost) pair.
- **Disabled states:** Export/Clear disabled when zero error logs; Force update / Unregister disabled when no SW registered; Skip waiting disabled when no waiting worker; Clear caches disabled when no caches; Send test notification disabled unless push permission === "granted".
- **Success/feedback:** SW actions emit toasts (e.g. "Caches cleared — N cache(s) deleted", "SKIP_WAITING posted to waiting worker", "Update check requested", and the Unregister title+description pair "Service workers unregistered" / "N registration(s) removed", "Test notification sent"). Environment Copy → transient "Copied" label (2s).
- **Error/destructive feedback:** SW action failures emit destructive-variant toasts with the error message. Notification failure → "Notification failed — Check permission and service worker".
- **Offline/online:** Environment "Online" row reflects `navigator.onLine` live. Storage row shows "—" if estimate unavailable.
- **Unsupported environment:** SW "Supported"/"Registered" → "no"; Push "Permission" → "unsupported" when Notifications API absent; conditional rows simply omitted.
- **Drift highlight:** In **Compare Cached vs Derived**, per-item rows render amber (`text-amber-600 dark:text-amber-400`) and append `(DRIFT)` when `|cached − derived| > 0.001`; non-drift rows neutral. In **Recalculate All Stock**, only the "Drifted Items:" heading is amber — the per-item drift rows render plain `font-mono` (no per-row `> 0.001` color gate; that gate is comparison-only).
- **Color-coded error sources:** see SOURCE_COLOR enum below.
- **Capacitor/native vs Web:** Environment "Mode" row reflects `isCapacitorMode()`. Note this is not a Capacitor runtime probe — `isCapacitorMode()` returns the truthiness of the `NEXT_PUBLIC_API_BASE_URL` env var.

---

## Enums, options & configurable values

### Error log sources (`ErrorLogSource`, db.ts) — filter dropdown options
- `all` (UI-only, labeled "All sources")
- `window-error`
- `unhandled-rejection`
- `error-boundary`
- `console-error`
- `console-warn`
- `api-error`

### Source color map (`SOURCE_COLOR`, error-log-viewer.tsx)
- `window-error` → `text-red-600 dark:text-red-400`
- `unhandled-rejection` → `text-red-600 dark:text-red-400`
- `error-boundary` → `text-rose-600 dark:text-rose-400`
- `console-error` → `text-orange-600 dark:text-orange-400`
- `console-warn` → `text-amber-600 dark:text-amber-400`
- `api-error` → `text-orange-600 dark:text-orange-400`

### Audit actions (`AuditAction`, db.ts) — full set (filter shows "All Actions" + these)
`ai_parse_request`, `ai_parse_success`, `ai_parse_error`, `data_export`, `data_import`, `data_clear`, `settings_change`, `api_key_set`, `api_key_clear`, `pin_set`, `pin_verify_success`, `pin_verify_failure`, `dose_taken`, `dose_skipped`, `dose_rescheduled`, `dose_time_edited`, `prescription_added`, `prescription_updated`, `inventory_adjusted`, `phase_activated`, `validation_error`, `dose_untaken`, `prescription_deleted`, `phase_completed`, `phase_started`, `stock_recalculated`, `inventory_added`, `inventory_deleted`, `titration_plan_updated`, `timezone_adjusted`.

> NOTE: The `AUDIT_ACTIONS` array in `debug-panel.tsx` currently lists 27 of these and is missing `dose_time_edited`, `titration_plan_updated`, and `timezone_adjusted` (the full `AuditAction` type has 30). An alternative design should source the dropdown from the type, not the hand-maintained array.

### Raw record table picker (`TABLE_NAMES`, debug-panel.tsx) — 14 tables
`intakeRecords`, `weightRecords`, `bloodPressureRecords`, `eatingRecords`, `urinationRecords`, `defecationRecords`, `prescriptions`, `medicationPhases`, `phaseSchedules`, `inventoryItems`, `inventoryTransactions`, `doseLogs`, `dailyNotes`, `auditLogs`. (Default selection = first entry, `intakeRecords`.)

### Environment Info fields (in order)
- App version (`NEXT_PUBLIC_APP_VERSION`, default "0.0.0")
- Build env (`NEXT_PUBLIC_VERCEL_ENV`, default "unknown")
- Mode ("Capacitor (native)" / "Web")
- Node env (`NODE_ENV`)
- DB version (`DB_SCHEMA_VERSION` = **21**)
- Device ID
- Timezone
- Day-start hour (from settings)
- Online ("yes"/"no")
- Locale (`navigator.language`)
- Screen (`width×height @ DPRx`)
- Viewport (`innerWidth×innerHeight`)
- Storage (`usage / quota`, formatted via `formatBytes`: bare `"N B"` with no decimal for values < 1024; KB/MB/GB to 1 decimal; `"—"` when the byte value is null)
- User agent

### Service Worker state fields
- Supported, Registered (yes/no)
- Scope, Script URL, Controller (conditional)
- Active state, Waiting state, Installing state (SW lifecycle states: `installing`/`installed`/`activating`/`activated`/`redundant`)
- Caches (comma-joined names or "none")

### Push state fields
- Push supported (yes/no)
- Permission: `NotificationPermission` (`granted` | `denied` | `default`) or `unsupported`
- Subscribed (yes/no)
- Endpoint (conditional)

### Limits / thresholds / constants (error-log-service.ts)
- `MAX_ENTRIES` = **500** (LRU cap on `_errorLogs`)
- `MESSAGE_MAX` = **2000** chars (message truncation)
- `STACK_MAX` = **8000** chars (stack/componentStack truncation)
- `CLIENT_VERSION` = `NEXT_PUBLIC_APP_VERSION` || "0.0.0"
- Error Log Viewer live query limit = **200**; Export exports ALL (uncapped)
- Audit Log Viewer live query limit = **100**
- Raw Record Viewer limit = **50** per table
- Drift epsilon = **0.001** (Stock comparison and recalc)
- Copy "Copied" label timeout = **2000 ms**
- `getErrorLogs()` default limit = 200

---

## Data model touched

- **`_errorLogs`** (`ErrorLogEntry`, db.ts; Dexie v17+, store key `id, timestamp, source`): READ (live, export) + WRITE (capture via `logError`) + CLEAR. Fields: `id`, `timestamp`, `source` (`ErrorLogSource`), `message`, `stack?`, `componentStack?`, `route?`, `userAgent?`, `appVersion?`. Local-only; excluded from sync/backup.
- **`auditLogs`** (`AuditLog`, db.ts): READ (live, top 100 newest) + CLEAR. Fields: `id`, `timestamp`, `action` (`AuditAction`), `details?` (JSON string), `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`.
- **`inventoryItems`** (`InventoryItem`, db.ts): READ active items (`isActive === 1`); fields used: `id`, `brandName`, `currentStock`, `isActive`. Stock recalc WRITES `currentStock` + `updatedAt`, enqueues sync (`_syncQueue`), calls `schedulePush()`, and writes a `stock_recalculated` audit log (`totalItems`, `driftedCount`, `driftedItems`).
- **`inventoryTransactions` / `doseLogs`**: read indirectly via `getCurrentStock()` to derive true stock.
- **All 14 picker tables**: READ-only via `db.table(name)` in Raw Record Viewer.
- Reads `DB_SCHEMA_VERSION` constant; reads settings store (`dayStartHour`).

---

## Validation, edge cases & business rules

- **Accordion-of-one:** sections are mutually exclusive (single `activeSection`).
- **Two-step destructive confirm** on both Clear (error logs) and Clear All (audit logs) — no immediate destructive action.
- **Route privacy:** only `window.location.pathname` is persisted with errors; query strings are intentionally stripped (may hold tokens).
- **Truncation:** message → 2000 chars, stacks → 8000 chars, each with an ellipsis suffix.
- **Reentrancy:** `writingDepth` guard + captured original console refs prevent the capture pipeline from recursing through its own patched console; `rawConsoleError` is the escape hatch used by the ErrorBoundary.
- **LRU trim** runs only when count > 500; deletes exactly the overflow count of oldest rows.
- **Export** is uncapped and unfiltered (full table), unlike the 200-row live view; filename is ISO datetime sliced to seconds.
- **Drift detection** uses absolute difference > 0.001 (float tolerance), not strict equality. This epsilon gates the amber `(DRIFT)` highlight in **Compare Cached vs Derived**, and the inclusion of an item in the recalc `items[]` drift list (`recalculateAllStock`).
- **Raw viewer sort fallback:** if `orderBy("updatedAt")` throws (missing index), falls back to in-memory sort by `updatedAt ?? timestamp ?? createdAt`.
- **SSR/Server safety:** capture install and most reads no-op when `window`/`navigator` undefined.
- **Clipboard** writes are wrapped in try/catch (fail silently in non-secure contexts).
- **Button gating:** every SW/push action is guarded by capability checks (`"serviceWorker" in navigator`, `"caches" in window`, `"PushManager" in window`, permission === "granted") and disabled accordingly.
- **Live counts** in headers reflect the post-filter list length, not the raw table count.

---

## Sub-components / variants

- **`DebugPanel`** (`debug-panel.tsx`) — top-level dialog + the six-section accordion shell; mounted in Settings.
- **`AuditLogViewer`** (inner, debug-panel.tsx) — filtered, expandable audit-log list with Clear All.
- **`StockManagement`** (inner, debug-panel.tsx) — recalc + cached-vs-derived stock integrity tools.
- **`RawRecordViewer`** (inner, debug-panel.tsx) — table-picker JSON record inspector.
- **`ErrorLogViewer`** (`debug/error-log-viewer.tsx`) — source-filtered error list with Export + Clear.
- **`EnvironmentInfo`** (`debug/environment-info.tsx`) — device/build key-value table with Copy.
- **`ServiceWorkerDiagnostics`** (`debug/service-worker-diagnostics.tsx`) — SW + push state and maintenance actions; includes internal `Row` presentational helper.
- **`error-log-service.ts`** — non-visual: `installErrorCapture`, `logError`, `getErrorLogs`, `clearErrorLogs`, `exportErrorLogs`, `rawConsoleError` (the capture/persistence engine behind the Error Logs section).
- Helpers in debug-panel.tsx: `formatTimestamp`, `parseDetails` (safe JSON parse of audit `details`).
