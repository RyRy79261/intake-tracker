# 10 — CardShell + Domain Theming

**Files covered:**
- `src/components/card-shell.tsx` — the shared card chrome component
- `src/lib/card-themes.ts` — the per-domain theme token map (`CARD_THEMES`)
- `src/lib/quick-nav-defaults.ts` — quick-nav items keyed by theme + label overrides
- Consumers that read theme tokens (chrome or sub-tokens): `src/components/weight-card.tsx`, `src/components/urination-card.tsx`, `src/components/defecation-card.tsx`, `src/components/blood-pressure-card.tsx`, `src/components/food-salt-card.tsx`, `src/components/liquids-card.tsx`, `src/components/food-salt/food-section.tsx`, `src/components/liquids/water-tab.tsx`, `src/components/liquids/beverage-tab.tsx`, `src/components/liquids/preset-tab.tsx`, `src/components/edit-substance-dialog.tsx`, `src/components/text-metrics.tsx`, `src/components/quick-nav-footer.tsx`, `src/components/settings/quick-nav-section.tsx`, `src/components/history/record-row.tsx`, `src/components/history-drawer.tsx`, `src/components/analytics/records-tab.tsx`

**Purpose:** `CardShell` is the shared outer chrome for the dashboard health cards (themed gradient `<Card>`, standard `p-6` padding, and an icon+label header row with a right-side stat slot). `CARD_THEMES` is the single source of truth that maps every tracking domain to a complete set of Tailwind color/gradient/icon tokens that drive card chrome, buttons, inputs, progress bars, toggles, latest-value text, loading skeletons, the quick-nav footer, history rows, and analytics — so all 10+ domains share one anatomy but each renders in its own consistent color identity.

---

## Features

### CardShell component (`card-shell.tsx`)
- Renders a themed `<Card>` with `relative overflow-hidden transition-all duration-300 bg-gradient-to-br` plus the theme's `gradient` and `border` classes.
- Renders a `<CardContent>` with the cards' standard `p-6` padding.
- Renders the **header row**: a flex row (`items-center justify-between mb-4`) containing:
  - Left group: an icon chip (`p-2 rounded-lg` + `theme.iconBg`) wrapping the theme's Lucide icon (`w-5 h-5` + `theme.iconColor`), followed by a label span (`font-semibold text-lg uppercase tracking-wide`).
  - Right group: the `headerRight` slot (any ReactNode — latest stat, loading skeleton, or progress widget).
- Renders `children` below the header (the card body / form / quick-add controls).
- **Label resolution:** displays `label ?? theme.label` — the caller can override the theme's default label per card (the prop comment cites `"Food + Sodium"` for the eating theme).

### CARD_THEMES token map (`card-themes.ts`)
- Provides a typed `CardTheme` record for **11 domain keys**: `water`, `salt`, `sugar`, `potassium`, `weight`, `bp`, `eating`, `urination`, `defecation`, `caffeine`, `alcohol`.
- Each theme carries **20 token fields** (see Enums section) spanning chrome, buttons, outline, progress (3 states), hover, input (3 fields), loading, latest-value, active-toggle, icon (3 fields), label, and a `sectionId` anchor.
- Exposes a `CardThemeKey` union type (`keyof typeof CARD_THEMES`) used app-wide for type-safe theme selection.
- Drives **secondary surfaces** beyond the card body:
  - **Quick-nav footer** uses `icon`, `iconColor`, `iconBg`, `label`, `sectionId` per enabled item.
  - **History rows** (`record-row.tsx`) pick `icon`, `iconColor`, `label` by record type.
  - **History drawer** + **analytics records tab** map type → `buttonBg` for filter chips/accents.
  - **Text-metrics weekly grid** colors each numeric cell by `theme.latestValueColor` (under-target) and overrides to orange/red for extended/over-limit.
- Theme reuse / aliasing: the Liquids card and its tabs reuse `water` (and `caffeine`/`alcohol` for the coffee/alcohol beverage tabs); the Food & Salt card composes `eating` (chrome) + `salt`/`sugar`/`potassium` (progress bars). `edit-substance-dialog` picks `caffeine` vs `alcohol` from a boolean.

### Per-domain progress-state theming
- Three progress visual states per theme: `progressGradient` (normal fill), `progressExtended` (over-target "extra" zone fill), `progressOverLimit` (`bg-red-500`, hard over-limit). Consumed via the custom `Progress` component (`indicatorClassName`, `extendedIndicatorClassName`, plus a `targetMarkerPct` marker).
- Only domains with daily limits/targets define gradient + extended fills (`water`, `salt`, `sugar`, `potassium`, `caffeine`, `alcohol`); `potassium` has only a gradient (no extended). Event-only domains (`weight`, `bp`, `eating`, `urination`, `defecation`) leave progress/input tokens as empty strings.

---

## User actions & interactions

CardShell/themes are **presentational** — interaction lives in the consuming cards, but the shell and tokens define every interactive surface:

- **Tap header-right slot content** — passive (shows latest stat / timestamp / skeleton); not interactive itself.
- **Tap quick-nav footer icon** — calls `onScrollTo(sectionId)` to scroll-anchor to that domain's card section (`section-water`, `section-food-salt`, `section-bp`, `section-weight`, `section-urination`, `section-defecation`, etc.).
- **Quick-add buttons** — themed via `buttonBg` (filled primary) or `outlineBorder`/`outlineText` (outline variant); on tap they log a record.
- **Increment / decrement steppers** (water, beverage, weight) — round buttons themed with `hoverBg`; the central value uses `inputBg` container + `inputText`.
- **Toggle selection** (active preset/size/position/arm/irregular-heartbeat) — the selected option gets `activeToggle` (tinted bg + border).
- **Submit / Save** — primary button uses `buttonBg`; inline edit forms pass `buttonClassName={theme.buttonBg}`.
- **Expand / collapse "Add details"** — chevron toggles an optional detail panel (per card body, e.g. urination).
- **Edit / Delete record** (history rows, inline edit) — themed icon color and save button.
- **Toggle quick-nav item enabled/disabled** (settings) — toggles `QuickNavItem.enabled`; disabled items stay in settings but disappear from the footer.
- **Reorder / RTL footer** — footer order respects `order: "ltr" | "rtl"` (reversal applied after filtering disabled items).

---

## States & presentations

CardShell + themes must support these states (rendered by the `headerRight` slot and consuming bodies):

- **Default / populated** — header shows latest value (`latestValueColor` for the stat, muted timestamp). E.g. weight: `text-lg font-bold` value + muted `formatDateTime`.
- **Loading (skeleton)** — `headerRight` shows an `animate-pulse` block using `theme.loadingBg` (e.g. `h-6 w-20 rounded` for urination; weight shows a stacked value+date skeleton). Card bodies use `<Skeleton>` for steppers/buttons.
- **Empty (no records)** — `headerRight` renders `null` (no latest stat). Card body shows its quick-add controls.
- **Over-target ("extended"/extra zone)** — progress shows `progressGradient` primary fill + `progressExtended` over-target fill; over-target text turns `text-orange-600 dark:text-orange-400`; an "X / Y extra" sub-line appears.
- **Over-limit (`isOverExtended`)** — progress fills `progressOverLimit` (`bg-red-500`) at 100%, extended hidden, target marker hidden; text turns `text-red-600 dark:text-red-400`.
- **Active / selected** — selected toggle/preset/size uses `activeToggle` tint + border.
- **Submitting / pending** — quick-add buttons show a spinner (`Loader2 animate-spin`) and `opacity-70`; other options stay disabled (`disabled={submittingAmount !== null}`).
- **Expanded / collapsed** — optional detail panel toggled by a chevron (`ChevronUp`/`ChevronDown`).
- **Disabled** — buttons disabled while a sibling submit is in flight.
- **Dark mode** — every token ships a `dark:` variant (gradients drop to `*-950/40`, borders to `*-800`, icon bg to `*-900/50`, etc.); the shell/themes are fully dark-mode aware.
- **Future days (weekly grid)** — cells render `---` in `text-muted-foreground/50`; today's column is `font-semibold`.
- **No-data cell (weekly grid)** — `text-muted-foreground/50`.

(Offline/syncing/global-error states are handled by the provider stack, not by CardShell itself; CardShell only reflects per-record loading via skeletons.)

---

## Enums, options & configurable values

### Domain theme keys (11) — `CardThemeKey`
`water` · `salt` · `sugar` · `potassium` · `weight` · `bp` · `eating` · `urination` · `defecation` · `caffeine` · `alcohol`

### `CardTheme` token fields (20 per theme)
`label`, `icon`, `gradient`, `border`, `iconBg`, `iconColor`, `buttonBg`, `outlineBorder`, `outlineText`, `progressGradient`, `progressExtended`, `progressOverLimit`, `hoverBg`, `inputBg`, `inputText`, `loadingBg`, `latestValueColor`, `activeToggle`, `sectionId`.

### Full per-domain token table (ACTUAL values from code)

| key | label | icon (Lucide) | base hue | sectionId | progressGradient | progressExtended | progressOverLimit |
|---|---|---|---|---|---|---|---|
| `water` | Water | `Droplets` | sky→cyan | `section-water` | `from-sky-400 to-cyan-500` | `from-blue-500 to-indigo-600` | `bg-red-500` |
| `salt` | Sodium | `Sparkles` | amber→orange | `section-salt` | `from-amber-400 to-orange-500` | `from-orange-600 to-amber-700` | `bg-red-500` |
| `sugar` | Sugar | `Candy` | pink→rose | `section-food-salt` | `from-pink-400 to-rose-500` | `from-rose-600 to-fuchsia-700` | `bg-red-500` |
| `potassium` | Potassium | `Banana` | purple→indigo | `section-food-salt` | `from-purple-400 to-indigo-500` | `""` (none) | `bg-red-500` |
| `weight` | Weight | `Scale` | emerald→teal | `section-weight` | `""` | `""` | `bg-red-500` |
| `bp` | Blood Pressure | `Heart` | rose→pink | `section-bp` | `""` | `""` | `bg-red-500` |
| `eating` | Eating | `Utensils` | orange→amber | `section-food-salt` | `""` | `""` | `bg-red-500` |
| `urination` | Urination | `Droplet` | violet→purple | `section-urination` | `""` | `""` | `bg-red-500` |
| `defecation` | Defecation | `CircleDot` | stone→amber | `section-defecation` | `""` | `""` | `bg-red-500` |
| `caffeine` | Caffeine | `Coffee` | yellow→amber | `section-caffeine` | `from-yellow-400 to-amber-500` | `""` | `bg-red-500` |
| `alcohol` | Alcohol | `Wine` | fuchsia→pink | `section-alcohol` | `from-fuchsia-400 to-pink-500` | `""` | `bg-red-500` |

### Detailed token values per domain (exact Tailwind classes)

**water** — gradient `from-sky-50 to-cyan-50 dark:from-sky-950/40 dark:to-cyan-950/40` · border `border-sky-200 dark:border-sky-800` · iconBg `bg-sky-100 dark:bg-sky-900/50` · iconColor `text-sky-600 dark:text-sky-400` · buttonBg `bg-sky-600 hover:bg-sky-700` · outlineBorder `border-sky-200 dark:border-sky-800` · outlineText `text-sky-700 dark:text-sky-300` · hoverBg `hover:bg-sky-100 hover:border-sky-300 dark:hover:bg-sky-900/50` · inputBg `bg-sky-100/80 hover:bg-sky-200/80 dark:bg-sky-900/50 dark:hover:bg-sky-800/50` · inputText `text-sky-700 dark:text-sky-300` · loadingBg `bg-sky-200 dark:bg-sky-800` · latestValueColor `text-sky-700 dark:text-sky-300` · activeToggle `bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700`

**salt** — gradient `from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40` · border `border-amber-200 dark:border-amber-800` · iconBg `bg-amber-100 dark:bg-amber-900/50` · iconColor `text-amber-600 dark:text-amber-400` · buttonBg `bg-amber-600 hover:bg-amber-700` · inputBg `bg-amber-100/80 hover:bg-amber-200/80 dark:bg-amber-900/50 dark:hover:bg-amber-800/50` · inputText `text-amber-700 dark:text-amber-300` · loadingBg `bg-amber-200 dark:bg-amber-800` · latestValueColor `text-amber-700 dark:text-amber-300` · activeToggle `bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:border-amber-700` · hoverBg/outline mirror the amber hue.

**sugar** — gradient `from-pink-50 to-rose-50 dark:from-pink-950/40 dark:to-rose-950/40` · border `border-pink-200 dark:border-pink-800` · iconBg `bg-pink-100 dark:bg-pink-900/50` · iconColor `text-pink-600 dark:text-pink-400` · buttonBg `bg-pink-600 hover:bg-pink-700` · inputBg `bg-pink-100/80 ...` · loadingBg `bg-pink-200 dark:bg-pink-800` · latestValueColor `text-pink-700 dark:text-pink-300` · activeToggle `bg-pink-100 border-pink-300 ...` (sectionId reuses `section-food-salt`).

**potassium** — gradient `from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40` · border `border-purple-200 dark:border-purple-800` · iconBg `bg-purple-100 dark:bg-purple-900/50` · iconColor `text-purple-600 dark:text-purple-400` · buttonBg `bg-purple-600 hover:bg-purple-700` · inputBg `bg-purple-100/80 ...` · loadingBg `bg-purple-200 dark:bg-purple-800` · latestValueColor `text-purple-700 dark:text-purple-300` · activeToggle `bg-purple-100 border-purple-300 ...` · **no** `progressExtended` (empty) (sectionId `section-food-salt`).

**weight** — gradient `from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40` · border `border-emerald-200 dark:border-emerald-800` · iconBg `bg-emerald-100 dark:bg-emerald-900/50` · iconColor `text-emerald-600 dark:text-emerald-400` · buttonBg `bg-emerald-600 hover:bg-emerald-700` · hoverBg `hover:bg-emerald-100 hover:border-emerald-300 dark:hover:bg-emerald-900/50` · loadingBg `bg-emerald-200 dark:bg-emerald-800` · latestValueColor `text-emerald-700 dark:text-emerald-300` · activeToggle `bg-emerald-100 border-emerald-300 ...` · **`inputBg`/`inputText`/`progressGradient`/`progressExtended` are empty strings** (event card, no progress bar).

**bp** — gradient `from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40` · border `border-rose-200 dark:border-rose-800` · iconBg `bg-rose-100 dark:bg-rose-900/50` · iconColor `text-rose-600 dark:text-rose-400` · buttonBg `bg-rose-600 hover:bg-rose-700` · hoverBg rose · loadingBg `bg-rose-200 dark:bg-rose-800` · latestValueColor `text-rose-700 dark:text-rose-300` · activeToggle `bg-rose-100 border-rose-300 ...` · progress/input tokens empty.

**eating** — gradient `from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40` · border `border-orange-200 dark:border-orange-800` · iconBg `bg-orange-100 dark:bg-orange-900/50` · iconColor `text-orange-600 dark:text-orange-400` · buttonBg `bg-orange-600 hover:bg-orange-700` · hoverBg orange · loadingBg `bg-orange-200 dark:bg-orange-800` · latestValueColor `text-orange-700 dark:text-orange-300` · activeToggle `bg-orange-100 border-orange-300 ...` · progress/input tokens empty · sectionId `section-food-salt`.

**urination** — gradient `from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40` · border `border-violet-200 dark:border-violet-800` · iconBg `bg-violet-100 dark:bg-violet-900/50` · iconColor `text-violet-600 dark:text-violet-400` · buttonBg `bg-violet-600 hover:bg-violet-700` · hoverBg violet · loadingBg `bg-violet-200 dark:bg-violet-800` · latestValueColor `text-violet-700 dark:text-violet-300` · activeToggle `bg-violet-100 border-violet-300 ...` · progress/input tokens empty.

**defecation** — gradient `from-stone-50 to-amber-50 dark:from-stone-950/40 dark:to-amber-950/40` · border `border-stone-200 dark:border-stone-800` · iconBg `bg-stone-100 dark:bg-stone-900/50` · iconColor `text-stone-600 dark:text-stone-400` · buttonBg `bg-stone-600 hover:bg-stone-700` · hoverBg stone · loadingBg `bg-stone-200 dark:bg-stone-800` · latestValueColor `text-stone-700 dark:text-stone-300` · activeToggle `bg-stone-100 border-stone-300 ...` · progress/input tokens empty.

**caffeine** — gradient `from-yellow-50 to-amber-50 dark:from-yellow-950/40 dark:to-amber-950/40` · border `border-yellow-200 dark:border-yellow-800` · iconBg `bg-yellow-100 dark:bg-yellow-900/50` · iconColor `text-yellow-700 dark:text-yellow-400` (note: 700 not 600) · buttonBg `bg-yellow-700 hover:bg-yellow-800` (note: 700/800, darker than other domains) · progressGradient `from-yellow-400 to-amber-500` · inputBg `bg-yellow-100/80 ...` · loadingBg `bg-yellow-200 dark:bg-yellow-800` · latestValueColor `text-yellow-700 dark:text-yellow-300` · activeToggle `bg-yellow-100 border-yellow-300 ...` · **no** `progressExtended`.

**alcohol** — gradient `from-fuchsia-50 to-pink-50 dark:from-fuchsia-950/40 dark:to-pink-950/40` · border `border-fuchsia-200 dark:border-fuchsia-800` · iconBg `bg-fuchsia-100 dark:bg-fuchsia-900/50` · iconColor `text-fuchsia-600 dark:text-fuchsia-400` · buttonBg `bg-fuchsia-600 hover:bg-fuchsia-700` · progressGradient `from-fuchsia-400 to-pink-500` · inputBg `bg-fuchsia-100/80 ...` · loadingBg `bg-fuchsia-200 dark:bg-fuchsia-800` · latestValueColor `text-fuchsia-700 dark:text-fuchsia-300` · activeToggle `bg-fuchsia-100 border-fuchsia-300 ...` · **no** `progressExtended`.

### sectionId anchor values (scroll targets)
`section-water`, `section-salt`, `section-food-salt` (shared by `sugar`/`potassium`/`eating`), `section-weight`, `section-bp`, `section-urination`, `section-defecation`, `section-caffeine`, `section-alcohol`.

### Quick-nav defaults (`quick-nav-defaults.ts`)
- `DEFAULT_QUICK_NAV_ITEMS` (order = top-to-bottom on the dashboard): `water` (→ "Liquids") · `eating` (→ "Food & Salt") · `bp` · `weight` · `urination` · `defecation` — all `enabled: true`.
- `QUICK_NAV_LABEL_OVERRIDES`: `water → "Liquids"`, `eating → "Food & Salt"` (footer reads these instead of the theme's raw label).
- Footer `order` option: `"ltr" | "rtl"`; default footer `transitionDuration` = `0.2`.

### Label overrides observed in card chrome
- CardShell prop comment example: eating theme overridden to `"Food + Sodium"`.
- `food-salt-card.tsx` hard-codes header label `"Food"` (composes `eating` chrome + `salt`/`sugar`/`potassium` progress bars).
- `bp`, `weight`, `urination`, `defecation` use their default `theme.label`.

### Fixed chrome constants (CardShell)
- Card classes: `relative overflow-hidden transition-all duration-300 bg-gradient-to-br`.
- CardContent padding: `p-6`.
- Header row: `flex items-center justify-between mb-4`; icon chip `p-2 rounded-lg`; icon `w-5 h-5`; label `font-semibold text-lg uppercase tracking-wide`.

---

## Data model touched

CardShell + card-themes touch **no database tables directly** — they are pure presentation. Indirectly, themes are keyed to record domains whose data lives in Dexie (`src/lib/db.ts`) and mirrored in Postgres (`src/db/schema.ts`):

- `water`/beverage → `intakeRecords` (type `water`) + `substanceRecords`
- `salt`/`sugar`/`potassium`/`eating` → `intakeRecords` (types `salt`/`sugar`) + `eatingRecords`
- `weight` → `weightRecords`
- `bp` → `bloodPressureRecords`
- `urination` → `urinationRecords`
- `defecation` → `defecationRecords`
- `caffeine`/`alcohol` → `substanceRecords`

`QuickNavItem` (`{ id: CardThemeKey; enabled: boolean }`) is persisted via the Zustand settings store (localStorage), not a DB table.

---

## Validation, edge cases & business rules

- **Label fallback:** CardShell renders `label ?? theme.label`; an explicit empty-string label would render empty (callers pass meaningful strings or omit).
- **Empty token strings are intentional:** event-only domains (`weight`, `bp`, `eating`, `urination`, `defecation`) leave `progressGradient`/`progressExtended`/`inputBg`/`inputText` as `""` because they have no progress bars or stepper inputs; consumers must not assume those tokens are non-empty.
- **`potassium`, `caffeine`, `alcohol` have no `progressExtended`** — they show a single gradient fill only (no over-target "extra" zone), so an over-target presentation for these falls back to the primary gradient (no extended band).
- **Over-limit precedence:** `isOverExtended` (hard over-limit) wins over `isOverTarget`. When over-limit, progress fills `progressOverLimit` at 100%, hides the extended fill (`extendedValue → 0`) and target marker (`targetMarkerPct → 0`), and text switches to red. When over-target but not over-limit, text is orange and an "extra" sub-line renders.
- **Shared sectionId is deliberate:** `sugar`, `potassium`, and `eating` all anchor to `section-food-salt` (they live in the combined Food & Salt card), so quick-nav for any of them scrolls to the same card.
- **Footer filtering vs. ordering:** disabled `QuickNavItem`s are filtered out first, then RTL reversal is applied — so the user's configured order is preserved on both axes; the footer hides entirely when zero items are enabled.
- **`caffeine` deliberately darker:** uses `yellow-700/800` for button + `yellow-700` icon (vs the `-600`/`-700` pattern elsewhere) for contrast against the pale yellow gradient.
- **Theme reuse:** Liquids card and tabs reuse the `water` theme for chrome (label overridden to "Liquids"); beverage/coffee/alcohol tabs swap to `caffeine`/`alcohol` themes; `edit-substance-dialog` selects `caffeine` vs `alcohol` from `isCaffeine`. Any redesign must keep these aliases coherent.
- **`as const` map:** `CARD_THEMES` is frozen as a const literal; `CardThemeKey` is derived from its keys, giving compile-time safety across all 15+ consumers.
- **Dark-mode parity required:** every color token must ship a `dark:` variant; the weekly-grid and progress over-limit/extended states hard-code `text-orange-600 dark:text-orange-400` / `text-red-600 dark:text-red-400` outside the theme map.

---

## Sub-components / variants

- `CardShell` (`card-shell.tsx`) — the shared themed card chrome (gradient wrapper + icon/label header + `headerRight` slot + children). Used by `weight-card`, `urination-card`, `defecation-card`.
- `CARD_THEMES` / `CardTheme` / `CardThemeKey` (`card-themes.ts`) — the domain → token map, interface, and key union.
- `weight-card.tsx` — Weight card; uses `CardShell` + `theme.weight`; headerRight shows latest weight (2 dp, kg) + skeleton.
- `urination-card.tsx` — Urination card; uses `CardShell` + `theme.urination`; headerRight shows latest timestamp; 3-col quick-log grid + "Add details".
- `defecation-card.tsx` — Defecation card; uses `CardShell` + `theme.defecation`.
- `blood-pressure-card.tsx` — BP card; **reproduces the chrome inline** (does not import CardShell) but consumes `theme.bp` tokens; headerRight shows latest reading + BP category color.
- `food-salt-card.tsx` — Food & Salt card; **inline chrome** using `CARD_THEMES.eating`, with three progress bars themed `salt`/`sugar`/`potassium`; header label hard-coded "Food".
- `liquids-card.tsx` — Liquids card; **inline chrome**, reuses `water` theme (label "Liquids"); maps tab → theme (`water`/`caffeine`/`alcohol`).
- `food-salt/food-section.tsx`, `liquids/water-tab.tsx`, `liquids/beverage-tab.tsx`, `liquids/preset-tab.tsx` — card-body sub-views that consume `buttonBg`, `hoverBg`, `inputBg`, `inputText`, `activeToggle`, and the three progress tokens.
- `edit-substance-dialog.tsx` — substance edit dialog; picks `caffeine`/`alcohol` theme for its submit `buttonBg`.
- `quick-nav-footer.tsx` — fixed bottom footer; renders one icon button per enabled `QuickNavItem` using `icon`/`iconColor`/`iconBg`/`label`/`sectionId`.
- `settings/quick-nav-section.tsx` — settings UI to enable/disable/reorder quick-nav items (keyed by `CardThemeKey`).
- `quick-nav-defaults.ts` — `DEFAULT_QUICK_NAV_ITEMS`, `QUICK_NAV_LABEL_OVERRIDES`, `QuickNavItem` interface.
- `history/record-row.tsx` — single history row; picks `icon`/`iconColor`/`label` by record type.
- `history-drawer.tsx` + `analytics/records-tab.tsx` — map record type → `buttonBg` for filter/accent colors.
- `text-metrics.tsx` — weekly numeric grid; colors each cell by `theme.latestValueColor` with orange/red over-target/over-limit overrides; also renders water/salt/sugar/potassium progress bars with the themed gradients.
