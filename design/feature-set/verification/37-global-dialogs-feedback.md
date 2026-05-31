# Verification — 37-global-dialogs-feedback

**Verdict:** accurate · checked 96 claims, verified 93.

Read every source file in the "Files covered" list plus the mount sites, the
settings store, the rate limiter, the Claude client, the version/voice-transcribe
API routes, `error-log-service.ts`, `use-ai-keys.ts`, `settings-helpers.ts`, and
`api-fetch.ts`. Cross-checked all "actual values from code" claims digit-for-digit.
The document is unusually precise. Three findings are nitpicks (low severity);
nothing material is wrong.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Diagnostics … attached to every report: environment info + **up to 25 recent error-log entries**" and "`MAX_REPORT_LOGS = 25`" framed as the binding cap. | Client collects ≤25 (`MAX_REPORT_LOGS = 25`, `bug-report.ts:18,118-120`), but the **server** schema accepts up to **30** error logs (`errorLogs: z.array(ErrorLogSchema).max(30)`). The doc states "error logs ≤30" elsewhere (line 255), so it is internally consistent, just worth noting the client cap (25) and server cap (30) differ. | `src/lib/bug-report.ts:18`, `src/app/api/bug-report/route.ts:49` |
| low | Migrations "at store versions **10/11/12** seeding these" (shake fields). | Accurate but incomplete: `version < 10` seeds `shakeToReportEnabled = true`; `version < 11` seeds `shakeThreshold = 15` **and** `shakeRequiredJolts = 3`; `version < 12` re-seeds `shakeThreshold = 8`. So a *migrating* user lands on threshold=8/jolts=3, while a *fresh* user gets the store defaults 10/5 — the two paths diverge. The doc's summary is correct; just does not surface that mismatch. | `src/stores/settings-store.ts:308-318,218-220` |
| low | PII dates: "DD/MM/YYYY, MM/DD/YYYY → `[date]`" listed as two distinct patterns. | There is one regex `\b\d{2}\/\d{2}\/\d{4}\b` that matches both orderings indistinguishably (plus `\b\d{4}-\d{2}-\d{2}\b` for ISO). Functionally correct; the doc implies two separate rules where the code has one ambiguous one. | `src/lib/security.ts:118-120` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | AppUpdatesSection header text is **Capacitor-aware**: "App Version" (native) vs "App Updates" (web); the footer reads "Running v{client} · Checks automatically every 5 min". Doc describes the section generically but omits the title swap and the always-present version footer. | `src/components/settings/app-updates-section.tsx:26,97-99` |
| low | The bug-report server returns several **typed GitHub error codes** not mentioned: `BAD_REPO` (503), `BAD_TOKEN` (502, GitHub 401), `NO_ACCESS` (502, GitHub 403/404), `ISSUES_DISABLED` (502, GitHub 410), plus a generic 502 fallback. Doc only lists `NO_GITHUB_TOKEN` (503), 429, and the empty-after-sanitize 400. | `src/app/api/bug-report/route.ts:334-390` |
| low | Server reads repo from `GITHUB_REPO` env (falls back to `DEFAULT_REPO`), and validates the `owner/repo` slug shape. Doc states the default repo but not the env override / validation. | `src/app/api/bug-report/route.ts:330-339` |
| low | AI structuring has a **two-pass tool-forcing fallback**: if the first `messages.create` returns no `tool_use` block, it retries with `tool_choice: {type:"tool"}`; returns null (→ template) if still absent or schema-invalid. Doc says "Claude restructures" but omits the retry/validation robustness. | `src/app/api/bug-report/route.ts:166-189` |
| low | The full `StructuredSchema` carries `title`, `summary`, `stepsToReproduce[]`, `expected`, `actual`, `severity`. Doc highlights only the `severity` enum; the other structured fields (and their assembly into `## Steps to reproduce` / `## Expected` / `## Actual` / `_Severity hint:_` sections) are not enumerated. | `src/app/api/bug-report/route.ts:56-63,239-258` |
| low | `useToast()` also exposes a top-level `dismiss(toastId?)` and the `toast()` return exposes `{id, dismiss, update}`. Doc covers `toast()` + variants but not the imperative dismiss/update handles. | `src/hooks/use-toast.ts:160-184` |
| low | The body assembler tags voice reports: footer becomes "Filed via the in-app reporter **(voice-dictated)**" when a transcript is present. Doc notes the transcript field but not this provenance marker. | `src/app/api/bug-report/route.ts:267-269,326` |

## Spot-confirmed

- Welcome flag key `intake-tracker-welcome-seen`, localStorage only, set to `"true"` on dismiss; gate `localStorage.getItem(WELCOME_SEEN_KEY) !== "true"`. `src/lib/constants.ts:10`, `src/components/welcome-dialog.tsx:34,41`
- Welcome never renders on `/auth*` — `pathname.startsWith("/auth")` → `return null`. `src/components/welcome-dialog.tsx:30,45`
- Device-aware help hint via `window.matchMedia("(pointer: coarse)")`; touch → Hand + "Just shake your phone", desktop → LifeBuoy + "Open the Help section in Settings". `src/components/welcome-dialog.tsx:37,61-69`
- `onOpenChange={(next) => !next && dismiss()}` — overlay/Esc persist the flag. `src/components/welcome-dialog.tsx:48`
- About: `appVersion` default `0.0.0`, `gitSha` default `local`, `shortSha = gitSha.slice(0,7)`. `src/components/about-dialog.tsx:16-17,34`
- `getEnvLabel`: production→Production/green, preview→Preview/amber, default→Development/blue; keyed on `NEXT_PUBLIC_VERCEL_ENV` (default `"development"`). `src/components/about-dialog.tsx:18,20-29`
- AboutDialog is the Settings-footer trigger (after "Reset to Defaults"), ghost button "About App" + Info icon. `src/app/settings/page.tsx:146-156`, `src/components/about-dialog.tsx:39-45`
- Bug reporter modes bug/feature toggle Bug/Lightbulb icons; titles "Report a bug"/"Request a feature"; mode-specific labels, placeholders, descriptions. `src/components/report-bug-dialog.tsx:198-249`
- Voice dictation only when `groqConfigured`; appends transcribed text to both `description` and `transcript` newline-joined. `src/components/report-bug-dialog.tsx:110-113,254`
- AI toggle "Improve with AI" only when `anthropicConfigured`; `effectiveUseAi = useAi && anthropicConfigured`. `src/components/report-bug-dialog.tsx:125,276`
- Diagnostics preview live counts `(${env.length} env fields, ${logs.length} log entries)`; "Collecting diagnostics…" while loading; submit gated by `diagnosticsReady = env !== null && logs !== null`. `src/components/report-bug-dialog.tsx:126,129-130,304-319`
- AI-key status appended at submit: "AI: Anthropic key" / "AI: Groq key" → configured/not. `src/components/report-bug-dialog.tsx:133-142`
- Success view: CheckCircle2, "Report filed", "Issue #N was created on GitHub", external "View issue #N" link, "Done". `src/components/report-bug-dialog.tsx:171-194`
- Manual promo card: BookOpen, "Wanna read the manual?", closes dialog + `router.push("/help")`. `src/components/report-bug-dialog.tsx:359-382`
- Reset effect depends only on `[open]`; comment confirms it deliberately avoids wiping a draft on late prop changes. `src/components/report-bug-dialog.tsx:79-93`
- `canSubmit = description.trim().length > 0 && !submit.isPending && diagnosticsReady`; submitting → spinner + "Filing…", Cancel disabled while pending. `src/components/report-bug-dialog.tsx:129-130,349-356`
- ShakeToReport mounted once in providers; `enabled: enabled && !open`; `defaultType="bug"`; renders null when `!enabled && !open`. `src/components/shake-to-report.tsx:22-27,42-44`, `src/app/providers.tsx:96`
- Shake detector is magnitude-based (rotation-invariant), jolts within `windowMs`, respects `cooldownMs`, ignores null acceleration samples, sample throttle `SAMPLE_THROTTLE_MS = 60`. `src/hooks/use-shake-gesture.ts:66-101,139,143-148`
- Hook defaults threshold=8, requiredJolts=3, windowMs=800, cooldownMs=3000. `src/hooks/use-shake-gesture.ts:122-125`
- Store defaults shakeToReportEnabled=true, shakeThreshold=10, shakeRequiredJolts=5; sanitizers clamp 4–20 / 2–8. `src/stores/settings-store.ts:218-220,430-432`
- iOS gesture handling: `motionPermissionNeeded()` (requestPermission is a function), requested once on first `pointerdown`; non-iOS returns "granted". `src/hooks/use-shake-gesture.ts:17-42`, `src/components/shake-to-report.tsx:33-40`
- Settings shake toggle requests permission; on "denied" shows destructive toast ("Motion access blocked") and does NOT enable. `src/components/settings/report-bug-section.tsx:37-53`
- Threshold input range 4–20 / step 1 (copy "Lower = more sensitive"); jolts 2–8 / step 1 (copy "Higher = fewer accidental triggers"); window described "~0.8s". `src/components/settings/report-bug-section.tsx:101-180`
- Update banner: hidden unless `isUpdateAvailable`; "Update available", web copy "v{X} is available — tap to refresh" vs Capacitor "v{X} available — update from Play Store"; Update button hidden in Capacitor; X dismiss. `src/components/update-notification.tsx:13,36-53`
- `useVersionCheck`: `CHECK_INTERVAL_MS = 5*60*1000`, initial 3s setTimeout, `cache:"no-store"`, `applyUpdate` reloads only when not Capacitor, newly-detected version clears `dismissed`. `src/hooks/use-version-check.ts:7,29,42,51-55,62-68`
- AppUpdatesSection toasts: "Update available", "You're up to date", "Check failed" (destructive). `src/components/settings/app-updates-section.tsx:62-79`
- ErrorBoundary persists via dynamic import → `rawConsoleError(...)` + `logError("error-boundary", …)`; dev-only mono error block under `NODE_ENV === "development"`; actions Try Again / Reload Page / Go Home / Report this problem; `CRASH_REPORT_KEY = "intake-tracker:crash-report"` (sessionStorage). `src/components/error-boundary.tsx:8,34-43,58-73,97-103`
- Crash pre-fill on `/settings`: reads + removes sessionStorage key, assembles "Reporting a crash." + error + stack, opens reporter `defaultType="bug"`. `src/app/settings/page.tsx:39,53-68,139-144`
- `withErrorBoundary(Component, fallback)` HOC + custom `fallback` prop. `src/components/error-boundary.tsx:77-79,151-162`
- Toast: `TOAST_LIMIT = 1`, `TOAST_REMOVE_DELAY = 1000000`, module-level reducer/store + listeners, variants default/destructive/success(green). `src/hooks/use-toast.ts:6-7,72-134`, `src/components/ui/toast.tsx:30-35`
- Toaster mounted in root layout; UpdateNotification mounted in layout; swipe-to-dismiss via Radix data-swipe states. `src/app/layout.tsx:102-103`, `src/components/ui/toast.tsx:27`
- `collectEnvironmentInfo` fields: App version, Build env, Mode (Capacitor (native)/Web), DB version (DB_SCHEMA_VERSION=21), Device ID, Timezone, Locale, Online (yes/no), User agent, Screen (`W×H @ Nx`), Viewport (`W×H`), Storage (`usage / quota`). `src/lib/bug-report.ts:77-114`, `src/lib/db.ts:906`
- `formatBytes` units: `< 1024` → "B", then KB/MB/GB. `src/lib/bug-report.ts:59-70`
- `collectRecentErrorLogs` swallows Dexie failures (returns []); `storage.estimate()` rejection skips the field. `src/lib/bug-report.ts:108-111,130-135`
- GitHub labels: bug `["type: bug","needs-triage","source: in-app"]`, feature `["type: feature","needs-triage","source: in-app"]`; full taxonomy spans type/status/priority/area/agent/source namespaces. `src/lib/github-labels.ts:20-69`
- Server: `DEFAULT_REPO = "RyRy79261/intake-tracker"`, `ISSUE_BODY_MAX = 60000`, `STACK_MAX_IN_BODY = 1200`, rate limiter `createRateLimiter(10)` (default 60s window), AI model `CLAUDE_MODELS.fast` (`claude-haiku-4-5-20251001`), temperature 0, max_tokens 1024, 60s timeout. `src/app/api/bug-report/route.ts:25-27,110,143-153`, `src/app/api/_shared/rate-limit.ts:41`, `src/app/api/ai/_shared/claude-client.ts:25-26`
- Server schema limits: description max 5000, transcript max 5000, environment ≤40, errorLogs ≤30; empty-after-sanitize → 400; missing GITHUB_TOKEN → 503 `NO_GITHUB_TOKEN`; rate limit → 429. `src/app/api/bug-report/route.ts:44-50,280-316`
- `StructuredSchema.severity` enum: critical | high | medium | low (optional). `src/app/api/bug-report/route.ts:62`
- PII redaction (`redactPii` via `sanitizeReportText`): emails→[email], intl+US phones→[phone], SSN→[ssn], cards→[card], dates→[date], 13-digit→[id-number]; SYSTEM_PROMPT tells the model placeholders may appear and to leave them as-is. `src/lib/security.ts:106-123,137-140`, `src/app/api/bug-report/route.ts:107`
- Fallback template: title = first line of description sliced to 100 chars, else "Bug report"/"Feature request"; backtick fences defused via `fenced()`. `src/app/api/bug-report/route.ts:196-198,259-265`
- `installErrorCapture` patches `console.error`/`console.warn`; `rawConsoleError` bound from the original before patching. `src/lib/error-log-service.ts:23-27,135,164-177`

## Low-confidence / could-not-verify

- Doc line 25/56 "with AI-key status appended" — confirmed the dialog appends AI-key EnvFields at submit (`report-bug-dialog.tsx:133-142`); however these are appended client-side at submit time, **not** by `collectEnvironmentInfo` itself, even though the doc's Sub-components note lists them under `collectEnvironmentInfo`. Minor placement nuance, not counted as an inaccuracy.
- "PII redaction (two passes)" — client pass: the client does NOT redact the description before sending; it only trims. The two-pass framing holds for the *diagnostics environment/log text* (the preview note promises stripping and the server strips via `sanitizeReportText`), and the server re-strips the description. The client-side description itself is sent raw and sanitized only server-side. Treated as a wording nuance rather than a hard inaccuracy since the server guarantees redaction; flagging here for transparency. `src/components/report-bug-dialog.tsx:143-164`, `src/app/api/bug-report/route.ts:310`
