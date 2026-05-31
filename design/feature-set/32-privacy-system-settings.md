# 32 — Privacy/Permissions + System Settings

**Files covered:**
- `src/components/settings/permissions-section.tsx`
- `src/components/settings/app-updates-section.tsx`
- `src/components/settings/help-section.tsx`
- `src/components/settings/report-bug-section.tsx`
- `src/components/permission-badge.tsx`
- `src/components/report-bug-dialog.tsx`
- `src/components/update-notification.tsx`
- `src/components/shake-to-report.tsx`
- `src/components/settings/expandable-settings-section.tsx`
- `src/hooks/use-permissions.ts`
- `src/hooks/use-version-check.ts`
- `src/hooks/use-notification-queries.ts`
- `src/hooks/use-shake-gesture.ts`
- `src/hooks/use-bug-report.ts`
- `src/lib/push-notification-service.ts`
- `src/lib/bug-report.ts`
- `src/lib/settings-helpers.ts`
- `src/app/api/version/route.ts`
- `src/stores/settings-store.ts` (shake fields)
- `src/app/settings/page.tsx` (mounting context)

**Purpose:** The device-integration and self-service cluster of the Settings screen: it surfaces and requests browser/OS permissions (notifications, microphone), manages expiry reminders, checks for and applies app updates, links to the user manual, and lets the user file GitHub bug/feature reports (including a global shake-to-report gesture with diagnostics auto-attached and PII stripped).

---

## Features

### Permissions section (`PermissionsSection`)
- Renders a "Permissions" group header (shield icon, purple text) over a stack of permission rows.
- **Notifications row** — icon (Bell), title "Notifications", subtitle "For expiry reminders", and a `PermissionBadge` reflecting the live notification permission state. Tapping Enable triggers the native browser permission prompt.
- **Microphone row** — icon (Mic), title "Microphone", subtitle "For voice input", `PermissionBadge` with state plus a **Reset** affordance when blocked (mic state is cached in localStorage because `navigator.permissions.query` is unreliable on mobile PWAs).
- **Expiry Reminders row** — conditionally rendered **only when notifications are `granted`**. Shows title "Expiry Reminders", subtitle "Get notified when records are about to expire", an On/Off toggle button, and (when On) a **Test** button that fires a sample local notification.
- Permission states are queried on mount: notifications via `Notification.permission`, microphone via localStorage cache → fallback to `navigator.permissions.query({name:"microphone"})`. A `change` listener on the mic permission keeps state live where supported.
- Every action surfaces a toast (success or destructive) for grant / failure / reset / save / test outcomes.

### App Updates section (`AppUpdatesSection`)
- Header label switches: **"App Updates"** on web vs **"App Version"** in Capacitor (native) mode.
- Shows current running version (`v{clientVersion}` from `NEXT_PUBLIC_APP_VERSION`, default `0.0.0`) and the footnote "Running v{clientVersion} · Checks automatically every 5 min".
- Background polling: an initial check 3s after mount, then every 5 minutes, hitting `GET /api/version` with `cache: "no-store"`.
- **Update-available banner** (in-section) when server version ≠ client version: sky-tinted card, "Update available", version detail, and an **Update** button (web only — reloads the page). In Capacitor mode the copy reads "v{serverVersion} available — update from Play Store" and the Update button is hidden.
- **Check for Updates** button when no update is pending; shows a spinner + "Checking…" while in-flight; on completion toasts either "Update available" or "You're up to date · Running v{clientVersion}", or "Check failed" on error.
- A separate global floating **`UpdateNotification`** banner (bottom-fixed) also consumes the same hook to prompt updates app-wide, with Update + dismiss (X) controls; dismissal hides it until the next detected update.

### Help section (`HelpSection`)
- Header "User manual" (BookOpen icon, sky text), descriptive paragraph, and an **Open the manual** button that navigates to `/help`.

### Report a bug section (`ReportBugSection`)
- Header "Report a bug" (Bug icon, rose text), explainer that environment info + recent error logs are attached automatically with personal data removed.
- **Report a bug** button opens `ReportBugDialog`.
- **Shake to report** toggle (Switch): enabling it requests device-motion permission first (iOS 13+ gate); a denied result toasts and aborts the enable.
- When shake is enabled, an **Expandable "Shake sensitivity"** sub-panel exposes two tunable numeric inputs: **Jolt threshold** (4–20) and **Jolts required** (2–8), each with +/- steppers, blur validation, and helper text.

### Report bug dialog (`ReportBugDialog`)
- Type toggle: **Bug** vs **Feature** (changes title, description label, placeholder, and footer wording).
- Multiline description textarea (6 rows).
- **Dictate instead** voice input — shown only when a Groq key is configured; records audio, posts to `/api/ai/voice-transcribe`, appends transcript to the description.
- **Improve with AI** toggle — shown only when an Anthropic key is configured; lets Claude restructure the report into a clear title + steps.
- **Collapsible diagnostics preview** ("What will be attached (N env fields, M log entries)") listing each environment field and a note about stripped PII.
- Submit files a GitHub issue via `POST /api/bug-report`; success state replaces the form with "Report filed", issue number, and an external link to the issue.
- Footer with Cancel and Submit; an always-present sky-tinted "Wanna read the manual?" promo block linking to `/help`.

### Global shake-to-report (`ShakeToReport`)
- Mounted once app-wide; shaking the device opens the bug dialog. Detection pauses while the dialog is open. On iOS, motion permission is requested once on the first pointer gesture after load (since the feature ships enabled by default).

---

## User actions & interactions

| Action | Result |
|---|---|
| Tap **Enable** on Notifications badge | Calls `Notification.requestPermission()`; on grant toasts "Notifications enabled"; on error toasts destructive |
| Tap **Enable** on Microphone badge | Calls `getUserMedia({audio:true})`, immediately stops tracks; caches "granted" in localStorage; toasts "Microphone enabled" |
| Tap **Reset** (mic, when Blocked) | Removes localStorage cache, sets state back to `prompt`; toasts "Permission reset — Tap Enable to request microphone access again" |
| Toggle **Expiry Reminders On/Off** | Persists `{enabled}` to localStorage notification settings; toasts "Reminders enabled/disabled"; reverts + destructive toast on save failure |
| Tap **Test** (reminders) | `sendTestNotification()` shows a local notification; toasts "Test notification sent" or failure |
| Tap **Check for Updates** | Fetches `/api/version`; toasts up-to-date or update-available; disabled + spinner while checking |
| Tap **Update** (banner or floating) | Web: `window.location.reload()`. Capacitor: hidden (no action) |
| Tap **X** on floating update banner | `dismissUpdate()` hides it until the next detected version change |
| Tap **Open the manual** | `router.push("/help")` |
| Tap **Report a bug** | Opens `ReportBugDialog` |
| Toggle **Shake to report** ON | Requests motion permission; if denied → destructive toast, stays off; else enables |
| Toggle **Shake to report** OFF | Disables immediately, no permission request |
| Expand **Shake sensitivity** | Reveals threshold + jolts inputs (collapsible chevron rotates) |
| Edit / increment / decrement **Jolt threshold** | Clamped 4–20, validated on blur, persisted to Zustand store |
| Edit / increment / decrement **Jolts required** | Clamped 2–8, validated on blur, persisted to Zustand store |
| Physically **shake device** (global) | Opens bug dialog (when enabled and dialog not already open) |
| In dialog: toggle **Bug/Feature** | Swaps copy and the issue type |
| In dialog: type description | Enables Submit once non-empty and diagnostics loaded |
| In dialog: **Dictate instead** | Opens voice recorder, transcribes, appends to description |
| In dialog: toggle **Improve with AI** | Sets `useAi` flag passed to server |
| In dialog: expand **What will be attached** | Shows env fields + log-count + PII note |
| In dialog: **Submit report** | Files GitHub issue; spinner "Filing…"; on success shows filed-state |
| In dialog: **View issue #N** | Opens GitHub issue URL in new tab |
| In dialog: **Cancel / Done** | Closes dialog |

---

## States & presentations

### Permission badge states (`PermissionBadge`)
- **granted** → green "Enabled" with check icon, no button.
- **denied** → red "Blocked" with X icon; optional **Reset** ghost button (mic only).
- **prompt** ("Not set") → outline **Enable** button.
- **unavailable** ("Not available") → muted text, no action.

### Permission rows
- **Default** — bordered row with icon, title, subtitle, trailing badge/button.
- **Expiry Reminders row** — only visible when notifications granted; muted background tint (`bg-muted/30`); toggle button is `default` variant when On, `outline` when Off; Test button only appears when On.

### App updates
- **Idle / up to date** — full-width outline "Check for Updates" button + version footnote.
- **Checking** — button disabled, spinner + "Checking…".
- **Update available (web)** — sky card with version delta `v{server} available (you have v{client})` + Update button.
- **Update available (Capacitor)** — sky card with Play Store copy, **no** Update button.
- **Check failed** — destructive toast, returns to idle.
- **Floating banner** — fixed bottom card (sky), slide-in animation, Update + dismiss; hidden when no update or dismissed.

### Report bug dialog
- **Form (default)** — type toggle, textarea, optional dictate/AI controls, diagnostics collapsible, footer.
- **Collecting diagnostics** — Submit disabled until env + logs resolve; collapsible shows "Collecting diagnostics…".
- **Submitting** — Submit shows spinner "Filing…", Cancel disabled.
- **Filed (success)** — replaces form with green "Report filed", issue #, external link, Done.
- **Error** — destructive toast "Could not file the report"; form stays open.
- **Variant per type** — Bug vs Feature changes title/labels/placeholders/footer.
- **Conditional controls** — Dictate hidden without Groq key; AI toggle hidden without Anthropic key.

### Shake sensitivity
- **Collapsed** (default) — only the toggle visible.
- **Expanded** — two numeric inputs with steppers, helper text; chevron rotates 180°, accordion up/down animation.

### Offline
- Version check fails silently/errors (no `/api/version`); permissions and shake settings are fully client-side and remain functional offline. Bug-report submit requires network (fails with toast otherwise).

---

## Enums, options & configurable values

### `PermissionState` (`use-permissions.ts`)
`"granted" | "denied" | "prompt" | "unavailable"`
- Human labels (`getPermissionLabel`): granted→"Enabled", denied→"Blocked", prompt→"Not set", unavailable→"Not available".
- `canRequestPermission(state)` true only for `"prompt"`.

### `NotificationPermissionState` (`push-notification-service.ts`)
`"granted" | "denied" | "default"` (browser-native; `"default"` is mapped to `"prompt"`).

### `MotionPermissionResult` (`use-shake-gesture.ts`)
`"granted" | "denied" | "unsupported"`.

### `BugReportType` (`bug-report.ts`)
`"bug" | "feature"`.

### Version check (`use-version-check.ts` / `/api/version`)
- `CLIENT_VERSION` = `NEXT_PUBLIC_APP_VERSION` (default `"0.0.0"`).
- `CHECK_INTERVAL_MS` = `5 * 60 * 1000` (5 min). Initial check delay = 3000 ms.
- `/api/version` returns `{ version, gitSha (default "local"), environment (default "development") }`.

### Notification settings (`NotificationSettings`)
- `enabled` (default `false`), `lastCheck` (default `null`), `checkIntervalHours` (default `24`).
- Storage key: `intake-tracker-notifications`.
- Expiry warning window default `warningDays = 7`. Expiry notification tag `"expiry-reminder"`, test tag `"test-notification"`, default icon `/icons/icon-192.svg`.

### Microphone cache
- Storage key: `intake-tracker-mic-permission` (only stores `"granted"` / `"denied"`).

### Shake gesture config (settings store + `useShakeGesture` defaults)
- `shakeToReportEnabled` — store default `true` (migration v10 force-enabled it).
- `shakeThreshold` — store default `10`; **range 4–20**; UI step 1.
- `shakeRequiredJolts` — store default `5`; **range 2–8**; UI step 1.
- Hook defaults (used by global wiring fallback): `threshold = 8`, `requiredJolts = 3`, `windowMs = 800`, `cooldownMs = 3000`, sample throttle `60 ms`.
- "Balanced/Sensitive" migration values seen in store: v11 set threshold 15 / jolts 3; v12 lowered threshold to 8.

### Bug-report diagnostics (`bug-report.ts`)
- `MAX_REPORT_LOGS` = `25` (max attached error-log entries).
- Standard env fields: App version, Build env (`NEXT_PUBLIC_VERCEL_ENV`, default "unknown"), Mode ("Capacitor (native)" / "Web"), DB version, Device ID, Timezone, Locale, Online (yes/no), User agent, Screen (`w×h @ Nx`), Viewport, Storage (`usage / quota`).
- Extra AI-key fields appended in dialog: "AI: Anthropic key" + "AI: Groq key" → "configured" / "not configured".

---

## Data model touched

- **No Dexie user-data tables are written** by these sections directly. They read:
  - `intakeRecords`, `weightRecords`, `bloodPressureRecords` — `checkExpiringRecords()` filters by `timestamp` for expiry notifications.
  - `auditLogs`/error-log table via `getErrorLogs()` (`error-log-service`) — recent error logs for bug reports (fields: `timestamp`, `source`, `message`, `stack?`, `route?`).
- **localStorage**: `intake-tracker-mic-permission`, `intake-tracker-notifications`, plus Zustand-persisted settings (`shakeToReportEnabled`, `shakeThreshold`, `shakeRequiredJolts`).
- **Server (Neon Postgres)**: push subscriptions via `POST /api/push/subscribe` / `unsubscribe` (the only server-side persisted data in this cluster).
- **Server APIs**: `GET /api/version`, `POST /api/bug-report` (files GitHub issue, returns `{url, number}`), `POST /api/ai/voice-transcribe`.

---

## Validation, edge cases & business rules

- **Notifications support gate** — if `Notification` is absent, state is `"unavailable"`; requests return false.
- **Microphone reliability** — `navigator.permissions.query` for microphone is untrusted unless its state ≠ "prompt"; localStorage cache is authoritative on mobile PWAs. `NotAllowedError` → "denied" (cached); other errors → "prompt" (not cached). Reset clears the cache so the user can re-prompt.
- **Expiry Reminders toggle** — only mountable when notifications granted; save failures revert the optimistic toggle and toast.
- **Version equality rule** — update available strictly when `serverVersion !== CLIENT_VERSION` (no semver comparison; any mismatch counts). Failed fetch → no update, logs error.
- **Capacitor mode** — never calls `reload()`; surfaces Play Store copy and hides the Update button (`isCapacitorMode()` from `api-fetch`).
- **Shake clamping** — threshold sanitized to 4–20, jolts to 2–8 (`sanitizeNumericInput` in store; `validateAndSave` reverts invalid input to the prior value). Shake detection uses acceleration *magnitude* deltas so tilting/reorientation does not trigger it (rotation-invariant); needs `requiredJolts` within an 800 ms window with a 3 s cooldown.
- **iOS motion permission** — `DeviceMotionEvent.requestPermission` only exists on iOS 13+; elsewhere motion fires without a prompt. Enabling shake from settings requests it explicitly; globally it is requested on first pointer gesture. Denied → toast, stays off.
- **Bug-report submit gating** — Submit disabled until description is non-empty AND diagnostics (env + logs) have finished loading (prevents filing empty diagnostics on a fast click).
- **PII stripping** — all bug-report text (env + error logs) is stripped of emails, phone numbers, and ID-like numbers before sending (noted in UI; enforced server-side).
- **AI/voice conditionals** — Dictate requires Groq key; "Improve with AI" requires Anthropic key; `effectiveUseAi = useAi && anthropicConfigured`.
- **Dialog reset rule** — dialog resets only on closed→open transition (deps `[open]`), so late prop updates don't wipe a draft in progress.

---

## Sub-components / variants

- `PermissionsSection` — permission rows + expiry-reminder toggle/test.
- `PermissionBadge` — status badge with state-dependent Enable/Reset/labels.
- `AppUpdatesSection` — version display, check button, in-section update card.
- `UpdateNotification` — global floating update banner (Update + dismiss).
- `HelpSection` — manual link block.
- `ReportBugSection` — report entry point + shake toggle + sensitivity panel.
- `ReportBugDialog` — full bug/feature filing form with diagnostics + manual promo.
- `ShakeToReport` — global shake-gesture mount opening the bug dialog.
- `ExpandableSettingsSection` — generic collapsible used for "Shake sensitivity".
- `usePermissions` — query/request/reset notification & microphone permissions.
- `useVersionCheck` — polling + check/apply/dismiss update logic.
- `useNotificationSettings` — thin re-export of settings get/save + test notification.
- `useShakeGesture` / `createShakeDetector` / `requestMotionPermission` — shake state machine + iOS motion permission.
- `useSubmitBugReport` — React Query mutation hitting `/api/bug-report`.
- `push-notification-service` — Notification API, expiry checks, push subscribe/unsubscribe.
- `bug-report` lib — env + error-log collection, shared request/response types, PII contract.
- `settings-helpers` — `validateAndSave` / `incrementSetting` / `decrementSetting` for numeric inputs.
