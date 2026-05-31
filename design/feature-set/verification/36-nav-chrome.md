# Verification — 36-nav-chrome

**Verdict:** minor-gaps  ·  checked 96 claims, verified 90.

Every file listed under "Files covered:" was read in full, plus the related
`src/components/auth-guard.tsx`, `src/lib/settings-helpers.ts`, and the
`src/app/*` route directories to confirm the non-top-route gating. The document
is highly accurate; the discrepancies found are a few cosmetic/numeric overstatements
and some omitted secondary behaviors.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "0.5px bottom indicator" on the active MedTab (Enums §, line 203) and skeleton ("0.5px bottom indicator", line 184 of doc) | Active tab indicator uses Tailwind `h-0.5` = 0.125rem = **2px**, not 0.5px. The `0.5` is the Tailwind spacing token, not pixels. | `src/components/medications/med-footer.tsx:41`; skeleton `src/components/page-skeletons.tsx:197` |
| low | CARD_THEMES "icon color" column lists single values e.g. `sky-600`, `amber-600`, `yellow-700` (lines 189–200) | Code icon colors are dual light/dark, e.g. `text-sky-600 dark:text-sky-400`, `text-yellow-700 dark:text-yellow-400`. Doc lists only the light half. Light values themselves all match. | `src/lib/card-themes.ts:45,67,86,108,148,182,200,233,256` |
| low | "Settings thresholds are clamped by `sanitizeNumericInput` on save … regardless of input" (line 262) | The **settings UI** path (`validateAndSave`) does not clamp out-of-range input — it **reverts to the previous/default value** when input is outside [min,max] (`parsed >= min && parsed <= max ? setter(parsed) : setter(defaultValue)`). Only the store setter itself uses `sanitizeNumericInput` (which clamps). So "clamped … regardless of input" is true for the setter but false for the on-blur UI save, which reverts instead of clamping. | `src/lib/settings-helpers.ts:14-21`; setters `src/stores/settings-store.ts:393-396` |
| low | "Tapping a [quick-nav] button scrolls to that section (custom eased smooth scroll), then auto-hides the chrome after a delay" / "becomes non-interactive" wording implies the footer button itself toggles disabled; voice bar: "clears tracking on blur" (line 94) | `useVisualViewportScroll.handleBlur` clears `activeInputRef` and `focusTimeoutRef` but does **not** clear the pending `resizeTimeoutRef`. So a queued resize-driven scroll can still fire after blur. Minor mismatch with "clears tracking on blur". | `src/hooks/use-keyboard-scroll.ts:105-111` |
| low | Header fallback "falls back to the first route entry if no match" (line 31) is stated as observable behavior | True in code (`?? NAV_ITEMS[0]`), but it is **dead code for title purposes**: the component returns `null` before render whenever `pathname` is not a NAV route (`isTopRoute` guard at line 27-28), so the fallback title is never actually displayed. Cite as low: claim is literally correct but slightly misleading about when it matters. | `src/components/app-header.tsx:24,27-28` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | AuthButton authenticated avatar uses `bg-primary/10 text-primary` and a fixed `w-7 h-7` rounded-full span with `text-sm font-semibold`; doc says "circular avatar badge showing the uppercase first letter" but omits that the badge always carries the primary tint (it is not gated on active state). | `src/components/auth-button.tsx:67` |
| low | `useAuth` returns `user.name` derived as `"name" in user ? user.name : user.email` (falls back to email); doc mentions `user.name` is read but not the email fallback. | `src/components/auth-guard.tsx:60` |
| low | Capacitor-specific auth path: `useAuth` validates a Capacitor session via async fetch and sets `capUser`; entirely unmentioned (not chrome-specific, but part of the auth surface the AuthButton/voice gate depend on). | `src/components/auth-guard.tsx:24-44` |
| low | SwipeNav resets `width` via a `resize` listener and `setWidth(window.innerWidth)`; commit target uses `window.innerWidth || width || 1` fallback chain. Doc describes viewport-width % but omits the width-tracking effect and the `|| 1` guard. | `src/components/swipe-nav.tsx:49-54,136` |
| low | `useScrollHide` `setHeaderHidden(isScrollingDown && !isAtBottomRef.current)` — the at-bottom override is folded directly into header-hidden (not only force-hide clearing). Doc covers force-hide clearing at bottom but not that scroll-down hide is itself suppressed at bottom. | `src/hooks/use-scroll-hide.ts:58` |
| low | MedTabBar (`MedTab` enum) is the in-page tab strip; doc lists the enum and FAB linkage but omits that the bar uses `-mx-4` breakout, `bg-background/95 backdrop-blur-sm`, hover `text-foreground`, and inactive `text-muted-foreground`. | `src/components/medications/med-footer.tsx:24,32-36` |
| low | Voice bar button inner mic chip styling (`bg-sky-100 dark:bg-sky-900/50`, `text-sky-600 dark:text-sky-400`) and `focus-visible:ring-inset` not described beyond "mic icon chip". | `src/components/voice/voice-launch-bar.tsx:63-64` |
| low | Boot shell details omitted/under-specified: spinner is CSS `itrk-spin` 0.8s, fade `200ms`, plus an inline BOOT_WATCHDOG that redirects to `/recover.html` if a prior load hung >12s (separate from the 8s "Reset app" reveal the doc mentions). | `src/app/layout.tsx:27,32-43` |
| low | `smoothScrollTo` accepts an `offset` param (default 0) subtracted from target; doc describes SSR-safety, `<=0` jump, `<1px` resolve, easeInOutCubic but omits the offset parameter. | `src/lib/smooth-scroll.ts:13,23` |
| low | CARD_THEMES has 11 keys; doc table lists all 11 correctly, but omits that `iconBg` (the chip background, e.g. `bg-sky-100 dark:bg-sky-900/50`) is what the footer renders as `bgColor` — doc's footer description says "colored icon chip" without tying it to `theme.iconBg`. | `src/lib/card-themes.ts:44`; `src/components/quick-nav-footer.tsx:42,71` |

## Spot-confirmed

- Header: `sticky top-0 z-40 -mx-4`, gradient + `backdrop-blur-sm`, slides `y: isHidden ? "-100%" : 0`, transition `barTransitionDurationMs/1000`; returns `null` on non-top routes. `src/components/app-header.tsx:28,32-34`
- Header active button highlight `bg-primary/10 text-primary` + colored icon; inactive click `router.push`, active is no-op. `src/components/app-header.tsx:53,56,59`
- AuthButton three states: loading (disabled ghost `User`, `text-muted-foreground/40`), unauthenticated (ghost `User`), authenticated (initial = `(email?.[0] ?? "U").toUpperCase()`), active highlight on `/profile`. `src/components/auth-button.tsx:20-32,34-50,52-53,18`
- SwipeNav constants: `DIRECTION_LOCK_THRESHOLD = 8`, `RESISTANCE = 0.25`, `COMMIT_DURATION = 0.18`, `ENTER_DURATION = 0.22`; commit ease `[0.4,0,0.2,1]`, snap-back ease `[0.22,1,0.36,1]`, non-horizontal spring stiffness 400 damping 40. `src/components/swipe-nav.tsx:15-18,132,153,161`
- SwipeNav prev/next from index, edge resistance for missing neighbor, prefetch both, `navigatingRef` re-entrancy guard, `useLayoutEffect` reset on pathname, `overflow-clip` + skeleton `left: ±100vw` + shared `x`, `touchAction: pan-y`, `[data-no-swipe]` → vertical lock, disabled on non-top routes (no pan handlers). `src/components/swipe-nav.tsx:42-47,57-58,61-71,80-82,108-113,129,178,193,202,210-217`
- Commit logic: `goingPrev = offset.x>0 && prevRoute && (offset.x>threshold || velocity.x>vThreshold)`; threshold = `w * (distancePct/100)`; off-screen tween then `router.push`. `src/components/swipe-nav.tsx:141-157`
- QuickNavFooter: built from enabled `quickNavItems`, label overrides `water→Liquids`/`eating→Food & Salt`, RTL reverse after filter, returns `null` when empty, `fixed bottom-0 z-40`, `y: hidden ? "100%" : 0`, `env(safe-area-inset-bottom)`, button `hover:bg-muted/80 active:scale-95 active:bg-muted` + focus ring. `src/components/quick-nav-footer.tsx:33-49,53-55,65-67`
- HomeFloatingBars renders only on `/` outside swipe transform; VoiceLaunchBar always, QuickNavFooter only when `showQuickNav`. `src/components/home-floating-bars.tsx:22,28-41`
- VoiceLaunchBar: `useAuthGate` (`!ready || authenticated`), `QUICK_NAV_HEIGHT_PX = 76`, bottom offset calc with/without footer, `y: hidden ? "150%" : 0` + `opacity` fade, `disabled`/`tabIndex -1`/`aria-hidden`/`pointer-events-none` when hidden, full-screen Sheet, closes on commit. `src/components/voice/voice-launch-bar.tsx:22,32,34-36,43,49-51,59,78`; gate `src/components/auth-guard.tsx:65-67`
- MedicationsFloatingBars: outside transform, FAB only when `activeTab === "schedule"` and `pathname === "/medications"`, teal-600/hover teal-700/`active:scale-95` `fixed bottom-20 right-4 z-30`, opens wizard, auto-closes wizard on navigate away (tab preserved). `src/components/medications-floating-bars.tsx:24-30,34-44`
- PageSkeleton dispatcher routes `/profile`, `/`, `/medications`, `/analytics`, `/settings`; aria-hidden via SwipeNav wrapper. `src/components/page-skeletons.tsx:371-380`
- useScrollHide: down trigger `current > previous && current > 50`, at-bottom tolerance `scrollHeight - (innerHeight + scrollTop) <= 10` via passive native listener ref, `handleQuickNav` seq-guard + clears existing timer, returns `{ isHidden: headerHidden || forceHidden, handleQuickNav }`. `src/hooks/use-scroll-hide.ts:41,56,58,81-101,107`
- useKeyboardAwareScroll: 300ms delay, `block: center`, `behavior: smooth`, cleanup on unmount. useVisualViewportScroll: 100ms resize debounce, 300ms focus fallback, no-op without `window.visualViewport`. `src/hooks/use-keyboard-scroll.ts:23-28,57,70-75,97-102`
- NAV_ROUTES: 5 entries with exact paths/icons/labels/titles/subtitles as doc table. `src/lib/nav-routes.ts:11-17`
- DEFAULT_QUICK_NAV_ITEMS order water/eating/bp/weight/urination/defecation all enabled; QUICK_NAV_LABEL_OVERRIDES water→Liquids, eating→Food & Salt. `src/lib/quick-nav-defaults.ts:17-30`
- MedTab enum + tabs: schedule/CalendarDays/Schedule, prescriptions/ClipboardList/Rx, medications/Pill/Meds, titrations/TrendingUp/Titrations, settings/Settings/Settings; active `text-teal-600 dark:text-teal-400`; store default `activeTab: "schedule"`. `src/components/medications/med-footer.tsx:7,9-15,35`; `src/stores/medication-ui-store.ts:20`
- Settings defaults/ranges: `showQuickNav=true`, `quickNavOrder="rtl"`, `scrollDurationMs=300 (100-1000)`, `autoHideDelayMs=500 (0-2000)`, `barTransitionDurationMs=200 (50-500)`, `swipeNavDistanceThresholdPct=28 (10-60)`, `swipeNavVelocityThreshold=500 (100-2000)`, `theme="system"`, persist version `16`. `src/stores/settings-store.ts:200-207,255,388-396`
- SwipeNavSection: distance step 1, velocity step 50, ranges 10-60 / 100-2000, under "Swipe Navigation" heading. `src/components/settings/swipe-nav-section.tsx:43-45,87-89,24`
- layout.tsx mount points: AppHeader, SwipeNav, HomeFloatingBars, MedicationsFloatingBars; boot shell `#__boot_shell` with "Loading…" + spinner + "Reset app" reveal after 8s, fades on `html.app-booted`. `src/app/layout.tsx:85-100,43,35`
- smoothScrollTo: SSR no-op guard, `durationMs <= 0` jumps, `<1px` resolves immediately, easeInOutCubic. `src/lib/smooth-scroll.ts:16,26-36`
- medication-ui-store not persisted (plain `create`), `activeTab`/`wizardOpen` + setters. `src/stores/medication-ui-store.ts:19-24`

## Low-confidence / could-not-verify

- Doc line 185 says default footer items are "top-to-bottom" and line 184 header repeats. The `DEFAULT_QUICK_NAV_ITEMS` order is confirmed, but the assertion that this order "matches the visual order in src/app/page.tsx" is only documented in a code comment (`quick-nav-defaults.ts:12-15`), not independently verified against `page.tsx` in this pass — treated as plausible, not confirmed.
- Doc claims the destination skeleton is "already centered" post-commit so "the real page just takes its place with no re-entry slide" (lines 52, 249). This matches the `useLayoutEffect` x-reset code intent, but the visual no-flash behavior is a runtime/animation property not statically verifiable from source.
- "Voice sheet closes on commit" — `VoicePanel onCommitted={() => setOpen(false)}` is wired (line 78), but whether `VoicePanel` actually fires `onCommitted` on every commit path was not traced into `voice-panel.tsx`.
