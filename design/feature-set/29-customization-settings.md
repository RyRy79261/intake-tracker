# 29 — Customization Settings

**Files covered:**
- `src/components/settings/appearance-section.tsx`
- `src/components/settings/quick-nav-section.tsx`
- `src/components/settings/animation-timing-section.tsx`
- `src/components/settings/swipe-nav-section.tsx`
- `src/components/settings/settings-accordion-group.tsx` (group wrapper)
- `src/components/ui/numeric-input.tsx` (shared control)
- `src/lib/settings-helpers.ts` (validate/step helpers)
- `src/lib/quick-nav-defaults.ts` (quick-nav item defaults + label overrides)
- `src/lib/card-themes.ts` (icon/color source for quick-nav items)
- `src/stores/settings-store.ts` (persisted state, setters, clamps, migrations)
- `src/hooks/use-settings.ts` (store accessor hook)
- `src/app/settings/page.tsx` (assembles the four sections under "Customization")
- Consumers (for state semantics): `src/components/quick-nav-footer.tsx`, `src/components/home-floating-bars.tsx`, `src/components/app-header.tsx`, `src/hooks/use-scroll-hide.ts`, `src/components/swipe-nav.tsx`, `src/components/theme-provider` via `src/app/providers.tsx`, `src/lib/nav-routes.ts`

**Purpose:** The "Customization" accordion group of the Settings page. Lets the single user control app appearance (theme), the quick-nav footer (visibility, per-item show/hide, drag reorder, icon direction), header/footer animation timing, and swipe-to-navigate sensitivity. All values persist to localStorage via the Zustand settings store and take effect live across the app.

---

## Features

Four sub-sections, all rendered inside one collapsible accordion item labeled **"Customization"** (Palette icon, color `text-cyan-600 dark:text-cyan-400`). Each sub-section is a titled block with a colored icon + heading and an indented (`pl-6`) body.

### 1. Appearance (`AppearanceSection`)
- Icon: `Sun`, heading color `text-slate-600 dark:text-slate-400`. Heading: "Appearance".
- Single control: a **Theme** dropdown (`Select`) with three options, each prefixed by an icon: Light (Sun), Dark (Moon), System (Monitor).
- Backed by `next-themes` `useTheme()` — NOT the Zustand store directly. `setTheme` writes the next-themes class on `<html>`. (The Zustand store also has a `theme` field + `setTheme`, but this section reads/writes the next-themes hook.)
- Helper caption: "Choose light, dark, or follow your system preference".
- Provider config (`providers.tsx`): `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` — applies the theme as a CSS class, enables OS-preference following for "system".

### 2. Quick Navigation (`QuickNavSection`)
- Icon: `Navigation`, heading color `text-cyan-600 dark:text-cyan-400`. Heading: "Quick Navigation".
- **Master toggle "Quick Nav Footer"** — On/Off button. Caption: "Show a footer bar to jump to sections". Controls `showQuickNav`.
- When ON, reveals two more controls (hidden when OFF):
  - **Footer Items list** (`Reorder.Group` from `motion/react`) — a draggable, reorderable vertical list of all 6 default sections. Each row shows: a grip handle (`GripVertical`), the section's themed icon in a colored chip (from `CARD_THEMES`), the section label, and a `Switch` to enable/disable that item. Disabled rows render at `opacity-50`. Caption: "Drag to reorder. Toggle to show/hide in the footer."
  - **Icon Order dropdown** — `Select` with "Right to Left (recommended)" (`rtl`) and "Left to Right" (`ltr`). Caption: "RTL puts your most-used sections closest to your right thumb". Controls `quickNavOrder`.
- The footer it configures (`QuickNavFooter`) renders enabled items as tap targets that smooth-scroll to the on-page section (`onScrollTo(sectionId)`); RTL reverses the visual order after filtering disabled items; if zero items are enabled the entire footer is hidden (returns `null`).

### 3. Animation Timing (`AnimationTimingSection`)
- Icon: `Timer`, heading color `text-orange-600 dark:text-orange-400`. Heading: "Animation Timing".
- Three numeric steppers (`NumericInput` = `[−][input][+]`), each with a local input-string mirror state synced from the store via `useEffect`:
  - **Scroll Speed (ms)** — `scrollDurationMs`. How fast the page scrolls to a section. Caption: "How fast the page scrolls to a section (100-1000)".
  - **Auto-Hide Delay (ms)** — `autoHideDelayMs`. Delay before header/footer hide after a quick-nav scroll. Caption: "Delay before header/footer hide after scrolling (0-2000)".
  - **Bar Transition Speed (ms)** — `barTransitionDurationMs`. Header/footer slide-in/out speed. Caption: "How fast header/footer slide in and out (50-500)".
- These feed `useScrollHide` (header + floating bars) and are converted ms→seconds (`/1000`) for the motion transition duration on the header and footer bars.

### 4. Swipe Navigation (`SwipeNavSection`)
- Icon: `Hand`, heading color `text-violet-600 dark:text-violet-400`. Heading: "Swipe Navigation".
- Two numeric steppers (`NumericInput`), each with local mirror state:
  - **Distance Threshold (% of width)** — `swipeNavDistanceThresholdPct`. How far you must drag (as % of screen width) to commit a page change. Caption: "How far you must drag (as % of screen width) to commit the page change (10-60). Lower = more sensitive."
  - **Flick Velocity (px/s)** — `swipeNavVelocityThreshold`. Minimum flick speed that commits regardless of distance. Caption: "Minimum flick speed that commits regardless of distance (100-2000). Lower = lighter flicks."
- Consumed by `SwipeNav`: on pan-end, commit fires if `offset.x > width*(distancePct/100)` OR `|velocity.x| > velocityThreshold`, navigating to the prev/next route in `NAV_ROUTES`.

### Page-level adjuncts (same Settings page, outside this group but related)
- A "Reset to Defaults" ghost button at the page bottom calls `resetToDefaults()`, restoring ALL settings (including every value above) and showing a toast ("Settings reset" / "All settings have been restored to defaults").

---

## User actions & interactions

**Appearance**
- Tap Theme select → open dropdown → choose Light / Dark / System. Result: theme applied immediately via next-themes (`<html class>` swaps; "system" follows OS).

**Quick Navigation**
- Tap the **On/Off** button → toggles `showQuickNav`. Turning ON reveals the Footer Items list + Icon Order; turning OFF hides them and removes the footer bar app-wide.
- **Drag a row** by its grip (whole row is `cursor-grab`/`active:cursor-grabbing`, `touch-none`, `select-none`) → reorders `quickNavItems`; new order persists and reflects in the footer.
- **Toggle a row's Switch** → flips that item's `enabled`; switch `onClick`/`onPointerDown` stop propagation so toggling doesn't start a drag. Disabled item dims to 50% and is removed from the footer (kept in settings).
- Tap **Icon Order** select → choose RTL or LTR → sets `quickNavOrder`; footer re-orders.

**Animation Timing & Swipe Navigation (NumericInput steppers)**
- Tap **−** (`onDecrement`) → decrement by `step`, clamped to min; updates store + input mirror.
- Tap **+** (`onIncrement`) → increment by `step`, clamped to max.
- **Type into the input** (`type="number"`) → updates only the local mirror string (`onChange`); not saved yet.
- **Blur the input** (`onBlur`) → `validateAndSave`: parse; if valid and within [min,max] save it; otherwise revert to the current stored value (passed as the "default") and reset the input text.
- Each input has min/max/step attributes mirrored onto the native `<input>` too.

**Page-level**
- Tap **Reset to Defaults** → `resetToDefaults()` restores every setting to `defaultSettings`; toast confirms.
- Expand/collapse the **Customization** accordion item (single-type accordion, `collapsible`) — only one accordion group open at a time across the page.

---

## States & presentations

- **Default (collapsed accordion):** Customization shows only its trigger row (Palette icon + "Customization"). Body lazy-renders on expand.
- **Appearance — value set:** Select shows the chosen option (icon + label). Placeholder "Select theme" only if `theme` is undefined (guarded: `{...(theme !== undefined && { value: theme })}`), which matters during SSR/hydration before next-themes resolves.
- **Quick Nav — OFF:** Only the On/Off button visible (button variant `outline`, label "Off"). Footer Items list and Icon Order hidden.
- **Quick Nav — ON:** Button variant `default`, label "On". Footer Items list + Icon Order shown.
- **Quick Nav item — enabled:** full opacity, switch checked.
- **Quick Nav item — disabled:** row at `opacity-50`, switch unchecked; excluded from the footer.
- **Quick Nav — dragging:** grabbed row uses `active:cursor-grabbing`; Reorder animates siblings.
- **Quick Nav footer — zero enabled:** footer renders nothing (component returns `null`); same when `showQuickNav` is false (footer not mounted).
- **Quick Nav footer — hidden vs shown:** footer slides down (`y: "100%"`) when `hidden` (scroll-down/auto-hide), slides up when shown; transition duration = `barTransitionDurationMs/1000`.
- **Numeric inputs — typing (unsaved):** input mirror diverges from store until blur. No live validation styling; correction happens on blur (silent revert on invalid).
- **Numeric inputs — clamp:** +/- buttons never exceed min/max (`Math.min`/`Math.max`); store setters additionally clamp via `sanitizeNumericInput`.
- **No explicit loading / empty / error / offline / syncing states** in these sections — all state is synchronous localStorage-backed Zustand; no async fetch, no skeletons, no error UI. (Settings persist offline by nature.)
- **Reset confirmation:** no confirm dialog; immediate reset + toast (success state only).
- **Theme follow-system:** when "system", switching OS dark/light updates the app live (`enableSystem`).

---

## Enums, options & configurable values (actual values)

### Theme
- Options: `"light"` | `"dark"` | `"system"`. Store default: `"system"`. Provider `defaultTheme="system"`, `attribute="class"`, `enableSystem`. Labels: "Light", "Dark", "System".

### Quick Nav
- `showQuickNav`: boolean, default `true`.
- `quickNavOrder`: `"ltr"` | `"rtl"`, default `"rtl"`. Option labels: "Right to Left (recommended)" / "Left to Right".
- `quickNavItems`: array of `{ id: CardThemeKey, enabled: boolean }`. Default (`DEFAULT_QUICK_NAV_ITEMS`), in order:
  1. `water` (enabled) → label override "Liquids"
  2. `eating` (enabled) → label override "Food & Salt"
  3. `bp` (enabled) → "Blood Pressure"
  4. `weight` (enabled) → "Weight"
  5. `urination` (enabled) → "Urination"
  6. `defecation` (enabled) → "Defecation"
- Label overrides (`QUICK_NAV_LABEL_OVERRIDES`): `water → "Liquids"`, `eating → "Food & Salt"` (all others use `CARD_THEMES[id].label`).
- `CardThemeKey` set (icon/color source, `CARD_THEMES`): `water` (Droplets, sky), `salt` (Sparkles, amber), `sugar` (Candy, pink), `potassium` (Banana, purple), `weight` (Scale, emerald), `bp` (Heart, rose), `eating` (Utensils, orange), `urination` (Droplet, violet), `defecation` (CircleDot, stone), `caffeine` (Coffee, yellow), `alcohol` (Wine, fuchsia). Each theme also carries `sectionId` (e.g. `section-water`, `section-food-salt`, `section-bp`, `section-weight`, `section-urination`, `section-defecation`) used as the scroll target.

### Animation Timing (all in ms)
- `scrollDurationMs`: default `300`; UI range **100–1000**, step **50**; store clamp `sanitizeNumericInput(v,100,1000)`. Increment min-clamp 100 / max-clamp 1000.
- `autoHideDelayMs`: default `500`; UI range **0–2000**, step **100**; clamp `(v,0,2000)`.
- `barTransitionDurationMs`: default `200`; UI range **50–500**, step **50**; clamp `(v,50,500)`. Consumed as seconds (`/1000`).

### Swipe Navigation
- `swipeNavDistanceThresholdPct`: default `28`; UI range **10–60**, step **1**; clamp `(v,10,60)`. (Migration v9 seeded `28`.)
- `swipeNavVelocityThreshold`: default `500` (px/s); UI range **100–2000**, step **50**; clamp `(v,100,2000)`. (Migration v9 seeded `500`.)

### Swipe-nav constants (fixed, not user-configurable — in `swipe-nav.tsx`)
- `DIRECTION_LOCK_THRESHOLD = 8` px, `RESISTANCE = 0.25` (edge rubber-band), `COMMIT_DURATION = 0.18` s, `ENTER_DURATION = 0.22` s.
- `NAV_ROUTES` order (prev/next targets): `/profile` → `/` → `/medications` → `/analytics` → `/settings`.

### Persistence
- Store key: `"intake-tracker-settings"` (localStorage). `SETTINGS_PERSIST_VERSION = 16`.

---

## Data model touched

All four sections read/write the **Zustand settings store** (`src/stores/settings-store.ts`), persisted to localStorage — NOT IndexedDB/Dexie, NOT the server schema. Fields and setters used:

- `theme: "light"|"dark"|"system"` + `setTheme` (Appearance reads via next-themes, but the store mirrors it).
- `showQuickNav: boolean` + `setShowQuickNav`.
- `quickNavOrder: "ltr"|"rtl"` + `setQuickNavOrder`.
- `quickNavItems: QuickNavItem[]` (`{ id: CardThemeKey; enabled: boolean }`, defined in `quick-nav-defaults.ts`) + `setQuickNavItems`.
- `scrollDurationMs`, `autoHideDelayMs`, `barTransitionDurationMs: number` + matching setters.
- `swipeNavDistanceThresholdPct`, `swipeNavVelocityThreshold: number` + matching setters.
- `resetToDefaults()` resets the entire `Settings` object.

External lookups (read-only): `CARD_THEMES` (icons/colors/sectionIds), `QUICK_NAV_LABEL_OVERRIDES`, `NAV_ROUTES`. None of these settings sync to Neon Postgres — they are device-local UI preferences.

---

## Validation, edge cases & business rules

- **Two-layer clamping for numeric settings:** (1) UI helpers `incrementSetting`/`decrementSetting` clamp to the section's min/max; `validateAndSave` parses (`parseFloat`), accepts only finite values within `[min,max]`, else reverts to the current stored value. (2) Store setters re-clamp via `sanitizeNumericInput(value, min, max)` as a backstop.
- **Input mirror sync:** each numeric section keeps a local string state, re-synced to the store value on every store change via `useEffect`. Typing is not persisted until blur; invalid input silently reverts (no validation-error UI).
- **Quick-nav drag vs toggle:** the per-item `Switch` stops `onClick`/`onPointerDown` propagation so toggling enabled state doesn't initiate a drag.
- **RTL ordering rule:** filtering of disabled items happens BEFORE the RTL reverse, so the configured order is preserved on both axes; only enabled items render.
- **Empty footer rule:** if all items disabled, the footer hides entirely (returns `null`) even when `showQuickNav` is true.
- **Theme hydration guard:** Select only sets `value` when `theme !== undefined`, avoiding a controlled/uncontrolled flip during SSR/first paint before next-themes resolves.
- **Auto-hide sequencing:** `useScrollHide` uses a `navSeqRef` to ignore stale auto-hide timers if the user starts another quick-nav scroll; force-hide clears on scroll-up or reaching page bottom; the header always shows when at the bottom of the page.
- **Swipe commit rule:** navigation commits when drag distance exceeds `width * (distancePct/100)` OR flick velocity exceeds the velocity threshold (in the correct direction) AND a prev/next route exists; at list edges, drag gets `RESISTANCE` rubber-banding and no commit.
- **Swipe applies only on top-level routes** (`NAV_ROUTES`); elements marked `[data-no-swipe]` lock the gesture to vertical.
- **Persist migrations** relevant here: v<5 seeds `quickNavItems` defaults; v<9 seeds swipe thresholds (28 / 500). Older stored blobs forward-migrate to v16.
- **No required fields / no server validation** — every control has a safe default and reset path; there is no error/offline state because writes are synchronous to localStorage.
- **Rounding:** numeric values are integers via integer steps (except weight increment elsewhere, not in this group); `validateAndSave` uses `parseFloat` then `.toString()`, so a typed decimal within range would be stored as-is (steps keep normal use on integers).

---

## Sub-components / variants

- **`AppearanceSection`** — Theme dropdown (Light/Dark/System) wired to next-themes.
- **`QuickNavSection`** — master On/Off toggle + drag-reorder item list (`Reorder.Group`/`Reorder.Item`) with per-item `Switch` + Icon Order (LTR/RTL) dropdown.
- **`AnimationTimingSection`** — three `NumericInput` steppers (Scroll Speed, Auto-Hide Delay, Bar Transition Speed).
- **`SwipeNavSection`** — two `NumericInput` steppers (Distance Threshold %, Flick Velocity px/s).
- **`SettingsAccordionGroup`** — generic collapsible wrapper (icon + label trigger, indented content) that hosts the four sections under "Customization".
- **`NumericInput`** (`ui/numeric-input.tsx`) — reusable `[−][number input][+]` control with aria-labels "Decrease value" / "Increase value"; native min/max/step mirrored.
- **`settings-helpers.ts`** — `validateAndSave`, `incrementSetting`, `decrementSetting` (and unrelated `formatHour`).
- **`quick-nav-defaults.ts`** — `QuickNavItem` type, `DEFAULT_QUICK_NAV_ITEMS`, `QUICK_NAV_LABEL_OVERRIDES`.
- **`card-themes.ts`** — `CARD_THEMES` map (icons, colors, sectionIds) and `CardThemeKey` type, the icon/label/color source for quick-nav rows and footer.
- Consumers reflecting these settings live: `QuickNavFooter` (footer rendering/order/transition), `home-floating-bars.tsx` + `app-header.tsx` (wire timing + footer props), `use-scroll-hide.ts` (scroll/auto-hide behavior), `swipe-nav.tsx` (swipe thresholds), next-themes `ThemeProvider` (theme application).
