# Phase 19: AI Substance Lookup Enhancement - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `waterContentPercent` to the `/api/ai/substance-lookup` API response so AI-sourced beverage presets produce accurate hydration records instead of defaulting to 100% water content. This is a gap closure from the v1.1 milestone audit (LIQD-03/LIQD-04 data quality).

</domain>

<decisions>
## Implementation Decisions

### API Response Shape
- **D-01:** `waterContentPercent` is a **required** field in the API response. Added to both the Zod schema (`z.number().min(0).max(100)`) and the Claude tool definition (`input_schema`). No optional/fallback at the API level — Claude must always return it.

### Prompt Guidance
- **D-02:** System prompt includes **reference point examples** for water content estimation: black coffee ~99, beer ~93, wine ~87, spirits ~60. This anchors Claude's estimates to match existing default presets without over-constraining.

### Client Handling
- **D-03:** PresetTab already consumes `data.waterContentPercent ?? 100` (line 139). No client-side changes needed — the fallback remains as a safety net but should never trigger now that the API returns the field.

### Claude's Discretion
- Exact wording of the system prompt addition
- Whether to add waterContentPercent guidance to both caffeine and alcohol system prompts or use a shared sentence
- Tool definition description text for the waterContentPercent property

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### API Route (primary target)
- `src/app/api/ai/substance-lookup/route.ts` — The route to modify. Contains `SubstanceLookupResponseSchema` (Zod), `SUBSTANCE_LOOKUP_TOOL` (Claude tool definition), and system prompts for caffeine/alcohol.

### Client Consumer (verify no changes needed)
- `src/components/liquids/preset-tab.tsx` — Lines 139, 162-164. Already reads `data.waterContentPercent ?? 100` and calculates water amount as `volumeMl * waterContentPercent / 100`.

### Data Model (reference values)
- `src/lib/constants.ts` — `DEFAULT_LIQUID_PRESETS` with established waterContentPercent values (espresso=98, coffee=99, beer=93, wine=87, spirit=60). Use as reference points for prompt examples.

### Gap Source
- `.planning/v1.1-MILESTONE-AUDIT.md` — Gap LIQD-03/LIQD-04: "AI substance-lookup API response missing waterContentPercent field"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getClaudeClient()` and `CLAUDE_MODELS` from `../_shared/claude-client` — already used in the route
- `withAuth()` middleware, `sanitizeForAI()` — already wired up
- Rate limiting already in place (15 req/min)

### Established Patterns
- Claude `tool_use` with `tool_choice: { type: "tool" }` forces structured output — makes required fields reliable
- Zod `.safeParse()` validates AI response before returning to client
- System prompt varies by substance type (caffeine vs alcohol)

### Integration Points
- Single file change: `src/app/api/ai/substance-lookup/route.ts`
- No client changes needed — PresetTab already handles the field
- No schema/migration changes — `LiquidPreset` already has `waterContentPercent`

</code_context>

<specifics>
## Specific Ideas

- Prompt reference points should match existing default presets: coffee ~99, beer ~93, wine ~87, spirits ~60
- The field anchors hydration tracking accuracy — e.g., beer logged via AI currently records 330ml water instead of the correct ~307ml

</specifics>

<deferred>
## Deferred Ideas

### Stale Todo
- "Migrate AI endpoints from Perplexity to Anthropic Claude" — already completed in Phase 13, still sitting in pending todos. Should be cleaned up.

### Other
None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-ai-substance-lookup-enhancement*
*Context gathered: 2026-03-27*
