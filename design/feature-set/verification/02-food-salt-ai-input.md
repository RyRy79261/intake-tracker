# Verification — 02-food-salt-ai-input

**Verdict:** minor-gaps · checked 78 claims, verified 73.

The document is largely accurate and faithful to the implementation. There is one
**high-severity factual error** (the AI model is named "Opus" but the code uses Sonnet),
two **medium** issues (recent list shows 3 rows not 5; "edit (pencil)" affordance is a
row-click, no pencil icon), and several low-severity wording nits. Everything else —
multipliers, source tags, enums, settings defaults/ranges, two-stage progress rules,
validation caps, route status codes — checks out digit-for-digit.

## Inaccuracies

| severity | doc claim | code reality | file:line |
| --- | --- | --- | --- |
| high | AI parse route "Model: `CLAUDE_MODELS.quality` (Opus)"; nutrient-analysis "Model: Opus" (lines 158, 167) | `CLAUDE_MODELS.quality` is **`claude-sonnet-4-6` (Sonnet)**, not Opus. Opus is `CLAUDE_MODELS.premium` (`claude-opus-4-6`). The routes do reference `.quality`, so the enum key is right but the parenthetical model name is wrong. | `src/app/api/ai/_shared/claude-client.ts:25-28`; routes at `src/app/api/ai/parse/route.ts:174` & `src/app/api/ai/nutrient-analysis/route.ts:220` |
| medium | "Recent entries list — last **5** eating records" (line 34); state "Recent list … Populated: rows" (line 100) | `FoodSection` calls `useEatingRecords(5)` (fetches 5) but renders via `RecentEntriesList` **without** passing `maxEntries`, so it slices to the default `maxEntries = 3`. Only **3 rows are displayed**. | `src/components/food-salt/food-section.tsx:101,555-561`; `src/components/recent-entries-list.tsx:105,112` |
| medium | "Tap **edit (pencil)** on a recent row" (line 64); "Per-row **edit** + delete" with implied edit control (line 34); "Tap the pencil" framing throughout | There is **no pencil/edit icon**. The entire row is a clickable `role="button"` (via `onEdit`); the only per-row icon button is the `Trash2` delete. Edit is triggered by clicking/Enter/Space on the row itself. | `src/components/recent-entries-list.tsx:130-171` |
| low | "**Recent list — Empty:** RecentEntriesList renders its own empty state when no records." (line 103) | `RecentEntriesList` returns **`null`** when `records` is empty/undefined — it renders nothing, not an empty state. | `src/components/recent-entries-list.tsx:110` |
| low | "Delete with undo — soft-delete with a toast offering Undo (~5s window)." (line 36) implies a single toast | Two toasts fire: `useUndoDeleteMutation.onSuccess` shows the 5s **Undo** toast ("Record deleted"), and `useDeleteWithToast` separately shows a non-undo "Entry deleted / Eating record removed" toast. The undo window claim itself is correct (`duration: 5000`). | `src/hooks/use-undo-delete-mutation.ts:21-23`; `src/components/medications/undo-toast.tsx:7,26`; `src/hooks/use-delete-with-toast.ts:26-29` |
| low | groupSource "broader set documented in db.ts also includes `ai_substance_lookup`, `manual`" (line 133) | The db.ts comment lists `"ai_food_parse" \| "ai_substance_lookup" \| "manual"` — it does **not** include `manual_food_entry`, even though the food form actually writes `manual_food_entry`. The doc's framing is fine, but note the comment is out of date vs. the value actually written. | `src/lib/db.ts:21,109`; `src/components/food-salt/food-section.tsx:336` |

## Omissions

| severity | missing behavior/state/enum | file:line |
| --- | --- | --- |
| low | Inline-edit save shows toast **"Entry updated"** on success and "Could not update the entry" (destructive) on failure; an invalid datetime shows "Invalid date/time". The doc covers create-toast copy but not edit-toast copy. | `src/hooks/use-edit-record.ts:97,111,115` |
| low | The blocked-save toast copy is title **"Sodium required"** / description **"Enter a sodium amount before saving."** (doc says "Blocked (with toast) if no sodium" without the copy). | `src/components/food-salt/food-section.tsx:278-281` |
| low | Success-toast **title is "Logged"** (the doc quotes only the descriptions "Meal with details recorded" / "Eating event recorded"). | `src/components/food-salt/food-section.tsx:348-351` |
| low | Recent rows are keyboard-accessible: each row is `role="button"`, `tabIndex={0}`, and opens edit on Enter/Space (only when the event target is the row itself). | `src/components/recent-entries-list.tsx:138-150` |
| low | `addComposableEntry` also supports a `substance` (singular) and `substances` (plural) input path and auto-creates a linked `water` intake from a substance's `volumeMl`; the food form never uses these, but they share the same group transaction. (Doc mentions SubstanceRecord is "touched … not by the food form" but omits the volume→water auto-intake behavior.) | `src/lib/composable-entry-service.ts:108-174,131-148` |
| low | `getRecentRecords`/recent-row delete uses a per-row spinner gated by `deletingId`; the delete icon is `Trash2`, hover turns red. (Doc says "spinner / disabled while delete in flight" — accurate — but the Trash2/red-hover affordance is unstated.) | `src/components/recent-entries-list.tsx:155-171` |

## Spot-confirmed

- **Sodium multipliers** `sodium 1.0 / salt 0.39 / msg 0.12`, select options Sodium/Salt/MSG, conversion hint `= <n>mg sodium` shown only when source ≠ sodium and calc > 0 — confirmed. `src/components/food-salt/food-section.tsx:54-58,464-480`
- **Linked source tags** `manual:sodium|salt|msg`, `manual:sugar` (SUGAR_SOURCE), `manual:potassium` (POTASSIUM_SOURCE), `manual:food_water_content` (FOOD_WATER_SOURCE), fallback `composable` — confirmed. `src/lib/composable-entry-service.ts:97,322-324`; `food-section.tsx:299-322`
- **groupSource** `manual_food_entry` vs `ai_food_parse` (set from `aiPopulated`) — confirmed. `src/components/food-salt/food-section.tsx:336`
- **Optional trackers**: sugar (label "Sugar", unit "g", icon Candy, pink) default **ON**; potassium (label "Potassium", unit "mg", icon Banana, purple) default **OFF** — confirmed. `src/lib/optional-trackers.ts:35-61`
- **Settings defaults/ranges**: saltLimit 1500 (100-10000), sugarLimit 30 (5-500), potassiumLimit 3500 (100-20000), saltExtendedBuffer 500 (0-10000), sugarExtendedBuffer 10 (0-500), saltIncrement 250 (10-1000), dayStartHour 2 (0-23); potassium has no buffer — all confirmed. `src/stores/settings-store.ts:182-247,352-382`
- **Two-stage progress**: target≤0 ⇒ all-zero & single-stage; below target single-stage 0..target; above target with buffer>0 ⇒ rescale to 0..target+buffer, marker shown; over extended ⇒ forced 100% solid red, extended/marker hidden; potassium uses a separate `Math.min(...,100)` soft bar — confirmed. `src/lib/progress-utils.ts:34-97`; `src/components/food-salt-card.tsx:41-44,105-117,192-197`
- **formatAmount**: `ml`≥1000 ⇒ `X.YL` (one decimal), else `${amount}${unit}` — confirmed. `src/lib/utils.ts:10-15`
- **AI parse route**: temperature 0, max_tokens 4096, tools `[WEB_SEARCH_TOOL, parse_food_result]`, rate limit 20, input 1-500; response caps water 0-10000 / sodium 0-20000 / sugar 0-1000 / potassium 0-20000 / reasoning ≤1000; salt→sodium `salt_g*1000/2.5`, pinch≈155mg; response `{ water, salt(=sodium mg), measurement_type:"sodium", sugar, potassium, reasoning? }`; 429/400/422(`fallbackToManual:true`)/502 — all confirmed. `src/app/api/ai/parse/route.ts:19-29,118,135-140,162-180,232-263`
- **Forced second tool turn** when model replies with prose, plus per-call usage tracking and `[AUDIT]` log — confirmed. `src/app/api/ai/parse/route.ts:150,181-230`
- **Nutrient-analysis route**: temperature 0.2, max_tokens 4096, rate limit 10; windowDays 1-90, focus ≤200, foods 1-500 (description 1-300, grams 0-10000), conditions ≤20, medications ≤40 (phaseType maintenance|titration); finding status `high|low|balanced`; summary ≤4000, findings ≤20 (detail ≤2000, exampleFoods ≤12), caveats ≤8 — confirmed. `src/app/api/ai/nutrient-analysis/route.ts:12-50,122,222`
- **ParsedIntake** shape `{ water, valueMg, measurementType, sugarG, potassiumMg, reasoning? }`, returns null when auth prompt dismissed (apiFetch falsy) — confirmed. `src/lib/ai-client.ts:4-11,39-59`
- **ComposablePreview** is a sibling UI **not wired into FoodSection** (only referenced by its own DOM test); PreviewRecord type union `eating|water|salt`, X removal stops propagation, Collapsible expand, Confirm All disabled when empty/confirming with "Saving..." spinner, reasoning line-clamp-2 — confirmed. `src/components/food-salt/composable-preview.tsx:14-21,75-78,127-284`
- **syncEatingGroup** reconciles first match + soft-deletes duplicate legacy rows; generates groupId when none and any nutrient>0; `undefined` field leaves linked record untouched, `0` soft-deletes — confirmed. `src/lib/composable-entry-service.ts:341-573`
- **Stale-fetch guard** via `openTokenRef` discards slower `fetchEntryGroup` of a previous record — confirmed. `src/components/food-salt/food-section.tsx:128,141,150`
- **groupId Dexie index added v15** — confirmed. `src/lib/db.ts:506-508,721-722`
- **Auth gate**: signed-out hides Sparkles, aria-label "Describe what you ate"; signed-in adds `pr-10` + aria-label "Describe food for AI nutritional parsing"; Enter triggers parse only when `showAi`; `useAuthGate` returns `!ready || authenticated` — confirmed. `src/components/auth-guard.tsx:65-68`; `src/components/food-salt/food-section.tsx:399-423`
- **Composable-vs-plain rule**: composable group written when `intakes.length>0 || aiPopulated`, else plain eating record — confirmed. `src/components/food-salt/food-section.tsx:328-346`
- **Card header** uses `CARD_THEMES.eating` (orange, Utensils icon) with the literal header text "Food" (note: theme `label` is "Eating", but the rendered span text is "Food") — confirmed. `src/components/food-salt-card.tsx:46-65`; `src/lib/card-themes.ts:164-184`

## Low-confidence / could-not-verify

- **"24h rolling … both re-run every ~60s (`useNowTick`)"** — `useNowTick` default interval is 60_000ms and the intake hooks depend on the tick, so this is accurate for the rolling/daily totals. The recent-eating list (`useEatingRecords`) uses `useLiveQuery` without a tick, so it is reactive to DB writes but not on a 60s timer — the doc's phrasing about "both re-run" refers to budget totals, which is correct; no discrepancy found. `src/hooks/use-now-tick.ts:35-37`; `src/hooks/use-intake-queries.ts:35-49`
- **`saltIncrement` "used by the Salt card, not this form"** — confirmed `saltIncrement` is never read in `food-salt-card.tsx`/`food-section.tsx`; could not exhaustively confirm the Salt-card consumer in scope, but the food unit does not use it, which is the load-bearing claim. (No issue.)
