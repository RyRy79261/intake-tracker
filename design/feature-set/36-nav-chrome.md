# 36 — Navigation Chrome

**Files covered:**
- `src/components/app-header.tsx`
- `src/components/swipe-nav.tsx`
- `src/components/quick-nav-footer.tsx`
- `src/components/home-floating-bars.tsx`
- `src/components/medications-floating-bars.tsx`
- `src/components/page-skeletons.tsx`
- `src/hooks/use-scroll-hide.ts`
- `src/hooks/use-keyboard-scroll.ts`
- `src/lib/nav-routes.ts`
- `src/lib/quick-nav-defaults.ts`
- `src/lib/card-themes.ts`
- `src/lib/smooth-scroll.ts`
- `src/components/auth-button.tsx`
- `src/components/voice/voice-launch-bar.tsx`
- `src/stores/medication-ui-store.ts`
- `src/components/medications/med-footer.tsx` (MedTab enum + tab bar referenced by FAB)
- `src/components/settings/swipe-nav-section.tsx` (settings UI for swipe thresholds)
- `src/app/layout.tsx` (mount points)

**Purpose:** The persistent navigation shell that wraps every top-level route — a sticky top header with route title/subtitle and icon tab buttons, edge-to-edge horizontal swipe navigation between adjacent routes (with per-route skeleton drag-peek previews), a configurable quick-nav scroll footer on the home page, a voice-log launch bar, and a context-aware floating action button on the medications page. Includes scroll-driven hide/show of the chrome and keyboard-aware input scrolling.

---

## Features

### Top App Header (`app-header.tsx`)
- Sticky bar pinned to the top of the viewport (`sticky top-0 z-40`), only rendered on the five top-level routes (returns `null` on any non-top route, e.g. `/auth/*`, `/history`, `/help`).
- Left block shows the current route's **title** (large bold) and **subtitle** (muted), looked up from `NAV_ROUTES` by matching `pathname`; falls back to the first route entry if no match.
- Right block is a horizontal cluster of icon tab buttons: an `AuthButton` (the `/profile` tab) followed by one ghost icon button per route (filtering out `/profile`, whose icon is replaced by the AuthButton).
- The active route's button gets a highlighted pill background (`bg-primary/10 text-primary`) and a colored icon.
- Tapping an inactive route button navigates via `router.push`; tapping the already-active one is a no-op.
- Header slides up out of view (`y: -100%`) when scroll-hide is active and slides back when revealed; transition speed is user-configurable.
- Gradient background with backdrop blur; breaks out of the page container with negative horizontal margin (`-mx-4`).

### Auth Button (`auth-button.tsx`)
- Doubles as the `/profile` route tab; always navigates to `/profile` on click (the profile page handles the signed-out case).
- Three presentations based on auth state: **loading** (disabled ghost user icon, dimmed), **unauthenticated** (ghost `User` icon), **authenticated** (circular avatar badge showing the uppercase first letter of the user's email, default `"U"`).
- Carries the active highlight (`bg-primary/10 text-primary`) when `pathname === "/profile"`.

### Swipe Navigation (`swipe-nav.tsx`)
- Wraps the page content (`children`) and enables horizontal drag/flick to navigate to the previous/next route in `NAV_ROUTES` order.
- Computes `prevRoute` / `nextRoute` from the current route's index; first route has no prev, last route has no next.
- Prefetches both adjacent routes (`router.prefetch`) whenever they change.
- Direction lock: a gesture is classified as horizontal or vertical once it passes an 8px threshold; vertical gestures are ignored (page scrolls normally), horizontal gestures drive the swipe.
- Live drag-peek: the page translates with the finger; an adjacent-route **skeleton preview** (from `page-skeletons.tsx`) is parked one viewport over on each side and shares the same `x` motion value, so it slides in from the edge as you drag.
- Edge resistance: dragging past a non-existent neighbor (no prev/next) applies 0.25 resistance factor (rubber-band feel).
- Commit logic on release: navigates if drag distance exceeds the configurable distance threshold (% of viewport width) **or** flick velocity exceeds the configurable velocity threshold, in the correct direction with a neighbor present.
- On commit, animates the page fully off-screen (tween, 0.18s) then calls `router.push`; on non-commit, springs/tweens back to center (0.22s).
- After route change, the destination skeleton was already centered, so the real page just takes its place with no re-entry slide.
- Touch action `pan-y` allows native vertical scroll; `overflow-clip` wrapper contains offscreen skeletons (load-bearing to avoid phantom scroll).
- Opt-out: elements (or descendants) marked `[data-no-swipe]` force a vertical lock so swipe is disabled over them (for horizontally scrollable content like charts/carousels).
- Re-entrancy guard: ignores stray gestures while a navigation commit animation is in flight (prevents dropping the queued `router.push`).
- Disabled entirely on non-top routes (no pan handlers attached, no skeletons rendered).

### Quick-Nav Footer (`quick-nav-footer.tsx`)
- Fixed bottom bar (home page only) of icon+label buttons that smooth-scroll to the matching card section on the page.
- Built from the user's configured `quickNavItems`, filtering out disabled entries; each item resolves its icon, colors, label, and target `sectionId` from `CARD_THEMES`.
- Two labels are overridden for the footer: `water` → "Liquids", `eating` → "Food & Salt" (to match on-screen card titles).
- Order respects the user's configured item order; if `quickNavOrder === "rtl"` the enabled list is reversed (applied after filtering, preserving configured order on both axes).
- Hides entirely when zero items are enabled (returns `null`).
- Each button: stacked colored icon chip + tiny label, evenly distributed across the bar.
- Tapping a button scrolls to that section (custom eased smooth scroll), then auto-hides the chrome after a delay.
- Slides down out of view (`y: 100%`) when chrome is hidden; respects bottom safe-area inset.

### Voice Launch Bar (`voice/voice-launch-bar.tsx`)
- Fixed bar above the quick-nav footer (home page), a full-width "Voice log" button with a mic icon chip.
- Only rendered when the AI auth gate passes (`useAuthGate`: shown while auth not-ready, or when authenticated).
- Opens a full-screen Sheet hosting the `VoicePanel`; the sheet closes on commit.
- Bottom offset adapts: sits ~76px above the footer when quick-nav is shown, else flush to the safe-area inset.
- Slides away (`y: 150%`, fades to opacity 0) when chrome is hidden; becomes non-interactive (`pointer-events-none`, `tabIndex -1`, `aria-hidden`, `disabled`) while hidden.

### Medications Floating Bars / FAB (`medications-floating-bars.tsx`)
- Renders the medications-page floating chrome outside the SwipeNav transform layer so `position: fixed` resolves against the viewport.
- Round teal `+` FAB at bottom-right — shown **only** when the medications active tab is `"schedule"` (other tabs have inline Add controls).
- Tapping the FAB opens the `AddMedicationWizard` dialog.
- Auto-closes the wizard when navigating away from `/medications` (tab state is intentionally preserved).
- Only rendered when `pathname === "/medications"`.

### Page Skeletons (`page-skeletons.tsx`)
- Per-route layout-mimicking skeletons used as drag-peek previews (decorative, `aria-hidden`). Each replicates the destination page's structural fingerprint (card shapes, header pattern, control rows, button heights).
- Dispatcher `PageSkeleton({ route })` selects the body by `route.path`: `/profile`, `/` (intake), `/medications`, `/analytics`, `/settings`.

### Scroll-Hide Behavior (`use-scroll-hide.ts`)
- Hides header + footer chrome on scroll-down (past 50px), shows on scroll-up.
- Always shows chrome when scrolled to (within 10px of) the bottom of the page.
- Provides `handleQuickNav(sectionId)`: smooth-scrolls to the element, then after a configurable delay force-hides the chrome; sequence-guarded so rapid quick-nav taps don't fire stale hides; cleared if the user scrolls up or reaches bottom.
- Returns `{ isHidden, handleQuickNav }`; `isHidden = headerHidden || forceHidden`.

### Keyboard-Aware Scroll (`use-keyboard-scroll.ts`)
- `useKeyboardAwareScroll`: returns an `onFocus` handler that scrolls a focused input into view (`block: "center"`) after a 300ms delay (waits out the iOS keyboard animation).
- `useVisualViewportScroll`: uses the Visual Viewport API; on viewport resize (keyboard open) scrolls the active focused input into view (100ms debounce); also scrolls on focus (300ms fallback); clears tracking on blur. Returns `onFocus` + `onBlur`.

---

## User actions & interactions

| Action | Location | Result |
|---|---|---|
| Tap a route icon | Header | Navigates to that route (`router.push`); no-op if already active |
| Tap auth/profile button | Header | Navigates to `/profile` |
| Horizontal drag left/right | Page body | Drags page + reveals adjacent skeleton; on release commits to prev/next route if distance/velocity threshold met, else snaps back |
| Flick (fast swipe) | Page body | Commits navigation regardless of distance if velocity exceeds threshold |
| Vertical drag/scroll | Page body | Treated as scroll (direction-locked vertical); chrome hides on down, shows on up |
| Drag over `[data-no-swipe]` element | Page body | Swipe disabled; native horizontal scroll of that element preserved |
| Drag past first/last route edge | Page body | Rubber-band resistance (0.25), no navigation |
| Tap quick-nav footer button | Footer (home) | Smooth-scrolls to that section, then auto-hides chrome after delay |
| Scroll down | Any top route | Header + footer + voice bar slide out of view |
| Scroll up / reach bottom | Any top route | Chrome slides back into view |
| Tap "Voice log" bar | Voice bar (home) | Opens full-screen voice panel sheet |
| Close voice sheet / commit | Voice sheet | Sheet closes |
| Tap `+` FAB | Medications (schedule tab) | Opens Add Medication wizard |
| Navigate away from /medications | — | Wizard auto-closes (tab preserved) |
| Focus an input | Any form | Input scrolls into view above keyboard (keyboard-aware hooks) |
| Adjust swipe distance/velocity threshold | Settings → Swipe Navigation | Persists new commit thresholds |
| Toggle quick-nav / reorder / enable items | Settings | Changes footer items, order, visibility |

---

## States & presentations

**Header**
- Default: visible, sticky, gradient + blur.
- Hidden: translated up `-100%` (scroll-hide active).
- Active tab: pill background + colored icon on current route's button.
- Inactive tab: ghost button, muted icon.
- Non-top route: header not rendered at all.

**Auth Button**
- Loading (`!ready`): disabled, dimmed user icon.
- Unauthenticated: ghost user icon.
- Authenticated: circular avatar with email initial.
- Active (`/profile`): highlight pill in any of the above (except loading is disabled).

**Swipe Nav**
- Idle: page centered (`x = 0`), no transform.
- Dragging horizontal: page + adjacent skeleton follow finger.
- Dragging at edge (no neighbor): resistance applied.
- Committing: page animating off-screen, navigation queued, gestures locked.
- Vertical lock: pan ignored, scroll proceeds.
- Disabled: non-top route (handlers absent) or over `[data-no-swipe]`.

**Quick-Nav Footer**
- Default: visible at bottom.
- Hidden: translated down `100%`.
- Empty: not rendered (zero enabled items).
- Button hover/active: `hover:bg-muted/80`, `active:scale-95 active:bg-muted`.
- Focus: ring outline.
- RTL vs LTR: item order reversed.

**Voice Launch Bar**
- Shown (gate passes) vs not rendered (gate fails).
- Visible vs hidden (slides down + fades, becomes non-interactive).
- Hover/active button states.
- Offset variant: above footer (76px) vs flush (no footer).

**Medications FAB**
- Shown only on schedule tab; hidden on other tabs and off-page.
- Hover (`hover:bg-teal-700`), active press (`active:scale-95`).
- Wizard open vs closed.

**Page Skeletons**
- One structural variant per route: profile, intake/home, medications, analytics, settings.
- Always decorative (`aria-hidden`); only visible during a drag-peek.

**Boot/loading shell (layout-level, related chrome)**
- Pre-hydration full-screen `#__boot_shell` with spinner, "Loading…" label; reveals a "Reset app" recovery link after 8s; fades out once `html.app-booted`.

---

## Enums, options & configurable values

### Top-level routes — `NAV_ROUTES` (order is the swipe order)
| path | icon | label | title | subtitle |
|---|---|---|---|---|
| `/profile` | `CircleUser` | Profile | Profile | Account & medical context |
| `/` | `Droplets` | Intake | Intake Tracker | Daily budget tracking |
| `/medications` | `Pill` | Meds | Medications | Medicine schedule & tracking |
| `/analytics` | `BarChart3` | Analytics | Analytics | Insights & record browsing |
| `/settings` | `Settings` | Settings | Settings | Configure preferences |

### Default quick-nav footer items — `DEFAULT_QUICK_NAV_ITEMS` (top-to-bottom)
`water` (label "Liquids"), `eating` (label "Food & Salt"), `bp`, `weight`, `urination`, `defecation` — all `enabled: true` by default. Footer label overrides: `water` → "Liquids", `eating` → "Food & Salt".

### Card themes referenced by footer — `CARD_THEMES` keys, labels, icons, sectionIds
| key | label | icon | sectionId | icon color |
|---|---|---|---|---|
| water | Water | `Droplets` | `section-water` | sky-600 |
| salt | Sodium | `Sparkles` | `section-salt` | amber-600 |
| sugar | Sugar | `Candy` | `section-food-salt` | pink-600 |
| potassium | Potassium | `Banana` | `section-food-salt` | purple-600 |
| weight | Weight | `Scale` | `section-weight` | emerald-600 |
| bp | Blood Pressure | `Heart` | `section-bp` | rose-600 |
| eating | Eating | `Utensils` | `section-food-salt` | orange-600 |
| urination | Urination | `Droplet` | `section-urination` | violet-600 |
| defecation | Defecation | `CircleDot` | `section-defecation` | stone-600 |
| caffeine | Caffeine | `Coffee` | `section-caffeine` | yellow-700 |
| alcohol | Alcohol | `Wine` | `section-alcohol` | fuchsia-600 |

### Medications tabs — `MedTab` (`med-footer.tsx`)
`"schedule"` (CalendarDays, "Schedule") · `"prescriptions"` (ClipboardList, "Rx") · `"medications"` (Pill, "Meds") · `"titrations"` (TrendingUp, "Titrations") · `"settings"` (Settings, "Settings"). Default active tab: `"schedule"`. FAB shown only on `"schedule"`. Active tab color: teal-600 / teal-400 with a 0.5px bottom indicator.

### Swipe-nav internal constants (`swipe-nav.tsx`)
- `DIRECTION_LOCK_THRESHOLD = 8` (px)
- `RESISTANCE = 0.25`
- `COMMIT_DURATION = 0.18` (s, off-screen commit tween)
- `ENTER_DURATION = 0.22` (s, snap-back tween)
- Commit ease `[0.4, 0, 0.2, 1]`; snap-back ease `[0.22, 1, 0.36, 1]`; non-horizontal snap is a spring (stiffness 400, damping 40).

### Configurable settings (`settings-store.ts`, with defaults & sanitize ranges)
- `showQuickNav` — boolean, default `true`.
- `quickNavOrder` — `"ltr" | "rtl"`, default `"rtl"`.
- `quickNavItems` — `QuickNavItem[]` (`{ id: CardThemeKey, enabled: boolean }`), default = `DEFAULT_QUICK_NAV_ITEMS`.
- `scrollDurationMs` — default `300`, range 100–1000 (quick-nav scroll speed).
- `autoHideDelayMs` — default `500`, range 0–2000 (delay before chrome auto-hides after quick-nav).
- `barTransitionDurationMs` — default `200`, range 50–500 (header/footer slide speed; used as seconds = ms/1000).
- `swipeNavDistanceThresholdPct` — default `28`, range 10–60 (% of viewport width to commit). Settings input step 1.
- `swipeNavVelocityThreshold` — default `500`, range 100–2000 (px/s flick to commit). Settings input step 50.
- `theme` — `"light" | "dark" | "system"`, default `"system"` (affects all chrome gradients).

### Scroll-hide thresholds (`use-scroll-hide.ts`)
- Scroll-down trigger: `current > previous && current > 50` (px).
- At-bottom tolerance: `scrollHeight - (innerHeight + scrollTop) <= 10` (px).

### Keyboard-scroll timings (`use-keyboard-scroll.ts`)
- Focus scroll delay: 300ms; visual-viewport resize debounce: 100ms; scroll `block: "center"`, `behavior: "smooth"`.

### Voice launch bar
- `QUICK_NAV_HEIGHT_PX = 76` (offset above footer).

---

## Data model touched
- **No persistent data tables** (Dexie) are read or written by the chrome itself.
- **Zustand `settings-store`** (localStorage, persist version 16): reads/writes `showQuickNav`, `quickNavOrder`, `quickNavItems`, `scrollDurationMs`, `autoHideDelayMs`, `barTransitionDurationMs`, `swipeNavDistanceThresholdPct`, `swipeNavVelocityThreshold`, `theme`.
- **Zustand `medication-ui-store`** (ephemeral, not persisted): `activeTab: MedTab`, `wizardOpen: boolean` (+ setters) — shared between the medications page and the layout-level FAB.
- **Auth** (`useAuth` from `auth-guard`): reads `ready`, `authenticated`, `user.email`/`user.name` for the AuthButton avatar and the AI gate.
- **Routing**: `usePathname`, `useRouter` (push/prefetch) from `next/navigation`.
- Static config: `NAV_ROUTES`, `CARD_THEMES`, `DEFAULT_QUICK_NAV_ITEMS`, `QUICK_NAV_LABEL_OVERRIDES`.

---

## Validation, edge cases & business rules
- **Header visibility gate:** rendered only when the current `pathname` exactly matches a `NAV_ROUTES.path`; all other routes get no header (and no swipe handlers).
- **Swipe edge handling:** first route has no prev, last has no next; dragging toward a missing neighbor is damped by `RESISTANCE` and can never commit.
- **Commit re-entrancy:** while a commit animation is running, `navigatingRef` blocks any new gesture from starting a competing animation (which would cancel the in-flight `router.push` and desync the skeleton overlay).
- **Post-navigation reset:** `useLayoutEffect` on `pathname` resets `x = 0` and all refs so the new page doesn't appear to slide in from the swiped edge.
- **`overflow-clip` (not `hidden`):** load-bearing — keeps offscreen skeletons from adding phantom scrollHeight and from coercing the wrapper into a scroll container.
- **Skeleton offset via CSS `left` (±100vw), not transform:** avoids motion's transform management conflicts and stale-width state on first render.
- **Quick-nav scroll guarding:** each quick-nav tap increments a sequence ref; the auto-hide only fires if its sequence is still current (prevents stale hides after rapid taps); existing timers cleared before starting a new scroll.
- **At-bottom override:** chrome is force-shown at the bottom of the page even mid scroll-down, and clears any pending force-hide.
- **Native scroll ref vs motion callback:** at-bottom state is written to a ref by a passive native scroll listener so the motion `scrollY` callback always reads a fresh value (avoids React state timing race).
- **Quick-nav footer empty rule:** renders nothing when no items are enabled.
- **RTL ordering rule:** filtering happens before reversal so the user's configured order is preserved on both axes.
- **Voice bar AI gate:** shown when auth not-ready OR authenticated; hidden for the resolved-unauthenticated state. When chrome-hidden it is fully non-interactive (`disabled`, `tabIndex -1`, `aria-hidden`, `pointer-events-none`).
- **FAB tab rule:** only on the medications `schedule` tab; wizard force-closed on route change but tab state preserved.
- **Smooth scroll:** SSR-safe (no-op without `window.scrollTo`); `durationMs <= 0` jumps instantly; <1px distance resolves immediately; uses `easeInOutCubic`.
- **Safe-area:** footer and voice bar respect `env(safe-area-inset-bottom)` for home-indicator devices.
- **Keyboard scroll:** all timeouts cleared on unmount/blur; visual-viewport path is a no-op when the API is unavailable.
- **Settings thresholds** are clamped by `sanitizeNumericInput` on save (distance 10–60, velocity 100–2000) regardless of input.

---

## Sub-components / variants
- `AppHeader` — sticky top header with title/subtitle + route icon tabs; hides on non-top routes and on scroll.
- `AuthButton` — `/profile` tab control with loading / signed-out / signed-in (avatar) variants.
- `SwipeNav` — gesture wrapper enabling horizontal route navigation with drag-peek skeletons and scroll-hide-compatible vertical pass-through.
- `QuickNavFooter` — fixed home-page scroll-to-section footer built from configurable card-theme items.
- `HomeFloatingBars` — home-only mounter that renders `VoiceLaunchBar` + `QuickNavFooter` outside the swipe transform.
- `VoiceLaunchBar` — fixed "Voice log" launcher button opening a full-screen voice sheet (AI-gated).
- `MedicationsFloatingBars` — medications-only mounter rendering the schedule-tab `+` FAB and the Add Medication wizard.
- `PageSkeleton` (+ `IntakeBody`, `MedicationsBody`, `AnalyticsBody`, `SettingsBody`, `ProfileBody`, and primitives `Block` / `BlockSoft` / `Pill` / `Card` / `CardHeader`) — per-route structural skeleton previews for drag-peek.
- `useScrollHide` — scroll-direction hide/show + quick-nav auto-hide logic; returns `{ isHidden, handleQuickNav }`.
- `useKeyboardAwareScroll` / `useVisualViewportScroll` — keyboard-aware input-into-view scrolling.
- `MedTabBar` (`med-footer.tsx`) — the in-page medications tab strip whose active tab drives the FAB visibility (via `medication-ui-store`).
- `SwipeNavSection` (`settings/swipe-nav-section.tsx`) — settings UI to tune distance/velocity commit thresholds.
- `smoothScrollTo` (`smooth-scroll.ts`) — custom eased (easeInOutCubic) scroll used by quick-nav.
