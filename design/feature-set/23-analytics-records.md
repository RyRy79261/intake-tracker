# 23 — Analytics: Records Table

**Files covered:**
- `src/components/analytics/records-tab.tsx` (the Records tab container, filter bar, grouped list, paging, all edit/delete orchestration + 7 edit dialogs)
- `src/hooks/use-records-tab-queries.ts` (`useRecordsTabData` — reactive multi-domain fetch + unify + sort, plus weight/BP/substance delete helpers)
- `src/lib/history-types.ts` (`UnifiedRecord`, `FilterType`, `filterRecords`, `groupRecordsByDate`, `getRecordTimestamp`, `getRecordId`)
- `src/components/history/record-row.tsx` (`RecordRow` — single record line item: icon, type label, measurement string, time, edit/delete buttons)
- `src/lib/card-themes.ts` (`CARD_THEMES` — per-domain label, icon, colors used by filter tabs and rows)
- `src/lib/analytics-types.ts` (`TimeRange`, `TimeScope`, `URINATION_ESTIMATE_ML`)
- `src/lib/alcohol-units.ts` (ABV ↔ standard-drinks conversion used in alcohol edit)
- `src/app/analytics/page.tsx` (parent: provides `range`, hosts Records as one of 4 analytics tabs)
- `src/lib/constants.ts` (`URINATION_AMOUNT_OPTIONS`, `DEFECATION_AMOUNT_OPTIONS`, `DEFAULT_LIQUID_PRESETS`)

**Purpose:** A single unified, filterable, paginated chronological list of *every* tracked health record (intake, weight, BP, eating, urination, defecation, caffeine, alcohol) within the selected analytics time range, grouped by day, with inline edit and delete for each row.

---

## Features

- **Unified cross-domain record list.** Fetches and merges 7 separate Dexie domains into one `UnifiedRecord[]` stream: water/salt/sugar/potassium intake, weight, blood pressure, eating, urination, defecation, and substances (caffeine + alcohol). Substances are split by `record.type` into two display types (`caffeine`, `alcohol`).
- **Reverse-chronological sort.** All unified records are sorted by `timestamp` descending (newest first) via `getRecordTimestamp(b) - getRecordTimestamp(a)`.
- **Day grouping.** Visible records are grouped into per-day buckets keyed by a localized date string (`"Wed, May 31, 2026"` style — `weekday: short, year: numeric, month: short, day: numeric`). Each group renders a date header with a `Calendar` icon (`w-4 h-4`) and an entry-count pill (`N entry` / `N entries`, singular/plural aware). The count is `dayRecords.length` — i.e. the number of records *currently visible after pagination slicing*, so a partially-loaded final day shows the visible count, not the day's true total.
- **Domain filter bar.** A horizontally-scrollable row of filter pills (tabs) that narrows the list to one domain (or "All"). The selected pill is tinted with that domain's theme color.
- **Optional-tracker gating.** Sugar and Potassium (`K`) filter pills are conditionally shown only when the corresponding optional tracker is enabled (`useOptionalTrackerEnabled("sugar" | "potassium")`).
- **Client-side pagination ("Load More").** Shows `PAGE_SIZE = 50` records per page; a "Load More" button (with ChevronDown icon) appends the next 50. Paging is purely client-side slicing of the already-fetched, filtered array (`filteredRecords.slice(0, page * 50)`).
- **Per-row measurement formatting.** Each `RecordRow` computes a domain-specific measurement string, type label, icon, and icon color (see Sub-components for exact formats).
- **Inline edit.** Tapping a row (or its pencil button) opens a domain-specific edit dialog pre-filled with current values; saving runs the matching mutation and shows a toast.
- **Inline delete.** Each row has a trash button that soft-deletes the record via the matching mutation, with a per-row deleting spinner and success/error toast.
- **Live/reactive data.** Uses `useLiveQuery` (Dexie React hooks) so the list updates automatically whenever any underlying record changes (add/edit/delete from anywhere in the app), with `[]` as the synchronous default for instant first render.
- **Range-driven.** The visible window is bounded by the analytics `TimeRange` (`{ start, end }` in Unix ms) passed from the parent. Records outside the range are never fetched.
- **Page auto-reset.** Page resets to 1 whenever the time range changes, or whenever the active filter changes.
- **Keyboard-aware scroll.** Edit dialog inputs receive an `onFocus` handler (`useKeyboardAwareScroll`) that scrolls the focused field into view above the mobile soft keyboard.

> Note on the "out-of-range flagging" angle: the current implementation does **not** color-flag clinically out-of-range values (e.g. high BP) in the row itself — rows are tinted only by domain theme color. BP validation min/max ranges exist in the edit dialog (see Enums). This is a candidate area for an alternative design (e.g. red badge on out-of-range systolic/diastolic).

---

## User actions & interactions

- **Tap a filter pill** → sets active `filter`, resets page to 1, re-filters the list. Selected pill switches from `outline` to `default` variant and (for non-"all") gets the domain's `buttonBg` color class.
- **Horizontal scroll the filter bar** → reveals filter pills that overflow (`overflow-x-auto`).
- **Tap a record row body** → opens the matching edit dialog (`role="button"`, also triggered by Enter/Space keys for accessibility).
- **Tap the pencil (edit) icon** → same as tapping the row; opens edit dialog. Click is stopped from bubbling so it doesn't double-fire.
- **Tap the trash (delete) icon** → immediately deletes the record (no confirm dialog), shows a `Loader2` spinner on that row while deleting, then toast `"Entry deleted" / "Record removed"` on success or `"Error" / "Could not delete the entry"` on failure. Button is `disabled` while `isDeleting`.
- **Tap "Load More"** → increments `page`, appending the next 50 records.
- **In an edit dialog:**
  - Change fields (amount, weight, systolic/diastolic, heart rate, position, arm, description, ABV, volume, amount estimate, time, note depending on type).
  - **Submit / Save Changes** → validates, runs the update mutation, closes dialog, toast `"Entry updated"`. On validation failure → a domain-specific destructive toast (no save, dialog stays open). On mutation error → `"Error" / "Could not update…"`.
  - **Cancel** or **click outside / Esc** → closes the dialog without saving (`onOpenChange` → `onClose`).
- **Edit time** via a native `datetime-local` input on every dialog.

---

## States & presentations

- **Default / populated:** day-grouped list with date headers, entry-count pills, and record rows.
- **Loading:** no dedicated skeleton — `useLiveQuery` returns `[]` immediately, so the first frame renders the **empty state** until data resolves (typically instant from local IndexedDB).
- **Empty (no records in range):** centered `ClipboardList` icon (12×12, 30% opacity) above the text "No records in this time range". Shown whenever `filteredRecords.length === 0` (true both for a genuinely empty range and for a filter that matches nothing).
- **Row hover:** subtle `hover:bg-muted/30` background; cursor pointer.
- **Row deleting:** trash icon swaps to a spinning `Loader2`; delete button disabled.
- **Has-more:** "Load More" button visible (centered, outline, with a `ChevronDown` `w-4 h-4` icon) when `visibleEnd < filteredRecords.length`.
- **All-loaded:** "Load More" hidden when all filtered records are visible.
- **Filter pill selected/active:** `default` variant + domain color background; others `outline` variant.
- **Edit dialog open/closed:** dialog controlled by whether its `editing<Type>` state is non-null (`open={record !== null}`).
- **Validation-error (within dialog):** destructive toast; dialog remains open; nothing persisted. Specific messages per field (see Validation).
- **Success:** non-destructive toast (`"Entry updated"` / `"Entry deleted"`).
- **Error (mutation throws):** destructive toast (`"Error"` + description).
- **Offline / syncing:** no special UI in this component — all reads/writes are local-first against IndexedDB; the sync engine mirrors to Postgres out of band, so the table behaves identically online and offline.
- **Min height:** the records list region holds `min-h-[40vh]` so the empty state and short lists don't collapse the layout.

Per-row presentation differs by domain (icon, label, measurement) — see Sub-components → RecordRow.

---

## Enums, options & configurable values

**`FilterType` / filter tabs (`FILTER_TABS`)** — value → label, in order:
- `all` → "All"
- `water` → "Water"
- `salt` → "Salt"
- `sugar` → "Sugar" *(optional: requires sugar tracker enabled)*
- `potassium` → "K" *(optional: requires potassium tracker enabled)*
- `weight` → "Weight"
- `bp` → "BP"
- `eating` → "Eating"
- `urination` → "Urination"
- `defecation` → "Defecation"
- `caffeine` → "Caffeine"
- `alcohol` → "Alcohol"

**`PAGE_SIZE`** = `50` records per page.

**`UnifiedRecord.type` discriminants:** `intake | weight | bp | eating | urination | defecation | caffeine | alcohol` (note: caffeine & alcohol both come from the `substances` table, split on `SubstanceRecord.type`).

**Domain theme labels (`CARD_THEMES[...].label`)** as defined in `CARD_THEMES`: Water=`Water`, salt=`Sodium`, sugar=`Sugar`, potassium=`Potassium`, weight=`Weight`, bp=`Blood Pressure`, eating=`Eating`, urination=`Urination`, defecation=`Defecation`, caffeine=`Caffeine`, alcohol=`Alcohol`. **Important:** `RecordRow` for intake records only branches on `water` / `sugar` / else (`themeKey = water ? "water" : sugar ? "sugar" : "salt"`), so there is **no potassium branch** — a potassium intake record actually renders with the **salt** theme (label `Sodium`, Sparkles icon). The `Potassium` theme exists in `CARD_THEMES` but is never used by the row.

**Domain accent colors (`buttonBg`, used to tint selected filter pill):** water=sky-600, salt=amber-600, sugar=pink-600, potassium=purple-600, weight=emerald-600, bp=rose-600, eating=orange-600, urination=violet-600, defecation=stone-600, caffeine=yellow-700, alcohol=fuchsia-600.

**Domain icons (lucide):** water=Droplets, salt=Sparkles, sugar=Candy, potassium=Banana, weight=Scale, bp=Heart, eating=Utensils, urination=Droplet, defecation=CircleDot, caffeine=Coffee, alcohol=Wine. (Banana is the defined potassium icon but, as noted above, is never rendered for a potassium intake row — it falls back to salt's Sparkles.)

**Measurement units shown in rows:** water=`ml`, salt=`mg`, sugar=`g`, weight=`kg`, bp=`mmHg`, caffeine=`mg`, alcohol=`drink(s)`. (Potassium intake also renders `mg` — but via the salt branch, since potassium has no dedicated row branch. The unit is coincidentally correct; the icon and label are wrong.)

**BP edit dialog options & input ranges:**
- Position: `sitting` | `standing`
- Arm: `left` | `right`
- Irregular heartbeat: the dialog component *supports* a `no` | `yes` control, but it only renders when `onIrregularHeartbeatChange` is supplied. In the Records tab, `EditBloodPressureDialog` is rendered **without** the `irregularHeartbeat` / `onIrregularHeartbeatChange` props, so **this control never appears here** (and the field is never edited or written).
- Systolic input: `min=60`, `max=300` (the "typically 90–180" text is an `sr-only` screen-reader description, not visible helper text)
- Diastolic input: `min=40`, `max=200` (the "typically 60–120" text is `sr-only`, not visible)
- Heart rate input (optional): `min=30`, `max=250` (the "typically 60–100" text is `sr-only`, not visible), placeholder `BPM`

**Urination / Defecation amount-estimate options** (`URINATION_AMOUNT_OPTIONS`, `DEFECATION_AMOUNT_OPTIONS`): `small | medium | large` (labels "Small"/"Medium"/"Large"). Stored as a free-ish string; estimated volume mapping for analytics: `small=150ml`, `medium=300ml`, `large=500ml` (`URINATION_ESTIMATE_ML`). The **defecation** edit dialog additionally passes `allowNoEstimate`, which prepends a 4th **"No estimate"** sentinel option (maps to `""`); the urination dialog does not, so its Select has only Small/Medium/Large.

**Alcohol edit:** amount field is ABV (semantics: ABV %, range `0 < abv ≤ 100`; the on-screen field label is **"% ABV"**); requires a positive `volume` (ml); standard drinks are derived = `standardDrinksFromAbv(abv, vol)` rounded to 2 dp. Constants: `GRAMS_PER_STANDARD_DRINK = 10`, `ETHANOL_DENSITY_G_PER_ML = 0.789`.

**Caffeine edit:** amount field is in mg (`amountMg`, must be `≥ 0` if provided; the on-screen field label is **"Caffeine (mg)"**).

**Time scopes (parent-provided range, `TimeScope`):** `24h | 7d | 30d | 90d | all` (default `7d`); a custom range can override. Records tab itself only consumes the resolved `{ start, end }`.

**Analytics tabs (parent):** `summary | correlations | records | titration`.

---

## Data model touched

Reads (filtered by `[start, end]` via each service's `getXByDateRange`) and unifies these Dexie tables / interfaces (`src/lib/db.ts`; mirrored in `src/db/schema.ts`):

- **`intakeRecords` / `IntakeRecord`** — `id`, `type` (`water|salt|sugar|potassium`), `amount`, `timestamp`, `source`, `note`, `groupId`, plus sync fields (`createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`). Edit writes `amount`, `timestamp`, `note`.
- **`weightRecords` / `WeightRecord`** — `id`, `weight` (kg), `timestamp`, `note`. Edit writes `weight`, `timestamp`, `note`.
- **`bloodPressureRecords` / `BloodPressureRecord`** — `systolic`, `diastolic`, `heartRate?`, `irregularHeartbeat?`, `position`, `arm`, `timestamp`, `note`. Edit writes `systolic`, `diastolic`, `heartRate?`, `position`, `arm`, `timestamp`, `note` only — **`irregularHeartbeat` is never written** by the Records-tab BP submit handler.
- **`eatingRecords` / `EatingRecord`** — `timestamp`, `grams?`, `note`. Edit writes `timestamp`, `note` only.
- **`urinationRecords` / `UrinationRecord`** — `timestamp`, `amountEstimate?`, `note`. Edit writes `timestamp`, `amountEstimate`, `note`.
- **`defecationRecords` / `DefecationRecord`** — `timestamp`, `amountEstimate?`, `note`. Edit writes `timestamp`, `amountEstimate`, `note`.
- **`substanceRecords` / `SubstanceRecord`** — `type` (`caffeine|alcohol`), `amountMg?` (caffeine), `amountStandardDrinks?` / `abvPercent?` / `volumeMl?` (alcohol), `description`, `source`, `aiEnriched?`, `timestamp`. Edit writes `timestamp`, `description`, and either `{amountMg}` (caffeine) or `{abvPercent, volumeMl, amountStandardDrinks}` (alcohol).

Services: `intake-service`, `health-service` (weight + BP), `eating-service`, `urination-service`, `defecation-service`, `substance-service`. Mutations via hooks: `useUpdateIntake`/`useDeleteIntake`, `useUpdateWeight`/`useUpdateBloodPressure`, `useUpdateEating`/`useDeleteEating`, `useUpdateUrination`/`useDeleteUrination`, `useUpdateDefecation`/`useDeleteDefecation`, `useUpdateSubstance`; weight/BP/substance deletes go through helpers returned by `useRecordsTabData` (`deleteWeight`, `deleteBP`, `deleteSubstance`).

All deletes are **soft deletes** (set `deletedAt`); records carry sync metadata so the local change later mirrors to Neon Postgres.

---

## Validation, edge cases & business rules

- **Intake edit:** amount parsed as int; must be a number and `> 0` else toast "Invalid amount". Timestamp must parse else "Invalid date/time". Note trimmed; empty → undefined.
- **Weight edit:** weight parsed as float; must be number and `> 0` else "Invalid weight". Timestamp must parse.
- **BP edit:** systolic & diastolic parsed as int, both must be numbers and `> 0` else "Invalid values". Heart rate optional (blank → undefined). Timestamp must parse.
- **Eating edit:** only timestamp + note are editable; timestamp must parse.
- **Urination / Defecation edit:** timestamp must parse; amount estimate and note optional.
- **Substance edit:** description **required** (trimmed, non-empty) else "Description required". Timestamp must parse. Amount optional, but if provided must be a number `≥ 0` else "Invalid amount".
  - **Alcohol-specific:** when an amount is given, ABV must be `> 0` and `≤ 100` (else "ABV must be between 0 and 100"), AND a positive volume is required (else "Enter a volume greater than 0"). `amountStandardDrinks` is then recomputed = `standardDrinksFromAbv(abv, vol)` rounded to 2 dp.
  - **Legacy alcohol records:** records logged before `abvPercent` existed are back-derived for display via `abvFromStandardDrinks(amountStandardDrinks, volumeMl)` (returns 0 if volume ≤ 0), shown rounded to 1 dp.
- **HTML input min/step guards (secondary, client-side):** in addition to the JS-handler validation above, the numeric inputs carry native `min`/`step` constraints — intake amount `min=1 step=1`; weight `min=0.1 step=0.1`; substance amount `min=0` with `step=1` (caffeine) / `step=0.1` (alcohol); BP systolic/diastolic/heart-rate min/max as listed under Enums.
- **Date parsing safety:** `parseDateTimeLocalOrNull` wraps `dateTimeLocalToTimestamp` in try/catch (it throws rather than returning NaN); a `null` result becomes the "Invalid date/time" toast.
- **No delete confirmation:** delete is immediate; only safety is the soft-delete model (recoverable via sync history, not in this UI).
- **Pagination is client-side:** all matching records for the range are loaded into memory first, then sliced — paging never re-queries Dexie. Large ranges fetch everything in the range up front.
- **Empty-state ambiguity:** the same empty state serves "no data in range" and "filter matches nothing" — no distinct "no matches for this filter" copy.
- **Filtering rules (`filterRecords`):** `all` returns everything; `water/salt/sugar/potassium` filter `type === "intake"` AND `record.type === <that>`; `caffeine/alcohol` filter on the unified `type`; everything else matches the unified `type` directly.
- **Day grouping uses device-local time** (`new Date(timestamp).toLocaleDateString`), not the app's configurable day-start-hour — a record just after midnight groups under the calendar date, regardless of day-start settings used elsewhere.
- **Singular/plural:** entry-count pill says "1 entry" vs "N entries"; alcohol drinks say "1 drink" vs "N drinks".
- **Measurement fallbacks:** eating with no note shows `—`; urination/defecation with no amount+note show `—`; caffeine/alcohol with no description+amount fall back to the bare label "Caffeine"/"Alcohol".
- **Shared edit-form state:** all 7 edit dialogs share a single set of form-state variables (`editTimestamp`, `editNote`, etc.) on the container; opening any one edit primes those shared fields. Behavioral, not user-visible (only one dialog is open at a time).

---

## Sub-components / variants

- **`RecordsTab`** (`records-tab.tsx`) — the container: filter bar, grouped list, paging, delete orchestration, and all 7 edit-dialog state machines.
- **`RecordRow`** (`history/record-row.tsx`) — memoized single row. The row body is `role="button"` `tabIndex={0}`. Layout: [domain icon] · [uppercase type label over measurement string] · [time `formatTimeOnly`] … [edit pencil] [delete trash/spinner]. The edit and delete buttons each carry `aria-label`/`title` ("Edit entry" / "Delete entry") and explicit hover theming — blue (`hover:text-blue-600`) for edit, red (`hover:text-red-600`) for delete. Per-type measurement strings:
  - intake water: `"{amount} ml · {sourceLabel}"` (source label resolved from liquid presets/note via `getLiquidTypeLabel`); salt: `"{amount} mg"`; sugar: `"{amount} g"`; potassium: `"{amount} mg"`.
  - weight: `"{weight} kg"`; bp: `"{systolic}/{diastolic} mmHg"`.
  - eating: the note, or `—`.
  - urination/defecation: `"{amountEstimate} · {note}"` (present parts joined), or `—`.
  - caffeine: `"{description} · {amountMg} mg"` or `"Caffeine"`.
  - alcohol: `"{description} · {N drink(s)}"` or `"Alcohol"`.
- **`EditIntakeDialog`** — edit amount / time / note. The dialog title, unit, and Save-button color branch only on `water` / `sugar` / else, so a **potassium** record (and a salt record) both open titled "Edit **Sodium** Entry" with unit `mg` and the amber (salt) Save button. Functionally editable but mislabeled as Sodium for potassium. Amount input has `min=1 step=1`.
- **`EditWeightDialog`** — edit weight / time / note.
- **`EditBloodPressureDialog`** — edit systolic / diastolic / heart rate / position / arm / time / note, with numeric min/max constraints. The dialog supports an optional irregular-heartbeat control, but the Records tab renders it without the `irregularHeartbeat` / `onIrregularHeartbeatChange` props, so that control is **not present in this feature** and `irregularHeartbeat` is not editable or written here.
- **`EditEatingDialog`** — edit time / note only in this feature. The dialog component *also* exposes an optional **grams** field (rendered only when `onGramsChange` is passed, `min=1 max=10000`), but the Records tab never passes `onGramsChange`, so grams is **not editable here**.
- **`EditUrinationDialog`** — edit time / amount estimate (Small/Medium/Large) / note.
- **`EditDefecationDialog`** — edit time / amount estimate / note. Passes `allowNoEstimate`, so its amount Select has a 4th "No estimate" option (→ `""`) that urination's does not.
- **`EditSubstanceDialog`** — edit time / description / amount (mg for caffeine, ABV% for alcohol) / volume (alcohol).
- **`useRecordsTabData`** (`use-records-tab-queries.ts`) — reactive hook: parallel `getXByDateRange` for all 7 domains, unify, sort desc; returns `{ data, deleteWeight, deleteBP, deleteSubstance }`.
- **`history-types.ts` helpers** — `UnifiedRecord`/`FilterType` types; `getRecordTimestamp`, `getRecordId`, `groupRecordsByDate`, `filterRecords`.
- **Parent `AnalyticsPage`** (`app/analytics/page.tsx`) — supplies the resolved `TimeRange` and hosts Records as one of four tabs alongside `TimeRangeSelector` and `ExportControls`.
