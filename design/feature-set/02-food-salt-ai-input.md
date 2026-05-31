# 02 — Food + Salt + AI "What I Ate" Input

**Files covered:**
- `src/components/food-salt-card.tsx` — the Food card shell + sodium/sugar/potassium budget bars
- `src/components/food-salt/food-section.tsx` — the entry form, AI parse, recent list, inline edit
- `src/components/food-salt/composable-preview.tsx` — editable AI-preview list (`PreviewRecord[]`, currently unused by FoodSection but a sibling preview UI)
- `src/lib/composable-entry-service.ts` — multi-record group create/edit/delete/sync against Dexie
- `src/hooks/use-composable-entry.ts` — React hooks wrapping the composable service (incl. undo toasts)
- `src/hooks/use-eating-queries.ts` — plain eating-record CRUD hooks
- `src/app/api/ai/parse/route.ts` — server-side Claude "what I ate" → {water, sodium, sugar, potassium} parse
- `src/app/api/ai/nutrient-analysis/route.ts` — server-side Claude nutrient-bias analysis over recent foods
- Supporting: `src/lib/ai-client.ts`, `src/lib/optional-trackers.ts`, `src/lib/progress-utils.ts`, `src/lib/card-themes.ts` (`eating`/`salt`/`sugar`/`potassium`), `src/hooks/use-intake-queries.ts`, `src/lib/db.ts` (`IntakeRecord`, `EatingRecord`), `src/components/ui/progress.tsx`, `src/components/auth-guard.tsx` (`useAuthGate`)

**Purpose:** A single "Food" card that tracks sodium (always-on) plus optional sugar and potassium budgets, and lets the user log a meal by typing a free-text description ("What I ate…") that an AI parses into per-nutrient + water-content estimates. Entries are stored as a *composable group* — one eating record linked by `groupId` to salt/sugar/potassium/water intake records — so totals stay correct and the whole meal can be edited or deleted as a unit.

---

## Features

### Budget bars (card header region)
- **Sodium bar (always shown):** daily total vs `saltLimit`, with a two-stage progress bar (target zone + extended-buffer overflow zone) and a rolling 24h total.
- **Sugar bar (optional tracker, default ON):** daily total vs `sugarLimit`, two-stage bar, 24h rolling total. Hidden entirely when the `sugar` optional tracker is disabled.
- **Potassium bar (optional tracker, default OFF):** daily total vs `potassiumLimit`, single-stage "soft target" bar (no extended buffer, caps at 100%), 24h rolling total. Hidden when the `potassium` tracker is disabled.
- Each bar shows: label, `consumed / limit` (consumed clamped to limit in the main number), an "extra" overflow line once over target, and a `24h: <rolling>` sub-line.
- Number/bar colors shift by state: foreground (under target) → orange (over target, within buffer) → red (over extended buffer). Potassium has no over-limit coloring.
- `formatAmount` formats values: `ml` ≥ 1000 → `X.YL`, otherwise `${amount}${unit}` (units `mg`, `g`, `ml`).

### Entry form
- **"What I ate…" text input** — free text. When the user is signed in (`useAuthGate`), it doubles as the AI parse trigger (Sparkles button + Enter key); the text also becomes the eating record's `note` and `originalInputText`.
- **AI parse** (`parseIntakeWithAI` → `POST /api/ai/parse`) — fills Sodium (mg, source forced to `sodium`), Water content (ml), and — if the respective optional tracker is enabled — Sugar (g) and Potassium (mg). Shows the AI's `reasoning` as a toast ("AI estimate"). Marks the form `aiPopulated`.
- **Manual detail fields** (always visible): Weight (g, optional), Sodium (required, with measurement-source select), Sugar (g, optional — only if sugar tracker on), Potassium (mg, optional — only if potassium tracker on), Water content (ml, optional).
- **Sodium measurement conversion:** the entered number is multiplied by a source factor to derive stored sodium-mg. A live hint shows `= <calculated>mg sodium` whenever source ≠ Sodium and the result > 0.
- **Record with details** button — persists. If any intake fields or AI-population exist, writes a composable group; otherwise writes a plain eating record (note/grams only).
- **Recent entries list** — last 5 eating records, each showing timestamp, linked sodium (`mg`), linked sugar (`g sugar`, if tracker on), linked potassium (`mg K`, if tracker on), grams, and note. Per-row edit + delete.
- **Inline edit form** — edits timestamp, note, weight, sodium (+source), sugar, potassium, water content; reconciles the linked group via `syncEatingGroup`.
- **Delete with undo** — soft-delete with a toast offering Undo (~5s window).

### Composable group model
- One submit can create up to: 1 eating record + N intake records (`salt`, `sugar`, `potassium`, `water`), all sharing one `groupId` and a `groupSource`.
- Group reads/writes are transactional across `intakeRecords`, `eatingRecords`, `substanceRecords` and the sync queue; every mutation enqueues an upsert + schedules a push.
- Recent-list nutrient badges are computed by `groupId` via `getSalt/Sugar/PotassiumTotalsByGroupIds`.

### AI nutrient analysis (server route)
- `POST /api/ai/nutrient-analysis` analyzes a list of recent foods (last *windowDays*) and returns nutrient-bias findings (consumed by the Analytics/Summary tab, not this card). Included here because it is part of the food data pipeline.

---

## User actions & interactions

| Action | Result |
| --- | --- |
| Type in "What I ate…" | Sets `foodText`; becomes note + originalInputText on save. |
| Press Enter in food input (signed in) | Triggers AI parse (`handleParse`). Does nothing special when signed out. |
| Tap Sparkles button (signed in) | Triggers AI parse. Disabled when input empty or parsing. Shows spinner (`Loader2`) while parsing. |
| AI parse succeeds | Auto-fills Sodium (source `sodium`), Water; Sugar/Potassium only if their tracker is enabled & value > 0; sets `aiPopulated=true`; shows reasoning toast. |
| AI parse fails | Destructive toast "AI parsing failed — Try again or add details manually." |
| AI parse returns null (user dismissed sign-in prompt) | Silent no-op. |
| Enter Weight (g) | Optional; parsed as int, only saved if > 0. |
| Enter Sodium + pick source | Required to enable save; conversion hint appears for salt/MSG. |
| Change Sodium source select | Switches multiplier (sodium 1.0 / salt 0.39 / msg 0.12). |
| Enter Sugar (g) / Potassium (mg) | Optional; only when tracker enabled; rounded to int, saved only if > 0. |
| Enter Water content (ml) | Optional; rounded, creates a linked water intake (`manual:food_water_content`) carrying the food note. |
| Tap "Record with details" | Saves. Blocked (with toast) if no sodium. Composable group if intakes/AI present, else plain eating record. Success toast + form reset. |
| Tap edit (pencil) on a recent row | Opens inline edit form; back-fills sodium (back-converted to input units via source multiplier), sugar, potassium, water, grams, note, timestamp. |
| Edit & Save in inline form | `syncEatingGroup` upserts/soft-deletes linked records; a `groupId` is generated if the record had none and any nutrient > 0. |
| Cancel inline edit | Closes form, discards changes; stale async group fetches are ignored via `openTokenRef`. |
| Tap delete on a recent row | Soft-deletes the eating record; undo toast (~5s). |
| Tap X on a preview row (ComposablePreview) | Removes that record from the preview list (stops propagation). |
| Tap a preview row header | Expand/collapse its editable fields (Collapsible). |
| Edit fields in preview row | Updates that record's description/grams/ml/mg in place. |
| Tap "Try Again" (preview) | Re-runs parse (caller-defined `onTryAgain`). |
| Tap "Confirm All" (preview) | Saves all preview records; disabled when list empty or while confirming (spinner + "Saving…"). |
| Toggle Sugar/Potassium optional tracker (in Settings) | Shows/hides that bar, form field, edit field, and recent-badge across the card; new entries for a disabled tracker are not persisted. |

---

## States & presentations

**Budget bars:**
- **Under target:** foreground number color; single-stage fill.
- **Over target, within buffer (two-stage):** orange number + "extra" line; bar shows primary segment full + extended (second-tone) segment growing; target marker line rendered.
- **Over extended buffer:** red number + red "extra" line; bar forced to 100% solid red (`progressOverLimit`), extended segment & marker hidden.
- **Potassium:** soft target only — fills 0–100%, never colors over-limit, no extended segment, no marker.
- **Zero / no limit:** if limit ≤ 0, progress is 0%, never two-stage.
- **Optional tracker disabled:** entire sugar / potassium bar block absent (`data-testid="food-card-sugar"` / `food-card-potassium`).

**Form:**
- **Default:** food input + Weight/Sodium/Water fields; Sugar/Potassium fields present only if enabled. Save button disabled (no sodium yet) with hint "Enter a sodium amount to enable saving."
- **Signed out:** no Sparkles button, no AI affordance; input aria-label "Describe what you ate"; manual entry only.
- **Signed in (AI available):** Sparkles button visible, input right-padded (`pr-10`), aria-label "Describe food for AI nutritional parsing".
- **Parsing:** food input `disabled`; Sparkles → spinner; button disabled.
- **AI-populated:** fields filled; `aiPopulated` flag changes save to a composable group with `groupSource: "ai_food_parse"` and stores `originalInputText`.
- **Submitting:** save button shows spinner; disabled.
- **Validation error (no sodium):** save disabled; destructive toast if forced; hint text below button.
- **Success:** success toast ("Meal with details recorded" or "Eating event recorded"); form resets.
- **Error (save failed):** destructive toast "Failed to record".
- **Sodium conversion hint:** shown only when source ≠ sodium and calculated > 0.

**Recent list:**
- **Populated:** rows with timestamp + nutrient badges (sodium orange, sugar pink, potassium purple) + grams + truncated note.
- **Editing row:** row replaced by inline edit form (`InlineEditFormShell`) with grams/sodium+source/sugar/potassium/water + timestamp + note + Save/Cancel.
- **Deleting row:** spinner / disabled while delete in flight (via `deletingId`).
- **Empty:** (RecentEntriesList renders its own empty state when no records.)

**ComposablePreview:**
- **Empty list:** shows original text + "No records to save. Try again or add details manually."; "Confirm All" disabled.
- **Collapsed row:** icon + label + summary (e.g. "120 mg", "250 ml", description).
- **Expanded row:** editable fields for the record's type.
- **Confirming:** "Confirm All" → spinner + "Saving…", disabled.
- **Reasoning present:** italic, line-clamped (2 lines) caption under the rows.

**Server route states:** `429` rate-limited; `400` invalid after sanitization; `422` AI didn't return structured tool / shape invalid (`fallbackToManual: true` on parse); `502` generic failure; mapped AI-key errors via `aiErrorResponse`.

---

## Enums, options & configurable values

**Sodium measurement source (`SodiumSource` / `SodiumKind`)** — select options & multipliers (`SODIUM_MULTIPLIERS`):
- `sodium` → ×1.0 (direct sodium mg) — label "Sodium"
- `salt` → ×0.39 (table salt ≈ 39% sodium) — label "Salt"
- `msg` → ×0.12 (MSG ≈ 12% sodium) — label "MSG"
- Stored on the linked salt intake as `source: "manual:<kind>"`.

**Intake `type` values** (`IntakeRecord.type`): `water` | `salt` | `sugar` | `potassium`.

**Linked-record source tags:**
- Sodium: `manual:sodium` / `manual:salt` / `manual:msg`
- Sugar: `manual:sugar` (`SUGAR_SOURCE`)
- Potassium: `manual:potassium` (`POTASSIUM_SOURCE`)
- Water content: `manual:food_water_content` (`FOOD_WATER_SOURCE`)
- Generic composable fallback: `composable`

**`groupSource` values:** `manual_food_entry` (manual), `ai_food_parse` (AI-populated); broader set documented in db.ts also includes `ai_substance_lookup`, `manual`.

**Optional trackers (`OPTIONAL_TRACKERS` / `OPTIONAL_TRACKER_DEFAULTS`):**
- `sugar` — label "Sugar", unit `g`, icon `Candy`, color pink, **default ON**.
- `potassium` — label "Potassium", unit `mg`, icon `Banana`, color purple, **default OFF**.

**Settings defaults & sanitize ranges (`settings-store.ts`):**
- `saltLimit` 1500 mg (range 100–10000)
- `sugarLimit` 30 g (range 5–500)
- `potassiumLimit` 3500 mg (range 100–20000; WHO adequate-intake reference)
- `saltExtendedBuffer` 500 mg (0–10000)
- `sugarExtendedBuffer` 10 g (0–500)
- `saltIncrement` 250 mg (10–1000) — used by the Salt card, not this form
- `dayStartHour` 2 (0–23) — controls "today's" budget window
- Potassium has **no** extended buffer (soft target).

**Form input bounds:**
- Weight: `min=1 max=10000`, parsed int.
- Sodium: `min=0`, required, parsed float.
- Sugar / Potassium / Water: `min=0`, parsed float, rounded to int.
- Preview grams/ml/mg: `min=1`, parsed int.

**Card theme tokens** (`CARD_THEMES`): `eating` (orange — card shell + Utensils icon + button), `salt` (amber/orange progress gradients + `progressExtended` orange→amber + `progressOverLimit` red), `sugar` (pink/rose + extended rose→fuchsia + red), `potassium` (purple/indigo gradient, no extended). Badge colors: sodium `text-orange-600`, sugar `text-pink-600`, potassium `text-purple-600`.

**AI parse route (`/api/ai/parse`):**
- Model: `CLAUDE_MODELS.quality` (Opus); `temperature: 0`; `max_tokens: 4096`; tools: `WEB_SEARCH_TOOL` + `parse_food_result`.
- Rate limit: 20 / window per IP.
- Request: `{ input: string }` (1–500 chars).
- Tool output fields: `water_ml`, `sodium_mg`, `sugar_g`, `potassium_mg`, `reasoning` (all required; nulls allowed).
- Validation caps: water 0–10000, sodium 0–20000, sugar 0–1000, potassium 0–20000; reasoning ≤ 1000 chars.
- Salt→sodium conversion in prompt: `sodium_mg = salt_g * 1000 / 2.5`; "pinch of salt" ≈ 0.4 g NaCl ≈ 155 mg sodium.
- Response shape (to client): `{ water, salt (=sodium mg), measurement_type: "sodium", sugar, potassium, reasoning? }`.

**AI nutrient-analysis route (`/api/ai/nutrient-analysis`):**
- Model: Opus; `temperature: 0.2`; `max_tokens: 4096`; rate limit 10 / window.
- Request: `windowDays` 1–90, optional `focus` (≤200), `foods[]` 1–500 (`description` 1–300, optional `grams` 0–10000), optional `conditions[]` (≤20), optional `medications[]` (≤40, with `phaseType: maintenance|titration`).
- Finding `status` enum: `high` | `low` | `balanced`.
- Response: `summary` (≤4000), `findings[]` (≤20, each: nutrient, status, detail ≤2000, exampleFoods ≤12), `caveats[]` (≤8).

---

## Data model touched

**`IntakeRecord` (`db.ts`):** `id, type (water|salt|sugar|potassium), amount (ml|mg|g per type), timestamp, source?, note?, createdAt, updatedAt, deletedAt, deviceId, timezone, groupId?, originalInputText?, groupSource?`. Dexie index includes `groupId` (added v15).

**`EatingRecord` (`db.ts`):** `id, timestamp, grams?, note?, createdAt, updatedAt, deletedAt, deviceId, timezone, groupId?, originalInputText?, groupSource?`.

**`SubstanceRecord`:** touched by the composable service (caffeine/alcohol), but not by the food form — relevant only for shared group transactions.

**Service entry points used:**
- `addComposableEntry(input, timestamp)` — creates the group (eating + intakes [+ substances]).
- `syncEatingGroup(eatingId, patch)` — reconciles linked salt/water/sugar/potassium with edited values.
- `deleteEntryGroup` / `undoDeleteEntryGroup`, `deleteSingleGroupRecord` / `undoDeleteSingleRecord`, `getEntryGroup`.
- `addEatingRecord` / `deleteEatingRecord` / `undoDeleteEatingRecord` (plain path).
- `getSalt/Sugar/PotassiumTotalsByGroupIds`, `getDailyTotal(type, dayStartHour)`, `getTotalInLast24Hours(type)`.

All writes mirror to Neon Postgres via the sync queue (`enqueueInsideTx` + `schedulePush`).

---

## Validation, edge cases & business rules

- **Sodium is required** to save; the entered value is multiplied by the source factor and **rounded** before storage. Save button stays disabled (`!hasSodium`) until calculated sodium > 0.
- **Composable vs plain:** a composable group is written when there is ≥1 intake **or** `aiPopulated`; otherwise a plain eating record (note/grams only) is written.
- **Optional-tracker gating:** when sugar/potassium is disabled, its value is never read into intakes (even if the AI returns it) and its edit field is omitted; in `syncEatingGroup`, an **omitted** field (`undefined`) leaves any pre-existing linked record untouched, while `0` soft-deletes it.
- **Zero handling:** sugar/potassium/water values ≤ 0 are dropped (not persisted) on create; on edit, 0 soft-deletes the existing linked record.
- **Back-conversion on edit:** stored sodium-mg is divided by the source multiplier to repopulate the input field in the user's original units.
- **Group reconciliation:** `syncEatingGroup` keeps the first matching linked salt/water/sugar/potassium row and **soft-deletes duplicate** legacy rows so totals aren't double-counted. A `groupId` is generated if the eating record lacked one and any nutrient > 0.
- **Water content** intake carries the food note and uses `manual:food_water_content`; it feeds the Water/Liquids budget, not the Food card.
- **Timestamp** is captured at the moment of submission (`getCurrentDateTimeLocal` → `dateTimeLocalToTimestamp`).
- **Day-start logic:** daily totals count records since `dayStartHour` (default 2am) via `getDayStartTimestamp`; rolling totals use a strict last-24h window; both re-run every ~60s (`useNowTick`).
- **Two-stage progress:** below target → single-stage 0..limit (buffer hidden); above target with buffer > 0 → rescales to 0..(limit+buffer), primary fills target portion, extended segment grows, target marker shown; above limit+buffer → solid red 100%. Potassium never two-stages.
- **AI server rules:** input is PII-sanitized (`sanitizeForAI`) before the Claude call; whitelist enforced via `withAuth`; every request audit-logged (client `logAudit` + server `[AUDIT]` log); a second forced-tool turn runs if the model replied with prose; usage tracked per call.
- **Stale-fetch guard:** opening another record's edit form bumps `openTokenRef` so a slower `fetchEntryGroup` result for the previous record is discarded.
- **Number display** clamps the main consumed figure to the limit (`Math.min(daily, limit)`); the overflow appears only in the "extra" line.

---

## Sub-components / variants

- **`FoodSaltCard`** — card shell: header (Utensils, "Food"), three budget bar blocks (sodium always, sugar/potassium conditional), then `<FoodSection/>`.
- **`FoodSection`** — the working unit: food/AI input, manual detail fields, save, recent list, inline edit; owns all form state and the create/edit/delete handlers.
- **`ComposablePreview`** — editable, collapsible list of AI-suggested `PreviewRecord`s (eating/water/salt) with remove + Try Again/Confirm All actions and reasoning caption (sibling preview UI; not wired into FoodSection's current parse flow which auto-fills fields instead).
- **`Progress`** (ui) — two-stage bar: `value`, `extendedValue`, `targetMarkerPct`, `indicatorClassName`, `extendedIndicatorClassName`.
- **`RecentEntriesList` / `InlineEditFormShell`** — shared recent-list renderer + inline edit chrome (timestamp, note, Save/Cancel).
- **`parseIntakeWithAI`** (`ai-client.ts`) — client wrapper returning `ParsedIntake { water, valueMg, measurementType, sugarG, potassiumMg, reasoning }` or null.
- **`POST /api/ai/parse`** — server food/drink → nutrient estimate (tool `parse_food_result`).
- **`POST /api/ai/nutrient-analysis`** — server nutrient-bias analysis (tool `report_nutrient_analysis`; consumed by Analytics).
- **Hooks** — `useAddComposableEntry`, `useSyncEatingGroup`, `useDeleteEntryGroup`/`useDeleteSingleGroupRecord` (undo toasts), `useEatingRecords`/`useAddEating`/`useDeleteEating`, `useIntake`, `useSalt/Sugar/PotassiumTotalsByGroupIds`, `useOptionalTrackerEnabled`, `useAuthGate`.
