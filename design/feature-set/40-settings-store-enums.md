# 40 — Settings Store & All Settings Enums

**Files covered:**
- `src/stores/settings-store.ts` (the persisted Zustand store — interface, defaults, actions, persist/migration config)
- `src/hooks/use-settings.ts` (selector hooks: `useSettings`, `useWaterSettings`, `useSaltSettings`, `useSugarSettings`, `usePotassiumSettings`)
- `src/lib/constants.ts` (food/sodium/liquid presets, BP classification, amount option enums, localStorage keys)
- `src/lib/quick-nav-defaults.ts` (`QuickNavItem`, `DEFAULT_QUICK_NAV_ITEMS`, label overrides)
- `src/lib/optional-trackers.ts` (`OPTIONAL_TRACKERS` registry, defaults, hooks)
- `src/lib/settings-helpers.ts` (`validateAndSave`, `incrementSetting`, `decrementSetting`, `formatHour`)
- `src/lib/security.ts` (`sanitizeNumericInput`, `obfuscateApiKey`, `deobfuscateApiKey`)
- `src/lib/card-themes.ts` (`CARD_THEMES`, `CardThemeKey` — drives Quick Nav item identities)
- Settings UI surfaces: `src/app/settings/page.tsx` and `src/components/settings/*` (water/salt/sugar/potassium/weight/day/appearance/quick-nav/animation-timing/swipe-nav/optional-trackers/urination-defecation/data-management/storage-info/ai-keys/report-bug/medication sections) plus `src/components/medications/medication-settings-view.tsx`

**Purpose:** The single client-side preferences store: every user-configurable setting (increments, daily limits, extended buffers, theme, day-start, animation/swipe tuning, quick-nav layout, tracking defaults, liquid presets, medication region/reminders, storage mode, shake-to-report, substance config) persisted to localStorage with schema-versioned migration. This brief enumerates every persisted field, its type, default, allowed range/options, and what it controls.

---

## Features

- **Persisted settings store** (`useSettingsStore`, Zustand + `persist` middleware) keyed in localStorage under `"intake-tracker-settings"`, JSON storage, schema `version: 16` (`SETTINGS_PERSIST_VERSION = 16`).
- **Forward migration** (`migrateSettings`) upgrades any older persisted blob to v16 (seeds new fields, deletes removed ones).
- **Numeric sanitization** — every numeric setter runs `sanitizeNumericInput(value, min, max, precision?)`: parses, rejects NaN/Infinity (returns `min`), clamps to `[min,max]`, rounds to integer (or to `precision` decimals when given).
- **Increment controls** for fast +/- entry on the dashboard: water (ml), salt (mg), weight (kg).
- **Daily limits** that drive progress bars and over-limit coloring: water, salt (sodium), sugar, potassium.
- **Extended buffers** — a second-tone progress segment from `limit` up to `limit + buffer` before the bar turns red; `0` disables the second stage. Applies to water, salt, sugar (not potassium).
- **Optional trackers** — opt-in nutritional metrics (sugar, potassium); disabling hides the tracker everywhere (forms, voice editor, progress bars, weekly grid, analytics, history filter, AI snapshot) and stops persisting new entries; existing data preserved.
- **Theme** preference (light/dark/system) — note the store holds `theme` but the live UI reads/writes via `next-themes` `useTheme` (Appearance section), so the store field is effectively legacy/mirror.
- **Day-start hour** — defines when "today" begins for budget tracking (so late-night entries count to the prior day).
- **Time format** (12h/24h) for medication/schedule display.
- **Quick Nav footer** — show/hide, per-item enable + drag reorder, and left/right icon order (thumb-reach).
- **Animation timing** — scroll-to-section duration, auto-hide delay for header/footer, header/footer slide speed.
- **Swipe navigation tuning** — distance threshold (% of viewport) and flick velocity (px/s) to commit a page change.
- **Tracking defaults** — pre-selected urination/defecation amounts; weight-graph overlay defaults (eating/urination/defecation/drinking).
- **Liquid presets** — full CRUD list of beverages (coffee/alcohol/beverage tabs) with per-100ml caffeine/alcohol/salt and water content; manual or AI-sourced.
- **Medication region** — primary + secondary country used by AI to find local brand alternatives.
- **Dose reminders** — enable push reminders, follow-up count, follow-up interval.
- **Storage mode** — local-only vs cloud-sync (mirrors Dexie to Neon Postgres).
- **Shake to report** — shake gesture opens bug/feature dialog; tunable jolt threshold + jolts required.
- **Substance config** — caffeine/alcohol enable + named types with default mg/drinks/volume (defaults only; no live UI setter consumer found).
- **AI auth secret** — obfuscated server-AI shared secret (legacy field; current AI keys UI uses server-stored provider keys instead).
- **One-time flags** — `analyticsIntroSeen` (analytics intro dialog).
- **Reset to defaults** — restores the entire store to `defaultSettings`.
- **Data management** (adjacent, not in store) — export/import/clear all Dexie data; import is merge-only with conflict review.

---

## User actions & interactions

- **Adjust a numeric setting** via `NumericInput`: type a value (commits on blur through `validateAndSave` → revert to default if out of range), or tap +/- step buttons (`incrementSetting`/`decrementSetting`, clamped to min/max).
- **Pick day-start hour**: Select with 24 entries (`formatHour(0..23)`), e.g. "12:00 AM (midnight)", "1:00 AM" … "12:00 PM (noon)" … "11:00 PM".
- **Toggle optional trackers** (sugar, potassium): Switch per row; enabling potassium reveals its settings section, disabling hides it.
- **Choose theme**: Select (Light / Dark / System) with icons.
- **Toggle Quick Nav footer**: button On/Off; when On, reveals item list + icon-order Select.
- **Reorder Quick Nav items**: drag (motion `Reorder.Group`, `axis="y"`, touch-none).
- **Toggle a Quick Nav item**: per-row Switch (stops drag propagation); disabled items shown at `opacity-50` but kept in the list.
- **Pick Quick Nav icon order**: Select — "Right to Left (recommended)" / "Left to Right".
- **Toggle weight-graph overlays** (Eating/Urination/Defecation/Drinking): custom pill button + sliding switch.
- **Pick urination/defecation default amount**: Selects (Small/Medium/Large).
- **Liquid presets**: add (`addLiquidPreset` returns new UUID), edit (`updateLiquidPreset`), delete (`deleteLiquidPreset`).
- **Medication region**: select primary/secondary country (settings-page section uses a 7-country Select; the medication-view uses a searchable combobox over the full ISO-3166 list).
- **Dose reminders**: master Switch (`useDoseReminderToggle`, disabled if notifications unsupported or while toggling); follow-up-count Select; reminder-interval Select (shown only when count > 0).
- **Time format**: Select (24-hour (14:00) / 12-hour (2:00 PM)).
- **Shake to report**: master Switch (requests device-motion permission on enable; toast on denial); when enabled, an expandable "Shake sensitivity" with jolt-threshold and jolts-required NumericInputs.
- **Storage mode**: switch to cloud sync via the migration wizard ("Switch to Cloud Sync" / "Resume Migration" buttons) — not a direct toggle; sign-in required.
- **Data management**: Export Data (with incomplete-cloud-data warning + "Export Anyway"), Import Data (file picker `.json`, merge-confirm, conflict review drawer), Clear All Data (two-step confirm: "Clear All Data" → "Confirm Delete" / "Cancel").
- **AI keys**: add/replace/remove per-provider key (Anthropic `sk-ant-`, Groq `gsk_`), share key with another email, revoke share, view 30-day usage.
- **Reset to Defaults**: ghost button → `resetToDefaults()` → toast "Settings reset".
- **Accordion navigation**: top-level groups expand one-at-a-time (`Accordion type="single" collapsible`).

---

## States & presentations

- **Accordion groups** (collapsed default, single-open): AI features, Data & Storage, Tracking, Customization, Medication, Privacy & Security, System, Help & Manual, Feedback, Debug — each with a colored icon.
- **Numeric input**: default (current value), editing (uncommitted string), validation-revert (out-of-range blur snaps to default), disabled +/- at min/max bounds.
- **Optional-tracker dependent sections**: Sugar/Potassium settings sections only render when their tracker is enabled.
- **Quick Nav**: footer-off state hides item list + order Select; per-item disabled = dimmed; drag = `cursor-grab`/`active:cursor-grabbing`.
- **Dose reminders**: hidden entirely when signed out (`useAuthGate`); switch disabled + helper "Notifications not supported in this browser" when unsupported; helper "Sign in to enable push reminders across devices" when signed out & off; follow-up interval row hidden when count = 0.
- **AI keys section**: `!ready` → renders null; unauthenticated → "Sign in to manage AI keys" card; per-provider: loading ("Loading…"), configured ("Using your key ending in <last4>"), shared ("Granted by <email>"), not-configured ("Not configured…"); editing form vs view (Add/Replace + Remove buttons); usage loading/empty/populated.
- **Storage section**: badge "Cloud Sync" (green) vs "Local only" (secondary); cloud states: full-copy (`CheckCircle2` "Full copy of your data on this device"), downloading (spinner), offline-waiting (`CloudOff`); "Last synced <datetime>"; local+signed-out → sign-in CTA; local+authenticated → "Switch to Cloud Sync" or "Resume Migration"; estimated usage / "Storage info unavailable"; record count.
- **Data export**: idle / "Exporting…"; incomplete-cloud warning panel (amber) with Cancel / Export Anyway.
- **Data import**: idle / "Importing…"; merge-confirm panel (amber) Cancel / Continue Import; result line "X new, Y skipped, Z conflicts" with "Review N conflicts" button when conflicts exist.
- **Clear data**: default button → two-button confirm (Cancel / Confirm Delete, destructive).
- **Shake-to-report**: sensitivity sub-section only shown when shake enabled; toast (destructive) "Motion access blocked" on permission denial.
- **Theme**: light / dark / system; many sub-components carry explicit `dark:` token variants (icons, active toggles).
- **Reset**: toast confirmation.

---

## Enums, options & configurable values

Every persisted field in `Settings` (defaults from `defaultSettings`, ranges from setter `sanitizeNumericInput` calls / UI):

| Field | Type | Default | Range / options (clamp) | UI step | Controls |
|---|---|---|---|---|---|
| `waterIncrement` | number (ml) | `250` | 10–1000 | 10 | +/- tap size for water |
| `saltIncrement` | number (mg) | `250` | 10–1000 | 10 | +/- tap size for sodium |
| `waterLimit` | number (ml) | `1000` | 100–10000 | 100 | daily water target |
| `saltLimit` | number (mg) | `1500` | 100–10000 | 100 | daily sodium target |
| `sugarLimit` | number (g) | `30` | 5–500 | 5 | daily total-sugars target |
| `potassiumLimit` | number (mg) | `3500` | 100–20000 | 100 | daily potassium target (WHO adequate intake) |
| `waterExtendedBuffer` | number (ml) | `500` | 0–10000 | 100 | second-tone zone above water limit (0 disables) |
| `saltExtendedBuffer` | number (mg) | `500` | 0–10000 | 100 | second-tone zone above salt limit |
| `sugarExtendedBuffer` | number (g) | `10` | 0–500 | 5 | second-tone zone above sugar limit |
| `optionalTrackers.sugar` | boolean | `true` | true/false | — | show/persist sugar tracker |
| `optionalTrackers.potassium` | boolean | `false` | true/false | — | show/persist potassium tracker |
| `aiAuthSecret` | string (obfuscated `obf:`) | `""` | free text | — | legacy server-AI shared secret |
| `theme` | `"light"\|"dark"\|"system"` | `"system"` | 3 options | — | color theme (UI uses next-themes) |
| `dataRetentionDays` | number (days) | `90` | 0–365 (0 = keep forever) | — | data retention window |
| `dayStartHour` | number (0–23) | `2` | 0–23 | — | hour "today" begins for budgets |
| `showQuickNav` | boolean | `true` | true/false | — | show footer quick-nav |
| `quickNavOrder` | `"ltr"\|"rtl"` | `"rtl"` | 2 options | — | footer icon direction |
| `quickNavItems` | `QuickNavItem[]` | 6 default items (see below) | reorderable, per-item enabled | — | footer item set/order |
| `scrollDurationMs` | number (ms) | `300` | 100–1000 | 50 | scroll-to-section speed |
| `autoHideDelayMs` | number (ms) | `500` | 0–2000 | 100 | delay before header/footer hide |
| `barTransitionDurationMs` | number (ms) | `200` | 50–500 | 50 | header/footer slide speed |
| `swipeNavDistanceThresholdPct` | number (%) | `28` | 10–60 | 1 | drag % to commit page change |
| `swipeNavVelocityThreshold` | number (px/s) | `500` | 100–2000 | 50 | flick speed to commit |
| `urinationDefaultAmount` | `"small"\|"medium"\|"large"` | `"small"` | 3 options | — | pre-selected urination amount |
| `defecationDefaultAmount` | `"small"\|"medium"\|"large"` | `"medium"` | 3 options | — | pre-selected defecation amount |
| `weightGraphShowEating` | boolean | `true` | true/false | — | default eating overlay on weight chart |
| `weightGraphShowUrination` | boolean | `true` | true/false | — | default urination overlay |
| `weightGraphShowDefecation` | boolean | `true` | true/false | — | default defecation overlay |
| `weightGraphShowDrinking` | boolean | `true` | true/false | — | default drinking overlay |
| `liquidPresets` | `LiquidPreset[]` | 8 defaults (see below) | CRUD | — | beverage presets |
| `weightIncrement` | number (kg) | `0.05` | 0.05–1 (precision 2) | 0.05 | +/- tap size for weight |
| `storageMode` | `"local"\|"cloud-sync"` | `"local"` | 2 options | — | local vs cloud sync |
| `analyticsIntroSeen` | boolean | `false` | true/false | — | one-time analytics intro shown |
| `shakeToReportEnabled` | boolean | `true` | true/false | — | shake opens report dialog |
| `shakeThreshold` | number (m/s²) | `10` | 4–20 | 1 | jolt delta to register a shake (lower = more sensitive) |
| `shakeRequiredJolts` | number | `5` | 2–8 | 1 | jolts within ~0.8s to fire |
| `primaryRegion` | string (country code) | `""` | ISO-3166 / 7-item list | — | primary region for med alternatives |
| `secondaryRegion` | string | `""` | ISO-3166 + "None" | — | fallback region |
| `timeFormat` | `"12h"\|"24h"` | `"24h"` | 2 options | — | clock display format |
| `doseRemindersEnabled` | boolean | `false` | true/false | — | push dose reminders |
| `reminderFollowUpCount` | number | `2` | 0,1,2,3 (Select) | — | extra reminders if unconfirmed |
| `reminderFollowUpInterval` | number (min) | `10` | 5,10,15,20,30 (Select) | — | minutes between follow-ups |
| `substanceConfig` | `SubstanceConfig` | see below | enable + typed list | — | caffeine/alcohol tracking config |

**`QuickNavItem`** (`{ id: CardThemeKey; enabled: boolean }`), `DEFAULT_QUICK_NAV_ITEMS` (order = top-to-bottom on dashboard):
`water` (label override "Liquids"), `eating` (label override "Food & Salt"), `bp` ("Blood Pressure"), `weight` ("Weight"), `urination` ("Urination"), `defecation` ("Defecation") — all `enabled: true`.

**`CardThemeKey`** (full set, drives quick-nav identities & icons): `water` (Water/Droplets), `salt` (Sodium/Sparkles), `sugar` (Sugar/Candy), `potassium` (Potassium/Banana), `weight` (Weight/Scale), `bp` (Blood Pressure/Heart), `eating` (Eating/Utensils), `urination` (Urination/Droplet), `defecation` (Defecation/CircleDot), `caffeine` (Caffeine/Coffee), `alcohol` (Alcohol/Wine).

**`OPTIONAL_TRACKERS`** registry (`src/lib/optional-trackers.ts`):
- `sugar` — label "Sugar", unit "g", default ON, icon Candy (pink). Desc: "Log total sugars per food entry…"
- `potassium` — label "Potassium", unit "mg", default OFF, icon Banana (purple). Desc: "Estimate potassium per food entry. Values are rough…"

**`LiquidPreset`** shape: `{ id, name, tab: "coffee"|"alcohol"|"beverage", defaultVolumeMl, waterContentPercent (0–100, default 100), caffeinePer100ml?, alcoholPer100ml? (ABV %), saltPer100ml?, isDefault, source: "manual"|"ai", aiConfidence? }`.

**`DEFAULT_LIQUID_PRESETS`** (8): Espresso (coffee, 210 mg/100ml, 98% water, 30ml), Double Espresso (210, 98%, 60ml), Moka (130, 98%, 50ml), Coffee (38, 99%, 250ml), Tea (19, 99%, 250ml), Beer (alcohol, 5% ABV, 93% water, 330ml), Wine (12% ABV, 87%, 150ml), Spirit (40% ABV, 60%, 45ml).

**`SubstanceConfig` default:**
- `caffeine.enabled: true`, types: Coffee (95 mg / 250 ml), Espresso (63 / 30), Tea (47 / 250), Other (80 / 250).
- `alcohol.enabled: true`, types: Beer (1 drink / 330 ml), Wine (1 / 150), Spirits (1 / 45), Other (1 / 250).

**`URINATION_AMOUNT_OPTIONS` / `DEFACATION_AMOUNT_OPTIONS`** (`constants.ts`): `small` "Small", `medium` "Medium", `large` "Large".

**`FOOD_PRESETS`** (water-content %, 21 entries): Apple 86, Banana 75, Orange 87, Watermelon 92, Grapes 81, Strawberries 91, Cucumber 96, Tomato 94, Lettuce 96, Celery 95, Carrot 88, Broccoli 89, Spinach 91, Peach 89, Pineapple 86, Milk 87, Yogurt 85, Soup (broth) 92, Rice (cooked) 70, Pasta (cooked) 62, Custom 80.

**`DEFAULT_SODIUM_PRESETS`** (`SodiumPreset` `{ id, name, sodiumPercent, isDefault }`): Sodium 100%, Table Salt 39%, MSG 12% (all default).

**BP classification** (`getBPCategory`, ESH 2023, OR-based, highest-first): Grade 3 hypertension (≥180/≥110), Grade 2 (≥160/≥100), Grade 1 (≥140/≥90), High normal (≥130/≥85), Normal (≥120/≥80), Optimal (else) — each with a color token.

**Medication-section country list** (settings page, `MedicationSettingsSection`): US, UK, CA, AU, DE, ZA, Other; secondary adds "None". **Medication-view combobox** uses the full ISO-3166-1 list (~190 countries + "" = "Not Specified (Global Search)").

**Dose-reminder Select options:** follow-up count → None / 1 / 2 / 3; interval → Every 5/10/15/20/30 minutes.

**AI provider keys** (`ai-keys-section.tsx`, server-stored, not in this store): Anthropic (prefix `sk-ant-`), Groq (prefix `gsk_`); usage window 30 days.

**localStorage keys:** settings store `"intake-tracker-settings"`; welcome-seen `"intake-tracker-welcome-seen"` (`WELCOME_SEEN_KEY`, device-local, never synced); crash report `"intake-tracker:crash-report"` (sessionStorage).

---

## Data model touched

- **Reads/writes:** `localStorage["intake-tracker-settings"]` via Zustand `persist` (JSON, versioned). No Dexie table for settings themselves.
- **Indirectly governs Dexie/Neon data** (`src/lib/db.ts`, `src/db/schema.ts`): optional-tracker toggles gate whether `intakeRecords` of `type: "sugar"/"potassium"` get persisted; `storageMode` toggles the sync engine mirroring all Dexie tables to Neon Postgres; `dataRetentionDays` governs pruning; default amounts seed `urinationRecords`/`defecationRecords`; liquid/substance presets feed liquid & substance entry forms.
- **Data management** (`data-management-section.tsx`) reads/writes all Dexie tables on export/import/clear via `use-backup-queries` (`ImportResult` covers intake, weight, bp, eating, urination, defecation, substance, prescriptions, phases, schedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs, userProfile, insightReports).
- **AI keys / dose reminders / cloud sync** touch server-side Neon Postgres (provider keys, push subscriptions, mirrored records), not this localStorage store.

---

## Validation, edge cases & business rules

- **`sanitizeNumericInput(value, min, max, precision?)`**: `parseFloat`; NaN/Infinity → returns `min`; clamps to `[min,max]`; rounds to integer unless `precision` given (weight uses precision `2` for 0.05 steps).
- **`validateAndSave`** (UI blur): if parsed value is NaN or outside `[min,max]`, **reverts to the default**, not the clamped value; otherwise saves and reflects the parsed value.
- **`incrementSetting`/`decrementSetting`**: step then clamp to max/min respectively; the decrement call passes `min` as the third arg (note water/salt limit decrement floors at 100, increments cap at 10000, etc.).
- **Extended buffer = 0** disables the second progress stage (bar goes limit → red directly).
- **`aiAuthSecret`** is stored obfuscated: setter wraps with `obfuscateApiKey` (XOR with `intake-tracker-v1`, base64, `obf:` prefix); `getDeobfuscatedAuthSecret` reverses it. This is obfuscation, **not encryption**.
- **`dayStartHour`** (0–23) reclassifies records: entries logged after this hour count toward "today"; useful past midnight. `formatHour` special-cases 0 → "12:00 AM (midnight)", 12 → "12:00 PM (noon)".
- **Optional trackers**: disabling not only hides UI but **stops persisting new entries of that type** (even AI-returned values); existing records preserved.
- **Theme dual-source**: store has `theme` but `AppearanceSection` reads/writes `next-themes`; the store field can drift from the active theme.
- **Quick Nav**: disabled items remain in `quickNavItems` (hidden from footer, dimmed in settings); add-preset uses `crypto.randomUUID()`.
- **Dose reminders** require auth + browser notification support; the section is hidden when signed out; the master toggle is disabled while toggling or unsupported.
- **Storage mode** is not a free toggle — switching to cloud-sync runs the migration wizard and requires sign-in; `local` is the safe default. Export in cloud-sync mode before initial sync completes warns of an incomplete file (`exportMayBeIncomplete = storageMode === "cloud-sync" && !initialSyncComplete`).
- **Import is merge-only** (`mode: "merge"`): adds new records, skips duplicates, surfaces conflicts for manual review.
- **Shake-to-report** enabling requests device-motion permission (`requestMotionPermission`); denial shows a destructive toast and leaves it off.
- **Persist migration** (`migrateSettings`) is forward-only and cumulative; key steps: v0 deletes `perplexityApiKey`/`aiAuthSecret`; <2 seeds liquid presets; <3 migrates old preset `type`/`substancePer100ml` to `tab`/`caffeinePer100ml`/`alcoholPer100ml` + `waterContentPercent: 100`, deletes `coffeeDefaultType`/`utilityOrder`; <5 seeds quick-nav items; <7 deletes `experimentalFeatures`; <8 seeds `storageMode: "local"`; <9 seeds swipe thresholds (28 / 500); <10 deletes `dismissedInsights`, seeds `shakeToReportEnabled: true`; <11 seeds shake (15 / 3); <12 sets `shakeThreshold: 8`; <13 seeds `sugarLimit: 30`; <14 seeds `potassiumLimit: 3500`; <15 seeds `optionalTrackers {sugar:true, potassium:false}`; <16 seeds extended buffers (500/500/10). (Note: current `defaultSettings` shake values are 10/5, diverging from the migration-seeded historical values.)
- **`resetToDefaults()`** replaces the whole state with `defaultSettings` (also drops any user liquid presets back to the 8 defaults).

---

## Sub-components / variants

- `settings-store.ts` — the Zustand store: `Settings` interface, `SettingsActions`, `defaultSettings`, `SETTINGS_PERSIST_VERSION`, `migrateSettings`.
- `use-settings.ts` — `useSettings` (whole store) plus scoped `useWaterSettings` / `useSaltSettings` / `useSugarSettings` / `usePotassiumSettings`.
- `settings-helpers.ts` — `validateAndSave`, `incrementSetting`, `decrementSetting`, `formatHour`.
- `optional-trackers.ts` — `OPTIONAL_TRACKERS`, `OPTIONAL_TRACKER_DEFAULTS`, `useOptionalTrackerEnabled`, `getOptionalTrackerEnabled`.
- `quick-nav-defaults.ts` — `QuickNavItem`, `DEFAULT_QUICK_NAV_ITEMS`, `QUICK_NAV_LABEL_OVERRIDES`.
- `card-themes.ts` — `CARD_THEMES`, `CardThemeKey` (icon/color/label per tracker).
- `constants.ts` — `FOOD_PRESETS`, `DEFAULT_SODIUM_PRESETS`, `DEFAULT_LIQUID_PRESETS`, `URINATION/DEFECATION_AMOUNT_OPTIONS`, `getBPCategory`, `WELCOME_SEEN_KEY`.
- `security.ts` — `sanitizeNumericInput`, `obfuscateApiKey`, `deobfuscateApiKey`.
- `app/settings/page.tsx` — accordion shell wiring all sections.
- `settings-accordion-group.tsx` / `expandable-settings-section.tsx` — collapsible group/section wrappers.
- `day-settings-section.tsx` — day-start-hour Select.
- `water-settings-section.tsx` / `salt-settings-section.tsx` / `sugar-settings-section.tsx` / `potassium-settings-section.tsx` — increment / limit / extended-buffer inputs.
- `optional-trackers-section.tsx` — sugar/potassium toggles.
- `weight-settings-section.tsx` — weight increment + 4 graph-overlay toggles.
- `appearance-section.tsx` — theme Select (next-themes).
- `quick-nav-section.tsx` — footer on/off, drag-reorder list, icon-order Select.
- `animation-timing-section.tsx` — scroll / auto-hide / bar-transition inputs.
- `swipe-nav-section.tsx` — distance + velocity inputs.
- `urination-defecation-defaults.tsx` — default-amount Selects.
- `liquid-presets-section.tsx` — beverage preset CRUD.
- `medication-settings-section.tsx` — primary/secondary region Selects (7-country list).
- `medications/medication-settings-view.tsx` — dose reminders, time format, region combobox (full ISO list).
- `data-management-section.tsx` — export/import/clear all data.
- `storage-info-section.tsx` — storage mode, sync status, migration entry.
- `ai-keys-section.tsx` — provider keys, sharing, usage (server-side).
- `report-bug-section.tsx` — shake-to-report toggle + sensitivity inputs.
- `account-section.tsx` / `permissions-section.tsx` / `medical-ai-section.tsx` / `app-updates-section.tsx` / `help-section.tsx` / `conflict-review-drawer.tsx` — adjacent settings surfaces (account, notification permissions, medical AI consent, PWA updates, help manual, import-conflict resolution).
