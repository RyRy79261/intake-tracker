# 27 — Settings Shell + Account

**Files covered:**
- `src/app/settings/page.tsx`
- `src/components/settings/settings-accordion-group.tsx`
- `src/components/settings/expandable-settings-section.tsx`
- `src/components/settings/account-section.tsx`
- `src/components/about-dialog.tsx`
- `src/lib/sign-out.ts`
- `src/components/ui/accordion.tsx`
- `src/components/auth-guard.tsx` (`useAuth`)
- `src/hooks/use-settings.ts` + `src/stores/settings-store.ts` (`resetToDefaults` / `defaultSettings`)
- `src/lib/nav-routes.ts` (page chrome), `src/app/layout.tsx` (page container)

**Purpose:** The Settings screen scaffold — a single-page, mobile-first settings index. It renders a persistent account/sign-in block at the top, a single-open accordion of 10 themed top-level groups (each containing one or more nested expandable sub-sections), and a footer pair of global actions: "Reset to Defaults" and an "About App" dialog. This unit is the *shell + account + reset/about*; the inner section bodies (water, salt, AI keys, etc.) are documented in their own briefs.

---

## Features

### Page chrome (from layout + nav-routes)
- Route `/settings`. Header title **"Settings"**, subtitle **"Configure preferences"** (`nav-routes.ts`).
- Rendered inside the global app container: `min-h-screen`, gradient background (`from-slate-50 to-slate-100` light / `from-slate-950 to-slate-900` dark), centered `max-w-lg` (mobile-first single column). Note: `layout.tsx`'s `container mx-auto max-w-lg px-4 pt-6` div wraps only `<AppHeader />`; the page **content** (children, incl. settings) is wrapped by `SwipeNav` in a separate `container mx-auto max-w-lg px-4 pb-6` div (`pb-6`, not `pt-6`).
- Shares the auto-hiding header/footer chrome of the rest of the app (driven by `scrollDurationMs` / `autoHideDelayMs` / `barTransitionDurationMs` settings).

### Account block (always at top, outside the accordion)
- Reads auth state via `useAuth()` → `{ ready, authenticated, user }` (Neon Auth session, plus Capacitor token validation path). The `user` object carries `{ id, email, name }`, where `name` falls back to the email (`"name" in user ? user.name : user.email`); the account block only surfaces `email`, so the `name` field is unused by this UI.
- The Capacitor token path calls `/api/auth/validate`; on a failed/invalid response it calls `clearAuthToken()` (drops the stored native token).
- Three mutually exclusive presentations: **loading**, **signed-out (marketing CTA)**, **signed-in (identity + sign out)**.
- Signed-out state lists three locked benefits: AI food & drink parsing, Dose reminder notifications, Cloud sync across devices.
- Signed-in state shows the user email and the provider label "Signed in via Neon Auth", plus a destructive Sign Out button.
- Wrapped in `pb-6` spacing above the accordion.

### Accordion of top-level groups
- Single shared Radix `Accordion` with `type="single"` and `collapsible` — **only one group open at a time**; clicking the open one collapses it (all collapsed is a valid state). `className="pb-8"`.
- 10 groups, each a `SettingsAccordionGroup` (icon + colored label trigger + content slot).
- Each group renders one or more child sub-sections in a `space-y-6 pl-2 pb-2` stack.
- Two child sub-sections are **conditionally rendered**: `SugarSettingsSection` only when the `sugar` optional tracker is enabled, `PotassiumSettingsSection` only when `potassium` is enabled (`useOptionalTrackerEnabled`).

### Nested expandable sub-sections
- Inner sections use `ExpandableSettingsSection` — an independent Radix `Collapsible` (NOT part of the single-open accordion). Multiple sub-sections inside one group can be open simultaneously.
- Each has an icon, colored label, optional `headerRight` slot (e.g. an inline toggle/switch), `defaultOpen` flag (default `false`), and a chevron that rotates 180° when open.

### Crash-report hand-off
- On mount, the page reads `sessionStorage["intake-tracker:crash-report"]` (set by the global ErrorBoundary crash screen before it navigates here).
- If present: removes the key, parses `{ message, stack }`, builds a pre-filled description ("Reporting a crash." + error + stack), and **auto-opens the `ReportBugDialog`** with `defaultType="bug"`.
- Malformed/unavailable sessionStorage is swallowed silently.

### Global footer actions
- **Reset to Defaults** — calls `settings.resetToDefaults()` (replaces the entire Zustand settings state with `defaultSettings`) and fires a success toast ("Settings reset" / "All settings have been restored to defaults").
- **About App** — opens the About dialog (app description, author note, version / environment / build metadata).
- Both sit in a top-bordered `pt-4 border-t space-y-2` footer block.

### About dialog
- Triggered by a ghost button "About App".
- Header: circular sky-tinted Droplets badge, title "Intake Tracker", description "A comprehensive personal medical tracker for hydration, nutrition, vitals, and medications."
- Two author paragraphs (chronic-condition origin story; AI-features-cost note).
- Three metadata rows in muted pill rows: **Version** (`NEXT_PUBLIC_APP_VERSION` || `0.0.0`, mono), **Environment** (colored badge — see enums), **Build** (`NEXT_PUBLIC_GIT_SHA` short 7-char || `local`, mono).

---

## User actions & interactions

| Action | Result |
|---|---|
| Tap an accordion group trigger | Expands that group; auto-collapses any other open group (single-open). |
| Tap the currently-open group trigger | Collapses it (no group open). |
| Tap a nested sub-section header | Toggles that sub-section independently (collapsible); chevron rotates 180°. |
| Tap **Sign In** (signed-out) | `router.push("/auth")`. |
| Tap **Sign Out** (signed-in) | `handleSignOut()`: stops sync engine, detaches lifecycle listeners, clears sync error/`isSyncing`, calls `signOut()` (3s timeout race), then hard-redirects `window.location.href = "/auth"` regardless of success. |
| Tap **Reset to Defaults** | Restores all settings to `defaultSettings`; shows success toast. No confirm dialog. |
| Tap **About App** | Opens About dialog. |
| Tap outside / Esc on About dialog | Closes dialog. |
| Arrive from crash screen | `ReportBugDialog` auto-opens pre-filled with the captured error message + stack. |
| Close the auto-opened report dialog | `onOpenChange` sets `open: false`; the reset effect early-returns when `!open` (`if (!open) return`), so the `description` is retained in state until the **next open** (which resets it) or unmount. |
| Toggle a sub-section `headerRight` control (per-section) | Section-specific (e.g. enabling sugar tracker reveals `SugarSettingsSection` in the Tracking group). |

- All interactions are tap-based (mobile-first). No swipe/drag/long-press on the shell itself. Accordion/collapsible are keyboard-accessible via Radix (Enter/Space toggles, focus ring).

---

## States & presentations

### Account block states
- **Loading (`ready === false`):** centered spinner (`Loader2` spin) in a slate card (`bg-slate-50 dark:bg-slate-900 border`, `p-6 rounded-lg`). No identity, no buttons.
- **Signed-out (`authenticated === false`):** slate card titled "Not signed in" + "Sign in to unlock:" + 3-item benefit list (Sparkles/amber = AI parsing, Bell/blue = dose reminders, CloudUpload/emerald = cloud sync). Full-width primary "Sign In" button with LogIn icon.
- **Signed-in:** slate card showing `user.email` (falls back to "Signed in" if no email) + "Signed in via Neon Auth" subtext. Full-width outline destructive "Sign Out" button (red text, red hover bg).

### Accordion group states
- **Collapsed (default):** trigger row only — icon + bold label, chevron pointing down.
- **Expanded:** content animates open (`animate-accordion-down`), chevron rotates 180° (`[&[data-state=open]>svg]:rotate-180`); children stacked.
- Trigger has `hover:no-underline` (overrides default accordion hover underline), `px-2 py-3`. Each group separated by bottom border (`border-b` from `AccordionItem`).

### Nested sub-section states
- **Closed (default):** header only; chevron down, `text-muted-foreground`.
- **Open:** content slides down (`animate-accordion-down`), chevron rotates 180° over 200ms; body indented `pl-6 pt-4`.
- Header button has `hover:opacity-80 transition-opacity`; whole header tinted by the section's `iconColorClass`.
- Optional `headerRight` element sits to the right of the trigger, outside the toggle button.

### Conditional sub-section visibility
- Sugar / Potassium sub-sections are **present or absent** depending on the optional-tracker toggles — not disabled, fully unmounted when off.

### About dialog states
- Closed (default) / Open.
- Environment badge color varies by env (3 variants — see enums).
- Build row shows `local` when no git SHA injected.

### Global / cross-cutting
- **Offline:** shell is fully client-rendered from Zustand/localStorage — renders identically offline. Only the account block depends on network (auth session); when session can't be fetched it resolves to signed-out CTA.
- **Reset success:** toast notification (no inline state change on the shell besides re-rendered child sections reflecting defaults).
- **No skeleton for the shell itself** — only the account block has a loading spinner. Settings values render synchronously from persisted store.

---

## Enums, options & configurable values

### Top-level accordion groups (order, value, icon, label, icon color)
| Order | `value` | Icon | Label | Icon color class |
|---|---|---|---|---|
| 1 | `ai-features` | Sparkles | **AI features** | `text-amber-600 dark:text-amber-400` |
| 2 | `data-storage` | Database | **Data & Storage** | `text-amber-600 dark:text-amber-400` |
| 3 | `tracking` | Activity | **Tracking** | `text-indigo-600 dark:text-indigo-400` |
| 4 | `customization` | Palette | **Customization** | `text-cyan-600 dark:text-cyan-400` |
| 5 | `medication` | Pill | **Medication** | `text-teal-600 dark:text-teal-400` |
| 6 | `privacy-security` | Shield | **Privacy & Security** | `text-emerald-600 dark:text-emerald-400` |
| 7 | `system` | Download | **System** | `text-sky-600 dark:text-sky-400` |
| 8 | `help` | BookOpen | **Help & Manual** | `text-sky-600 dark:text-sky-400` |
| 9 | `feedback` | MessageSquare | **Feedback** | `text-rose-600 dark:text-rose-400` |
| 10 | `debug` | Bug | **Debug** | `text-slate-600 dark:text-slate-400` |

### Child sub-sections per group (composition map)
- **AI features:** `AiKeysSection`.
- **Data & Storage:** `StorageInfoSection`, `DataManagementSection`.
- **Tracking:** `DaySettingsSection`, `WaterSettingsSection`, `SaltSettingsSection`, `OptionalTrackersSection`, *(`SugarSettingsSection` if sugar on)*, *(`PotassiumSettingsSection` if potassium on)*, `WeightSettingsSection`, `LiquidPresetsSection`, `UrinationDefecationDefaults`.
- **Customization:** `AppearanceSection`, `QuickNavSection`, `AnimationTimingSection`, `SwipeNavSection`.
- **Medication:** `MedicationSettingsSection`.
- **Privacy & Security:** `PermissionsSection`, `MedicalAiSection`.
- **System:** `AppUpdatesSection`.
- **Help & Manual:** `HelpSection`.
- **Feedback:** `ReportBugSection`.
- **Debug:** `DebugPanel`.

### Account benefit list (signed-out)
- "AI food & drink parsing" (Sparkles, `text-amber-500`)
- "Dose reminder notifications" (Bell, `text-blue-500`)
- "Cloud sync across devices" (CloudUpload, `text-emerald-500`)
- Provider label (signed-in): "Signed in via Neon Auth"

### About dialog — environment badge variants (`getEnvLabel`)
| `NEXT_PUBLIC_VERCEL_ENV` | Label | Badge classes |
|---|---|---|
| `production` | **Production** | green (`bg-green-100 text-green-800` / dark `bg-green-900/40 text-green-300`) |
| `preview` | **Preview** | amber (`bg-amber-100 text-amber-800` / dark `bg-amber-900/40 text-amber-300`) |
| default (e.g. `development`) | **Development** | blue (`bg-blue-100 text-blue-800` / dark `bg-blue-900/40 text-blue-300`) |

Other About values: Version = `NEXT_PUBLIC_APP_VERSION || "0.0.0"`; Build = `NEXT_PUBLIC_GIT_SHA` sliced to 7 chars, or `"local"`.

### Accordion behavior config
- `type="single"`, `collapsible` (all-collapsed allowed).
- `ExpandableSettingsSection` props: `defaultOpen` default `false`; chevron transition `duration-200`.

### Crash-report constant
- `CRASH_REPORT_KEY = "intake-tracker:crash-report"` (sessionStorage key).
- `ReportBugDialog` defaults when crash-triggered: `defaultType="bug"`.

### Sign-out timeout
- `signOut()` raced against a **3000ms** timeout; on timeout/error it still redirects.

### Reset-to-defaults payload (`defaultSettings`, the values restored)
A flat reset to these defaults (full enum source for what "default" means here):
- `waterIncrement: 250`, `saltIncrement: 250`, `weightIncrement: 0.05`
- `waterLimit: 1000`, `saltLimit: 1500`, `sugarLimit: 30`, `potassiumLimit: 3500`
- `waterExtendedBuffer: 500`, `saltExtendedBuffer: 500`, `sugarExtendedBuffer: 10`
- `optionalTrackers: { sugar: true, potassium: false }`
- `aiAuthSecret: ""` (note: in normal use this value is stored **obfuscated** via `setAiAuthSecret`/`obfuscateApiKey` and read back via `getDeobfuscatedAuthSecret`; `resetToDefaults` restores it to the raw `""`)
- `theme: "system"` (enum: `light` | `dark` | `system`)
- `dataRetentionDays: 90`, `dayStartHour: 2`
- `showQuickNav: true`, `quickNavOrder: "rtl"` (enum: `ltr` | `rtl`), `quickNavItems: DEFAULT_QUICK_NAV_ITEMS`
- `scrollDurationMs: 300`, `autoHideDelayMs: 500`, `barTransitionDurationMs: 200`
- `swipeNavDistanceThresholdPct: 28`, `swipeNavVelocityThreshold: 500`
- `urinationDefaultAmount: "small"`, `defecationDefaultAmount: "medium"` (enum each: `small` | `medium` | `large`)
- `weightGraphShowEating/Urination/Defecation/Drinking: true`
- `liquidPresets: DEFAULT_LIQUID_PRESETS`
- `storageMode: "local"` (enum: `local` | `cloud-sync`)
- `analyticsIntroSeen: false`
- `shakeToReportEnabled: true`, `shakeThreshold: 10`, `shakeRequiredJolts: 5`
- `primaryRegion: ""`, `secondaryRegion: ""`
- `timeFormat: "24h"` (enum: `12h` | `24h`)
- `doseRemindersEnabled: false`, `reminderFollowUpCount: 2`, `reminderFollowUpInterval: 10`
- `substanceConfig`: caffeine enabled with types Coffee (95mg/250ml), Espresso (63mg/30ml), Tea (47mg/250ml), Other (80mg/250ml); alcohol enabled with types Beer (1/330ml), Wine (1/150ml), Spirits (1/45ml), Other (1/250ml).

---

## Data model touched

This shell unit reads/writes very little data directly; it mostly composes child sections. Direct touches:

- **Zustand settings store** (`settings-store.ts`, persisted to `localStorage` key `intake-tracker-settings`, `version: 16`): the shell calls only `resetToDefaults()` (replaces entire state with `defaultSettings`). The full `Settings` interface is the surface restored. Child sections read/write individual fields.
- **Optional-tracker flags** (`optionalTrackers.{sugar,potassium}` in the store) read via `useOptionalTrackerEnabled` to gate child rendering.
- **Auth session** via `useAuth()` → Neon Auth `useSession()` (`session.user.{id,email,name}`; `name` falls back to email when absent), plus Capacitor token path (`getAuthToken`, `/api/auth/validate`, which calls `clearAuthToken()` on failure). No persistence written by this unit beyond that native token clear.
- **sessionStorage** `intake-tracker:crash-report` (read + delete) for the crash hand-off.
- **Sync engine** side-effects on sign-out: `stopEngine()`, `detachLifecycleListeners()`, `useSyncStatusStore.setState({ lastError: null, isSyncing: false })`.
- About metadata from build-time env vars: `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_GIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`.

No Dexie/IndexedDB tables are touched by the shell itself (child sections like Data Management do).

---

## Validation, edge cases & business rules

- **Single-open accordion:** by design only one top-level group is expanded at a time; nested sub-sections are independent collapsibles (multiple open allowed). Don't conflate the two — an alternative design must preserve "groups single-open, sub-sections multi-open" or deliberately change it.
- **Reset has no confirmation step** — a single tap wipes all preferences to defaults. (A redesign may add a confirm.)
- **Sign-out is fault-tolerant:** redirect to `/auth` happens even if `signOut()` hangs/fails (3s race). Sync teardown always runs first.
- **Account loading guard:** while `ready === false`, neither sign-in nor sign-out is offered (spinner only) to avoid acting on indeterminate auth.
- **Email fallback:** signed-in card shows `"Signed in"` if `user.email` is missing.
- **Conditional sections:** Sugar/Potassium sub-sections must not render when their tracker is off — they are unmounted, not merely hidden/disabled.
- **Crash hand-off is one-shot:** the sessionStorage key is removed immediately on read so a refresh won't re-open the report dialog; parse errors are swallowed.
- **Persist-version migration:** the store auto-migrates older persisted blobs up to `SETTINGS_PERSIST_VERSION = 16` (e.g. seeding `optionalTrackers`, extended buffers, shake params). The shell never sees an un-migrated shape.
- **Env-var defaults:** About dialog never errors on missing env — falls back to `0.0.0` / `local` / Development.
- **No empty/error state for the accordion** — it always renders all 10 groups (Debug always present, even in production builds).

---

## Sub-components / variants

| Component / file | One-line purpose |
|---|---|
| `app/settings/page.tsx` (`SettingsPage` / `SettingsContent`) | The settings index: account block, 10-group accordion, reset/about footer, crash-report hand-off. |
| `settings/settings-accordion-group.tsx` (`SettingsAccordionGroup`) | One top-level accordion item: icon + colored bold label trigger + indented content stack. |
| `settings/expandable-settings-section.tsx` (`ExpandableSettingsSection`) | Reusable nested collapsible sub-section with icon, colored label, optional `headerRight`, rotating chevron. |
| `settings/account-section.tsx` (`AccountSection`) | Account block with loading / signed-out CTA / signed-in identity + sign-out states. |
| `components/about-dialog.tsx` (`AboutDialog`) | "About App" dialog: app blurb, author note, version/environment/build metadata. |
| `lib/sign-out.ts` (`handleSignOut`) | Tears down sync, clears sync status, races `signOut()` against 3s timeout, hard-redirects to `/auth`. |
| `components/ui/accordion.tsx` | shadcn/Radix accordion primitives (`Accordion`, `AccordionItem/Trigger/Content`). |
| `components/auth-guard.tsx` (`useAuth`) | Auth-state hook returning `{ ready, authenticated, user }` (Neon session + Capacitor token path). The same file also exports `useAuthGate()` and a pass-through `AuthGuard` component (`return <>{children}</>`), but the settings shell uses neither — the settings page has no auth gate and always renders. |
| `hooks/use-settings.ts` / `stores/settings-store.ts` | Zustand settings store; the shell uses `resetToDefaults()` → `defaultSettings`. |
| `components/report-bug-dialog.tsx` (`ReportBugDialog`) | Bug/feature-request dialog; auto-opened pre-filled when navigated from a crash. |
| `components/debug-panel.tsx` (`DebugPanel`) | Debug-group child content (diagnostics). |
| Child section components (own briefs) | `AiKeysSection`, `StorageInfoSection`, `DataManagementSection`, `DaySettingsSection`, `WaterSettingsSection`, `SaltSettingsSection`, `OptionalTrackersSection`, `SugarSettingsSection`, `PotassiumSettingsSection`, `WeightSettingsSection`, `LiquidPresetsSection`, `UrinationDefecationDefaults`, `AppearanceSection`, `QuickNavSection`, `AnimationTimingSection`, `SwipeNavSection`, `MedicationSettingsSection`, `PermissionsSection`, `MedicalAiSection`, `AppUpdatesSection`, `HelpSection`, `ReportBugSection` — bodies documented in their respective unit briefs. |
