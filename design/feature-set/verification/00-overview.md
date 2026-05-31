# Verification — 00-overview

**Verdict:** minor-gaps  ·  checked 41 claims, verified 38.

Note: `00-overview.md` is a cross-cutting frame document, not a per-unit doc. It carries **no
"Files covered:" line** (it is the only doc that points at the other 46 units rather than at source
files). Verification therefore checked its concrete factual claims — `CARD_THEMES`, hue degrees,
icons, route order, component patterns, global states, and the 46-unit index — against the actual
source. The vast majority are accurate and digit-precise. The one material defect is a fabricated
"Bristol scale" requirement that does not exist anywhere in the codebase.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| **high** | §3: "*Bristol type* … selectors render as tap-the-option segmented chips" and §7 item 4: enums to preserve include "**Bristol types 1–7**" — presented as a load-bearing functional contract. | No Bristol scale exists anywhere. `DefecationRecord` has only `amountEstimate` ("small"/"medium"/"large") + free-text `note` ("e.g. consistency, urgency"). Repo-wide `grep -ri bristol src/` (excluding nothing) returns **zero** non-test hits. The defecation card renders `DEFECATION_AMOUNT_OPTIONS` only. | `src/lib/db.ts:124-134` (interface), `src/lib/constants.ts:88-92` (amount options), `src/components/defecation-card.tsx:33,138,176,188` (note placeholder) |
| **low** | §2: CVD collision "`weight↔medication` **<8°**". | weight hue = 160, medication hue = 168 → difference is **exactly 8°**, not strictly less than 8°. | `src/app/globals.css:33` (`--weight: 160 …`), `:47` (`--medication: 168 …`) |
| **low** | §4 + §7 item 4: dose states "taken/skipped/**missed**/pending". Omits "rescheduled". | Stored `DoseStatus = "taken" \| "skipped" \| "rescheduled" \| "pending"` — "missed" is **not** a stored enum member (it is a derived `DoseSlot` status used in UI/analytics); "rescheduled" **is** a stored member but is unlisted. The doc conflates the derived slot status with the stored enum and drops "rescheduled". | `src/lib/db.ts:138` (`DoseStatus`), `src/components/medications/time-slot-group.tsx:54` (derived "missed") |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | §2 table omits that `sugar`/`potassium`/`eating`/`defecation` have **no `--<domain>` HSL token of their own for sugar & potassium** (they are Tailwind-class-only in `CARD_THEMES`), while `eating` (25°) and `defecation` (33°) *do* have CSS-var hues. The doc cites degree values only for the var-backed domains, which is internally consistent, but a reader could assume all 11 have HSL tokens — only 9 do (water, salt, weight, bp, eating, urination, defecation, caffeine, alcohol) + medication. | `src/app/globals.css:29-48` (no `--sugar`/`--potassium`) |
| low | §3 lists toast variants "default/destructive/success" — accurate — but omits no behavior of note. (Listed here only to record that the variant set was checked and is exactly three.) | `src/components/ui/toast.tsx:30-38` |
| low | BP categories: doc never enumerates them; code uses a 6-tier ESH grade scale (Optimal / Normal / High normal / Grade 1–3 hypertension), not the common AHA normal/elevated/crisis. No direct conflict (doc only references "BP crisis" generically), but downstream unit docs must match this 6-tier scale. | `src/lib/constants.ts:57-71` |

## Spot-confirmed

- **§2 — 11 `CARD_THEMES` keys, exact set**: water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol. `src/lib/card-themes.ts:38-269`. Confirmed.
- **§2 — icons**: Droplets/Sparkles/Candy/Banana/Scale/Heart/Utensils/Droplet/CircleDot/Coffee/Wine all match the table. `src/lib/card-themes.ts:1-13,39-267`. `salt` label = "Sodium", `eating` label = "Eating" (doc table consistent).
- **§2 — hue degrees, digit-for-digit**: water 200° (`--water: 200 85% 55%` :29), salt 30° (:31), weight 160° (:33), bp 350° (:35), urination 258° (:39), caffeine 48° + **black fg** (`--caffeine: 48 96% 53%` / `--caffeine-foreground: 0 0% 0%` :43-44), alcohol 292° (:45), medication/Pill teal 168° (`--medication: 168 76% 36%` :47), eating 25° (:37), defecation 33° (:41). All confirmed. `src/app/globals.css`.
- **§2 — "three blues water/urination/primary"**: `--primary: 220 70% 50%` (:13), water 200, urination 258 — all blue-band. Confirmed.
- **§3 — Pill icon for Medications**: `nav-routes.ts:14` uses `Pill`; pill-icon component family confirmed. `src/lib/nav-routes.ts:1,14`.
- **§3 — Liquids tabs Water/Beverage/Coffee/Alcohol**: `TAB_THEMES = { water, beverage, coffee, alcohol }`. `src/components/liquids-card.tsx:33-47`.
- **§3 — `inputMode="decimal"` steppers**: `src/components/liquids-card.tsx:382,397`.
- **§3 — Settings single-open accordion of ~10 themed groups**: `<Accordion type="single" collapsible>` with exactly 10 `SettingsAccordionGroup`s (ai-features, data-storage, tracking, customization, medication, privacy-security, system, help, feedback, debug). `src/app/settings/page.tsx:84-134`.
- **§3 — Global dialog layer**: welcome-dialog, about-dialog, shake-to-report + report-bug-dialog, update-notification, error-boundary all present. `src/components/{welcome-dialog,about-dialog,shake-to-report,report-bug-dialog,update-notification,error-boundary}.tsx`.
- **§3 — Help live component previews**: `preview-registry.tsx:20` "Registry of live, interactive component previews shown inside manual pages". `src/components/help/preview-registry.tsx`.
- **§4 — Sync states (offline/syncing/synced/failed)**: `PulseState = "syncing" | "synced" | "offline" | "error"`; colors syncing=yellow-400, synced=emerald-500, offline=slate-400; "Sync failed" banner. `src/components/sync/sync-pulse-indicator.tsx:10,13-15`, `src/components/sync/sync-error-banner.tsx:22`.
- **§4 — Toast variants default/destructive/success**: `src/components/ui/toast.tsx:30-38`.
- **§5 — SwipeNav route order /profile → / → /medications → /analytics → /settings**: exact array order in `NAV_ROUTES`. `src/lib/nav-routes.ts:11-17`.
- **§5 — history/help/help/[slug]/auth/* are sub-surfaces (not top-route tabs)**: present as routes but absent from `NAV_ROUTES`. `src/app/{history,help,help/[slug],auth}/page.tsx`.
- **§5 — in-app MCP server route exists**: `src/app/api/mcp/[transport]/route.ts` plus oauth + well-known sub-routes.
- **§6 — 46 unit docs**: folder contains exactly `01-…` through `46-…` and titles match the index list. `design/feature-set/`.
- **§3 — Undo soft-delete services**: per-domain `undoDelete…` functions exist (intake, urination, weight, defecation, …). `src/lib/intake-service.ts:54`, `src/lib/urination-service.ts:56`, `src/lib/health-service.ts:71`, etc.
- **BP category function**: `getBPCategory` returns Optimal/Normal/High normal/Grade 1–3 hypertension with red reserved for Grade 2–3 — consistent with §1 "red reserved for clinical danger." `src/lib/constants.ts:57-71`.

## Low-confidence / could-not-verify

- **"~5s Undo toast"** (§3): could not confirm the 5-second figure. `use-toast.ts` sets `TOAST_REMOVE_DELAY = 1000000` (the standard shadcn near-infinite default), so the 5s window, if it exists, must be driven by a per-call `duration`/`setTimeout` at the call sites rather than the global delay. Not disproved, but the specific "~5s" number is unverified at the source cited. `src/hooks/use-toast.ts:7`.
- **Quantitative claims that are inherently descriptive** (e.g. "answer in under three seconds," "under two taps," "last 3–5" recent entries) are design intent, not code-checkable, and were not adjudicated.
- **sugar / potassium "pink→rose" / "purple→indigo" hue descriptions** (§2): these have no HSL tokens (Tailwind-class only), so the descriptions match the gradient classes (`from-pink-* to-rose-*`, `from-purple-* to-indigo-*`) rather than a degree value — consistent, but not expressible as a single hue number. `src/lib/card-themes.ts:81-121`.
