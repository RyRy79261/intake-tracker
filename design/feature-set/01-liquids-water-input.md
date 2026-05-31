# 01 — Water / Liquids Input

**Files covered:**
- `src/components/liquids-card.tsx` (top-level card: header, tab strip, recent-entries list, inline edit form)
- `src/components/liquids/water-tab.tsx` (plain water quick-add tab)
- `src/components/liquids/beverage-tab.tsx` (generic named beverage + optional sugar tab)
- `src/components/liquids/preset-tab.tsx` (coffee & alcohol tabs: preset grid, AI lookup, substance auto-calc)
- `src/components/manual-input-dialog.tsx` (modal for exact-amount entry with custom time + note)
- `src/components/collapsible-time-input.tsx` (shared "Set different time" collapsible — used by other cards, e.g. weight/BP; the manual dialog here re-implements the same disclosure pattern inline rather than importing this component)
- `src/components/recent-entries-list.tsx` (`RecentEntriesList` + `InlineEditFormShell`)
- `src/hooks/use-intake-queries.ts` (`useIntake`, totals, recent records, add/update/delete)
- `src/hooks/use-substance-queries.ts` (caffeine/alcohol substance CRUD)
- `src/hooks/use-composable-entry.ts` (`useAddComposableEntry`, `useSyncLiquidEntrySubstances`, `fetchEntryGroup`)
- `src/lib/substance-service.ts` (SubstanceRecord persistence)
- `src/lib/composable-entry-service.ts` (grouped multi-record write + liquid substance sync)
- `src/lib/intake-service.ts` (daily total, rolling-24h total, recent records)
- `src/lib/alcohol-units.ts` (ABV ↔ standard-drinks math)
- `src/lib/progress-utils.ts` (`computeTwoStageProgress` two-stage progress bar)
- `src/lib/card-themes.ts` (per-tab color themes)
- `src/lib/constants.ts` (`LiquidPreset` type + `DEFAULT_LIQUID_PRESETS`)
- `src/lib/utils.ts` (`formatAmount`, `getLiquidTypeLabel`)
- `src/lib/db.ts` (`IntakeRecord`, `SubstanceRecord` interfaces)
- `src/stores/settings-store.ts` (water increment/limit/buffer, day-start, liquid presets store)

**Purpose:** A single mobile card for logging all fluid intake — plain water, named beverages, coffee/caffeine drinks, and alcohol — via a 4-tab interface with quick-set size buttons, +/- steppers, savable presets, AI-assisted substance lookup, and a manual dialog for exact amounts at a custom time. Every drink contributes its full volume to a daily + rolling-24h water budget, while caffeine and alcohol content is auto-calculated and stored as linked substance records.

---

## Features

### Card-level (liquids-card.tsx)
- **Four tabs in one card:** Water | Beverage | Coffee | Alcohol. Tab strip is a 4-column equal grid. The active tab drives the card's gradient/border theme and the header icon.
- **Per-tab theming:** Water & Beverage → water (sky/cyan) theme; Coffee → caffeine (yellow/amber) theme; Alcohol → alcohol (fuchsia/pink) theme. Theme animates with `transition-all duration-300`.
- **Header stats block (always visible, all tabs):**
  - **Daily total vs limit:** `{dailyTotal} / {waterLimit}` (e.g. `750ml / 1.0L`), label "today". Turns red when over the water limit.
  - **Rolling 24h total:** `24h: {rollingTotal}` in muted text — a secondary safety/pacing metric distinct from the daily budget.
- **Header label:** "Liquids" (uppercase, tracking-wide) + tab icon (Droplets / Coffee / Wine).
- **All tabs share one water progress bar** (rendered inside each tab) and one daily water budget — every drink across every tab counts as water.
- **Recent entries list** (always visible below tabs, regardless of active tab): last 3 water-type intake records, newest first. Each row shows time, amount, optional `{n}g sugar` chip (pink), and a derived source label chip (beverage/preset name).
- **Inline edit** of any recent entry expands the row into an edit form (amount, beverage name, caffeine mg, alcohol % ABV, optional sugar g, date/time, note).
- **Delete with undo:** deleting a recent entry soft-deletes it and fires **two** stacked toasts: an undo toast titled **"Record deleted"** with an Undo button (~5s window), plus a separate confirmation toast titled **"Entry deleted"** with description **"Water entry removed"**.
- **Sugar tracking is conditional** on the optional "sugar" tracker being enabled (`useOptionalTrackerEnabled("sugar")`) — sugar inputs/chips hide when disabled.

### Water tab (water-tab.tsx)
- **Two-stage progress bar** (primary fill to target, extended segment into the buffer, target marker, over-limit red state).
- **Quick-set size buttons:** `70`, `100`, `150`, `200` (ml) — set the pending amount directly. Active size is highlighted.
- **+/- stepper:** decrement/increment the pending amount by `waterIncrement` (default 250ml). Decrement clamps at `waterIncrement`.
- **Center value display** (`+{amount}`): tappable, opens the manual-input dialog. Subtitle "tap to edit". Turns orange when the pending add would exceed the limit (but isn't already over).
- **Confirm Entry button:** logs the pending water amount (`source: "manual"`), toasts success, resets pending amount to `waterIncrement`.
- **Manual dialog path:** logs an exact amount, optionally at a custom past time and with a note.

### Beverage tab (beverage-tab.tsx)
- Generic named drink with **no substance auto-calc** but **optional sugar**.
- **Beverage name input** (free text, placeholder "e.g. Juice, Smoothie") → stored in source as `beverage:{name}` (or bare `beverage` if blank).
- **Quick-set size buttons:** `40`, `200`, `330`, `500` (ml).
- **+/- stepper** by `waterIncrement`; center value opens manual dialog.
- **Optional sugar (g) field** → when > 0, the drink is written as a grouped composable entry (water + sugar) with `groupSource: "manual_beverage_entry"`; otherwise a plain water record.
- **Log Beverage button** + manual-dialog path; both reset name/sugar after success.
- Shares the same water two-stage progress bar.

### Coffee & Alcohol tabs (preset-tab.tsx, `tab="coffee" | "alcohol"`)
- **Preset grid** (2-column) of saved drinks for that tab; each button shows name + default volume (`{n}ml`).
- **Tap preset → load** its volume + per-100ml substance + salt + water-content + name into the form. **Tap again → deselect/clear.**
- **Long-press preset (500ms) → delete confirmation dialog.**
- **Collapse logic:** if > 8 presets, show first 6 with a "Show all ({n})" button.
- **AI substance lookup** (signed-in only): search field + sparkles button → calls `/api/ai/substance-lookup` with `{query, type}` → auto-fills volume, per-100ml substance, name, water content.
- **Name input** (always visible, even signed-out, so entries can be labeled).
- **Volume (ml) + per-100ml substance fields**, editable; editing clears the selected preset id.
- **Optional sugar (g) field.**
- **Calculated amount display:** live string e.g. `52 mg caffeine` or `12% ABV (1.4 std drinks)`, or salt fallback `78 mg salt`; placeholder "Enter volume and concentration" when nothing to compute. There is **no UI field to enter salt** on the preset tab — `saltPer100ml` is only ever populated by loading a preset (or AI lookup) that already carries it, so the salt fallback string only appears when such a preset is loaded.
- **Log Entry button** — writes a composable group (water + optional salt/sugar intakes + caffeine/alcohol substance record).
- **"Save as preset & log" button** (signed-in, named, AI-populated only) — persists a new `LiquidPreset` then logs in one action.
- Shares the same water two-stage progress bar (uses the tab's gradient for primary fill).

### Manual input dialog (manual-input-dialog.tsx)
- Modal for entering an **exact amount** in ml (or mg when `type="salt"`). Title is "Enter Water Amount" for water, "Enter **Sodium** Amount" for salt.
- The dialog re-implements its time + note disclosures **inline** (it does not import/use `CollapsibleTimeInput`; that shared component exists and is used by other cards, e.g. weight/BP).
- **Quick-select chips:** `100, 250, 500, 750, 1000`.
- **Collapsible "Set different time"** (`datetime-local`, capped at now) to back-date the entry.
- **Collapsible "Add a note"** (textarea, max 200 chars, live counter).
- **Zod validation** (amount positive & required; note ≤ 200). Field errors render inline; a validation_error audit log is written on failure.
- **On-open reset:** each time the dialog opens, a `useEffect` re-seeds the amount to the current value and re-evaluates `getCurrentDateTimeLocal()`, resetting `customTime`, clearing the note, and collapsing both the time and note disclosures.

### Substance auto-calc
- **Caffeine:** `mg = round(volumeMl / 100 × caffeinePer100ml)`.
- **Alcohol:** standard drinks `= ethanolGrams / 10`, where `ethanolGrams = volumeMl × (abv/100) × 0.789`. ABV % is the stored input; standard drinks are derived. The live display and the create path (`buildComposableEntry`) round to **1 dp** (`toFixed(1)`); the **edit-form sync path rounds to 2 dp** (`standardDrinksFromAbv(...).toFixed(2)`), so stored std-drinks precision is not uniformly 1 dp.
- **Salt (from preset):** `mg = round(volumeMl / 100 × saltPer100ml)`.

---

## User actions & interactions

### Card / tabs
- **Tap a tab** (Water/Beverage/Coffee/Alcohol) → switch tab content + recolor card + swap header icon. Inactive tabs are `forceMount` + hidden (state preserved).

### Water tab
- **Tap quick-set size** (70/100/150/200) → set pending amount to that value (highlights button).
- **Tap +** → pending += increment.
- **Tap −** → pending −= increment, floored at increment. Disabled at `≤ increment` or while submitting.
- **Tap center value** → open manual-input dialog (disabled while submitting).
- **Tap Confirm Entry** → log pending water; success toast; reset to increment. No-op if amount ≤ 0 or already submitting. Disabled while submitting / loading / amount ≤ 0.

### Beverage tab
- **Type beverage name** → free text label.
- **Tap quick-set size** (40/200/330/500) → set pending amount.
- **Tap +/−** → step by increment (− clamps at increment).
- **Type sugar (g)** → optional grams.
- **Tap center value** → open manual dialog.
- **Tap Log Beverage** → log (grouped with sugar if sugar > 0); reset name/sugar/amount.

### Coffee / Alcohol tabs
- **Tap a preset** → load its values into the form (sets `selectedPresetId`).
- **Tap the selected preset again** → deselect + reset all fields.
- **Long-press a preset (≥ 500ms)** → open "Delete {name}?" confirmation; the subsequent click is suppressed.
- **Tap "Show all (n)"** → reveal all presets (when > 8).
- **Type in AI search + Enter / tap sparkles** → AI lookup; fills fields; clears preset selection; sets `aiLookupUsed`.
- **Type name / volume / per-100ml / sugar** → edit form; editing volume or per-100ml clears `selectedPresetId`.
- **Tap Log Entry** → write composable group; success toast; reset all fields. Disabled when submitting OR `volumeMl ≤ 0` OR no substance (`caffeinePer100ml ≤ 0 && alcoholPer100ml ≤ 0`).
- **Tap "Save as preset & log"** → add preset + log. Disabled unless submitting-false, volume > 0, has substance, and AI lookup was used.
- **Confirm delete dialog** → permanently removes the preset (toast "Deleted: {name} removed"); clears selection if it was selected. **Cancel** dismisses.

### Manual input dialog
- **Type amount** (number, min 1, step 1, autofocus).
- **Tap a quick-value chip** (100/250/500/750/1000) → set amount (highlights chip).
- **Toggle "Set different time"** → reveal `datetime-local` (max = now) + helper "Use this to log intake that happened earlier".
- **Toggle "Add a note"** → reveal textarea (max 200, live `n/200` counter).
- **Tap Add Entry** (submit) → validate → submit amount/timestamp/note. Disabled while submitting or amount ≤ 0.
- **Tap Cancel / close** → dismiss without saving.

### Recent entries (all tabs)
- **Tap an entry row** → expand inline edit form (keyboard Enter/Space also opens).
- **Edit amount / beverage name / caffeine mg / alcohol % ABV / sugar g / date-time / note → tap Save** → update intake record + sync linked substance/sugar records.
- **Tap Cancel** → collapse edit form.
- **Tap trash icon** → soft-delete; fires the undo toast (title "Record deleted", Undo button) **and** a confirmation toast (title "Entry deleted", description "Water entry removed"). Shows spinner while deleting; stop-propagation so it doesn't open edit.

---

## States & presentations

- **Default / idle:** progress bar at current daily %, pending amount = `waterIncrement` (water/beverage), or empty form (preset tabs).
- **Active tab vs inactive:** active tab content visible + card themed to tab; inactive content `forceMount`-hidden (preserves field state when switching).
- **Active/selected quick-set or preset:** highlighted via `theme.activeToggle`.
- **Submitting:** buttons disabled; labels change — Water "Recording...", Beverage "Logging...", Preset "Logging..."/"Saving...", Dialog "Adding...". Center value tap disabled.
- **Loading totals:** `useIntake.isLoading` true while either total is `undefined` (Confirm disabled on water tab).
- **AI lookup in-progress:** search input disabled; sparkles icon swaps to spinning `Loader2`.
- **Over-limit (daily):** header `{daily}/{limit}` text turns red (`waterLimit > 0 && dailyTotal > waterLimit`).
- **Would-exceed-limit (water tab only):** center pending value turns orange when `dailyTotal + pending > waterLimit` but not yet over.
- **Two-stage progress states:**
  - *Single-stage* (below target, or buffer = 0): bar fills 0→target, no marker, no extended segment.
  - *Two-stage* (over target AND buffer > 0): bar rescales to 0→target+buffer; primary segment full to target marker; extended (blue/indigo) segment grows into buffer.
  - *Over-extended* (past target+buffer): bar shows full red (`progressOverLimit`), no marker/extended.
  - *Target ≤ 0* (limit disabled): empty bar, no over-limit logic.
- **Empty presets:** "No {tab} presets yet. Use AI lookup or enter values manually to create one." (signed-out drops the AI-lookup clause).
- **No substance entered (preset tab):** calculated display shows muted "Enter volume and concentration"; Log Entry disabled.
- **Signed-out:** AI search field hidden; preset "Save as preset & log" hidden; name input + manual fields still usable. Gate is permissive while auth not ready (`!ready || authenticated`).
- **Recent list empty:** entire Recent section is not rendered (returns null when 0 records).
- **Recent entry editing:** edited row replaced by inline form on a `bg-muted/30` panel.
- **Deleting entry:** that row's trash icon shows a spinner; button disabled.
- **Validation error (manual dialog):** inline destructive text under the amount field (e.g. "Amount must be positive", "Amount is required").
- **AI lookup failure:** destructive toast "Lookup failed — Try a different name or enter values manually."
- **Generic write failure:** destructive toast "Error — Failed to record intake / Failed to save preset".
- **Success:** green/success toast (`Added {amount}` / "Logged" / "Saved & Logged" / "Deleted"). Manual back-dated entries say "...recorded for earlier time".
- **Offline/sync:** writes go to local Dexie immediately and enqueue to a sync queue (`schedulePush`); UI is fully usable offline — no offline-specific UI here, optimistic local-first.
- **"Save as preset & log" hint:** when name present but AI not used, muted "Use AI lookup to populate substance data" + disabled button.

---

## Enums, options & configurable values

### Tabs
- `TabKey`: `"water" | "beverage" | "coffee" | "alcohol"`.
- Tab → theme: water→water, beverage→water, coffee→caffeine, alcohol→alcohol.
- Tab → icon: water/beverage→Droplets, coffee→Coffee, alcohol→Wine.
- `LiquidPreset.tab`: `"coffee" | "alcohol" | "beverage"`.
- `PresetTab` prop `tab`: `"coffee" | "alcohol" | "beverage"`.

### Quick-set size presets (hardcoded per tab)
- **Water tab:** `[70, 100, 150, 200]` ml.
- **Beverage tab:** `[40, 200, 330, 500]` ml.
- **Manual dialog:** `[100, 250, 500, 750, 1000]` (ml for water, mg for salt).

### Default liquid presets (`DEFAULT_LIQUID_PRESETS`)
Coffee tab:
- Espresso — 30ml, 210 mg/100ml caffeine, 98% water
- Double Espresso — 60ml, 210 mg/100ml, 98% water
- Moka — 50ml, 130 mg/100ml, 98% water
- Coffee — 250ml, 38 mg/100ml, 99% water
- Tea — 250ml, 19 mg/100ml, 99% water

Alcohol tab:
- Beer — 330ml, 5% ABV, 93% water
- Wine — 150ml, 12% ABV, 87% water
- Spirit — 45ml, 40% ABV, 60% water

(All default presets: `isDefault: true`, `source: "manual"`.)

### Substance / measurement constants
- `GRAMS_PER_STANDARD_DRINK = 10` (WHO/metric standard drink = 10 g ethanol).
- `ETHANOL_DENSITY_G_PER_ML = 0.789`.
- Caffeine unit: mg. Alcohol unit: % ABV (stored) + standard drinks (derived; 1 dp on the live display & create path, 2 dp on the edit-form sync path). Salt unit: mg. Sugar unit: g (rounded integer). Water/volume unit: ml.
- Per-100ml input step: alcohol `0.5`, coffee/beverage `1`. Edit-form: caffeine step `1`, alcohol step `0.1`, sugar step `1`. All three edit inputs also set `min="0"` and `inputMode="decimal"`.

### Substance label strings (preset tab)
- Primary per-100ml label: coffee → "per 100ml (mg caffeine)", alcohol → "% ABV", beverage → "per 100ml (mg)".
- `aiLookupType`: coffee→"caffeine", alcohol→"alcohol", beverage→"caffeine" (the beverage value is dead — that `PresetTab` variant is never mounted by `LiquidsCard`).
- Default descriptions when name/search blank: coffee→"Coffee", alcohol→"Drink", beverage→"Beverage".

### Settings (Zustand `settings-store`, persisted to localStorage)
- `waterIncrement`: default **250** ml; configurable range 10–1000.
- `waterLimit`: default **1000** ml (= 1L); range 100–10000.
- `waterExtendedBuffer`: default **500** ml; range 0–10000.
- `dayStartHour`: default **2** (2am); range 0–23 — defines the daily-total cutoff.
- `optionalTrackers.sugar`: default **true**; `optionalTrackers.potassium`: default false.
- `liquidPresets`: defaults to `DEFAULT_LIQUID_PRESETS`.

### Source-string conventions (`IntakeRecord.source`)
- `"manual"` — plain water (no label shown).
- `"beverage"` / `"beverage:{name}"` — named beverage.
- `"preset:{id}"` / `"preset:manual"` — preset-driven drink (manual = no label).
- `"substance:{id}"` — water auto-created by a standalone substance record.
- `"manual:sugar"` — linked sugar intake.
- Legacy: `"coffee:{name}"`, `"juice"`, `"food:*"` recognized by `getLiquidTypeLabel`.
- `groupSource` values seen here: `"manual_beverage_entry"`, `"preset:{id|manual}"`. (On preset tabs the same `preset:{id|manual}` string is written to **two distinct fields**: the entry's `groupSource` and each water intake row's per-row `source`.)

### Misc constants
- Recent entries shown: **3** (`getRecentRecords` limit + `RecentEntriesList` `maxEntries`).
- Long-press delete threshold: **500ms**.
- Preset grid collapse threshold: **> 8** presets → show first **6**.
- Note max length: **200** chars.
- Rolling-window length: **24 hours**; totals re-tick every **60s**.

---

## Data model touched

### `IntakeRecord` (db.ts / written via intake-service & composable-entry-service)
`id, type ("water"|"salt"|"sugar"|"potassium"), amount (ml/mg/g), timestamp, source?, note?, createdAt, updatedAt, deletedAt (null=active), deviceId, timezone, groupId?, originalInputText?, groupSource?`
- Water tab writes `type:"water"`, `source:"manual"`.
- Beverage tab writes `type:"water"`, `source:"beverage[:name]"` (+ grouped `type:"sugar"` when sugar present).
- Preset tabs write `type:"water"` (full volume), optional `type:"salt"` and `type:"sugar"`, all sharing a `groupId`.

### `SubstanceRecord` (db.ts / substance-service & composable-entry-service)
`id, type ("caffeine"|"alcohol"), amountMg?, amountStandardDrinks?, abvPercent?, volumeMl?, description, source ("water_intake"|"eating"|"standalone"), sourceRecordId?, aiEnriched?, timestamp, createdAt, updatedAt, deletedAt, deviceId, timezone, groupId?, originalInputText?, groupSource?`
- Coffee logs caffeine substance with `amountMg`; alcohol logs `amountStandardDrinks` + `abvPercent`.
- Linked to the water intake via shared `groupId` (composable entry) or `volumeMl` auto-water (standalone path).

### `LiquidPreset` (constants.ts / stored in settings-store)
`id, name, tab ("coffee"|"alcohol"|"beverage"), defaultVolumeMl, waterContentPercent (0-100), caffeinePer100ml?, alcoholPer100ml? (ABV %), saltPer100ml?, isDefault, source ("manual"|"ai"), aiConfidence?`
- `aiConfidence?` exists on the type but is **never written** by this unit's save-as-preset path (`addLiquidPreset` omits it).

### Aggregation reads
- `getDailyTotal(type, dayStartHour)` — sum of water since the day-start cutoff (the budget metric).
- `getTotalInLast24Hours(type)` — rolling 24h sum (safety metric).
- `getRecentRecords(type, 3)` — last 3 active water records, newest first.
- `getSugarTotalsByGroupIds(groupIds)` — sugar totals keyed by group, for the recent-list sugar chip.
- `EntryGroup { groupId, intakes[], eatings[], substances[] }` — fetched on edit to repopulate substance/sugar fields.

### Composable write (`ComposableEntryInput`)
`{ eating?, intakes?: [{type, amount, source?, note?}], substance?, substances?, originalInputText?, groupSource? }` → one shared `groupId` across all created rows; each row also enqueued to `_syncQueue`.

---

## Validation, edge cases & business rules

- **Amount must be positive:** water/beverage Confirm no-ops if `pendingAmount ≤ 0`; manual dialog Zod-validates `amount > 0` & required; edit form rejects `NaN`/`≤ 0` with toast "Invalid amount".
- **Decrement floor:** stepper minimum is `waterIncrement` (can't go below one increment).
- **Custom time is past-only (manual dialog only):** the manual dialog's `datetime-local` caps `max` at now (`getCurrentDateTimeLocal()`). The inline edit form's `datetime-local` has **no `max` attribute** — it does not constrain to the past. Back-dated dialog entries get the dialog timestamp, otherwise `Date.now()`.
- **Full volume counts as water:** caffeine/alcohol content does NOT reduce the logged water volume (explicit comment). `waterContentPercent` is stored on presets but not subtracted from the logged water amount.
- **Avoid duplicate water:** a substance record only carries `volumeMl` when no explicit water intake exists in the same group (otherwise the service would auto-create a second water row). The edit-form sync preserves this invariant too: when an existing caffeine/alcohol record has **no** `volumeMl`, the update deliberately does NOT add one (`if (existing.volumeMl !== undefined)`).
- **Substance required to log on preset tabs:** Log Entry requires `volumeMl > 0` AND (`caffeinePer100ml > 0` OR `alcoholPer100ml > 0`).
- **Sugar parsing:** beverage tab `Math.round` of positive parse else 0; only grouped when > 0.
- **Caffeine/salt rounding:** `Math.round((volumeMl/100)×perValue)`. Standard drinks are rounded to 1 decimal on the live display and create path, but to 2 decimals on the edit-form sync path.
- **Daily cutoff (`dayStartHour`, default 2am):** day-start = today at hour:00; if now is before that hour, use yesterday's start. The daily total resets at the configured hour, distinct from the rolling 24h window.
- **Over-limit handling is non-blocking:** going over the limit only recolors text/bar; entries still save.
- **Limit disabled (`waterLimit = 0`):** no over-limit/would-exceed logic; progress treats target ≤ 0 as empty bar.
- **Edit beverage-name sync:** only plain `beverage[:name]` entries write the name back to `source`; preset/substance entries keep the name on `SubstanceRecord.description` (synced separately).
- **Cleared substance field on edit = soft-delete; junk field = leave untouched:** the edit `parse()` helper maps an empty caffeine/alcohol/sugar field to `0` (which `syncLiquidEntrySubstances` interprets as "remove the linked record"), a finite `≥ 0` number to that value, and a **non-numeric non-empty** string to `null` (which the sync treats as "leave the existing record untouched").
- **Stale async guard on edit:** an `openTokenRef` discards a slow `fetchEntryGroup` result if the user opened a different record meanwhile.
- **Legacy alcohol records:** if a record stored `amountStandardDrinks` but no `abvPercent`, the edit form derives ABV via `abvFromStandardDrinks(stdDrinks, volume)` (returns 0 when volume ≤ 0).
- **Pre-v15 / no-groupId records:** edit form falls back to looking up the preset by `source` ("preset:{id}") to pre-fill substance values synchronously.
- **Long-press vs tap disambiguation:** a fired long-press sets a ref that suppresses the following click so delete doesn't also toggle selection.
- **AI lookup is auth-gated** and PII-stripped server-side; request schema caps `query` at 200 chars and `type ∈ {caffeine, alcohol}`.
- **"Save as preset & log" guard:** requires a trimmed name AND a prior AI lookup (`aiLookupUsed`) — manual values alone can't be saved this way.
- **Delete is soft + reversible:** sets `deletedAt`; deleting a standalone substance also soft-deletes its `source:"substance:{id}"` water row; undo restores within ~5s.
- **Optimistic offline writes:** all mutations write to Dexie and enqueue sync ops inside the same transaction; no network is required to log.

---

## Sub-components / variants

- **`LiquidsCard`** — top-level card: header stats, 4-tab strip, recent-entries list, and the inline substance edit form.
- **`WaterTab`** — plain water quick-add (size chips, stepper, confirm, manual dialog).
- **`BeverageTab`** — named generic beverage + optional sugar; grouped write when sugar present.
- **`PresetTab`** — coffee & alcohol variant: preset grid, long-press delete, AI lookup, substance auto-calc, save-as-preset. (The component also accepts `tab="beverage"`, but `LiquidsCard` never mounts that variant — the Beverage tab renders `BeverageTab` instead, so `PresetTab`'s beverage path is dead in this card.)
- **`ManualInputDialog`** — modal for exact amount with quick chips, collapsible custom-time, collapsible note, Zod validation (`type: "water" | "salt"`).
- **`CollapsibleTimeInput` / `CollapsibleTimeInputControlled`** — shared "Set different time" disclosure (datetime-local, max=now); uncontrolled vs parent-controlled variants.
- **`RecentEntriesList`** — generic last-N entries list with click-to-edit, delete-with-spinner, custom row + edit-form render props.
- **`InlineEditFormShell`** — shared inline edit scaffold (children fields + timestamp + note + Save/Cancel), labeled or placeholder variant.
- **Progress bar (`computeTwoStageProgress` + `Progress`)** — two-stage primary/extended fill with target marker and over-extended red state.
- **AlertDialog (delete preset)** — confirmation for long-press preset deletion.
