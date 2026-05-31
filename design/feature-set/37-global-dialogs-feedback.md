# 37 — Global Dialogs & Feedback

**Files covered:**
- `src/components/about-dialog.tsx`
- `src/components/welcome-dialog.tsx`
- `src/components/report-bug-dialog.tsx`
- `src/components/update-notification.tsx`
- `src/components/error-boundary.tsx`
- `src/components/shake-to-report.tsx`
- `src/hooks/use-toast.ts`
- `src/components/ui/toast.tsx`
- `src/components/ui/toaster.tsx`
- `src/lib/bug-report.ts`
- `src/hooks/use-bug-report.ts`
- `src/hooks/use-shake-gesture.ts`
- `src/hooks/use-version-check.ts`
- `src/components/settings/report-bug-section.tsx`
- `src/components/settings/app-updates-section.tsx`
- `src/lib/github-labels.ts`
- `src/app/api/bug-report/route.ts` (server pipeline)
- `src/lib/security.ts` (PII redaction)
- `src/lib/constants.ts` (`WELCOME_SEEN_KEY`)
- Mount sites: `src/app/providers.tsx`, `src/app/layout.tsx`, `src/app/settings/page.tsx`

**Purpose:** The app-wide feedback and chrome layer: a first-launch welcome modal, an About modal, an in-app bug/feature reporter (typed or voice, optionally AI-restructured, with auto-attached sanitized diagnostics) reachable by tapping or by shaking the phone, a sticky update banner, a crash error-boundary fallback, and a global toast system. These run outside any single tracking feature and surface system status, errors, and the support path.

---

## Features

### Welcome dialog (first launch)
- One-time greeting shown automatically on first app load per device.
- "Seen" flag is stored only in `localStorage` (key `intake-tracker-welcome-seen`), intentionally NOT synced to cloud → shows once per device, not per account.
- Two info rows: a help hint and an install hint.
- Help hint is device-aware: touch devices ("`pointer: coarse`") see "Lost or need help? Just shake your phone." with a Hand icon; non-touch devices see "Lost or need help? Open the Help section in Settings." with a LifeBuoy icon.
- Install hint: "Install this web app to your phone for a more app-like experience." with a Smartphone icon.
- Never shown on auth pages (`/auth*`) — the component renders `null` there so the modal can't block sign-in.
- Single "Got it" action dismisses and persists the seen flag. Dismissing via overlay/Esc also persists it.

### About dialog
- Modal launched from a ghost trigger button labeled "About App" (Info icon), placed at the bottom of the Settings page.
- Branded header: Droplets icon in a circular sky-tinted badge, title "Intake Tracker", description "A comprehensive personal medical tracker for hydration, nutrition, vitals, and medications."
- Two paragraphs of author/mission copy (built to manage a chronic condition; AI features can't be offered free but self-setup is supported).
- Three metadata rows in muted pill rows:
  - **Version** — `NEXT_PUBLIC_APP_VERSION` (default `0.0.0`), mono.
  - **Environment** — colored badge derived from `NEXT_PUBLIC_VERCEL_ENV`.
  - **Build** — git SHA from `NEXT_PUBLIC_GIT_SHA` (default `local`), shortened to first 7 chars, mono muted.

### Bug / feature reporter dialog
- Single dialog that files a GitHub issue directly from the app (no email, no leaving the app).
- Two modes via a top toggle: **Bug** (Bug icon) and **Feature** (Lightbulb icon). Title, description label, placeholder, and dialog description copy all change with mode.
- Free-text description (6-row textarea) — typed and/or voice-dictated.
- **Voice dictation** (only when a Groq key is configured): "Dictate instead" button reveals an inline `VoiceRecorder`; the recording POSTs to `/api/ai/voice-transcribe` and the returned text is appended to both the description and a kept-separate `transcript` field (newline-joined to existing text).
- **AI restructuring toggle "Improve with AI"** (only when an Anthropic key is configured): when on, Claude restructures raw prose into a clean title + summary + steps/expected/actual + severity hint. Form works fully with it off or absent.
- **Diagnostics preview** — collapsible "What will be attached" showing live counts `(N env fields, M log entries)`; expands to a table of every environment field (label + mono value) plus a note about how many error-log entries are attached and that PII is stripped.
- Auto-collected diagnostics attached to every report: environment info + up to 25 recent error-log entries, with AI-key status appended.
- **Success state**: after filing, swaps the entire dialog body to a confirmation — "Report filed", "Issue #N was created on GitHub", an external link "View issue #N", and a "Done" button.
- **"Wanna read the manual?" promo card** (sky-tinted, below the form): BookOpen heading + copy + "Open the manual" button that closes the dialog and routes to `/help`. Rationale baked into the code: a shake often means "how does this work?" not "this is broken".
- Reachable from 3 entry points: Settings → Feedback section button, a device **shake** gesture, and the **crash screen** ("Report this problem").

### Shake-to-report (global gesture)
- Mounted once globally; shaking the device opens the bug reporter with `defaultType="bug"`.
- Detection pauses while the dialog is already open.
- Pure shake-detection state machine: counts acceleration-magnitude *jolts* (delta above threshold) within a rolling window; fires when enough jolts land inside the window and a cooldown has elapsed. Magnitude is rotation-invariant so tilting/reorienting doesn't trigger it.
- Sensitivity is user-configurable (threshold + required jolts) in Settings.
- iOS 13+ motion-permission handling: motion events are gated behind a user-gesture permission prompt. When enabled and permission is needed, it's requested once on the first `pointerdown` after load; the Settings toggle also requests it explicitly on opt-in.

### Update notification banner
- Sticky bottom banner shown when a newer server version is detected (polls `/api/version` 3s after load, then every 5 minutes).
- Web mode: "Update available", "v{X} is available — tap to refresh", an "Update" button (reloads the page) and an X dismiss button.
- Capacitor (native) mode: copy changes to "v{X} available — update from Play Store"; the Update button is hidden (can't self-reload a native build), dismiss remains.
- Dismiss hides the banner for the session; a newly detected version un-dismisses it.
- Settings has a parallel **App Updates section**: shows current vs. server version, an inline update card when available, and a "Check for updates" button that toasts "You're up to date" / "Update available" / "Check failed".

### Error boundary (crash fallback)
- Class component wrapping the entire app (`providers.tsx`); catches render errors below it.
- On catch: persists the error to the in-app debug log via `error-log-service` (using `rawConsoleError` to avoid double-capture) so it's visible on devices without devtools.
- Fallback screen: AlertTriangle in a red badge, "Something went wrong" heading, recovery copy, and recovery actions.
- In development only: shows the raw error message in a mono code block.
- "Report this problem" stores the caught error (message + stack) in `sessionStorage` and navigates to `/settings`, which opens the bug reporter pre-filled with the crash details.
- Supports a custom `fallback` prop and a `withErrorBoundary(Component, fallback)` HOC for scoped boundaries.

### Toast system (global)
- Imperative `toast(...)` API + `useToast()` hook backed by a module-level reducer/store (works outside React tree).
- Rendered by `<Toaster />` mounted in the root layout.
- Three visual variants (default / destructive / success) plus optional action button, title, description, and a close (X) button.
- Swipe-to-dismiss (Radix). One toast visible at a time (`TOAST_LIMIT = 1`).

---

## User actions & interactions

### Welcome dialog
- Tap "Got it" → dismiss + persist seen flag.
- Tap overlay / press Esc → same (handled via `onOpenChange` only dismissing on close).

### About dialog
- Tap "About App" trigger → open.
- Tap overlay / Esc / close → close. (Read-only; no other actions.)

### Bug reporter
- Tap "Bug" / "Feature" toggle → switch mode (changes all labels/placeholders/copy).
- Type into description textarea.
- Tap "Dictate instead" → reveal voice recorder; record → transcript appended to description.
- Toggle "Improve with AI" switch on/off.
- Tap "What will be attached" → expand/collapse diagnostics preview.
- Tap "Submit report" → file the issue (disabled until valid). Shows "Filing…" + spinner while pending.
- Tap "Cancel" → close (disabled while submitting).
- On success: tap "View issue #N" (opens GitHub in new tab) or "Done" (close).
- Tap "Open the manual" → close dialog + navigate to `/help`.
- **Shake the device** → opens reporter (bug mode) from anywhere.

### Update banner
- Tap "Update" → `window.location.reload()` (web only).
- Tap X / "Dismiss" → hide for session.

### Settings — App Updates
- Tap "Check for updates" → manual poll, toasts result.
- Tap "Update" (when available, web) → reload.

### Settings — Report a bug / Shake settings
- Tap "Report a bug" → open reporter.
- Toggle "Shake to report" switch → enable/disable (enabling requests motion permission; if denied, a destructive toast appears and the toggle is not enabled).
- When enabled, expand "Shake sensitivity" → adjust "Jolt threshold" and "Jolts required" via numeric inputs with +/- steppers (validated on blur).

### Crash screen
- Tap "Try Again" → reset boundary state (re-render children).
- Tap "Reload Page" → `window.location.reload()`.
- Tap "Go Home" → navigate to `/`.
- Tap "Report this problem" → stash error in sessionStorage + go to `/settings` (opens pre-filled reporter).

### Toasts
- Swipe a toast → dismiss.
- Tap close (X) → dismiss.
- Tap action button (if provided) → custom callback.

---

## States & presentations

### Welcome dialog
- **Hidden** — already seen, or on `/auth*` (renders null).
- **Shown** — first launch; touch variant (Hand icon, "shake your phone") vs. desktop variant (LifeBuoy icon, "Help section in Settings").

### About dialog
- **Closed / Open**. Environment badge has 3 color variants (see enums).

### Bug reporter
- **Form (default)** — type toggle, description, optional voice/AI controls, diagnostics preview.
- **Diagnostics loading** — preview shows "Collecting diagnostics…"; submit disabled until env AND logs both finish loading (guards against filing with empty arrays; reads are sub-100ms).
- **Voice idle vs. recording** — "Dictate instead" button vs. inline recorder panel.
- **AI toggle present vs. absent** — only renders when Anthropic key configured.
- **Voice control present vs. absent** — only renders when Groq key configured.
- **Submit disabled** — when description is empty/whitespace, while pending, or diagnostics not ready.
- **Submitting** — button shows spinner + "Filing…"; Cancel disabled.
- **Success** — confirmation view (CheckCircle2, issue number, external link, Done).
- **Submit error** — destructive toast "Could not file the report" with the error message; form stays open.
- **Voice transcription error** — destructive toast "Voice transcription failed".
- **Bug vs. Feature variant** — distinct title, label, placeholder, and description copy.
- **Pre-filled (crash)** — opened from crash flow with `defaultDescription` containing the error.
- Body is scrollable (`max-h-[90vh] overflow-y-auto`).

### Update banner / App Updates section
- **No update** — banner hidden; Settings shows "Check for updates" button.
- **Update available** — banner slides in from bottom; Settings shows the sky update card.
- **Dismissed** — banner hidden for session.
- **Checking** — `isChecking` flag (manual check button can spin via `Loader2`).
- **Web vs. Capacitor** — Update action shown vs. hidden; copy differs ("tap to refresh" vs. "update from Play Store").

### Error boundary
- **Normal** — renders children.
- **Crashed (default fallback)** — full recovery screen.
- **Crashed (custom fallback)** — renders the provided node instead.
- **Dev-only error detail** — mono error message block shown only when `NODE_ENV === "development"`.

### Toasts
- Variants: **default**, **destructive**, **success** (green-tinted). Open/closed animation states; swipe states (cancel/move/end). Single toast at a time.

### Shake gesture
- **Enabled & idle** — listening.
- **Paused** — while dialog open (`enabled: enabled && !open`).
- **Disabled** — component renders null when not enabled and not open.
- **Permission needed (iOS)** — requests on first gesture.

---

## Enums, options & configurable values

### About — environment badge (`getEnvLabel`, keyed on `NEXT_PUBLIC_VERCEL_ENV`)
- `production` → label "Production", green badge.
- `preview` → label "Preview", amber badge.
- default (e.g. `development`) → label "Development", blue badge.
- Version default `0.0.0`; git SHA default `local`; SHA display = first 7 chars.

### Bug report type (`BugReportType`)
- `"bug"` | `"feature"`. Default `"bug"`.

### AI structuring severity (server `StructuredSchema.severity`)
- `"critical"` | `"high"` | `"medium"` | `"low"` (optional triage hint, AI-inferred).

### Shake gesture defaults (hook) vs. settings store
- Hook defaults: `threshold = 8`, `requiredJolts = 3`, `windowMs = 800`, `cooldownMs = 3000`, sample throttle `60ms`.
- Settings-store defaults: `shakeToReportEnabled = true`, `shakeThreshold = 10`, `shakeRequiredJolts = 5`.
- **Threshold** range: 4–20 (sanitized 4–20; stepper min 4 / max 20, step 1). Copy: "Lower = more sensitive".
- **Jolts required** range: 2–8 (sanitized 2–8; stepper min 2 / max 8, step 1). Copy: "Higher = fewer accidental triggers".
- Window described in UI as "~0.8s".

### Version check
- `CHECK_INTERVAL_MS = 5 * 60 * 1000` (5 min); initial check 3s after load; `cache: "no-store"`.

### Toast config
- `TOAST_LIMIT = 1`; `TOAST_REMOVE_DELAY = 1000000` ms.
- Variants: `default`, `destructive`, `success`.

### Diagnostics — environment fields collected (`collectEnvironmentInfo`)
- App version, Build env, Mode (`Capacitor (native)` / `Web`), DB version (`DB_SCHEMA_VERSION`), Device ID, Timezone, Locale, Online (`yes`/`no`), User agent, Screen (`W×H @ Nx`), Viewport (`W×H`), Storage (`usage / quota`, human-formatted). Plus appended AI-key fields: "AI: Anthropic key" (configured/not), "AI: Groq key" (configured/not).
- `MAX_REPORT_LOGS = 25` error-log entries.
- Storage formatting units: B, KB, MB, GB.

### GitHub labels applied by the in-app reporter
- Bug: `["type: bug", "needs-triage", "source: in-app"]`.
- Feature: `["type: feature", "needs-triage", "source: in-app"]`.
- (Full taxonomy in `github-labels.ts`: type/status/priority/area/agent/source namespaces.)

### Server constants (`/api/bug-report`)
- Default repo `RyRy79261/intake-tracker`; `ISSUE_BODY_MAX = 60000`; `STACK_MAX_IN_BODY = 1200`; rate limit 10 / window; AI model = `CLAUDE_MODELS.fast`, temp 0, max_tokens 1024, 60s timeout.

### Storage keys
- `WELCOME_SEEN_KEY = "intake-tracker-welcome-seen"` (localStorage).
- `CRASH_REPORT_KEY = "intake-tracker:crash-report"` (sessionStorage).

---

## Data model touched

- **No user-data Dexie tables written** by this unit. It reads the **error-log** store via `error-log-service` (`getErrorLogs`, `logError`, `rawConsoleError`) — Dexie-backed in-app debug log.
- Reads `DB_SCHEMA_VERSION` (from `db.ts`) for diagnostics.
- Reads device identity/timezone helpers: `getDeviceId()`, `getDeviceTimezone()`.
- Reads Zustand `settings-store` fields: `shakeToReportEnabled`, `shakeThreshold`, `shakeRequiredJolts` (persisted to localStorage; with migrations at store versions 10/11/12 seeding these).
- Reads AI-key status via `useApiKeyStatus()` (`anthropic.configured`, `groq.configured`).
- POSTs `BugReportRequest` → `/api/bug-report` (server files GitHub issue via Octokit; optional Anthropic call). Response `BugReportResponse { url, number }`.
- POSTs audio → `/api/ai/voice-transcribe`. Polls `/api/version`.
- Types (in `bug-report.ts`): `BugReportType`, `EnvField`, `BugReportErrorLog`, `BugReportDiagnostics`, `BugReportRequest`, `BugReportResponse`.

---

## Validation, edge cases & business rules

- **Welcome flag is device-local and never synced** — deliberately shows once per device.
- **Welcome never renders on `/auth*`** to avoid blocking sign-in.
- **Reporter reset semantics**: state resets only on closed→open transition; the effect depends only on `[open]` so late `defaultType`/`defaultDescription` prop changes can't wipe a draft the user is typing.
- **Submit gating**: requires non-empty trimmed description AND `diagnosticsReady` (env and logs both loaded) AND not pending — prevents filing with empty diagnostics from a fast click.
- **AI is additive/degrading**: `effectiveUseAi = useAi && anthropicConfigured`. If AI is off, no key, or the model call fails, the server falls back to a plain template (title = first line of description ≤100 chars, or "Bug report"/"Feature request").
- **PII redaction (two passes)**: client strips and server re-strips via `sanitizeReportText` → `redactPii`: emails→`[email]`, intl & US phones→`[phone]`, SSN→`[ssn]`, credit cards→`[card]`, dates (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)→`[date]`, SA 13-digit ID→`[id-number]`. AI prompt is told placeholders may appear and to leave them as-is.
- **Server limits**: description max 5000, transcript max 5000, env ≤40 fields, error logs ≤30; issue body capped at 60000; stack truncated to 1200 chars in body; backtick fences inside content are defused.
- **Empty-after-sanitize** → server returns 400.
- **Missing `GITHUB_TOKEN`** → 503 with code `NO_GITHUB_TOKEN`.
- **Rate limit** → 429.
- **Shake detection**: magnitude-based (rotation-invariant) so tilting doesn't fire; requires ≥`requiredJolts` jolts within `windowMs` and respects `cooldownMs`; sample throttle 60ms; ignores null acceleration samples; paused while dialog open.
- **iOS motion permission**: `requestPermission` only exists on iOS 13+; non-iOS returns "granted" without a prompt; on denial the Settings toggle shows a destructive toast and does NOT enable.
- **Update banner**: hidden in Capacitor's actionable form (no self-reload); manual reload only on web; newly detected version clears prior dismissal.
- **Crash report pre-fill**: best-effort — if sessionStorage is unavailable, the report form still opens, just without the pre-fill; the description is assembled as "Reporting a crash." + error message + stack.
- **Error logging on crash** uses `rawConsoleError` to avoid double-capture by the patched `console.error`.
- **Diagnostics collection is best-effort**: a Dexie read failure for logs, or a `storage.estimate()` rejection, is swallowed so it never blocks filing.

---

## Sub-components / variants

- **`AboutDialog`** — read-only app/version/build modal (Settings footer).
- **`WelcomeDialog`** — one-time first-launch greeting (mounted in providers; device-aware copy).
- **`ReportBugDialog`** — the bug/feature reporter (props: `open`, `onOpenChange`, `defaultType`, `defaultDescription`); has form + success sub-states and an embedded manual promo.
- **`ShakeToReport`** — global mount wiring the shake gesture to the reporter.
- **`UpdateNotification`** — sticky bottom update banner (web/Capacitor variants).
- **`ErrorBoundary`** + **`withErrorBoundary`** HOC — crash catcher + recovery fallback screen.
- **`Toaster`** — renders active toasts from the toast store.
- **`Toast` / `ToastViewport` / `ToastTitle` / `ToastDescription` / `ToastClose` / `ToastAction` / `ToastProvider`** — Radix-based toast primitives (variants default/destructive/success).
- **`useToast` / `toast`** — imperative toast store + hook.
- **`useShakeGesture` / `createShakeDetector` / `requestMotionPermission` / `motionPermissionNeeded`** — shake detection state machine + iOS permission helpers.
- **`useVersionCheck`** — polling version comparison + apply/dismiss controls.
- **`useSubmitBugReport`** — React Query mutation posting to `/api/bug-report`.
- **`collectEnvironmentInfo` / `collectRecentErrorLogs`** — client diagnostics collectors.
- **`ReportBugSection`** (Settings → Feedback) — entry button + shake toggle + sensitivity controls.
- **`AppUpdatesSection`** (Settings → System) — current/server version display + manual check.
