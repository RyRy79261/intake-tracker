# 46 — Substances (Caffeine / Alcohol) Tracking

**Files covered:**
- `src/lib/substance-service.ts` — Dexie CRUD for `substanceRecords` + water-intake linking.
- `src/app/api/ai/substance-lookup/route.ts` — per-100ml lookup (caffeine mg / alcohol ABV) from a beverage name.
- `src/app/api/ai/substance-lookup/schema.ts` — Zod + tool schema for the lookup response.
- `src/app/api/ai/substance-enrich/route.ts` — AI enrichment of a free-text "Other" caffeine/alcohol entry.
- `src/hooks/use-substance-queries.ts` — React/Dexie live-query + mutation hooks.
- `src/lib/alcohol-units.ts` — metric standard-drink / ethanol math.
- `src/components/liquids/preset-tab.tsx` — primary entry surface (Coffee & Alcohol tabs of the Liquids card).
- `src/components/liquids-card.tsx` — host card + inline edit form for liquid-linked substances.
- `src/components/edit-substance-dialog.tsx` — standalone substance edit dialog (used by analytics Records tab).
- `src/components/analytics/records-tab.tsx` — substance rows + edit/delete in analytics.
- `src/components/analytics/summary-tab.tsx` — caffeine/alcohol totals.
- `src/components/analytics/correlations-tab.tsx` — caffeine/alcohol vs BP correlations.
- `src/components/history/record-row.tsx` — substance rows in unified history.
- `src/lib/composable-entry-service.ts` — multi-substance composable group writes + `syncLiquidEntrySubstances`.
- `src/lib/db.ts` (`SubstanceRecord`, v12 migration), `src/db/schema.ts` (`substance_records`), `src/lib/constants.ts` (`LiquidPreset`, `DEFAULT_LIQUID_PRESETS`), `src/lib/card-themes.ts` (caffeine/alcohol themes).

**Purpose:** Track caffeine (mg) and alcohol (ABV % → metric standard drinks) consumed via beverages, computed from a per-100ml concentration × the drink volume. Substances are logged alongside the liquid they ride in (the drink's volume also counts as water intake), backed by presets and optional AI lookup/enrichment, and surfaced in history, analytics totals, and BP correlations.

---

## Features

- **Two substance types:** `caffeine` (tracked in milligrams) and `alcohol` (tracked as metric standard drinks, derived from ABV % + volume). No other types exist.
- **Per-100ml model.** The user/preset/AI supplies a *concentration*: caffeine mg per 100 ml, or alcohol ABV % (label %). The logged amount is computed from concentration × actual volume.
  - Caffeine: `amountMg = round((volumeMl / 100) × caffeinePer100ml)`.
  - Alcohol: `amountStandardDrinks = standardDrinksFromAbv(abv, volumeMl)` rounded to 1 dp for entry, 2 dp on edit; `abvPercent` and `volumeMl` are stored alongside.
- **Liquid integration (fluid balance).** When a substance carries a volume, the *full drink volume* is recorded as a `water` intake record (caffeine/alcohol does NOT reduce the water count). Linkage is by `source: "substance:<id>"` (standalone service path) or by shared `groupId` (composable path).
- **Presets** (`LiquidPreset`, scoped to `tab`: `coffee` | `alcohol` | `beverage`). Each preset holds a name, default volume, water-content %, and an optional `caffeinePer100ml` / `alcoholPer100ml` / `saltPer100ml`. Ships with defaults (espresso, coffee, tea, beer, wine, spirit…). Users add (Save-as-preset) and long-press-delete presets.
- **AI lookup** (`/api/ai/substance-lookup`): type a beverage name → Claude (with web_search) returns `substancePer100ml`, `defaultVolumeMl`, `beverageName`, `waterContentPercent`, `reasoning`. Branded items use web search; generic items answered from model knowledge.
- **AI enrichment** (`/api/ai/substance-enrich`): free-text description of a caffeine/alcohol item → returns total caffeine mg + volume, or alcohol ABV %, volume, derived standard drinks + ethanol grams. (Backs voice/"Other" flows; falls back to manual on failure via `fallbackToManual`.)
- **Calculated preview.** Live string in the entry surface, e.g. `"95 mg caffeine"` or `"12% ABV (1.8 std drinks)"`, or `"330 mg salt"` if only salt present.
- **Manual entry** without AI (signed-out users): enter volume + concentration + name, log directly.
- **Edit** any logged substance: time, description, amount (mg or ABV %), and—alcohol only—volume (re-derives standard drinks). Liquid-linked entries are editable inline from the Liquids card; standalone/analytics records via the edit dialog.
- **Soft-delete** with cascade: deleting a substance also soft-deletes its linked water intake record(s).
- **Analytics:** daily/range caffeine-mg total + mg avg/day; alcohol drinks total + drinks avg/day; caffeine-vs-BP and alcohol-vs-BP correlation cards; substance rows in the Records list filterable by type.
- **History:** caffeine/alcohol records appear in the unified history feed with type icon, description, and amount label.
- **AI re-run support:** `originalInputText` + `groupSource` stored on the primary record so the AI estimate can be regenerated.
- **Migration backfill (v12):** legacy water-intake notes containing caffeine/alcohol keywords were converted into `SubstanceRecord`s with default amounts (`aiEnriched: false`).

---

## User actions & interactions

In the **Liquids card → Coffee / Alcohol tab** (`PresetTab`, `tab="coffee"|"alcohol"`):
- **Tap a preset** → loads its volume, concentration, water-content %, name into the form; highlights as selected.
- **Tap the selected preset again** → deselects and clears the form.
- **Long-press a preset (500 ms)** → opens a delete-confirmation AlertDialog ("Delete <name>? This preset will be permanently removed." / Cancel / Delete). The subsequent click is suppressed so long-press never also selects.
- **"Show all (N)"** → expands the preset grid when more than 8 presets exist (otherwise shows first 6).
- **Type in the AI search box** (signed-in only) + **tap the Sparkles button or press Enter** → calls substance-lookup; populates volume, concentration, name, water-content; sets `aiLookupUsed`. Shows a spinner (`Loader2`) while loading.
- **Edit Volume (ml)** and **per-100ml/ABV** number inputs → recomputes the preview; editing either clears the selected-preset highlight.
- **Edit beverage Name** (always visible, even signed-out) → labels the entry.
- **Edit Sugar (g)** optional input → logs a linked sugar intake.
- **Tap "Log Entry"** → writes the composable group (substance(s) + water + optional salt/sugar), toasts "Logged", resets the form. Disabled while submitting, when `volumeMl <= 0`, or when no substance present.
- **Tap "Save as preset & log"** (signed-in, name present, AI lookup used) → creates a new preset (source `ai`/`manual`) then logs; toasts "Saved & Logged". Disabled until AI lookup populates data; otherwise hint: "Use AI lookup to populate substance data".

In the **Liquids card recent-entries list** (water entries, may be substance-linked):
- **Tap edit** on an entry → inline form pre-fills amount, beverage name, caffeine mg, alcohol ABV %, and sugar g (resolved from the linked substance group / preset). **Save** runs `syncLiquidEntrySubstances` to create/update/soft-delete the linked caffeine/alcohol/sugar records. Clearing a field to empty soft-deletes that linked record.
- **Tap delete** on an entry → removes the water entry (and the substance link cascade where applicable).

In **Analytics → Records tab** / **Edit Substance dialog**:
- **Tap a substance row** → opens `EditSubstanceDialog`: edit Time (`datetime-local`), Description, amount (Caffeine mg | % ABV), and—alcohol only—Volume (ml). Save / Cancel.
- **Delete** a substance record from the row.
- **Filter** the records list by `all` / `caffeine` / `alcohol` (among other domains).

In **voice / "Other"** flows: free-text descriptions are sent to substance-enrich and the parsed values pre-fill an entry for confirmation.

---

## States & presentations

- **Default / empty form:** volume 0, concentrations 0, water-content 100, name blank; preview shows "Enter volume and concentration".
- **No presets for tab:** message "No <tab> presets yet. Use AI lookup or enter values manually to create one." (signed-out: "Enter values manually to create one.")
- **Preset selected:** preset button highlighted via `theme.activeToggle`; form fields populated.
- **AI lookup loading:** search input disabled, Sparkles → spinning `Loader2`; lookup button disabled while empty/loading.
- **AI lookup success:** fields populated, `aiLookupUsed = true` (enables Save-as-preset).
- **AI lookup failure:** destructive toast "Lookup failed — Try a different name or enter values manually."; manual entry still possible.
- **Logging / submitting:** Log button label → "Logging…", Save button → "Saving…"; buttons disabled.
- **Log disabled:** when submitting, `volumeMl <= 0`, or no caffeine/alcohol present.
- **Save-as-preset disabled** until AI lookup used; helper text shown when disabled.
- **Calculated preview present:** colored (`theme.iconColor`) summary string; absent → muted "Enter volume and concentration".
- **Signed-out (no auth gate):** AI search box and Save-as-preset hidden; manual concentration entry + Name input still available.
- **Over water-limit:** top water progress bar switches indicator to `progressOverLimit` (red) and the card header total turns red.
- **Two-stage water progress:** primary fill up to `waterLimit`, extended fill into `waterExtendedBuffer`, target marker; over-extended collapses to 100%.
- **Edit dialog per-type:** caffeine → "Edit Caffeine Entry", amount label "Caffeine (mg)", step 1, no volume field; alcohol → "Edit Alcohol Entry", amount label "% ABV", step 0.1, plus Volume (ml) field + note "Standard drinks are calculated from ABV % and volume."
- **Delete-preset confirm:** AlertDialog with destructive Delete; deleting a selected preset clears the form; toast "Deleted — <name> removed".
- **Analytics totals:** caffeine card shown only when `caffeineMg > 0`; alcohol card only when `alcoholDrinks > 0`.
- **History rows:** caffeine row = yellow/amber `Coffee` icon + "<description> · <mg> mg" (fallback "Caffeine"); alcohol row = fuchsia/pink `Wine` icon + "<description> · <n> drink(s)" with singular/plural (fallback "Alcohol").
- **Offline / sync:** all writes go to Dexie immediately and enqueue to `_syncQueue`; `schedulePush()` is best-effort. No blocking sync UI in this unit.
- **AI rate-limited (429):** lookup 15 req/window, enrich 30 req/window → "Rate limit exceeded. Please try again later."
- **AI validation/format failure (422):** lookup → "AI response validation failed"; enrich → `{ error, fallbackToManual: true }` so the UI degrades to manual entry.

---

## Enums, options & configurable values

- **Substance types:** `'caffeine' | 'alcohol'` (DB check constraint `IN ('caffeine','alcohol')`).
- **Record source:** `'water_intake' | 'eating' | 'standalone'` (DB check; service default `standalone`).
- **`groupSource` values (free text, conventional):** `"ai_food_parse"` | `"ai_substance_lookup"` | `"manual"` (also `preset:<id>` and `manual` written by the entry surface).
- **Preset `tab`:** `'coffee' | 'alcohol' | 'beverage'`. Caffeine maps to `coffee`/`beverage`; alcohol to `alcohol`.
- **AI lookup type mapping (PresetTab):** `coffee → caffeine`, `alcohol → alcohol`, `beverage → caffeine` (default).
- **Default caffeine presets** (`caffeinePer100ml`, `waterContentPercent`, `defaultVolumeMl`):
  - Espresso 210 / 98 / 30 ml
  - Double Espresso 210 / 98 / 60 ml
  - Moka 130 / 98 / 50 ml
  - Coffee 38 / 99 / 250 ml
  - Tea 19 / 99 / 250 ml
- **Default alcohol presets** (`alcoholPer100ml` = ABV %, `waterContentPercent`, `defaultVolumeMl`):
  - Beer 5 / 93 / 330 ml
  - Wine 12 / 87 / 150 ml
  - Spirit 40 / 60 / 45 ml
- **Per-100ml input step:** alcohol `0.5`, caffeine/beverage `1` (entry surface); edit dialog: caffeine step `1`, alcohol step `0.1`.
- **Per-100ml input label:** coffee "per 100ml (mg caffeine)", alcohol "% ABV", beverage "per 100ml (mg)".
- **Preset-grid collapse threshold:** > 8 presets collapses to 6 with "Show all".
- **Long-press threshold:** 500 ms.
- **Alcohol unit constants:** `GRAMS_PER_STANDARD_DRINK = 10` (WHO metric standard drink), `ETHANOL_DENSITY_G_PER_ML = 0.789`.
- **AI lookup schema bounds:** `substancePer100ml` 0–500, `defaultVolumeMl` 1–5000, `waterContentPercent` 0–100.
- **AI enrich caffeine bounds:** `caffeineMg` 0–2000, `volumeMl` 0–5000, `reasoning` ≤1000 chars.
- **AI enrich alcohol bounds:** `abvPercent` 0–95, `volumeMl` 0–5000, `ethanolGrams` 0–500 (optional).
- **DB ABV check:** `abvPercent IS NULL OR (0 ≤ abvPercent ≤ 100)`.
- **AI request limits:** lookup `query` 1–200 chars; enrich `description` 1–500 chars.
- **AI rate limiters:** lookup 15, enrich 30 (per IP/window).
- **AI model:** `CLAUDE_MODELS.quality` (Opus), `temperature: 0`, `max_tokens` 4096 (initial) / 1024 (forced-tool follow-up), tools `WEB_SEARCH_TOOL` + the structured tool.
- **AI reference per-100ml caffeine values (prompt):** filter coffee ~40, espresso ~200, black tea ~20, green tea ~12, cola ~10, energy drinks ~32, matcha ~60–100.
- **AI reference ABV/volumes (prompt):** lager 5, IPA 6–7, red wine 13, vodka 40, cask whisky 60; pint 568 ml, half pint 284 ml, wine glass 125–175 ml, single spirit 25 (UK)/30 (EU), double 50 ml.
- **AI reference water content (prompt):** black coffee ~99, beer ~93, wine ~87, spirits ~60.
- **Card theme colors:** caffeine = yellow/amber + `Coffee` icon; alcohol = fuchsia/pink + `Wine` icon. (`CARD_THEMES.caffeine`, `CARD_THEMES.alcohol`.)
- **v12 migration defaults:** caffeine keywords [coffee, espresso, tea, caffeine, matcha, latte, cappuccino] → mg {coffee 95, espresso 63, tea 47, latte 95, cappuccino 95, matcha 70} / ml {coffee 250, espresso 30, tea 250, latte 350, cappuccino 250, matcha 250}; alcohol keywords [beer, wine, whiskey, whisky, vodka, gin, rum, cocktail, spirit, alcohol, brandy] → drinks {beer 1, wine 1, cocktail 1.5}.
- **Analytics filter tabs (substance subset):** `{ value: "caffeine", label: "Caffeine" }`, `{ value: "alcohol", label: "Alcohol" }` (plus all/other domains).
- **Correlation unit suffixes:** caffeine " mg", alcohol " drinks".

---

## Data model touched

**`SubstanceRecord`** (`src/lib/db.ts`) / **`substance_records`** (`src/db/schema.ts`):
- `id` (uuid, PK), `userId` (server only, cascade), `type` `'caffeine'|'alcohol'`.
- `amountMg?` (caffeine mg; `integer` server), `amountStandardDrinks?` (alcohol drinks; `real`), `abvPercent?` (ABV %, user input; `real`), `volumeMl?` (`integer`).
- `description` (required), `source` `'water_intake'|'eating'|'standalone'`, `sourceRecordId?` (FK → `intakeRecords.id`, no cascade), `aiEnriched?`.
- `timestamp`, `createdAt`, `updatedAt`, `deletedAt` (soft-delete), `deviceId`, `timezone` (sync metadata via `syncFields()`).
- `groupId?` (links composable group records), `originalInputText?` (primary record only, AI re-run), `groupSource?`.
- **Dexie indexes:** `id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt`.
- **Server indexes/checks:** `idx_substance_user_updated`, `idx_substance_type_ts`, `idx_substance_group`; type/source/ABV-range check constraints.

**Also writes/reads:**
- `IntakeRecord` (`type: "water"`, `source: "substance:<id>"` or via group) — fluid-balance link; also `sugar`/`salt` linked intakes from the same entry.
- `LiquidPreset` (`src/lib/constants.ts`, Zustand `settings-store` → localStorage): `id, name, tab, defaultVolumeMl, waterContentPercent, caffeinePer100ml?, alcoholPer100ml?, saltPer100ml?, isDefault, source`.
- `_syncQueue` op-log (`enqueueInsideTx(...,"upsert")`), `_syncMeta` cursor (via sync engine).

---

## Validation, edge cases & business rules

- **Standard-drink math:** `ethanolGrams = volumeMl × (abvPercent/100) × 0.789`; `standardDrinks = ethanolGrams / 10`; `abvFromStandardDrinks` inverts it (returns 0 for non-positive volume). Used to back-fill ABV for legacy records that stored only `amountStandardDrinks` + `volumeMl`.
- **Rounding:** caffeine mg `Math.round`; standard drinks 1 dp on entry, 2 dp on edit/sync; ethanol grams to 1 dp in enrich response; salt/sugar `Math.round`.
- **Alcohol edit requires volume:** editing an alcohol amount requires ABV in (0,100] AND a volume > 0, else validation toast; standard drinks can't be derived otherwise.
- **Water double-count guard:** in composable entries, `volumeMl` is included on the substance only when no explicit water intake exists (`waterAmount <= 0`), otherwise the service would auto-create a duplicate water record.
- **Full volume = water:** caffeine/alcohol content never reduces the water amount; `waterContentPercent` is captured/stored on presets/AI but the full drink volume counts as water.
- **Soft-delete cascade:** deleting a substance soft-deletes water intakes whose `source = "substance:<id>"`; queries filter `deletedAt === null`.
- **Inline sync rules (`syncLiquidEntrySubstances`):** each of caffeineMg/alcoholAbv/sugarG, when `> 0`, updates the first existing record of that type or creates one; when set to 0/cleared, soft-deletes the existing record; duplicate extras of a type are soft-deleted; if the intake has no `groupId` and the patch introduces a substance, a group is created.
- **Backward-compat single vs multi:** one substance → singular `entry.substance`; multiple → `entry.substances[]`; legacy records may lack `abvPercent` (derived) or `groupId` (resolved via preset lookup).
- **AI unit discipline (critical):** alcohol `substancePer100ml`/`abvPercent` MUST be label ABV %, never grams or ml of ethanol; conversion to standard drinks happens server-side only. Caffeine is per-100ml mg; metric units only (no oz/cups/US standard drinks). Prompts enforce this; a forced-tool follow-up call retries if the model didn't emit the structured tool.
- **Input sanitization:** queries/descriptions run through `sanitizeForAI`; empty-after-sanitize → 400. PII-safe by design (server holds the key).
- **Timestamp default:** `input.timestamp ?? Date.now()`; edit dialog uses `datetime-local`.
- **Day/timezone:** records store `timezone`; daily totals computed by the analytics/settings day-start logic (not in this file set).
- **`getUnenrichedSubstanceRecords`:** returns `source === "water_intake"`, not yet `aiEnriched`, not deleted — candidates for the post-load AI enrichment pass.

---

## Sub-components / variants

- `PresetTab` (`tab="coffee"|"alcohol"|"beverage"`) — preset grid + AI search + manual volume/concentration entry + log/save actions (the primary surface).
- `LiquidsCard` — host with 4 tabs (Water / Beverage / Coffee / Alcohol) and the inline edit form for liquid-linked caffeine/alcohol/sugar.
- `EditSubstanceDialog` — standalone substance edit (time/description/amount, alcohol adds volume), type-aware labels & steps.
- `substance-service.ts` — `addSubstanceRecord`, `getSubstanceRecords`, `getSubstanceRecordsByDateRange`, `deleteSubstanceRecord` (cascade), `updateSubstanceRecord`, `getUnenrichedSubstanceRecords`.
- `use-substance-queries.ts` — `useSubstanceRecords`, `useSubstanceRecordsByDateRange`, `useAddSubstance`, `useDeleteSubstance`, `useUpdateSubstance`.
- `composable-entry-service.ts` — multi-substance group writes + `syncLiquidEntrySubstances` (create/update/soft-delete linked caffeine/alcohol/sugar around a liquid).
- `alcohol-units.ts` — `ethanolGrams`, `standardDrinksFromAbv`, `abvFromStandardDrinks`, constants.
- `substance-lookup/route.ts` + `schema.ts` — per-100ml lookup API + `substance_lookup_result` tool/Zod schema.
- `substance-enrich/route.ts` — free-text enrichment API (`caffeine_enrichment` / `alcohol_enrichment` tools).
- `analytics/records-tab.tsx` — substance rows, type filter, edit/delete wiring.
- `analytics/summary-tab.tsx` — caffeine mg + alcohol drinks totals/averages.
- `analytics/correlations-tab.tsx` — caffeine-vs-BP & alcohol-vs-BP cards.
- `history/record-row.tsx` — caffeine/alcohol rows in unified history.
- `card-themes.ts` — caffeine (yellow/amber, Coffee) & alcohol (fuchsia/pink, Wine) visual themes.
