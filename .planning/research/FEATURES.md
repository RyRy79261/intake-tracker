# Feature Research

**Domain:** Health tracking PWA — composable data entries, unified input cards, AI substance lookup, text metrics
**Researched:** 2026-03-23
**Confidence:** MEDIUM (patterns synthesized from competitor analysis and existing codebase; no single app does all four features together)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Unified Liquids card with tabs (water/coffee/alcohol) | Current water card already has liquid type selector with water/juice/coffee/food tabs. Users expect this pattern to extend naturally to alcohol. Cronometer, WaterMinder, FoodNoms all consolidate liquid tracking. | MEDIUM | Refactor existing `IntakeCard` liquid type selector. Water tab preserves current +/- increment UX. Coffee/alcohol tabs need volume + substance content fields. Biggest risk: water tab must remain zero-friction (tap-tap-done). |
| Beverage presets with one-tap logging | FoodNoms, Caffeine++, WaterMinder all offer saved presets with single-tap logging. Coffee presets already exist (`COFFEE_PRESETS` in constants.ts). Users will expect the same for alcohol. | LOW | Extend existing `CoffeePreset` pattern to a generic `BeveragePreset` with caffeine/alcohol content fields. Store in Zustand (settings) or Dexie (if user-created). |
| AI substance lookup (caffeine mg, alcohol per serving) | Existing `/api/ai/substance-enrich` route already does this via Perplexity. Users expect AI to fill in what they don't know — "how much caffeine in a cortado?" | LOW | Backend already built. Need FAB or inline trigger in coffee/alcohol tabs that calls existing API and populates fields. Key UX: show AI result, let user confirm/edit before saving. |
| Cascading delete for linked records | When deleting a food entry that auto-created water + salt records, all linked records must go. Standard behavior in any app with linked data — users expect undo to undo everything. | MEDIUM | Requires a `compositeEntryId` field linking records across tables. Dexie transaction for atomic delete. Must handle partial deletion (user wants to delete just the water part of a linked set). |
| BP heart rate always visible | Current BP card hides heart rate behind "more options" expand. Users who track HR expect it front and center — it's the most frequently used optional field. | LOW | Remove expand/collapse, show HR input inline. Small UI change, no data model impact. |
| Manual salt input retained in food card | Salt tablets, seasoning additions — user needs direct salt entry even when food card handles AI-parsed salt. Every health app with salt tracking keeps manual override. | LOW | Keep current salt increment UX as a section within unified Food+Salt card. |
| Text-based daily metrics (today's limits, totals) | Apple Health Summary, Cronometer daily summary, FoodNoms daily totals — all show text-based metrics prominently. Current graphs on intake page are reportedly unused by the user. | MEDIUM | Replace intake page graphs with computed text: water budget remaining, caffeine total, alcohol total, weekly summary (Mon-start). Needs aggregation queries across intake + substance records. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Composable entries — single input creates linked records | "I had soup" auto-creates eating record + water record + salt record atomically. No consumer health app does this with editable linked records across domains. Cronometer auto-includes water from food via NCCDB nutrient data, but doesn't create separate editable records — it's just a rolled-up nutrient total. | HIGH | Core architectural feature. Needs: (1) composite entry wrapper with parent ID, (2) AI parse that returns multi-domain data (existing `/api/ai/parse` already returns water + salt), (3) Dexie transaction to write N records atomically, (4) UI to show/edit linked records as a group. This is the riskiest feature — get the data model right first. |
| Saved beverage presets with AI-populated content | User types "cortado" once, AI fills caffeine-per-100ml, user saves as reusable preset. Next time: one tap. FoodNoms has favorites but not AI-populated substance content. Caffeine++ has 200+ drinks but no AI lookup. Combining AI lookup with saved presets is novel. | MEDIUM | New `beveragePresets` table in Dexie or array in Zustand settings. Fields: name, type (caffeine/alcohol), volumeMl, substanceAmountPer100ml, source (manual/ai). AI populates on first entry, user confirms before saving. |
| Volume-based substance calculation | User picks "cortado" preset (63mg caffeine per 100ml), enters 60ml serving. App calculates 37.8mg caffeine automatically. Better than flat "one coffee = 95mg" defaults currently in `DEFAULT_CAFFEINE_MG`. | LOW | Pure math: `(volume / 100) * contentPer100ml`. Display calculated amount in UI before confirm. Depends on presets having per-100ml data from AI lookup. |
| Weekly summary with Monday start | Configurable week start (already have `dayStartHour` in settings). Weekly caffeine/alcohol totals, daily averages, limit adherence rate. Apple Health does monthly, Cronometer does weekly but Sunday-start. Monday-start with day-start-hour awareness is unusual and matches European convention. | MEDIUM | Aggregation query: group by logical day (respecting dayStartHour), then by ISO week (Mon-start). Display as text block with key numbers, not a chart. |
| Food AI parsing auto-creates linked liquid + salt entries | "Chicken soup with bread" -> eating record (300g) + water record (250ml from soup broth) + salt record (800mg from soup + bread). Existing `/api/ai/parse` already returns `{ water, salt, reasoning }`. The composable entry system bridges AI output to multi-record creation. | MEDIUM | Extend eating card to call AI parse, then use composable entry system to create linked records. Show preview of all records before confirming. User can edit/remove individual linked entries before saving. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full nutritional database (USDA/NCCDB) | "I want exact caffeine in a Starbucks Venti Latte" | Massive data dependency (USDA has 300K+ foods). Offline-first app cannot fetch on demand. Maintenance burden for a single-user app. Cronometer's entire value prop is their database — competing there is a losing game. | AI lookup via Perplexity is good enough. Cache results as reusable beverage presets. User corrects if AI is wrong. |
| Barcode scanning for beverages | "Scan my coffee bag to get caffeine content" | Requires camera permissions, barcode database subscription (Open Food Facts has significant gaps for non-US products), adds complexity for marginal benefit in a single-user app. SA/German products have poor barcode database coverage. | Manual text entry with AI assist. User types "Lavazza Qualita Rossa" and AI estimates caffeine per 100ml. |
| Real-time caffeine metabolism tracking | "Show my current caffeine level decaying over time" | Caffeine half-life varies by individual (3-7 hours), liver enzyme genetics (CYP1A2), medication interactions (user takes multiple prescriptions). Any estimate is unreliable and creates false precision that could influence medical decisions. | Show total caffeine today + rolling 24h. Let user's doctor interpret clinical significance. |
| Automatic food photo recognition | "Take a photo of my meal and log it" | Unreliable accuracy for estimating water/salt content specifically (even if food identification works). Requires cloud processing (breaks offline-first). Privacy concerns with food photos on external servers. | Text description + AI parsing via Perplexity. Already built and working via `/api/ai/parse`. |
| Graph/chart improvements on intake page | "Make the graphs prettier or more interactive" | User explicitly requested removing graphs from intake page. Graph investment should go to the analytics/history page in a separate milestone. | Text metrics on intake page. Charts stay on `/history`. |
| Undo/redo stack for all operations | "I accidentally deleted something, give me full undo" | Complex state management, memory overhead, conflicts with IndexedDB's async transaction nature. Overkill for the frequency of accidental deletes. | Soft-delete with confirmation toast ("Undo" button visible for 5 seconds). Already have `deletedAt` field on all records supporting this pattern. |
| Automatic liquid type detection from text | "App should know 'latte' is coffee without me selecting the coffee tab" | Requires NLP parsing on every text input. Edge cases are abundant ("coffee cake" is food not coffee, "Irish coffee" is both caffeine and alcohol). Creates surprising behavior when the app guesses wrong. | Explicit tab selection (water/coffee/alcohol) followed by text input within that context. AI substance lookup happens after user explicitly requests it. |

## Feature Dependencies

```
[Composable Entry Data Model]
    |
    +--requires--> [compositeEntryId field on all record types]
    |                  |
    |                  +--requires--> [Dexie schema v15 migration]
    |
    +--enables--> [Cascading Delete]
    |
    +--enables--> [Food AI auto-creates linked entries]
    |
    +--enables--> [Unified Food+Salt card]

[Beverage Presets]
    |
    +--requires--> [Preset data model (Dexie table or Zustand)]
    |
    +--enhanced-by--> [AI Substance Lookup (existing API)]
    |
    +--enables--> [Volume-based substance calculation]
    |
    +--enables--> [Unified Liquids card coffee/alcohol tabs]

[Unified Liquids Card]
    |
    +--requires--> [Beverage Presets]
    |
    +--requires--> [SubstanceRecord creation on beverage log]
    |
    +--preserves--> [Water tab increment UX (existing)]

[Unified Food+Salt Card]
    |
    +--requires--> [Composable Entry Data Model]
    |
    +--requires--> [AI Parse (existing) returning water + salt]
    |
    +--preserves--> [Manual salt input (existing)]

[Text Metrics]
    |
    +--requires--> [Aggregation queries across intake + substance records]
    |
    +--independent-of--> [Composable entries — can be built in parallel]

[BP Heart Rate Always Visible]
    |
    +--independent-of--> [Everything else — pure UI change]

[Food Calculator Removal]
    |
    +--independent-of--> [Everything else — pure deletion]

[Coffee Settings Migration]
    |
    +--depends-on--> [Unified Liquids Card being stable]
    |
    +--requires--> [Beverage Presets replacing COFFEE_PRESETS]
```

### Dependency Notes

- **Composable Entry Data Model is the foundation:** Unified Food+Salt card and cascading delete both depend on it. Must be the first thing built. The data model (compositeEntryId, schema migration) is separable from any UI work.
- **Beverage Presets enable Unified Liquids card:** Without presets, coffee/alcohol tabs have nothing to populate beyond one-off manual entry. Presets make the tabs useful for repeat logging.
- **Text Metrics are independent:** Can be built in parallel with card unification work. Good candidate for an early phase since it delivers visible value with no data model changes.
- **BP Heart Rate is trivial and independent:** Do it in the first phase for quick momentum.
- **Food AI linked entries depend on BOTH composable model AND existing AI parse:** The `/api/ai/parse` route already returns `{ water, salt, reasoning }` — the work is in creating linked records from the response and displaying them as a composable group.
- **Coffee settings migration should be last:** It's cleanup work that only makes sense after the unified Liquids card is stable and presets have replaced the hardcoded `COFFEE_PRESETS` constant.

## MVP Definition

### Launch With (v1.1 core)

Minimum viable set that delivers the milestone's core value: unified cards with composable entries.

- [ ] Composable entry data model (compositeEntryId, Dexie v15) — foundation for everything
- [ ] Unified Liquids card with water/coffee/alcohol tabs — biggest visible change, preserves water +/- UX
- [ ] Beverage presets with AI-populated caffeine/alcohol content — enables meaningful coffee/alcohol tracking
- [ ] Unified Food+Salt card with AI-linked entries — food input creates water + salt records
- [ ] Cascading delete for composable entries — data integrity for linked records
- [ ] Text metrics replacing intake page graphs — daily limits, substance totals, weekly summary
- [ ] BP heart rate always visible — quick UI win
- [ ] Food calculator removal — explicit requirement, reduces dead code

### Add After Validation (v1.1.x)

Features to add once core composable system is working and validated on real data.

- [ ] Volume-based substance calculation from presets — refine after presets are proven useful in daily use
- [ ] Weekly Monday-start summary — needs a week of real composable data to validate the display format
- [ ] Smart preset suggestions (recent/frequent presets surfaced first) — needs usage data to drive ordering
- [ ] Coffee settings migration to liquid tab defaults — cleanup after unified card is stable

### Future Consideration (v2+)

Features to defer until composable entries are battle-tested.

- [ ] Cross-domain correlation text insights ("You drink more water on high-salt days") — needs v1.1 data model + analytics work
- [ ] Natural language multi-entry ("I had a latte and a sandwich") parsing into composable entries — complex NLP, Perplexity can approximate but UX for confirming multiple composed groups is hard
- [ ] Preset sharing/import — only matters with multi-user/cloud sync

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Composable entry data model | HIGH | HIGH | P1 |
| Unified Liquids card (tabs) | HIGH | MEDIUM | P1 |
| Beverage presets + AI lookup | HIGH | MEDIUM | P1 |
| Unified Food+Salt card | HIGH | MEDIUM | P1 |
| Cascading delete | HIGH | MEDIUM | P1 |
| Text metrics (daily/weekly) | MEDIUM | MEDIUM | P1 |
| BP heart rate visible | MEDIUM | LOW | P1 |
| Food calculator removal | LOW | LOW | P1 |
| Volume-based calculation | MEDIUM | LOW | P2 |
| Weekly Monday-start summary | MEDIUM | MEDIUM | P2 |
| Coffee settings migration | LOW | LOW | P2 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Cronometer | FoodNoms | MyFitnessPal | WaterMinder | Caffeine++ | Our Approach |
|---------|-----------|----------|--------------|-------------|------------|-------------|
| Water tracking | Dedicated feature; auto-includes food water content from NCCDB nutrient data (rolled into total, not separate records) | Part of nutrition totals in daily summary | Basic cup counter with configurable units | Core feature with custom cup sizes and presets | N/A | Unified Liquids card; water tab preserves existing increment +/- UX |
| Caffeine tracking | Via food database nutrients (no separate caffeine view) | Premium tier; reads caffeine from food entries | Not built-in | Caffeine from drink type settings | 200+ drink database with favorites and size presets | AI lookup + saved beverage presets; no massive database needed |
| Alcohol tracking | Via food database (standard drinks not explicitly calculated) | Premium tier | Not built-in | N/A | N/A | AI lookup + presets; standard drinks calculation from volume + ABV |
| Linked records from food | Auto-adds water from NCCDB data but NOT as separate editable records | No linked records | No linked records | No linked records | No linked records | Composable entries: food creates editable linked water + salt records with cascading delete |
| Saved presets/favorites | Recent foods, custom food entries | AI-powered favorites with preset portions, one-tap logging, customizable icons | Frequent/recent foods | Custom cup sizes per drink type | Favorite drinks with multiple size options | Beverage presets with AI-populated caffeine/alcohol per 100ml |
| Daily text summary | Nutrition report with targets and remaining budgets | Daily summary with nutrient totals for tracked nutrients | Dashboard with macro rings | Daily water goal text with percentage | Daily caffeine total + half-life timeline | Text metrics: water budget, caffeine total, alcohol total, weekly summary |
| Salt/sodium tracking | Full NCCDB sodium data per food entry | Via nutrition database nutrients | Via food database | No | No | AI-estimated from food description + manual salt entry retained |

## Sources

- [Cronometer Water Tracking](https://support.cronometer.com/hc/en-us/articles/18020279636628-Water-Tracking) — official docs
- [Cronometer Auto Water from Food](https://forums.cronometer.com/discussion/2737/automatic-water-content-tracking) — community forum, MEDIUM confidence
- [FoodNoms 2 Feature Overview](https://foodnoms.com/news/foodnoms-2) — official blog, HIGH confidence
- [FoodNoms MacStories Review](https://www.macstories.net/reviews/foodnoms-a-privacy-focused-food-tracker-with-innovative-new-ways-to-log-meals/) — third-party review, MEDIUM confidence
- [WaterMinder Caffeine Tracking](https://9to5mac.com/2021/04/07/waterminder-app-adds-support-for-tracking-caffeine-intake-with-apple-health-integration/) — third-party coverage, MEDIUM confidence
- [Caffeine Informer Database](https://www.caffeineinformer.com/) — primary reference for caffeine content data
- [HiCoffee App](https://apps.apple.com/us/app/hicoffee-caffeine-tracker/id1507361706) — App Store listing
- [Caffeine++ App](https://apps.apple.com/gb/app/caffeine/id1594448346) — App Store listing
- [MyFitnessPal Community: Tea & Coffee as Water](https://community.myfitnesspal.com/en/discussion/10745715/tea-coffee-logged-as-water) — competitor pain point, MEDIUM confidence
- Existing codebase: `intake-card.tsx`, `eating-card.tsx`, `db.ts`, `constants.ts`, `/api/ai/substance-enrich/route.ts`, `/api/ai/parse/route.ts` — HIGH confidence, primary source

---
*Feature research for: Health tracking PWA — composable entries, unified cards, AI substance lookup, text metrics*
*Researched: 2026-03-23*
