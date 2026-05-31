# Verification — 10-card-shell-theming

**Verdict:** minor-gaps  ·  checked 88 claims, verified 81.

Scope: read all 3 core files (`card-shell.tsx`, `card-themes.ts`, `quick-nav-defaults.ts`) line-for-line, all 18 "Files covered" consumers, plus `progress.tsx`, `page.tsx`, and `settings-store.ts` for anchors/defaults. Cross-checked every per-domain token digit-for-digit against `card-themes.ts:38-269`.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | Per-domain token table lists `progressGradient` values as e.g. `from-sky-400 to-cyan-500`, `from-amber-400 to-orange-500`, etc. (table cols + per-domain detail lines 91-125). | Every `progressGradient` (and `progressExtended`) class string is prefixed with `bg-gradient-to-r ` in code, e.g. `"bg-gradient-to-r from-sky-400 to-cyan-500"`. The doc drops the `bg-gradient-to-r ` prefix throughout the table and detail rows — a "digit-for-digit" value mismatch. | `card-themes.ts:49-50,70-71,91-92,112,237,258` |
| medium | Line 7, 50, 85: lists `outlineText` as a real token that drives "outline (outlineBorder/outlineText) variant" buttons; line 85 enumerates it among the 20 fields that are consumed. | `outlineText` is defined on the interface and on all 11 themes but is **never read** anywhere in `src/`. Only `outlineBorder` is consumed (one site: preset-tab). `outlineText` is dead/unused. | grep: only refs are `card-themes.ts` definitions; consumer = `preset-tab.tsx:607` (outlineBorder only) |
| low | Line 46 & 128 present `section-salt`, `section-caffeine`, `section-alcohol` as live "scroll targets" / quick-nav anchors alongside the others. | Only six anchors exist in the DOM: `section-water`, `section-food-salt`, `section-bp`, `section-weight`, `section-urination`, `section-defecation` (`page.tsx:41-63`). `section-salt`/`section-caffeine`/`section-alcohol` are `sectionId` strings in the theme map but have **no matching element**, so they are not reachable scroll targets. (Doc's Quick-nav-defaults section correctly notes only the 6 defaults are wired, so this is a partial internal contradiction.) | `page.tsx:41-63`; `card-themes.ts:79,246,267` |
| low | Line 48: "Increment / decrement steppers (water, beverage, weight) — round buttons themed with `hoverBg`; the central value uses `inputBg` container + `inputText`." Implies weight's center also uses inputBg/inputText. | Weight card's stepper buttons use `hoverBg` (correct), but its center is an `InlineEdit` with hard-coded `text-4xl font-bold` classes — weight's `inputBg`/`inputText` tokens are `""` and are **not** applied. Only water/beverage tabs use `inputBg`+`inputText`. | `weight-card.tsx:184,191-211`; `card-themes.ts:136-137` |
| low | Line 22 & 136: cites CardShell prop-comment example label as `"Food + Sodium"` for the eating theme. | The actual JSDoc in code reads `"Food + Sodium"`... confirmed verbatim at `card-shell.tsx:10`. (No inaccuracy — but note the real on-screen food card hard-codes `"Food"`, not `"Food + Sodium"`, at `food-salt-card.tsx:64`; doc states this correctly at line 137.) | `card-shell.tsx:10`; `food-salt-card.tsx:64` |

(The last row is a confirmation, retained for traceability; not an error.)

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `food-salt-card.tsx` chrome is NOT a faithful clone of CardShell's header: it uses `flex items-center gap-2 mb-4` with **no `justify-between`** and no `headerRight` slot (it has no latest-stat header). Doc (line 186) calls it "inline chrome" but implies the same anatomy. | `food-salt-card.tsx:56` |
| low | `liquids-card.tsx` wrapper omits the `transition-all duration-300` part of the fixed Card class and splits gradient/border into a template literal (`bg-gradient-to-br ${theme.gradient} ${theme.border}`) rather than the canonical class list. Doc (line 16, 141) presents the chrome constants as uniform across cards. | `liquids-card.tsx:216-220` |
| low | `TAB_THEMES` in liquids-card maps **both** `water` and `beverage` tabs to `CARD_THEMES.water` (4-key map incl. `coffee`→caffeine, `alcohol`→alcohol). Doc (line 33, 187) says tabs map `water`/`caffeine`/`alcohol` but omits that `beverage` also aliases to `water`. | `liquids-card.tsx:33-38` |
| low | BP card "irregular heartbeat = Yes" toggle uses a hard-coded **red** active style (`bg-red-100 border-red-300 dark:bg-red-900/50 dark:border-red-700`), NOT `theme.activeToggle`. Doc (line 50, 67) implies all toggles use `activeToggle`. | `blood-pressure-card.tsx:392` |
| low | `text-metrics.tsx` over-extended progress fill uses a **literal** `"bg-red-500"` for `indicatorClassName`, not `theme.progressOverLimit`. (Functionally identical value, but the token is not the source.) The food-salt/liquids consumers DO use `theme.progressOverLimit`. | `text-metrics.tsx:223,275,329` |
| low | `record-row.tsx` maps the unified `intake` type onto theme keys with a fallback: `water`→water, `sugar`→sugar, **everything else (incl. salt/potassium)**→`salt`. Doc (line 30, 193) says rows pick "by record type" but omits the salt-fallback for non-water/non-sugar intake types. | `record-row.tsx:29-31` |
| low | Settings store default `quickNavOrder` is `"rtl"` (not the footer prop default of `0.2`/ltr). The quick-nav-section UI labels RTL "(recommended)". Doc states the footer's own default `order` only implicitly; the persisted user default of `"rtl"` is not mentioned. | `settings-store.ts:201`; `quick-nav-section.tsx:115` |
| low | Caffeine/alcohol latest-value cells in text-metrics fall back to `text-muted-foreground` when total is 0 (only color via `latestValueColor` when > 0). A presentational state the doc's States section does not list. | `text-metrics.tsx:406-409,423-429` |

## Spot-confirmed

- CardShell chrome constants exact: `relative overflow-hidden transition-all duration-300 bg-gradient-to-br`, `<CardContent className="p-6">`, header `flex items-center justify-between mb-4`, icon chip `p-2 rounded-lg`, icon `w-5 h-5`, label `font-semibold text-lg uppercase tracking-wide`, label resolution `{label ?? theme.label}` — all verbatim. `card-shell.tsx:22-47`.
- 11 domain keys with exactly the listed labels/icons; `CardThemeKey = keyof typeof CARD_THEMES`; `as const`. `card-themes.ts:38-271`.
- `CardTheme` has exactly the 19 listed-as-"20" fields... doc line 26/84 says "20 token fields" but actually enumerates **19** (label, icon, gradient, border, iconBg, iconColor, buttonBg, outlineBorder, outlineText, progressGradient, progressExtended, progressOverLimit, hoverBg, inputBg, inputText, loadingBg, latestValueColor, activeToggle, sectionId = 19). The interface has 19 members. Minor count slip, not flagged as high since the field list itself is correct. `card-themes.ts:16-36`.
- Caffeine deliberately darker: `iconColor: text-yellow-700 dark:text-yellow-400`, `buttonBg: bg-yellow-700 hover:bg-yellow-800` — confirmed. `card-themes.ts:233-234`.
- Empty-string tokens for event domains (weight/bp/eating/urination/defecation): `progressGradient`/`progressExtended`/`inputBg`/`inputText` all `""`. `card-themes.ts:132-137,153-158,174-179,195-200,216-221`.
- `potassium` has `progressGradient` but no `progressExtended` key at all; `caffeine`/`alcohol` have `progressExtended: ""`. `card-themes.ts:102-121,238,259`.
- Over-limit precedence: `isOverExtended` → value 100, extendedValue→0, targetMarkerPct→0, indicator = `progressOverLimit`; over-target → orange text + "extra" sub-line. `food-salt-card.tsx:105-117`; `text-metrics.tsx:217-227,245-257`.
- `DEFAULT_QUICK_NAV_ITEMS` order water/eating/bp/weight/urination/defecation all enabled; `QUICK_NAV_LABEL_OVERRIDES` water→"Liquids", eating→"Food & Salt". `quick-nav-defaults.ts:17-30`.
- Footer: filters disabled first, then RTL reverse; returns null when 0 enabled; default `transitionDuration = 0.2`. `quick-nav-footer.tsx:32-49,26`.
- `edit-substance-dialog` picks `caffeine` vs `alcohol` by `record?.type === "caffeine"`. `edit-substance-dialog.tsx:48-49`.
- History `filterColorMap` maps type→`buttonBg`; records-tab includes caffeine/alcohol; history-drawer omits them. `history-drawer.tsx:199-207`; `records-tab.tsx:91-103`.
- Weekly grid: future `---` in `text-muted-foreground/50`, today `font-semibold`, no-data `text-muted-foreground/50`, in-extended-zone orange, over-extended red. `text-metrics.tsx:466-487`.
- Weight skeleton stacked (`h-6 w-16` value + `h-4 w-24` date); urination/defecation skeleton `h-6 w-20 rounded animate-pulse`. `weight-card.tsx:147-149`; `urination-card.tsx:127`; `defecation-card.tsx:128`.
- Submitting state: quick-log buttons disabled via `submittingAmount !== null`, `opacity-70` on active, `Loader2 animate-spin`. `urination-card.tsx:142-150`.

## Low-confidence / could-not-verify

- Doc line 9/Purpose claim "all 10+ domains share one anatomy" — three cards genuinely share CardShell; the other root cards (food-salt, liquids, bp) only *re-implement* the chrome inline and diverge in small ways (see Omissions). The "single anatomy" claim is aspirational/loose but defensible as design intent; not flagged as a hard inaccuracy.
- "20 token fields" vs actual 19 — counted the interface members three times; it is 19. Treated as a minor count slip rather than a structural inaccuracy because the enumerated field names (line 85) are all correct and complete.
- Did not exercise runtime behavior (no app run); all findings are from static source reading.
