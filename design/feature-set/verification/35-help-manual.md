# Verification — 35-help-manual

**Verdict:** minor-gaps  ·  checked 78 claims, verified 74.

The document is an unusually faithful description of the help/manual feature. All
file paths, line ranges, verbatim copy, callout tone maps, domain tables, seed
fixture values (digit-for-digit), preview registry entries, isolation seam
behavior and the DOM test contract were confirmed against source. Two real
inaccuracies were found (one a hard count error), plus a couple of type-precision
overstatements and a minor in-product copy mismatch worth flagging.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "**Manuals (`MANUALS`, 14 total)**" | There are exactly **13** manuals in the `MANUALS` array (and the doc's own table lists only 13 rows). The "14 total" count is wrong. | `src/lib/help/manuals.ts:129-601` (13 `slug:` entries) |
| low | Data-model section types `UrinationRecord.amountEstimate ("small"\|"medium"\|"large")` and `DefecationRecord.amountEstimate` as a fixed enum | Both interfaces declare `amountEstimate?: string` — a loose optional string, not a typed union. The seed data happens to use those three values, but the type does not constrain them. | `src/lib/db.ts:115` (`amountEstimate?: string`) and the matching DefecationRecord field |
| low | Data-model section types `SubstanceRecord.source ("standalone")` as if the field's type is just `"standalone"` | The field type is `'water_intake' \| 'eating' \| 'standalone'`; the seed merely uses `"standalone"`. (Doc's framing is ambiguous — the seed value is correct, the type is wider.) | `src/lib/db.ts:312` |
| low | (In-product, surfaced by doc Sub-components/States as accurate copy) settings manual callout text: `the "How does this work?" link in the shake / bug-report dialog`. The doc elsewhere correctly states the dialog actually reads "Wanna read the manual?" / "Open the manual". The manual's own copy ("How does this work?") does not match the real dialog wording. | Dialog renders "Wanna read the manual?" heading + "Open the manual" button; no "How does this work?" string exists anywhere. | `src/lib/help/manuals.ts:596` vs `src/components/report-bug-dialog.tsx:365,380`; grep for "How does this work" returns only the manual copy line |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The doc says the Settings entry point is the "User manual" section, but it is mounted inside a Settings accordion group literally labeled **"Help & Manual"** (`SettingsAccordionGroup ... label="Help & Manual"`). The `HelpSection` h3 is "User manual"; the wrapping group header is "Help & Manual". Doc conflates the two. | `src/app/settings/page.tsx:126-127`, `src/components/settings/help-section.tsx:14` |
| low | `HelpSection` renders descriptive body copy ("Step-by-step guides for every card, input and feature…") not quoted by the doc. Minor — doc didn't claim to quote it. | `src/components/settings/help-section.tsx:17-21` |
| low | `PREVIEW_STORES` doc-comment in db.ts still says "the current (v19) schema" while `DB_SCHEMA_VERSION = 21`; the doc copies the spirit ("schema `DB_SCHEMA_VERSION`") correctly but does not flag this stale in-code comment. Not a doc error, noted for completeness. | `src/lib/db.ts:909,906,914` |
| low | `BloodPressureRecord` carries `irregularHeartbeat?: boolean` (and `note?`), which the BP preview seed does not set; doc's "fields used" list for BP omits `note` (acceptable — it lists only seeded fields) but the existence of `irregularHeartbeat` on the model is unmentioned. Trivial. | `src/lib/db.ts:85` |
| low | `IntakeRecord` has composable fields (`groupId`, `originalInputText`, `groupSource`, plus `potassium` as a 4th `type`); the doc's "fields used" list is intentionally scoped to seeded fields and says so, so this is not a defect — flagged only as model surface the previews could touch. | `src/lib/db.ts:9,19-21` |

## Spot-confirmed

- `ManualDomainId` 7-value union and `CalloutTone` 4-value union — exact match. `src/lib/help/manuals.ts:29-38`
- `MANUAL_DOMAINS` table (id/label/blurb/icon/colorClass) — all 7 rows verified digit/string-for-string incl. `text-sky-600 dark:text-sky-400` … `text-slate-600 dark:text-slate-400`. `src/lib/help/manuals.ts:77-127`
- All 13 manual rows (slug/title/domain/icon) — verified. `src/lib/help/manuals.ts:129-601`
- `TONE` callout map: tip→Lightbulb/"Tip"/emerald, note→Info/"Note"/sky, warning→AlertTriangle/**"Important"**/amber (label differs from tone id — correctly flagged by doc), privacy→ShieldCheck/"Privacy"/violet; each has explicit `dark:` variants. `src/components/help/manual-callout.tsx:15-38`
- `MANUAL_PREVIEWS` 6 entries (how-it-works→TextMetrics, logging-drinks→LiquidsCard, food-and-sodium→FoodSaltCard, blood-pressure→BloodPressureCard, weight→WeightCard, urination-and-bowel→Urination+Defecation) keyed by slug → `{ render, seed }`. `src/components/help/preview-registry.tsx:31-61`
- Seed fixtures digit-for-digit: BP 118/76 hr68 sitting/left −1d, 124/81 hr72 sitting/left −3d, 131/84 hr77 standing/right −6d. `src/lib/help/preview-data.ts:26-57`
- Weight 74.6 −1d, 74.9 −4d, 75.4 −8d. `:65-79`. Liquids water 250/200/300 at −1h/−3h/−6h source "manual" `:87-112`. FoodSalt salt 400 "Lunch" −2h, 250 "Breakfast" −5h `:120-139`. Bathroom: urination medium −1h, large −4h, small "pale" −8h; defecation medium "normal" −5h, small −1d−4h `:147-184`. TextMetrics water 500/300, salt 600, caffeine 95mg/250ml "Coffee" source "standalone" aiEnriched false `:191-229`. `DAY_MS = 86_400_000`, `HOUR_MS = 3_600_000` `:19-20`.
- `ComponentPreview` runtime states loading/ready/error + reset (generation bump), QueryClient `{ queries:{retry:false,gcTime:0}, mutations:{retry:false} }` ref-guarded, `<div key={generation}>`, suspendEngine/setActiveDatabase on mount, resetActiveDatabase/resumeEngine/preview.delete + cancelled flag on cleanup. Frame caption "Live preview · sample data · changes are not saved", FlaskConical + RotateCcw "Reset", "Preparing preview…", "The preview could not be loaded.". `src/components/help/component-preview.tsx:29-110`
- `ManualView`: `<ComponentPreview key={manual.slug}>`, "Try it" heading + body copy verbatim, body split on `\n\n`, numbered steps pill `{s+1}`, `mt-3` when body precedes steps/bullets, callout via ManualCallout. `src/components/help/manual-view.tsx:32-97`
- Not-found fallback "That manual could not be found." + "Back to the manual" → `router.push("/help")`. `src/app/help/[slug]/page.tsx:14-23`
- Index subtitle verbatim + `HelpTopBar title="User Manual"` + `router.back()`, hover→`bg-accent`, card `bg-card`, ChevronRight, empty domains filtered by `getManualsByDomain`. `src/components/help/help-index.tsx:16-65`, `src/lib/help/manuals.ts:607-612`
- `HelpTopBar` gradient `from-slate-50` / `dark:from-slate-950`, sticky `top-0 z-40`, ArrowLeft + sr-only "Back". `src/components/help/help-top-bar.tsx:19-31`
- db plumbing: `export let db: AppDatabase = realDb` live binding (`realDb = new Dexie("IntakeTrackerDB")`), `createPreviewDatabase()` → `IntakeTrackerPreviewDB-<counter>` at `DB_SCHEMA_VERSION` (=21) with `PREVIEW_STORES`, `setActiveDatabase`/`resetActiveDatabase`, `previewDbCounter` increments. `src/lib/db.ts:448-457,906-947`
- DOM test asserts 118/76 (BP), 250ml (drinks), pale+normal (bathroom) and mocks `@/components/auth-guard`'s `useAuthGate` → `true` for LiquidsCard preset tab. `src/components/help/component-preview.dom.test.tsx:7-58`
- Bug-dialog entry point closes dialog (`onOpenChange(false)`) **before** `router.push("/help")`. `src/components/report-bug-dialog.tsx:374-377`
- `HELP_INDEX_ICON = BookOpen`, helper API `getManual`/`getManualsByDomain`/`getManualPreview` all present. `src/lib/help/manuals.ts:603-614`, `src/components/help/preview-registry.tsx:63-65`
- No separate substances/caffeine manual exists; substances surface only via the `TextMetrics` preview (which queries caffeine). `src/components/text-metrics.tsx:104-117`

## Low-confidence / could-not-verify

- In-manual prose claims (e.g. "default 1500 mg sodium and 30 g sugar", "Five tabs", "day rolls over at an hour you choose", AI key gating, retroactive dose picker, undo toast) are product copy *inside* the manual data, not structural claims the doc itself asserts about behavior. The doc characterizes them as "cross-references / AI disclaimers / where-to-find" copy, which is accurate; I did not independently re-verify every numeric default against the live FoodSaltCard/settings store, as that is outside the help-manual unit's surface. The 1500/30 defaults in particular should be spot-checked against `settings-store.ts` if exact-default fidelity matters, but they are not a claim the verification document stakes on the help feature's own code.
