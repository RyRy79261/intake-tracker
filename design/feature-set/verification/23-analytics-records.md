# Verification — 23-analytics-records

**Verdict:** minor-gaps  ·  checked 92 claims, verified 84.

The document is a high-fidelity, mostly-accurate description of the Records tab. The
material defects all cluster around **potassium**: the doc repeatedly asserts that
potassium intake records get their own row icon/label/unit and a dedicated edit-dialog
treatment, but the actual `RecordRow` and `EditIntakeDialog` code only branch on
`water | sugar | salt`, so potassium silently falls into the **salt/Sodium** theme. A
second cluster concerns the **BP irregular-heartbeat control**, which the doc lists as an
editable field but which is never wired up in the Records tab. Everything else
(enums, colors, icons, page size, filter rules, validation messages, derived alcohol math,
soft-delete model, range plumbing) checks out digit-for-digit.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Domain icons: ... potassium=Banana" and "Measurement units: potassium=`mg`" / "Domain theme labels ... potassium=`Potassium`" presented as what rows render (§Enums L95,L99,L101). | `RecordRow` for intake computes `themeKey = water ? "water" : sugar ? "sugar" : "salt"` — there is **no potassium branch**, so a potassium intake record renders with the **salt** theme: Sparkles icon, label "Sodium", and unit "mg". (Unit "mg" is coincidentally correct; icon + label are wrong.) The Banana/"Potassium" theme exists in `CARD_THEMES` but is never used by the row. | `record-row.tsx:27-42`; theme defined `card-themes.ts:102-121` |
| medium | "`EditIntakeDialog` — edit amount / time / note for water/salt/sugar/**potassium**" (§Sub-components L172). | `EditIntakeDialog` only branches on `water`/`sugar`/else; a potassium record opens with title "Edit **Sodium** Entry", unit "mg", and an amber (salt) Save button. Functionally editable but mislabeled as Sodium. | `edit-intake-dialog.tsx:43-52,114-122` |
| medium | "BP edit: ... Edit writes `systolic`, `diastolic`, `heartRate?`, `position`, `arm`, `timestamp`, `note`" lists `irregularHeartbeat` as a written field (§Data model L129) and as an editable control (§Sub-components L174). | The BP submit handler builds `updates` with systolic/diastolic/heartRate/position/arm/timestamp/note only — **`irregularHeartbeat` is never written**. | `records-tab.tsx:287` |
| medium | "Irregular heartbeat (conditional control): `no` \| `yes`" listed under BP edit dialog options (§Enums L106); §Sub-components L174 lists "(optional irregular-heartbeat)". | The dialog *supports* the control, but it only renders when `onIrregularHeartbeatChange` is truthy; in the Records tab `EditBloodPressureDialog` is rendered **without** `irregularHeartbeat`/`onIrregularHeartbeatChange` props, so the control never appears in this feature. | dialog guard `edit-blood-pressure-dialog.tsx:163`; render-site omits props `records-tab.tsx:480-499` |
| low | "Alcohol edit: amount field is **ABV %**" / "Caffeine edit: amount field is **mg** (`amountMg`)" implying labels (§Enums L113,L115). | Field labels in the dialog are "**% ABV**" (not "ABV %") for alcohol and "**Caffeine (mg)**" for caffeine. Semantics correct; label strings differ. | `edit-substance-dialog.tsx:50` |
| low | "Systolic input ... (helper text 'typically 90–180')", diastolic "typically 60–120", heart rate "typically 60–100" (§Enums L107-109). | These "typically" strings exist only as `sr-only` (screen-reader) `aria-describedby` paragraphs, not visible helper text. | `edit-blood-pressure-dialog.tsx:92-94,109-111,127-129` |
| low | "entry-count pill (`N entry` / `N entries`...)" and singular handling described as general (§Features L22). | Correct, but the singular/plural ternary uses literal `"entry"`/`"entries"`; confirmed accurate — flagged only because the doc nowhere notes the count is `dayRecords.length` *after pagination slicing*, i.e. a partially-loaded final day shows the visible count, not the day's true total. Minor presentational nuance. | `records-tab.tsx:421` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `EditEatingDialog` and `EditSubstanceDialog` use a `Textarea`/`Input` for the note/description but the doc says eating edits "time + note only" — accurate — however the dialog also exposes an optional **grams** field (`onGramsChange`) that the Records tab never passes, so grams is not editable here. Worth noting the field exists but is intentionally unused in this feature. | `edit-eating-dialog.tsx:72-86`; render-site `records-tab.tsx:500-509` |
| low | Defecation edit dialog passes `allowNoEstimate` (adds a "No estimate" sentinel option mapping to `""`), so the defecation amount Select has a 4th "No estimate" entry that urination's does not. Doc lists only Small/Medium/Large for both. | `edit-defecation-dialog.tsx:27`; sentinel `edit-estimate-entry-dialog.tsx:24,109` |
| low | Edit dialogs share a single set of form-state variables (`editTimestamp`, `editNote`, etc.) across all 7 dialogs; opening one edit primes those shared fields. Doc treats each dialog as independent. Behavioral, not user-visible. | `records-tab.tsx:152-165,197-243` |
| low | The substance amount input enforces `min={0}` and `step` "1" (caffeine) / "0.1" (alcohol); intake amount `min=1 step=1`; weight `min=0.1 step=0.1`. Doc gives validation ranges from the JS handlers but omits the HTML input min/step constraints (a secondary client guard). | `edit-substance-dialog.tsx:51,93-94`; `edit-intake-dialog.tsx:66-67`; `edit-weight-dialog.tsx:55-56` |
| low | `RecordRow` edit/delete buttons have explicit hover color theming (blue for edit, red for delete) and `aria-label`/`title` "Edit entry"/"Delete entry"; the row body is `role="button"` `tabIndex={0}`. Doc covers the role/keyboard but not the per-button labels/affordances. | `record-row.tsx:129-149` |
| low | Day-group date header uses `Calendar` icon at `w-4 h-4`; the empty-state `ClipboardList` is `w-12 h-12 opacity-30` ("12×12, 30% opacity" in doc — confirmed). Load-More uses `ChevronDown`. All icon sizes are present in code but only partially cited by doc. | `records-tab.tsx:410,418,446` |

## Spot-confirmed

- `PAGE_SIZE = 50`; pagination is `filteredRecords.slice(0, page * PAGE_SIZE)`, `hasMore = visibleEnd < filteredRecords.length`. `records-tab.tsx:53,169-171`
- Page resets to 1 on range change (`useEffect` on `range.start/range.end`) and on every filter pill click (`setPage(1)`). `records-tab.tsx:122-124,398`
- `FILTER_TABS` order and labels exactly as documented incl. potassium label "K", sugar/potassium gated via `optional` + `useOptionalTrackerEnabled`. `records-tab.tsx:72-89,109-116`
- Filter pill tint: selected → `variant="default"` + (non-"all") `filterColorMap[value]` from `CARD_THEMES[...].buttonBg`. `records-tab.tsx:91-103,390-401`
- `buttonBg` accent colors verified: water sky-600, salt amber-600, sugar pink-600, potassium purple-600, weight emerald-600, bp rose-600, eating orange-600, urination violet-600, defecation stone-600, caffeine yellow-700, alcohol fuchsia-600. `card-themes.ts:46,67,88,109,129,150,171,192,213,234,255`
- Domain icons verified: Droplets/Sparkles/Candy/Banana/Scale/Heart/Utensils/Droplet/CircleDot/Coffee/Wine. `card-themes.ts:1-14` + each theme's `icon`
- Domain labels: salt label is "Sodium" (not "Salt"); bp label "Blood Pressure"; all others as documented. `card-themes.ts:61,144`
- `UnifiedRecord` union and `FilterType` exactly as documented; substances split into `caffeine`/`alcohol` via `r.type` cast. `history-types.ts:4-14`; `use-records-tab-queries.ts:48-51`
- `filterRecords` rules: `all`→all; water/salt/sugar/potassium → `type==="intake" && record.type===<that>`; caffeine/alcohol → unified `type`; else unified `type`. `history-types.ts:49-58`
- `groupRecordsByDate` keys via `toLocaleDateString("en-US", {weekday:"short", year:"numeric", month:"short", day:"numeric"})` = "Wed, May 31, 2026" style; uses device-local `new Date(timestamp)`. `history-types.ts:31-37`
- Sort: `unified.sort((a,b) => getRecordTimestamp(b) - getRecordTimestamp(a))` (desc). `use-records-tab-queries.ts:54`
- `useLiveQuery` with `[]` synchronous default; parallel `Promise.all` over 7 `getXByDateRange` services. `use-records-tab-queries.ts:28-39,58`
- `URINATION_ESTIMATE_ML = { small:150, medium:300, large:500 }`. `analytics-types.ts:166-170`
- `GRAMS_PER_STANDARD_DRINK = 10`, `ETHANOL_DENSITY_G_PER_ML = 0.789`; `standardDrinksFromAbv` and `abvFromStandardDrinks` (returns 0 when volume ≤ 0). `alcohol-units.ts:7,10,18,28-29`
- Alcohol edit: derives `amountStandardDrinks = parseFloat(standardDrinksFromAbv(amt,vol).toFixed(2))`; legacy back-derive via `abvFromStandardDrinks` shown `parseFloat(abv.toFixed(1))`. `records-tab.tsx:368-370,232-238`
- BP input ranges: systolic min=60/max=300, diastolic min=40/max=200, heart rate min=30/max=250 placeholder "BPM"; position sitting/standing, arm left/right. `edit-blood-pressure-dialog.tsx:83-84,101-102,119-124,139-140,154-155`
- Intake validation: `parseInt`, NaN or `<=0` → "Invalid amount"; null timestamp → "Invalid date/time". Weight: `parseFloat`, `<=0` → "Invalid weight". BP: `<=0` → "Invalid values". Substance: empty desc → "Description required", amount `<0` → "Invalid amount", alcohol ABV `<=0||>100` → "ABV must be between 0 and 100", missing volume → "Enter a volume greater than 0". `records-tab.tsx:252-253,266,283,340,343,349-355`
- `parseDateTimeLocalOrNull` wraps `dateTimeLocalToTimestamp` in try/catch; the underlying fn throws (never NaN). `records-tab.tsx:58-64`; `date-utils.ts:33-39`
- Delete is immediate (no confirm), per-row `Loader2` spinner via `deletingId`, toast "Entry deleted"/"Record removed" or "Error"/"Could not delete the entry"; button `disabled={isDeleting}`. `records-tab.tsx:177-194`; `record-row.tsx:139-149`
- Soft deletes: weight/BP/substance via `deleteWeight`/`deleteBP`/`deleteSubstance` helpers from `useRecordsTabData`; all services set `deletedAt`. `use-records-tab-queries.ts:61-73`; `intake-service.ts:44`, `substance-service.ts:127`
- Services filter `deletedAt === null` and `.between(start,end)` on timestamp. `intake-service.ts:184-192`
- Empty state: `ClipboardList w-12 h-12 opacity-30` + "No records in this time range", shown when `filteredRecords.length === 0`; list region `min-h-[40vh]`. `records-tab.tsx:407-412`
- Row hover `hover:bg-muted/30`, `cursor-pointer`, `role="button"`, Enter/Space → onEdit, edit-icon click `stopPropagation`. `record-row.tsx:101-127`
- Measurement strings: intake water `"{amount} ml · {sourceLabel}"` via `getLiquidTypeLabel`, salt `"{amount} mg"`, sugar `"{amount} g"`; weight `"{w} kg"`; bp `"{sys}/{dia} mmHg"`; eating note or "—"; urination/defecation `amountEstimate · note` joined or "—"; caffeine `"{desc} · {mg} mg"` or "Caffeine"; alcohol `"{desc} · {N drink(s)}"` or "Alcohol", plural-aware via `!== 1`. `record-row.tsx:36-97`
- Parent: tabs `summary|correlations|records|titration`, default scope `"7d"`, `customRange ?? scopeRange`, hosts `TimeRangeSelector` + `ExportControls`. `analytics/page.tsx:16-18,38-42,49-55`
- `TimeScope = "24h" | "7d" | "30d" | "90d" | "all"`. `analytics-types.ts:24`
- `useUpdateSubstance` called as `updateSubstanceMutation(id, updates)` (not `.mutateAsync`). `use-substance-queries.ts:61-68`; `records-tab.tsx:374`
- `useKeyboardAwareScroll().onFocus` passed to all dialog inputs; scrolls focused field into view. `records-tab.tsx:107,466` etc.; `use-keyboard-scroll.ts:42`

## Low-confidence / could-not-verify

- §States "out-of-range flagging" note (L34) is editorial/design commentary, not a code claim — consistent with code (no clinical out-of-range row tinting exists). The `getBPCategory` classifier in `constants.ts:57-71` exists but is **not** used by the Records tab, so the note's "BP validation min/max ranges exist in the edit dialog" is the only relevant claim and is correct.
- §States "Offline/syncing: no special UI ... sync engine mirrors to Postgres out of band" (L68) — the local-first behavior is verifiable in-component (no online checks); the sync-engine description is out of this unit's scope and was not re-verified against the sync layer.
- The Dexie `.between(start, end)` default bound semantics (inclusive lower / exclusive upper) could subtly drop a record exactly at `end`; the doc does not make a claim about boundary inclusivity, so nothing to flag — noted only as a latent edge the doc is silent on. `intake-service.ts:186`
