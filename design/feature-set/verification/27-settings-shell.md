# Verification — 27-settings-shell

**Verdict:** accurate · checked 78 claims, verified 75.

The brief is a faithful, high-fidelity description of the settings shell, account block,
reset/about footer, and crash hand-off. Every accordion group (order/value/icon/label/color),
the full `defaultSettings` payload (digit-for-digit, incl. substanceConfig), the sign-out
teardown sequence, the `getEnvLabel` env-badge variants, and the crash-report constant all match
the source exactly. The only deviations are two small layout-class details and one nuance about
where the `max-w-lg` container lives.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | Page is "Rendered inside the global app container: … centered `max-w-lg`, `px-4 pt-6`". | The `max-w-lg px-4 pt-6` container in `layout.tsx` wraps only `<AppHeader />`. Page **content** (children, incl. settings) is wrapped by `SwipeNav` in a `container mx-auto max-w-lg px-4 pb-6` div — i.e. `pb-6`, not `pt-6`. The `pt-6` value belongs to the header container only. | `src/app/layout.tsx:94`; `src/components/swipe-nav.tsx:219` |
| low | Accordion group "chevron pointing down" rotates via `[data-state=open]>svg]:rotate-180`. | Correct mechanism, but the real class is `[&[data-state=open]>svg]:rotate-180` (note the `&` prefix). Doc dropped the `&`. Behaviorally identical; transcription nit. | `src/components/ui/accordion.tsx:31` |
| low | Close auto-opened report dialog → "description retained in state until unmount." | `ReportBugDialog` keeps `description` in state on close because the reset effect early-returns when `!open` (`if (!open) return`), so it is retained until the **next open** (which resets it) or unmount — not strictly "until unmount." Practically accurate; slightly imprecise on the boundary. | `src/components/report-bug-dialog.tsx:79-82` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `useAuth()` returns a third field `name` (`"name" in user ? user.name : user.email`) in the user object. Doc's data-model section mentions `{id,email,name}` but the account-block description only uses `email`; the `name` fallback-to-email logic is undocumented (not surfaced in UI, so low impact). | `src/components/auth-guard.tsx:54-62` |
| low | `useAuthGate()` and a pass-through `AuthGuard` component are exported from the same `auth-guard.tsx` file. Not used by the settings shell (settings page has no auth gate — it always renders), so the omission is correct scoping, noted for completeness. | `src/components/auth-guard.tsx:65-77` |
| low | The Capacitor token path calls `/api/auth/validate` and on failure calls `clearAuthToken()`; doc mentions the path but not the token-clear side-effect. Minor. | `src/components/auth-guard.tsx:31-40` |
| low | `aiAuthSecret` is stored **obfuscated** (`obfuscateApiKey`) via `setAiAuthSecret`, and `resetToDefaults` resets it to the raw `""`. Doc lists `aiAuthSecret: ""` as a default (correct) but does not note the obfuscation wrapper — out of shell scope but adjacent. | `src/stores/settings-store.ts:370-374,196` |

## Spot-confirmed

- Route `/settings`, title **"Settings"**, subtitle **"Configure preferences"** — `src/lib/nav-routes.ts:16`.
- Gradient `from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900`, `min-h-screen` — `src/app/layout.tsx:93`.
- Account block wrapped in `pb-6`; `<AccountSection />` rendered above accordion — `src/app/settings/page.tsx:80-82`.
- `useAuth()` returns `{ ready, authenticated, user }`; loading → `ready:false`; Neon `useSession` + Capacitor token validation — `src/components/auth-guard.tsx:10,43-63`.
- Loading state: centered `Loader2` spin, `p-6 rounded-lg bg-slate-50 dark:bg-slate-900 border` — `src/components/settings/account-section.tsx:13-19`.
- Signed-out: "Not signed in" + "Sign in to unlock:" + 3 benefits (Sparkles/amber-500, Bell/blue-500, CloudUpload/emerald-500); full-width "Sign In" with `LogIn`; `router.push("/auth")` — `account-section.tsx:21-52`.
- Signed-in: `user?.email ?? "Signed in"`, "Signed in via Neon Auth", outline destructive Sign Out (`text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30`) → `handleSignOut` — `account-section.tsx:55-73`.
- `<Accordion type="single" collapsible className="pb-8">` — single-open, collapsible — `src/app/settings/page.tsx:84`.
- 10 groups, exact order/value/icon/label/color all match the doc table — `src/app/settings/page.tsx:85-136`:
  ai-features/Sparkles/amber, data-storage/Database/amber, tracking/Activity/indigo, customization/Palette/cyan, medication/Pill/teal, privacy-security/Shield/emerald, system/Download/sky, help/BookOpen/sky, feedback/MessageSquare/rose, debug/Bug/slate.
- Group composition map fully matches, incl. conditional `{sugarEnabled && <SugarSettingsSection/>}` and `{potassiumEnabled && <PotassiumSettingsSection/>}` — `src/app/settings/page.tsx:94-104`.
- `SettingsAccordionGroup`: content stack `space-y-6 pl-2 pb-2`; trigger `px-2 py-3 hover:no-underline`; `border-b` from `AccordionItem` — `settings-accordion-group.tsx:24,31`; `accordion.tsx:17`.
- `ExpandableSettingsSection` is a Radix `Collapsible` (independent, multi-open); `defaultOpen=false`; chevron `transition-transform duration-200` + `rotate-180` when open; body `pl-6 pt-4`; header `hover:opacity-80 transition-opacity`; `headerRight` outside the trigger button — `expandable-settings-section.tsx:22,28,40-51`.
- Crash hand-off: `CRASH_REPORT_KEY = "intake-tracker:crash-report"`; reads sessionStorage, `removeItem` immediately, parses `{message,stack}`, builds description starting `"Reporting a crash."` then `\n\nError: …` / `\n\n<stack>`, opens dialog; `catch {}` swallows — `src/app/settings/page.tsx:39,53-68`.
- `ReportBugDialog` opened with `defaultType="bug"` + `defaultDescription={crash.description}`; `onOpenChange` sets `open` — `src/app/settings/page.tsx:139-144`; props default `defaultType="bug"` — `report-bug-dialog.tsx:56`.
- Footer: `pt-4 border-t space-y-2`; Reset = ghost button → `settings.resetToDefaults()` + toast `{title:"Settings reset", description:"All settings have been restored to defaults"}`; no confirm dialog — `src/app/settings/page.tsx:70-76,146-156`.
- `handleSignOut`: `stopEngine()` → `detachLifecycleListeners()` → `useSyncStatusStore.setState({lastError:null, isSyncing:false})` → `Promise.race([signOut(), 3000ms timeout])` → `window.location.href="/auth"` regardless — `src/lib/sign-out.ts:6-21`; targets exist at `sync-engine.ts:553,571`, `sync-status-store.ts:29,46-48`.
- About dialog: ghost trigger "About App" (`Info` icon); circular `bg-sky-100 dark:bg-sky-900/40` badge with `Droplets text-sky-600 dark:text-sky-400`; title "Intake Tracker"; description "A comprehensive personal medical tracker for hydration, nutrition, vitals, and medications."; two author paragraphs (chronic-condition origin + AI-cost note) — `about-dialog.tsx:38-69`.
- About metadata: Version = `NEXT_PUBLIC_APP_VERSION || "0.0.0"` (mono); Build = `gitSha === "local" ? "local" : gitSha.slice(0,7)` (mono); Environment colored badge — `about-dialog.tsx:16-17,34,70-83`.
- `getEnvLabel` env variants exact: production→"Production" `bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`; preview→"Preview" amber; default→"Development" blue — `about-dialog.tsx:20-29`.
- `resetToDefaults: () => set(defaultSettings)` — replaces whole state — `settings-store.ts:458`.
- `SETTINGS_PERSIST_VERSION = 16`, persist `name: "intake-tracker-settings"`, localStorage, migrate via `migrateSettings`; migration seeds `optionalTrackers` (v<15), extended buffers (v<16), shake params (v<10/11/12) — `settings-store.ts:255,331-337,461-465`.
- `defaultSettings` payload digit-for-digit: waterIncrement 250, saltIncrement 250, weightIncrement 0.05, waterLimit 1000, saltLimit 1500, sugarLimit 30, potassiumLimit 3500, waterExtendedBuffer 500, saltExtendedBuffer 500, sugarExtendedBuffer 10, optionalTrackers {sugar:true, potassium:false}, aiAuthSecret "", theme "system", dataRetentionDays 90, dayStartHour 2, showQuickNav true, quickNavOrder "rtl", quickNavItems DEFAULT_QUICK_NAV_ITEMS, scrollDurationMs 300, autoHideDelayMs 500, barTransitionDurationMs 200, swipeNavDistanceThresholdPct 28, swipeNavVelocityThreshold 500, urinationDefaultAmount "small", defecationDefaultAmount "medium", weightGraph* true×4, liquidPresets DEFAULT_LIQUID_PRESETS, storageMode "local", analyticsIntroSeen false, shakeToReportEnabled true, shakeThreshold 10, shakeRequiredJolts 5, primaryRegion "", secondaryRegion "", timeFormat "24h", doseRemindersEnabled false, reminderFollowUpCount 2, reminderFollowUpInterval 10 — `settings-store.ts:182-226`.
- substanceConfig digit-for-digit: caffeine enabled — Coffee 95/250, Espresso 63/30, Tea 47/250, Other 80/250; alcohol enabled — Beer 1/330, Wine 1/150, Spirits 1/45, Other 1/250 — `settings-store.ts:227-246`.
- `useOptionalTrackerEnabled` gates Sugar/Potassium (fully unmounted when off, not disabled) — `src/lib/optional-trackers.ts:67-69`; `src/app/settings/page.tsx:99-100`.
- Debug group always rendered (no production gate) — `src/app/settings/page.tsx:134-136`.

## Low-confidence / could-not-verify

- The brief's claim that the account block "depends on network … when session can't be fetched it resolves to signed-out CTA" is consistent with `useAuth` resolving `ready:true, authenticated:false` once `isPending` clears, but the actual offline fetch-failure path lives in `@neondatabase/auth`'s `useSession` (not in-repo) — behavior is plausible but not directly provable from the repo source.
- "Page chrome … auto-hiding header/footer driven by `scrollDurationMs`/`autoHideDelayMs`/`barTransitionDurationMs`" — these settings exist and are global; the auto-hide wiring is in header/floating-bar components outside this unit's listed files, so confirmed only at the settings-definition level, not the consuming animation logic.
