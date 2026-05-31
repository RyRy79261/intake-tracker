# Verification — 46-substances

**Verdict:** minor-gaps  ·  checked 96 claims, verified 88.

The document is highly accurate on data model, presets, math, AI schema bounds, themes, and UI surfaces — almost every digit-for-digit value (presets, migration defaults, schema bounds, rate limits, constants) is correct. The notable defects are around the **substance-enrich route's real purpose** (the doc misattributes it to voice/"Other" flows when it is actually a background Pass-2 enrichment runner for v12-migrated records) and the **alcohol correlation unit suffix** (the dedicated card uses " units", not " drinks").

---

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| high | substance-enrich "Backs voice/'Other' flows" / "voice / 'Other' flows: free-text descriptions are sent to substance-enrich and the parsed values pre-fill an entry for confirmation" (lines 33, 68, 182) | No UI/voice flow calls `/api/ai/substance-enrich`. Its only caller is `runSubstanceEnrichment()`, a **background Pass-2 enrichment runner** that re-estimates v12-migrated records (`source='water_intake'`, `aiEnriched=false`). Voice creates substances via `addSubstance` using values already produced by the **food-parse** AI, never substance-enrich. | `src/lib/substance-enrich.ts:5-9,24,41`; `src/components/voice/voice-panel.tsx:240-258`; route has zero app callers |
| medium | "Correlation unit suffixes: caffeine ' mg', alcohol ' drinks'" (line 132) | The dedicated **Alcohol vs Blood Pressure** card uses `unitA=" units"`, not `" drinks"`. The `" drinks"` suffix exists only in the generic `DOMAIN_UNITS` map used by the configurable correlation explorer. Caffeine card `unitA=" mg"` is correct. | `src/components/analytics/correlations-tab.tsx:404` (units), `:395` (mg), `:77` (DOMAIN_UNITS drinks) |
| low | "`groupSource` values … `"manual"` (also `preset:<id>` and `manual` written by the entry surface)" (line 101) | The PresetTab always writes `preset:<id>` form — `preset:${selectedPresetId ?? "manual"}` → e.g. `preset:manual`, never a bare `"manual"`. `ai_substance_lookup` appears only as a type-comment in db.ts and is never written by any code path. | `src/components/liquids/preset-tab.tsx:233,244`; `src/lib/db.ts:323` (comment only) |
| low | Edit dialog: "Save / Cancel" (lines 64, 176) | The submit button label is "Save Changes" (Cancel is correct). | `src/components/edit-substance-dialog.tsx:120-124` |
| low | "Show all (N)" → "expands the preset grid when more than 8 presets exist (otherwise shows first 6)" (line 51) | Slightly misleading: with ≤8 presets ALL are shown (not "first 6"); only when `> 8` and not expanded does it slice to the first 6. The "Show all (N)" button likewise renders only when `presets.length > 8`. | `src/components/liquids/preset-tab.tsx:117-120,434` |
| low | Caffeine "amountMg = round(...)"; edit "amount (mg)" (lines 28, 36) | On the analytics Edit-Substance path the caffeine amount is stored as raw `parseFloat(amt)` with **no** `Math.round` (`amountField = { amountMg: amt }`). Entry surface and inline-sync paths DO round; the dialog edit path does not. | `src/components/analytics/records-tab.tsx:361-362` |

---

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| medium | `src/lib/substance-enrich.ts` (`runSubstanceEnrichment`) is not in "Files covered" at all, yet it is the sole consumer of the substance-enrich route — batches of 5, 1 s inter-batch delay, best-effort skip on non-OK, only enriches caffeine when `data.caffeineMg !== undefined` / alcohol when `data.standardDrinks !== undefined`. | `src/lib/substance-enrich.ts:19,33-95` |
| low | Inline liquid edit form's **Sugar (g)** field is gated on the optional-tracker toggle `useOptionalTrackerEnabled("sugar")`; when disabled the field is hidden and `sugarG` is passed as `null` (leaves any existing linked sugar untouched). Doc presents sugar editing unconditionally. | `src/components/liquids-card.tsx:70,197,403` |
| low | `syncLiquidEntrySubstances` volume nuance: when **updating** an existing caffeine/alcohol record it only writes `volumeMl` if the record already had one (`existingX.volumeMl !== undefined`); a newly **created** record always gets `volumeMl: patch.volumeMl`. Doc's sync rules don't capture this. | `src/lib/composable-entry-service.ts:665-667,675,721-723,732` |
| low | `addSubstanceRecord` standalone path: the linked water `IntakeRecord` is created only when `input.volumeMl` is truthy (a falsy/0/undefined volume skips the water record and the whole intake transaction). | `src/lib/substance-service.ts:41-62` |
| low | New caffeine/alcohol records created by inline sync default `description` to `"Drink"` when none supplied; PresetTab description fallback is `"Coffee" / "Drink" / "Beverage"` by tab. Doc doesn't list these literal fallbacks. | `src/lib/composable-entry-service.ts:676,733`; `src/components/liquids/preset-tab.tsx:230` |
| low | `deleteEntryGroup` / `undoDeleteEntryGroup` / `deleteSingleGroupRecord` / `undoDeleteSingleRecord` exist in composable-entry-service (group-level soft-delete + undo across intake/eating/substance). Doc only mentions `addComposableEntry` and `syncLiquidEntrySubstances`. | `src/lib/composable-entry-service.ts:189,224,280,300` |
| low | `recalculateFromCurrentValues` is a deferred stub that always returns an error (Phase 13/14). | `src/lib/composable-entry-service.ts:818-824` |
| low | Substance type filter is part of a larger `FilterType` union (`all/water/salt/sugar/potassium/weight/bp/eating/urination/defecation/caffeine/alcohol`); the substance filter tabs are also gated by `visibleFilterTabs` (optional-tracker settings). Doc notes only the caffeine/alcohol subset. | `src/lib/history-types.ts:14`; `src/components/analytics/records-tab.tsx:111,118` |
| low | groupId index on substanceRecords was added in **v15**, not v12; the v12 store definition omits `groupId`. Doc's index list reflects current schema (correct) but attributes the table addition to v12 migration without noting groupId came later. | `src/lib/db.ts:490` (v12, no groupId), `:721-725` (v15 adds groupId), `:748` (current) |

---

## Spot-confirmed

- Two substance types `'caffeine' | 'alcohol'`, no others — `src/lib/db.ts:306`; DB check `IN ('caffeine','alcohol')` — `src/db/schema.ts:262`, `drizzle/0000_init.sql:277`.
- Caffeine preview `round((volumeMl/100) * caffeinePer100ml) mg caffeine` and alcohol `${abv}% ABV (${1dp} std drinks)`; salt-only fallback `round(...) mg salt`; empty fallback "Enter volume and concentration" — `src/components/liquids/preset-tab.tsx:91-111,580`.
- Alcohol entry std-drinks 1 dp (`parseFloat(...toFixed(1))`); edit/sync 2 dp (`.toFixed(2)`) — `src/components/liquids/preset-tab.tsx:291`; `src/components/analytics/records-tab.tsx:369`; `src/lib/composable-entry-service.ts:711`.
- Full drink volume → water intake `source: "substance:<id>"` (standalone) or shared `groupId` (composable); caffeine/alcohol does not reduce water — `src/lib/substance-service.ts:45-53`; `src/components/liquids/preset-tab.tsx:236-246,281-283`.
- Default caffeine presets (mg/water%/ml): Espresso 210/98/30, Double Espresso 210/98/60, Moka 130/98/50, Coffee 38/99/250, Tea 19/99/250 — `src/lib/constants.ts:127-131` (exact).
- Default alcohol presets (ABV/water%/ml): Beer 5/93/330, Wine 12/87/150, Spirit 40/60/45 — `src/lib/constants.ts:133-135` (exact).
- Per-100ml input step: alcohol `0.5`, else `1` (entry); edit dialog caffeine `1`, alcohol `0.1` — `src/components/liquids/preset-tab.tsx:547`; `src/components/edit-substance-dialog.tsx:51`.
- Per-100ml labels: coffee "per 100ml (mg caffeine)", alcohol "% ABV", beverage "per 100ml (mg)" — `src/components/liquids/preset-tab.tsx:381-382`.
- Long-press 500 ms → delete AlertDialog "Delete <name>?" / "This preset will be permanently removed." / Cancel / Delete; click suppressed after long-press; toast "Deleted — <name> removed" — `src/components/liquids/preset-tab.tsx:152-155,165-171,181-186,624-637`.
- AI lookup type mapping coffee→caffeine, alcohol→alcohol, beverage→caffeine — `src/components/liquids/preset-tab.tsx:88`.
- Lookup loading: Sparkles → spinning Loader2, input disabled, button disabled while empty/loading — `src/components/liquids/preset-tab.tsx:461,475-483`. Failure toast "Lookup failed — Try a different name or enter values manually." (destructive) — `:216-220`.
- Log button "Logging…"/disabled when `isSubmitting || volumeMl <= 0 || !hasSubstance`; Save-as-preset "Saving…"/also disabled `!aiLookupUsed`, hint "Use AI lookup to populate substance data" — `src/components/liquids/preset-tab.tsx:590-614`.
- Alcohol units: `GRAMS_PER_STANDARD_DRINK = 10`, `ETHANOL_DENSITY_G_PER_ML = 0.789`; `ethanolGrams = vol*(abv/100)*0.789`; `standardDrinksFromAbv = ethanolGrams/10`; `abvFromStandardDrinks` returns 0 for non-positive volume — `src/lib/alcohol-units.ts:7-34`.
- Lookup schema bounds: substancePer100ml 0–500, defaultVolumeMl 1–5000, waterContentPercent 0–100 — `src/app/api/ai/substance-lookup/schema.ts:4-8`. Request: query 1–200, type enum — `route.ts:13-16`.
- Enrich caffeine bounds: caffeineMg 0–2000, volumeMl 0–5000, reasoning ≤1000 — `src/app/api/ai/substance-enrich/route.ts:27-31`. Alcohol: abvPercent 0–95, volumeMl 0–5000, ethanolGrams 0–500 (optional) — `:33-38`. Description 1–500 — `:21`.
- Rate limiters lookup 15, enrich 30; 429 message "Rate limit exceeded. Please try again later." — `substance-lookup/route.ts:18,78-80`; `substance-enrich/route.ts:108,126-128`.
- AI model `CLAUDE_MODELS.quality`, temperature 0, max_tokens 4096 then 1024 forced-tool follow-up, tools `WEB_SEARCH_TOOL` + structured tool — `substance-lookup/route.ts:120-125,143-152`.
- 422 handling: lookup → `{ error: "AI response validation failed" }`; enrich → `{ error, fallbackToManual: true }` — `substance-lookup/route.ts:186`; `substance-enrich/route.ts:226-229,239-243,253-257`.
- AI prompt reference values (caffeine ~40/200/20/12/10/32/60-100; ABV lager 5/IPA 6-7/wine 13/vodka 40/whisky 60; volumes pint 568/half 284/wine 125-175/spirit 25-30/double 50; water content 99/93/87/60) — `substance-lookup/route.ts:42-46,61-65`; `substance-enrich/route.ts:98-99`.
- Themes: caffeine yellow/amber + Coffee icon; alcohol fuchsia/pink + Wine icon — `src/lib/card-themes.ts:227-250`.
- v12 migration keyword maps + defaults (caffeine mg coffee95/espresso63/tea47/latte95/cappuccino95/matcha70; vol coffee250/espresso30/tea250/latte350/cappuccino250/matcha250; alcohol drinks beer1/wine1/cocktail1.5; aiEnriched:false; source water_intake) — `src/lib/db.ts:645-707` (exact).
- Server schema: amountMg integer, amountStandardDrinks real, abvPercent real, volumeMl integer, userId cascade, sourceRecordId FK no-cascade; checks type/source/ABV-range; indexes idx_substance_user_updated/type_ts/group — `src/db/schema.ts:228-278`; `drizzle/0000_init.sql:277-278,392-394`; `drizzle/0006_milky_klaw.sql:2`.
- Dexie substanceRecords index `id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt` (current) — `src/lib/db.ts:748`.
- Soft-delete cascade: deleting substance soft-deletes water intakes `source = "substance:<id>"`; queries filter `deletedAt === null` — `src/lib/substance-service.ts:120-146,88,117`.
- `getUnenrichedSubstanceRecords` → `source === "water_intake"`, `!aiEnriched`, `deletedAt === null` — `src/lib/substance-service.ts:167-174`.
- Service exports & hooks match doc lists — `src/lib/substance-service.ts`; `src/hooks/use-substance-queries.ts`.
- Analytics totals: caffeine card only `caffeineMg > 0` (`round mg`, `round mg avg/day`), alcohol only `alcoholDrinks > 0` (`toFixed(1) drinks`, `toFixed(1) avg/day`) — `src/components/analytics/summary-tab.tsx:374-388`.
- History rows: caffeine "<desc> · <mg> mg" fallback "Caffeine"; alcohol "<desc> · <n> drink(s)" singular/plural fallback "Alcohol" — `src/components/history/record-row.tsx:73-90`.
- Edit dialog per-type: "Edit Caffeine/Alcohol Entry", caffeine label "Caffeine (mg)" step 1 no volume; alcohol label "% ABV" step 0.1 + Volume (ml) + note "Standard drinks are calculated from ABV % and volume." — `src/components/edit-substance-dialog.tsx:48-117`.
- Alcohol edit validation requires ABV in (0,100] AND volume > 0 else toast — `src/components/analytics/records-tab.tsx:348-357`.
- Water double-count guard: `volumeMl` on substance only when `waterAmount <= 0` — `src/components/liquids/preset-tab.tsx:283,293`.
- `originalInputText` on primary record only (eating, or singular substance when `!input.eating`; not on plural substances) — `src/lib/composable-entry-service.ts:79,125`.
- Backward-compat single→`entry.substance`, multi→`entry.substances[]` — `src/components/liquids/preset-tab.tsx:299-303`; `src/lib/composable-entry-service.ts:109,152`.
- Input sanitization via `sanitizeForAI`, empty→400 — `substance-lookup/route.ts:92-98`; `substance-enrich/route.ts:152-158`.
- Timestamp default `input.timestamp ?? Date.now()` — `src/lib/substance-service.ts:25`.
- `LiquidPreset` shape (id/name/tab/defaultVolumeMl/waterContentPercent/caffeinePer100ml?/alcoholPer100ml?/saltPer100ml?/isDefault/source) — `src/lib/constants.ts:111-123`.
- LiquidsCard 4 tabs Water/Beverage/Coffee/Alcohol; coffee/alcohol render `PresetTab` — `src/components/liquids-card.tsx:260-309`.
- Over-water-limit header turns red (`text-red-600`) and progress switches to `progressOverLimit` (bg-red-500) — `src/components/liquids-card.tsx:212,239-241`; `src/lib/card-themes.ts:239,260`; `src/components/liquids/preset-tab.tsx:394`.

---

## Low-confidence / could-not-verify

- "AI re-run support: `originalInputText` + `groupSource` stored so the AI estimate can be regenerated" (line 40) — the **fields are stored** (confirmed), and food/eating UI surfaces a re-run flow, but no substance-specific re-run UI was found in this file set; the regeneration capability for substances specifically is plausible but not directly exercised by any code read here. Treated as not-falsified rather than confirmed.
- "AI enrichment … returns total caffeine mg + volume, or alcohol ABV %, volume, derived standard drinks + ethanol grams … falls back to manual on failure via `fallbackToManual`" (line 33) — the route's response shape is confirmed; `fallbackToManual` is returned on 422. But because no live UI consumes this route (only the background runner, which ignores `fallbackToManual`), the "falls back to manual" UX described is not actually wired anywhere in the read surface.
- Offline/sync claims (writes to Dexie + `_syncQueue` via `enqueueInsideTx`, `schedulePush()` best-effort, `_syncMeta` cursor) are consistent with what was read in the service/composable layers, but the full sync-engine behavior lives outside this file set and was not exhaustively traced.
