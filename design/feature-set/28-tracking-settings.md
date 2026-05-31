# 28 — Tracking Settings

**Files covered:**
- `src/components/settings/day-settings-section.tsx`
- `src/components/settings/water-settings-section.tsx`
- `src/components/settings/salt-settings-section.tsx`
- `src/components/settings/sugar-settings-section.tsx`
- `src/components/settings/potassium-settings-section.tsx`
- `src/components/settings/weight-settings-section.tsx`
- `src/components/settings/optional-trackers-section.tsx`
- `src/components/settings/liquid-presets-section.tsx`
- `src/components/settings/urination-defecation-defaults.tsx`
- Supporting: `src/components/settings/expandable-settings-section.tsx`, `src/components/ui/numeric-input.tsx`, `src/lib/settings-helpers.ts`, `src/lib/optional-trackers.ts`, `src/stores/settings-store.ts`, `src/lib/constants.ts`, `src/lib/security.ts` (`sanitizeNumericInput`), `src/hooks/use-settings.ts`, `src/app/settings/page.tsx`

**Purpose:** The "Tracking" accordion group on the Settings page. It lets the single user configure every per-metric daily limit/target, +/- tap increment, two-stage extended buffer, day-start hour, optional-tracker toggles, weight-graph overlay defaults, liquid-preset (beverage) CRUD, and bathroom (urination/defecation) default amounts. All values persist client-side to Zustand → localStorage and drive intake forms, progress bars, the weekly grid, analytics, and the AI snapshot.

---

## Features

Each section is an **ExpandableSettingsSection** (collapsible, default-collapsed) with a colored Lucide icon + title. Rendered (in this order) inside the "Tracking" accordion group on `/settings`: Day → Water → Sodium → Optional Trackers → Sugar (conditional) → Potassium (conditional) → Weight → Liquid Presets → Bathroom Defaults.

**Day Settings (Clock icon, indigo)**
- Single dropdown picking the "day start hour" (0–23). Controls when the budget day rolls over for all daily-limit tracking. Useful for staying up past midnight.
- 24 options, each formatted via `formatHour`: `12:00 AM (midnight)` (0), `1:00 AM`…`11:00 AM`, `12:00 PM (noon)` (12), `1:00 PM`…`11:00 PM`.

**Water Settings (Droplets icon, sky)**
- Three numeric controls: Increment (ml), Daily Limit (ml), Extended Buffer (ml).
- Increment = amount added/removed per +/- tap on the water tracker.
- Daily Limit = the water intake target; drives the progress bar.
- Extended Buffer = extra allowance shown as a second-tone progress-bar segment from `limit` up to `limit + buffer` before the bar turns red; 0 disables the second stage.

**Sodium Settings (Sparkles icon, amber)** — identical layout to Water; unit mg.
- Increment (mg), Daily Limit (mg, sodium intake), Extended Buffer (mg).

**Optional Trackers (ToggleLeft icon, indigo)**
- Per-tracker on/off Switch rows for opt-in nutritional metrics (Sugar, Potassium). Each row: metric icon, label, description, Switch.
- Disabling hides the tracker from forms, voice input, progress bars, weekly grid, analytics KPIs/correlations, AI insight snapshot, reports, and history filters; previously-logged data is preserved (not deleted). New entries are NOT persisted while disabled, even if AI returns a value.
- Enabling Sugar/Potassium conditionally reveals their dedicated limit sections below (`{sugarEnabled && <SugarSettingsSection/>}`, `{potassiumEnabled && <PotassiumSettingsSection/>}`).

**Sugar Settings (Candy icon, pink)** — only rendered when the Sugar optional tracker is enabled.
- Daily Limit (g, total sugars) and Extended Buffer (g). No increment control (sugar isn't +/- tapped).

**Potassium Settings (Banana icon, purple)** — only rendered when the Potassium optional tracker is enabled.
- Single "Daily Target (mg)" control (soft target, no buffer/increment). Help text cites WHO ~3500 mg adequate intake.

**Weight Settings (Scale icon, emerald)**
- Increment (kg) numeric control (per +/- tap on weight entry).
- "Weight Graph Overlays" group: four GraphToggle switches choosing which reference event lines appear *by default* on the weight chart (still toggleable live on the chart): Eating, Urination, Defecation, Drinking. Each is a full-width button with label + description + an animated pill switch; active state tints the row border/background per-metric.

**Liquid Presets (Droplets icon, blue)**
- Full CRUD list of beverage presets used by the Liquids card tabs (Coffee/Alcohol/Beverage).
- List rows show: name, default volume (e.g. `250ml`), a "Default" badge for seeded presets, and a substance summary line (`formatPresetSubstances`).
- Add a new preset, edit any preset (inline form), delete user-added presets (inline confirm). Default presets can be edited but not deleted.

**Bathroom Defaults (Droplets icon, rose)**
- Two dropdowns selecting the pre-selected amount when opening the urination / defecation details dialogs: Small / Medium / Large each.

---

## User actions & interactions

**All numeric controls (NumericInput)** — Water/Sodium/Sugar/Potassium/Weight:
- Tap **−** button: decrement by `step`, clamped to `min` (`decrementSetting`).
- Tap **+** button: increment by `step`, clamped to `max` (`incrementSetting`).
- Type into the centered numeric `<input type=number>`: free-text edit of a local string; not yet saved.
- **Blur** the input: `validateAndSave` parses; if valid and in `[min,max]` it saves and normalizes the displayed string; otherwise it reverts to the current stored value.
- A `useEffect` keeps the local input string in sync if the store value changes externally (e.g. Reset to Defaults).

**Day Settings:** open Select, choose an hour → `setDayStartHour(parseInt)` saves immediately.

**Optional Trackers:** toggle a Switch → `setOptionalTracker(key, enabled)` saves immediately; flipping Sugar/Potassium mounts/unmounts its limit section in the same accordion.

**Weight graph overlays:** tap a GraphToggle (whole row is the button, `aria-pressed`) → flips the boolean default immediately.

**Liquid Presets:**
- Tap **"Add Preset"** → reveals empty `PresetEditForm`.
- Tap pencil (edit) on a row → replaces that row with `PresetEditForm` pre-filled.
- Tap trash (delete, only on non-default rows) → replaces that row with an inline confirm ("Delete {name}?" + "Keep Preset" / "Delete Preset").
- In the edit/add form: enter Name (required), pick Category (Coffee/Alcohol/Beverage), set Volume (ml), Water %, Caffeine/100ml, % ABV, Na/100ml. **Save** is disabled until Name is non-empty; trimmed name required. **Cancel** closes the form without saving. Saving an add appends a new preset (UUID id); saving an edit merges updates; confirm-delete removes the preset.

**Bathroom Defaults:** open either Select, choose Small/Medium/Large → `setUrinationDefaultAmount` / `setDefecationDefaultAmount` saves immediately.

**Section-level:** tap any section header (or chevron) to expand/collapse it. A page-level "Reset to Defaults" button (outside these sections) calls `settings.resetToDefaults()` restoring every value, including all of these.

---

## States & presentations

- **Collapsed (default):** only the section header (icon + title + chevron) shows; chevron points down.
- **Expanded:** chevron rotates 180°; content slides down (accordion animation) with left indent.
- **Default value state:** inputs reflect persisted store values; on first run, the seeded defaults below.
- **Editing (numeric):** local input string may differ from stored value until blur.
- **Validation-error (numeric):** out-of-range / non-numeric input on blur silently reverts to the last valid stored value (no error message shown). Increment/decrement always stay clamped to `[min,max]`.
- **Switch/toggle active vs inactive:** Optional-tracker Switch on/off; GraphToggle active row tints border+background with a per-metric color and slides the pill right (`translate-x-4`) vs left (`translate-x-0.5`), pill track turns primary vs muted.
- **Conditional sections:** Sugar/Potassium sections are absent entirely when their tracker is disabled.
- **Liquid preset row — normal:** name + volume + optional "Default" badge + substance summary + edit (+ delete if not default) icons.
- **Liquid preset row — editing:** row replaced by the inline form (muted background).
- **Liquid preset row — delete-confirm:** row replaced by "Delete {name}?" with two buttons (outline "Keep Preset", destructive "Delete Preset").
- **Liquid preset form — invalid:** Save button disabled (greyed) while name is empty.
- **Add state:** "Add Preset" outline button vs the expanded add form.
- No explicit loading / skeleton / empty / offline / syncing states in these components — settings are synchronous reads from in-memory Zustand (hydrated from localStorage). The preset list could be empty (renders just the "Add Preset" button) but ships with defaults.

---

## Enums, options & configurable values

All ranges below are enforced both at the UI (`min`/`max`/`step` props + `validateAndSave`) and at the store setter (`sanitizeNumericInput(value, min, max[, precision])`, which clamps, rounds to integer unless precision given, and falls back to `min` on NaN).

**Day start hour:** integer 0–23. Default **2** (2:00 AM). Store clamp 0–23.

**Water** (`waterIncrement`, `waterLimit`, `waterExtendedBuffer`):
- Increment: min 10, max 1000, step 10. Default **250** ml. (decrement floor 10)
- Daily Limit: min 100, max 10000, step 100. Default **1000** ml (= 1 L). (decrement floor 100)
- Extended Buffer: min 0, max 10000, step 100. Default **500** ml. (decrement floor 0; 0 disables)

**Sodium** (`saltIncrement`, `saltLimit`, `saltExtendedBuffer`):
- Increment: min 10, max 1000, step 10. Default **250** mg.
- Daily Limit: min 100, max 10000, step 100. Default **1500** mg.
- Extended Buffer: min 0, max 10000, step 100. Default **500** mg.

**Sugar** (`sugarLimit`, `sugarExtendedBuffer`):
- Daily Limit (g, total sugars): min 5, max 500, step 5. Default **30** g.
- Extended Buffer: min 0, max 500, step 5. Default **10** g.

**Potassium** (`potassiumLimit`):
- Daily Target (mg): min 100, max 20000, step 100. Default **3500** mg (WHO adequate intake). Store clamp 100–20000.

**Weight** (`weightIncrement`):
- Increment (kg): min 0.05, max 1, step 0.05. Default **0.05** kg. Stored with **precision 2** (`sanitizeNumericInput(value, 0.05, 1, 2)`) — only numeric setting that keeps decimals; all others round to integers.

**Optional trackers** (`optionalTrackers`): keys `"sugar" | "potassium"`. Defaults — Sugar **true**, Potassium **false** (`OPTIONAL_TRACKER_DEFAULTS`). Each meta: `{ key, label, description, icon, iconColorClass, unit }`:
- `sugar`: label "Sugar", unit "g", Candy icon, pink. Desc: "Log total sugars per food entry. Helpful if you're watching added or hidden sugars."
- `potassium`: label "Potassium", unit "mg", Banana icon, purple. Desc: "Estimate potassium per food entry. Values are rough — many foods aren't labelled for potassium."

**Weight-graph overlay defaults (booleans, all default true):** `weightGraphShowEating`, `weightGraphShowUrination`, `weightGraphShowDefecation`, `weightGraphShowDrinking`. Active-tint colors: Eating orange, Urination violet, Defecation stone, Drinking sky.

**Bathroom defaults:** `urinationDefaultAmount` default **"small"**, `defecationDefaultAmount` default **"medium"**. Enum each: `"small" | "medium" | "large"` (labels Small/Medium/Large; see `URINATION_AMOUNT_OPTIONS` / `DEFECATION_AMOUNT_OPTIONS`).

**Liquid preset category tabs (enum):** `"coffee" | "alcohol" | "beverage"` (labels Coffee / Alcohol / Beverage).

**Liquid preset form fields & defaults (new preset):** name "" (required), tab "coffee", defaultVolumeMl 250, caffeinePer100ml 0, alcoholPer100ml 0 (`% ABV`, step 0.5), saltPer100ml 0, waterContentPercent 100 (input min 0 max 100). `isDefault` false, `source` "manual" for new entries. Substance fields are only persisted when > 0 (spread-conditional).

**Default seeded liquid presets (`DEFAULT_LIQUID_PRESETS`, all `isDefault: true`, `source: "manual"`):**
- Coffee tab: Espresso (210 caff/100ml, 98% water, 30ml), Double Espresso (210, 98%, 60ml), Moka (130, 98%, 50ml), Coffee (38, 99%, 250ml), Tea (19, 99%, 250ml).
- Alcohol tab: Beer (5% ABV, 93% water, 330ml), Wine (12% ABV, 87%, 150ml), Spirit (40% ABV, 60%, 45ml).

**Preset summary line (`formatPresetSubstances`):** joins present substances with " + " — `{caffeine}mg caff/100ml`, `{abv}std alc/100ml`, `{salt}mg salt/100ml`; if none, shows `{waterContentPercent}% water`.

**Other related defaults in the same store (not directly edited in these files but reset together):** `substanceConfig` caffeine types (Coffee 95mg/250ml, Espresso 63mg/30ml, Tea 47mg/250ml, Other 80mg/250ml) and alcohol types (Beer 1 drink/330ml, Wine 1/150ml, Spirits 1/45ml, Other 1/250ml); `timeFormat` "24h". `SETTINGS_PERSIST_VERSION = 16`.

---

## Data model touched

All reads/writes go through the Zustand store `useSettingsStore` (`src/stores/settings-store.ts`), persisted to `localStorage` key `intake-tracker-settings` (JSON, versioned + migrated). No Dexie/Postgres writes from these components.

**Settings fields touched (interface `Settings`):** `dayStartHour`, `waterIncrement`, `waterLimit`, `waterExtendedBuffer`, `saltIncrement`, `saltLimit`, `saltExtendedBuffer`, `sugarLimit`, `sugarExtendedBuffer`, `potassiumLimit`, `optionalTrackers.{sugar,potassium}`, `weightIncrement`, `weightGraphShow{Eating,Urination,Defecation,Drinking}`, `liquidPresets[]`, `urinationDefaultAmount`, `defecationDefaultAmount`.

**Setters used:** `setDayStartHour`, `setWaterIncrement/Limit/ExtendedBuffer`, `setSaltIncrement/Limit/ExtendedBuffer`, `setSugarLimit/ExtendedBuffer`, `setPotassiumLimit`, `setOptionalTracker`, `setWeightIncrement`, `setWeightGraphShow*`, `addLiquidPreset/updateLiquidPreset/deleteLiquidPreset`, `setUrinationDefaultAmount`, `setDefecationDefaultAmount`, `resetToDefaults`.

**Interfaces:** `LiquidPreset` (`src/lib/constants.ts`): `{ id, name, tab, defaultVolumeMl, waterContentPercent, caffeinePer100ml?, alcoholPer100ml?, saltPer100ml?, isDefault, source: "manual"|"ai", aiConfidence? }`. `OptionalTrackerMeta`, `OptionalTrackerKey` (`src/lib/optional-trackers.ts`).

**Downstream consumers (where these settings are applied):** progress-bar / extended-buffer logic in `food-salt-card.tsx`, `text-metrics.tsx`, `liquids/{water-tab,beverage-tab,preset-tab}.tsx`; liquid presets feed the Liquids card tabs; optional trackers gate every nutritional surface via `useOptionalTrackerEnabled(key)`.

---

## Validation, edge cases & business rules

- **Double clamping:** UI helper (`validateAndSave`/increment/decrement) enforces ranges; the store setter independently re-clamps via `sanitizeNumericInput`. Invalid blur input reverts to stored value (no error UI).
- **`sanitizeNumericInput`** rounds to integer when no precision given (so e.g. typing `1250.7` into water limit stores `1251` after clamping), returns `min` on NaN/Infinity, and only `weightIncrement` passes precision 2 (keeps 0.05 steps).
- **Extended buffer = 0** disables the second progress-bar stage; otherwise the bar shows a second tone from `limit`→`limit+buffer` before going red.
- **Day-start hour** rolls the budget day over at the chosen hour: records logged after it count toward the new "today" — central to all daily limits.
- **Optional tracker gating:** disabling a tracker stops persistence of new values and hides all surfaces but never deletes history; enabling/disabling Sugar/Potassium add/remove their limit sections live.
- **Liquid presets:** name is required (trimmed, Save disabled while empty); only non-`isDefault` presets are deletable (no trash icon on defaults); delete requires inline confirm; substance fields persist only when > 0; new ids via `crypto.randomUUID()`.
- **Weight-graph defaults** only seed the chart's initial overlay state; live chart toggles are independent and not written back here.
- **Persistence/migration:** `migrateSettings` forward-migrates older stored blobs (e.g. v<14 seeds potassiumLimit 3500, v<15 seeds optionalTrackers, v<16 seeds the three extended buffers, v<13 seeds sugarLimit 30) so an upgrading user gets sane defaults for newly-added fields. `resetToDefaults` reverts the entire store (including every tracking value) at once.

---

## Sub-components / variants

- `DaySettingsSection` — day-start-hour dropdown (24 formatted options).
- `WaterSettingsSection` — increment / daily limit / extended buffer (ml).
- `SaltSettingsSection` ("Sodium Settings") — increment / daily limit / extended buffer (mg).
- `SugarSettingsSection` — daily limit / extended buffer (g); conditional on Sugar tracker.
- `PotassiumSettingsSection` — daily target (mg); conditional on Potassium tracker.
- `WeightSettingsSection` — kg increment + four weight-graph overlay GraphToggles.
- `GraphToggle` (inline in weight section) — full-row pill switch with per-metric active tint.
- `OptionalTrackersSection` — Switch rows iterating `OPTIONAL_TRACKERS`.
- `LiquidPresetsSection` — beverage preset CRUD list with add/edit/delete-confirm states.
- `PresetEditForm` (inline in presets) — name/category/volume/water%/caffeine/ABV/Na form, reused for add and edit.
- `UrinationDefecationDefaults` ("Bathroom Defaults") — two Small/Medium/Large dropdowns.
- `ExpandableSettingsSection` — shared collapsible wrapper (icon, label, color, chevron, optional `headerRight`, `defaultOpen`).
- `NumericInput` — shared −/input/+ control used by all numeric settings (`min`/`max`/`step`, `onIncrement`/`onDecrement`/`onChange`/`onBlur`).
- Helpers: `validateAndSave`, `incrementSetting`, `decrementSetting`, `formatHour` (`settings-helpers.ts`); `sanitizeNumericInput` (`security.ts`).
