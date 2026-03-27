# Phase 19: AI Substance Lookup Enhancement - Research

**Researched:** 2026-03-27
**Domain:** Anthropic Claude tool_use API, Zod schema validation, Next.js API routes
**Confidence:** HIGH

## Summary

This phase is a surgical single-file fix to close a gap identified in the v1.1 milestone audit: the `/api/ai/substance-lookup` API route does not return `waterContentPercent` in its response, causing all AI-sourced beverage presets to default to 100% water content. Beer looked up via AI records 330ml water instead of the correct ~307ml (93% of 330ml).

The fix requires adding `waterContentPercent` to three places within `src/app/api/ai/substance-lookup/route.ts`: (1) the Zod response validation schema, (2) the Claude tool definition's `input_schema`, and (3) reference examples in the system prompts. The client (`preset-tab.tsx` line 139) already reads `data.waterContentPercent ?? 100`, so no downstream changes are needed -- the fallback simply stops triggering once the API returns the field.

**Primary recommendation:** Add `waterContentPercent` as a required field to both the Zod schema and tool definition, with reference-point examples in the system prompt anchored to the default presets (coffee ~99, beer ~93, wine ~87, spirits ~60).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `waterContentPercent` is a **required** field in the API response. Added to both the Zod schema (`z.number().min(0).max(100)`) and the Claude tool definition (`input_schema`). No optional/fallback at the API level -- Claude must always return it.
- **D-02:** System prompt includes **reference point examples** for water content estimation: black coffee ~99, beer ~93, wine ~87, spirits ~60. This anchors Claude's estimates to match existing default presets without over-constraining.
- **D-03:** PresetTab already consumes `data.waterContentPercent ?? 100` (line 139). No client-side changes needed -- the fallback remains as a safety net but should never trigger now that the API returns the field.

### Claude's Discretion
- Exact wording of the system prompt addition
- Whether to add waterContentPercent guidance to both caffeine and alcohol system prompts or use a shared sentence
- Tool definition description text for the waterContentPercent property

### Deferred Ideas (OUT OF SCOPE)
- "Migrate AI endpoints from Perplexity to Anthropic Claude" -- already completed in Phase 13, stale todo to clean up
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIQD-03 (gap) | AI lookup returns caffeine/alcohol per-100ml for a beverage | waterContentPercent addition to tool definition ensures complete beverage data quality |
| LIQD-04 (gap) | Auto-calc substance from volume * per-100ml with correct water amount | PresetTab already uses waterContentPercent for hydration calc; API fix makes the value accurate |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager: **pnpm** (npm/yarn will fail)
- Build check: `pnpm build` (TypeScript strict compilation)
- Lint check: `pnpm lint`
- E2E tests: `pnpm test:e2e` (Playwright, auto-starts dev server with LOCAL_AGENT_MODE=true)
- Unit tests: `pnpm test` (Vitest)
- Path alias: `@/*` maps to `src/*`
- API keys server-side only; PII stripped via `sanitizeForAI()` before external calls
- Service layer boundary: components never import from services directly (ESLint enforced)

## Standard Stack

No new libraries needed. This phase modifies existing code only.

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x | API response schema validation | Already used in all AI routes for safeParse |
| @anthropic-ai/sdk | installed | Claude API client | Shared `getClaudeClient()` + `CLAUDE_MODELS` |
| next | 14 | App Router API routes | Framework |

### Supporting (already in use)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.x | Unit testing | Validate Zod schema accepts/rejects waterContentPercent |

**Installation:** None required. Zero new dependencies.

## Architecture Patterns

### Target File
```
src/app/api/ai/substance-lookup/route.ts   # THE ONLY FILE TO MODIFY
```

### Pattern 1: Anthropic Claude tool_use with Forced Tool Choice
**What:** The route defines a tool with `input_schema` (JSON Schema), passes it to `client.messages.create` with `tool_choice: { type: "tool", name: "substance_lookup_result" }`, which forces Claude to return structured data matching the schema.
**When to use:** Always -- this is the established pattern for all AI routes in this codebase.
**Key detail:** Because `tool_choice` forces the tool, Claude will always return all required fields. Making `waterContentPercent` required in the tool definition is sufficient to guarantee it appears in every response.

**Current tool definition (before fix):**
```typescript
const SUBSTANCE_LOOKUP_TOOL = {
  name: "substance_lookup_result" as const,
  description: "Return the substance content per 100ml and typical serving size for a beverage",
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description: "For caffeine: mg per 100ml. For alcohol: standard drinks per 100ml.",
      },
      defaultVolumeMl: {
        type: "number",
        description: "Typical single serving volume in ml",
      },
      beverageName: {
        type: "string",
        description: "Normalized name of the beverage",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of the estimate and data source",
      },
    },
    required: ["substancePer100ml", "defaultVolumeMl", "beverageName", "reasoning"],
    additionalProperties: false,
  },
};
```

**After fix -- add waterContentPercent property and to required array.**

### Pattern 2: Zod safeParse Validation
**What:** The AI response is validated with `SubstanceLookupResponseSchema.safeParse(toolBlock.input)` before being returned to the client.
**Key detail:** The Zod schema and tool definition must stay in sync. If Zod requires `waterContentPercent` but the tool definition omits it, Claude will not return it and Zod will reject the response as invalid (returning 422 to the client).

**Current Zod schema (before fix):**
```typescript
const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
});
```

**After fix -- add `waterContentPercent: z.number().min(0).max(100)`.**

### Pattern 3: System Prompt with Reference Points
**What:** The system prompt provides domain expertise to anchor Claude's estimates.
**Key detail:** Two separate system prompts exist (caffeine vs alcohol). Both need the waterContentPercent guidance. The reference points should match the existing default presets in `constants.ts`.

**Current prompts:**
- Caffeine: `"You are a beverage nutrition expert. Given a beverage name, estimate its caffeine content per 100ml and typical serving size. Be as accurate as possible based on known beverage data."`
- Alcohol: `"You are a beverage nutrition expert. Given a beverage name, estimate its alcohol content in standard drinks per 100ml and typical serving size. A standard drink contains approximately 14g (0.6 oz) of pure alcohol."`

**Guidance to add (to both):** A sentence about also estimating waterContentPercent, with reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%.

### Anti-Patterns to Avoid
- **Separate Zod and tool_schema updates:** Both MUST be updated atomically in the same commit. A mismatch causes either (a) Claude returns a field Zod doesn't expect (harmless, stripped) or (b) Zod expects a field Claude doesn't return (422 error to client).
- **Making waterContentPercent optional in Zod while required in tool definition (or vice versa):** Per D-01, it is required in both. No fallback needed at the API level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Water content estimation | Hardcoded lookup table | Claude AI tool_use | Already the pattern; AI handles long-tail beverages |
| Response validation | Manual field checking | Zod safeParse | Already in use; type-safe, concise |

**Key insight:** The infrastructure for this feature already exists. This phase is purely about adding one field to two schemas and one sentence to two prompts.

## Common Pitfalls

### Pitfall 1: Zod/Tool Schema Mismatch
**What goes wrong:** Updating the Zod schema without updating the tool definition (or vice versa) causes either silent data loss or 422 errors.
**Why it happens:** The two schemas are defined separately in the same file -- easy to update one and forget the other.
**How to avoid:** Update both in the same edit, then verify by checking that every key in `required` array of the tool definition also exists in the Zod schema, and vice versa.
**Warning signs:** 422 errors on substance lookup, or `waterContentPercent` missing from client-side data despite the API "returning" it.

### Pitfall 2: Prompt Not Mentioning the New Field
**What goes wrong:** Claude's tool_use can technically return `waterContentPercent` without prompt guidance, but the values may be unreasonable (e.g., returning 50% for coffee) because Claude has no context about what the field means.
**Why it happens:** Claude's tool_use respects the JSON Schema and will fill all required fields, but accuracy depends on the system prompt providing domain context.
**How to avoid:** Add explicit guidance with reference points that match the app's existing default presets. This creates a consistent user experience where AI-sourced presets align with built-in ones.
**Warning signs:** AI returning waterContentPercent values far outside expected ranges (e.g., beer at 50% or coffee at 60%).

### Pitfall 3: Only Updating One System Prompt
**What goes wrong:** The route has two system prompts -- one for caffeine, one for alcohol. Updating only one means the other type of beverage lookups still produces unguided waterContentPercent values.
**Why it happens:** The two prompts are defined in a ternary expression, easy to miss one branch.
**How to avoid:** Both prompts need the waterContentPercent guidance. Recommend appending the same sentence to both, or refactoring to a shared base with type-specific additions.

### Pitfall 4: Forgetting additionalProperties: false
**What goes wrong:** If `additionalProperties: false` is set on the tool definition (it is) and you add a new property without adding it to `properties`, Claude's response will be rejected.
**Why it happens:** `additionalProperties: false` is a strict JSON Schema constraint.
**How to avoid:** Add the new property to the `properties` object AND to the `required` array. The existing code already has `additionalProperties: false` set.

## Code Examples

### Exact Zod Schema Change
```typescript
// BEFORE
const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
});

// AFTER
const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
  waterContentPercent: z.number().min(0).max(100),
});
```

### Exact Tool Definition Change
```typescript
// Add to SUBSTANCE_LOOKUP_TOOL.input_schema.properties:
waterContentPercent: {
  type: "number",
  description: "Estimated water content as a percentage (0-100). Reference: black coffee ~99, beer ~93, wine ~87, spirits ~60.",
},

// Add to SUBSTANCE_LOOKUP_TOOL.input_schema.required:
required: ["substancePer100ml", "defaultVolumeMl", "beverageName", "reasoning", "waterContentPercent"],
```

### System Prompt Addition
```typescript
// Append to BOTH caffeine and alcohol system prompts:
// " Also estimate the beverage's water content as a percentage (0-100). Reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%."
```

### Client-Side (NO CHANGES NEEDED - for reference)
```typescript
// preset-tab.tsx line 139 - already handles the field:
setWaterContentPercent(data.waterContentPercent ?? 100);

// preset-tab.tsx lines 162-164 - already calculates water amount:
const waterAmount = Math.round((volumeMl * waterContentPercent) / 100);
```

### Reference Values from Default Presets (constants.ts)
```typescript
// These are the ground truth for prompt reference points:
{ name: "Espresso",  waterContentPercent: 98 }
{ name: "Coffee",    waterContentPercent: 99 }
{ name: "Tea",       waterContentPercent: 99 }
{ name: "Beer",      waterContentPercent: 93 }
{ name: "Wine",      waterContentPercent: 87 }
{ name: "Spirit",    waterContentPercent: 60 }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No waterContentPercent in API | API returns waterContentPercent (this phase) | Phase 19 | AI presets produce accurate hydration records |
| Client defaults to 100% | Client fallback still 100% but rarely triggers | Phase 14 added fallback | Safety net preserved |

**Deprecated/outdated:**
- Perplexity API: Fully migrated to Anthropic Claude in Phase 13. Stale todo referencing migration should be cleaned up (deferred per CONTEXT.md).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm lint && pnpm build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIQD-03-gap | Zod schema validates waterContentPercent in [0,100] | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No -- Wave 0 |
| LIQD-03-gap | Zod schema rejects waterContentPercent outside [0,100] | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No -- Wave 0 |
| LIQD-03-gap | Zod schema rejects response missing waterContentPercent | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No -- Wave 0 |
| LIQD-04-gap | Tool definition includes waterContentPercent in required array | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test && pnpm lint`
- **Per wave merge:** `pnpm test && pnpm lint && pnpm build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/ai/substance-lookup/route.test.ts` -- unit tests for Zod schema validation (waterContentPercent accepted, rejected on out-of-range, rejected when missing)
- [ ] Export Zod schema and tool definition constants for testability (currently module-scoped `const` -- may need to be exported or tests can import and validate inline schema objects)

**Note:** Testing the actual Claude API call is not feasible in unit tests (requires API key, costs money, non-deterministic). Schema validation tests are the appropriate unit test boundary. The success criterion "beer returns ~93" is an integration/manual test against the live API.

## Open Questions

1. **Export strategy for test access**
   - What we know: `SubstanceLookupResponseSchema` and `SUBSTANCE_LOOKUP_TOOL` are module-scoped constants, not exported.
   - What's unclear: Whether to export them for testing or to duplicate the expected shape in the test file.
   - Recommendation: Export both as named exports. They have no security sensitivity (they are schema definitions, not secrets). This is the cleaner pattern and matches how other test files work in this codebase.

2. **Shared prompt sentence vs. duplicated in each prompt**
   - What we know: Two system prompts exist in a ternary. Both need waterContentPercent guidance.
   - What's unclear: Whether a shared base string is cleaner or a sentence appended to each.
   - Recommendation: Append the same sentence to both prompts. Refactoring to a shared base is cosmetic and out of scope for a gap-closure phase. Keep changes minimal.

## Sources

### Primary (HIGH confidence)
- `src/app/api/ai/substance-lookup/route.ts` -- direct source file inspection, complete understanding of current state
- `src/components/liquids/preset-tab.tsx` -- confirmed client already reads waterContentPercent (line 139) with ?? 100 fallback
- `src/lib/constants.ts` -- confirmed default preset waterContentPercent values for prompt reference points
- `.planning/v1.1-MILESTONE-AUDIT.md` -- confirmed gap: "AI substance-lookup API response missing waterContentPercent field"
- `src/app/api/ai/parse/route.ts` -- reference pattern for tool_use + Zod safeParse in sibling AI route

### Secondary (MEDIUM confidence)
- Anthropic Claude tool_use behavior: forced `tool_choice` guarantees all required fields are returned. Based on established pattern in this codebase (parse route has been working reliably) and Anthropic documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, modifying existing code with established patterns
- Architecture: HIGH -- single file change, pattern copied from existing sibling routes
- Pitfalls: HIGH -- identified from direct code inspection, all verifiable
- Validation: HIGH -- Zod schema testing is deterministic and straightforward

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- no fast-moving dependencies)
