# Phase 13: Liquid Presets and AI Lookup - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Beverage preset system in Zustand with AI-powered caffeine/alcohol per-100ml lookup. Migrate all 3 existing Perplexity AI routes (parse, substance-enrich, medicine-search) to Anthropic Claude API using tool_use for structured output. Build new `/api/ai/substance-lookup` route on Claude. Seed built-in presets from existing `COFFEE_PRESETS` and `substanceConfig` defaults.

</domain>

<decisions>
## Implementation Decisions

### Preset Data Model
- **D-01:** Per-100ml is the primary unit for presets. Store `caffeinePer100ml` or `alcoholPer100ml` as the core value. Absolute amounts are calculated at log time from volume * per-100ml / 100.
- **D-02:** Presets live in a new top-level `liquidPresets` array in Zustand settings store, separate from the existing `substanceConfig` array. Clean separation between preset system and legacy config.
- **D-03:** Built-in presets (seeded from `COFFEE_PRESETS` + `substanceConfig.caffeine.types` + `substanceConfig.alcohol.types`) are fully editable and deletable by the user. They have an `isDefault: true` flag but no special protection.
- **D-04:** Each preset includes a `defaultVolumeMl` for one-tap quick logging (e.g., espresso=30ml, beer=330ml). User can override volume before confirming a log entry.
- **D-05:** Preset fields: `id`, `name`, `type` (caffeine | alcohol), `substancePer100ml` (mg for caffeine, standard drinks equivalent for alcohol), `defaultVolumeMl`, `isDefault`, `source` (manual | ai), `aiConfidence?` (optional, from AI lookup).

### AI Migration
- **D-06:** Migrate ALL 3 existing Perplexity routes to Anthropic Claude API: `/api/ai/parse`, `/api/ai/substance-enrich`, `/api/ai/medicine-search`. Plus build new `/api/ai/substance-lookup` route. One AI provider after this phase.
- **D-07:** Use Claude's `tool_use` (structured output) for all AI responses. Define Zod schemas as Claude tool input schemas. No JSON text parsing — tool_use returns typed, validated responses.
- **D-08:** Remove Perplexity dependency entirely after migration. `PERPLEXITY_API_KEY` env var replaced with `ANTHROPIC_API_KEY`.

### AI Lookup UX Flow
- **D-09:** AI lookup result appears inline in the coffee/alcohol tab — fields populate with per-100ml value, volume, and name. User edits inline before saving.
- **D-10:** AI result requires explicit confirmation before saving as a preset. User must tap "Save as Preset" to persist. Can edit per-100ml value and default volume before saving.
- **D-11:** AI FAB button in coffee/alcohol tabs triggers a text input for beverage name, calls `/api/ai/substance-lookup`, and populates the inline fields with the result.

### Claude's Discretion
- Exact Claude model selection per route (claude-sonnet-4-5-20250514 vs claude-haiku-4-5-20251001 — cost/quality tradeoff per route)
- Tool schema definitions for each route
- Rate limiting configuration for Claude API
- Whether to keep the retry-once pattern or use Claude's native retry
- Preset ID generation strategy
- How to handle the transition period (env var detection, fallback behavior)
- Zustand persist migration version bump

### Folded Todos
- **Migrate AI endpoints from Perplexity to Anthropic Claude** — originally a standalone todo, folded into this phase's scope. Affects all 3 existing AI routes plus the new substance-lookup route. Eliminates Perplexity as a dependency.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI Routes (to be migrated)
- `src/app/api/ai/parse/route.ts` — Food parsing route, Perplexity sonar-pro, Zod schemas for water/salt response
- `src/app/api/ai/substance-enrich/route.ts` — Substance enrichment route, caffeine/alcohol response schemas, retry logic
- `src/app/api/ai/medicine-search/route.ts` — Medicine search route, sonar-reasoning-pro, 15-field response schema
- `src/app/api/ai/status/route.ts` — Health check route (needs API key reference update)

### Preset System (existing patterns)
- `src/lib/constants.ts` — `COFFEE_PRESETS` constant (value/label/waterMl), `CoffeePreset` interface
- `src/stores/settings-store.ts` — Zustand store with `coffeeDefaultType`, `substanceConfig` with caffeine/alcohol types, persist config with version 1
- `src/components/intake-card.tsx` — Uses `COFFEE_PRESETS.find()` for volume seeding, coffee type selection
- `src/components/customization-panel.tsx` — Renders preset buttons for default coffee selection

### Substance Layer
- `src/lib/substance-service.ts` — `addSubstanceRecord()` with atomic intake linking, `AddSubstanceInput` type
- `src/lib/substance-enrich.ts` — Background enrichment runner (batched, best-effort)
- `src/hooks/use-substance-queries.ts` — useLiveQuery + useCallback mutation hooks

### Milestone Research
- `.planning/research/STACK.md` — Zero new deps needed, Zustand for presets recommendation
- `.planning/research/FEATURES.md` — Beverage presets as table stakes, AI lookup as differentiator
- `.planning/research/PITFALLS.md` — Pitfall #5: AI caffeine/alcohol estimates ~35% error rate, must be editable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `withAuth()` middleware in AI routes — reuse for new substance-lookup route
- `sanitizeForAI()` — PII stripping before AI calls, reuse for Claude
- `showUndoToast()` — 5-second undo pattern for preset deletion
- Zod validation schemas in existing routes — refactor for Claude tool_use schemas
- `substanceConfig.caffeine.types` array — seed data for built-in caffeine presets
- `substanceConfig.alcohol.types` array — seed data for built-in alcohol presets

### Established Patterns
- AI routes: `withAuth()` → Zod validate → `sanitizeForAI()` → API call → Zod validate response → retry once on failure
- Zustand persist: `createJSONStorage()` with localStorage, version number for migrations
- Settings store: getter + setter pattern per field, all exposed via `useSettingsStore`

### Integration Points
- New `liquidPresets` array in settings-store.ts alongside existing state
- New `/api/ai/substance-lookup` route following existing route patterns
- Existing routes refactored: Perplexity SDK → Anthropic SDK with tool_use
- `PERPLEXITY_API_KEY` → `ANTHROPIC_API_KEY` in env vars and `.env.example`
- Background enrichment runner (`substance-enrich.ts`) needs to call Claude instead of Perplexity

</code_context>

<specifics>
## Specific Ideas

- User said "hit an AI fab to figure out the amount of caffeine for that kind of coffee by the 100ml so we can do calculations with variable millilitres"
- Same approach for alcohol — per-100ml enables flexible volume entry
- Coffee settings that exist now should become defaults in the liquid preset system
- The food calculator is being removed (Phase 16), so any food-calc-related code in the AI routes can be cleaned up

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
None — the only matched todo was folded in.

### Other
None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-liquid-presets-and-ai-lookup*
*Context gathered: 2026-03-23*
