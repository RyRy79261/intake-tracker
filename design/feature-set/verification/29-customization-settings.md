# Verification — 29-customization-settings

**Verdict:** minor-gaps  ·  checked 78 claims, verified 74.

The document is highly accurate and demonstrates close reading of the actual implementation. Almost every value, label, default, range, clamp, icon, color token, migration version, and behavioral rule was confirmed digit-for-digit against source. The only real defect is one edge-case claim about decimal storage that contradicts the store's rounding behavior, plus a couple of minor omissions/imprecisions.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "`validateAndSave` uses `parseFloat` then `.toString()`, so a typed decimal within range would be stored as-is" (line 169) | Even if `validateAndSave` calls `setter(parsed)` with a decimal, the store setter re-clamps through `sanitizeNumericInput(value, min, max)` which, with no `precision` arg, returns `Math.round(clamped)` — so a typed decimal is **rounded to an integer**, NOT stored as-is. The doc's own "two-layer clamping … re-clamp via `sanitizeNumericInput`" (line 158) actually contradicts the as-is claim. | `src/lib/security.ts:56-65`; `src/stores/settings-store.ts:387-396` |
| low | "`CardThemeKey` set … `salt` (Sparkles, amber)" with no label given (line 120); elsewhere the doc never notes salt's label | `salt.label = "Sodium"` (not "Salt"). Minor since `salt` is not in the default quick-nav set, but the doc enumerates the key set and is otherwise label-explicit. | `src/lib/card-themes.ts:61` |
| low | "`eating` (Utensils, orange) … Each theme also carries `sectionId`" — doc lists `section-food-salt` only for the food/salt mapping (line 120) | Three different theme keys (`sugar`, `potassium`, `eating`) all share `sectionId: "section-food-salt"`; the doc's section-id list is correct but does not surface that the eating row's scroll target is `section-food-salt` shared with sugar/potassium. Informational only. | `src/lib/card-themes.ts:100,120,183` |
| low | Quick Nav "Icon Order" — doc says it is a `Select` (correct) but omits the `ArrowRightLeft` label icon on the field; doc also omits the `GripVertical` icon on the "Footer Items" Label | The "Footer Items" Label carries a `GripVertical` icon and the "Icon Order" Label carries an `ArrowRightLeft` icon. Cosmetic omission. | `src/components/settings/quick-nav-section.tsx:51,103` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The "Customization" accordion group is one of **many** groups on the page (AI features, Data & Storage, Tracking, Customization, Medication, Privacy & Security, System, Help & Manual, Feedback, Debug). The doc says "only one accordion group open at a time across the page" (correct) but does not note the full sibling list — fine given scope. | `src/app/settings/page.tsx:84-137` |
| low | `swipeNavVelocityThreshold` velocity-direction sign rule not fully stated: commit requires `velocity.x > vThreshold` for prev (positive) and `velocity.x < -vThreshold` for next (negative). Doc says "in the correct direction" (line 165) — captured but not made explicit. | `src/components/swipe-nav.tsx:141-144` |
| low | `barTransitionDurationMs` is wired into BOTH `app-header.tsx` (header slide) and `home-floating-bars.tsx` (footer + VoiceLaunchBar). Doc mentions header/footer but not that the same value also drives `VoiceLaunchBar` transition. | `src/components/home-floating-bars.tsx:24,28-32` |
| low | `useScrollHide` "at bottom" threshold is a fixed 10px (`scrollHeight - (innerHeight + scrollTop) <= 10`) and scroll-hide only triggers past 50px (`current > 50`). Doc describes the auto-hide sequencing accurately but omits these two literal thresholds. | `src/hooks/use-scroll-hide.ts:40-41,56` |
| low | The Reorder list container styling (`rounded-lg border bg-background/50 p-2`) and the swipe gesture's `touchAction: "pan-y"` on the swipe layer are unmentioned (minor). | `src/components/settings/quick-nav-section.tsx:62`; `src/components/swipe-nav.tsx:210` |

## Spot-confirmed

- Four sub-sections inside one "Customization" `AccordionItem`, Palette icon, `iconColorClass="text-cyan-600 dark:text-cyan-400"`, `Accordion type="single" collapsible`. `src/app/settings/page.tsx:106-111,84`
- Appearance uses `next-themes` `useTheme()` (NOT the store), three options Light/Dark/System each with Sun/Moon/Monitor icon, caption "Choose light, dark, or follow your system preference", placeholder "Select theme" guarded by `{...(theme !== undefined && { value: theme })}`. `src/components/settings/appearance-section.tsx:15,26-53`
- ThemeProvider config `attribute="class" defaultTheme="system" enableSystem`. `src/app/providers.tsx:89`
- Quick Nav master button: `variant={showQuickNav ? "default" : "outline"}` label On/Off, controls `setShowQuickNav`; `showQuickNav &&` gates the Footer Items list + Icon Order. `src/components/settings/quick-nav-section.tsx:38-46`
- Reorder rows: `cursor-grab active:cursor-grabbing touch-none select-none`, `!item.enabled && "opacity-50"`, Switch `onClick`/`onPointerDown` `e.stopPropagation()`. `src/components/settings/quick-nav-section.tsx:72-93`
- Icon Order options: `rtl` → "Right to Left (recommended)", `ltr` → "Left to Right". `src/components/settings/quick-nav-section.tsx:115-116`
- Footer: filters disabled, then `order === "rtl" ? enabled.reverse() : enabled`; returns `null` when `orderedSections.length === 0`; `animate={{ y: hidden ? "100%" : 0 }}`, `transition.duration = transitionDuration` (default 0.2). `src/components/quick-nav-footer.tsx:32-56`
- Animation Timing ranges/steps/clamps: scroll 100–1000/50 `sanitizeNumericInput(...,100,1000)`; autoHide 0–2000/100 `(...,0,2000)`; barTransition 50–500/50 `(...,50,500)`. `src/components/settings/animation-timing-section.tsx:36-77`; `src/stores/settings-store.ts:387-392`
- Swipe ranges/steps/clamps: distance 10–60/1 `(...,10,60)`; velocity 100–2000/50 `(...,100,2000)`. `src/components/settings/swipe-nav-section.tsx:36-104`; `src/stores/settings-store.ts:393-396`
- Defaults: theme "system", showQuickNav true, quickNavOrder "rtl", scrollDurationMs 300, autoHideDelayMs 500, barTransitionDurationMs 200, swipeNavDistanceThresholdPct 28, swipeNavVelocityThreshold 500. `src/stores/settings-store.ts:197,200-207`
- `DEFAULT_QUICK_NAV_ITEMS` order water/eating/bp/weight/urination/defecation all enabled; `QUICK_NAV_LABEL_OVERRIDES = {water:"Liquids", eating:"Food & Salt"}`. `src/lib/quick-nav-defaults.ts:17-30`
- Swipe-nav constants: `DIRECTION_LOCK_THRESHOLD = 8`, `RESISTANCE = 0.25`, `COMMIT_DURATION = 0.18`, `ENTER_DURATION = 0.22`. `src/components/swipe-nav.tsx:15-18`
- Edge resistance `next = next * RESISTANCE` when no prev/next route; commit needs `offset.x > threshold || velocity.x > vThreshold` AND route exists. `src/components/swipe-nav.tsx:110-111,141-146`
- `NAV_ROUTES` order `/profile → / → /medications → /analytics → /settings`; `[data-no-swipe]` → vertical lock. `src/lib/nav-routes.ts:11-17`; `src/components/swipe-nav.tsx:80-82`
- Persist key `"intake-tracker-settings"`, `SETTINGS_PERSIST_VERSION = 16`; v<5 seeds quickNavItems, v<9 seeds swipe thresholds 28/500. `src/stores/settings-store.ts:255,295-307,461-463`
- `resetToDefaults: () => set(defaultSettings)`; page calls it and toasts "Settings reset" / "All settings have been restored to defaults"; ghost button with `RotateCcw` icon, no confirm dialog. `src/stores/settings-store.ts:458`; `src/app/settings/page.tsx:70-76,146-154`
- `NumericInput` is `[−][input(type=number, min/max/step)][+]` with aria-labels "Decrease value" / "Increase value". `src/components/ui/numeric-input.tsx:34-67`
- Local input mirror state synced from store via `useEffect` in both timing and swipe sections. `src/components/settings/animation-timing-section.tsx:12-20`; `src/components/settings/swipe-nav-section.tsx:12-18`
- `incrementSetting`/`decrementSetting` use `Math.min`/`Math.max`; `validateAndSave` accepts finite value in `[min,max]` else reverts to the passed current value. `src/lib/settings-helpers.ts:6-48`
- `useScrollHide` `navSeqRef` guards stale auto-hide timers; force-hide cleared on scroll-up or at-bottom. `src/hooks/use-scroll-hide.ts:61-68,86-101`

## Low-confidence / could-not-verify

- Doc line 144: "the store mirrors it" regarding theme — the store has a `theme` field + `setTheme`, but the AppearanceSection writes only the next-themes hook. There is no code synchronizing next-themes' selection back into the Zustand `theme` field; the two are effectively independent. The doc's parenthetical "(the store mirrors it)" overstates the coupling, but this is a nuance rather than a hard inaccuracy — no syncing code found in the read surface, so flagged as low-confidence rather than confirmed. (`src/components/settings/appearance-section.tsx:15`; `src/stores/settings-store.ts:376`)
- Migration claim "Older stored blobs forward-migrate to v16" is structurally correct (the `migrate` chain runs cumulative `if (version < N)` blocks up to 16); not exhaustively step-traced for every prior version but the relevant v5/v9 seeds were confirmed.
