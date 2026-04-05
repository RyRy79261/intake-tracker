---
phase: 13-liquid-presets-and-ai-lookup
plan: 02
subsystem: api
tags: [anthropic, claude, tool-use, ai, perplexity-migration, substance-lookup]

# Dependency graph
requires:
  - phase: 05-security
    provides: withAuth middleware, sanitizeForAI, rate limiting patterns
provides:
  - "All 5 AI routes migrated from Perplexity to Anthropic Claude with tool_use"
  - "Shared claude-client.ts with getClaudeClient() and CLAUDE_MODELS"
  - "New /api/ai/substance-lookup route for beverage per-100ml caffeine/alcohol lookup"
  - "Zero regex JSON extraction remaining in any AI route"
affects: [13-liquid-presets-and-ai-lookup, api-ai-routes]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk 0.80.0"]
  patterns: ["Claude tool_use with forced tool_choice for structured output", "Zod defense-in-depth validation on toolBlock.input", "Shared claude-client singleton pattern"]

key-files:
  created:
    - "src/app/api/ai/_shared/claude-client.ts"
    - "src/app/api/ai/substance-lookup/route.ts"
  modified:
    - "src/app/api/ai/parse/route.ts"
    - "src/app/api/ai/substance-enrich/route.ts"
    - "src/app/api/ai/medicine-search/route.ts"
    - "src/app/api/ai/interaction-check/route.ts"
    - "src/app/api/ai/titration-warnings/route.ts"
    - "package.json"

key-decisions:
  - "Used 'as const' only on name and input_schema.type, not on required arrays, to satisfy Anthropic SDK TypeScript types"
  - "CLAUDE_MODELS.fast (haiku) for parse, substance-enrich, substance-lookup; CLAUDE_MODELS.quality (sonnet) for medicine-search, interaction-check, titration-warnings"
  - "Singleton cached client pattern in claude-client.ts for connection reuse"

patterns-established:
  - "Claude tool_use pattern: define tool with input_schema, use tool_choice forced, extract toolBlock.input, validate with Zod"
  - "Shared AI client: import { getClaudeClient, CLAUDE_MODELS } from '../_shared/claude-client'"

requirements-completed: [LIQD-03]

# Metrics
duration: 9min
completed: 2026-03-24
---

# Phase 13 Plan 02: AI Route Migration Summary

**Migrated all 5 Perplexity AI routes to Anthropic Claude tool_use and created new substance-lookup route for beverage per-100ml lookup**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-24T07:01:06Z
- **Completed:** 2026-03-24T07:10:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Replaced fragile regex JSON extraction across all 5 AI routes with Claude's guaranteed structured output via tool_use
- Created shared claude-client.ts with singleton pattern and model constants
- Created new /api/ai/substance-lookup route for beverage caffeine/alcohol per-100ml lookup
- Build succeeds with zero TypeScript errors and zero Perplexity API references remaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate parse, substance-enrich, medicine-search routes to Claude** - `8fcda7f` (feat)
   - TypeScript fix: `2dc608e` (fix) - resolved readonly array incompatibility with Anthropic SDK
2. **Task 2: Migrate interaction-check, titration-warnings + create substance-lookup** - `30096cc` (feat)

**Build artifacts:** `88b0f6f` (chore: update PWA worker hash)

## Files Created/Modified
- `src/app/api/ai/_shared/claude-client.ts` - Shared Anthropic client singleton with model constants
- `src/app/api/ai/parse/route.ts` - Claude tool_use for food/drink water+salt parsing
- `src/app/api/ai/substance-enrich/route.ts` - Claude tool_use for caffeine/alcohol enrichment
- `src/app/api/ai/medicine-search/route.ts` - Claude tool_use for pharmaceutical information lookup
- `src/app/api/ai/interaction-check/route.ts` - Claude tool_use for drug interaction analysis
- `src/app/api/ai/titration-warnings/route.ts` - Claude tool_use for titration warning generation
- `src/app/api/ai/substance-lookup/route.ts` - New route for beverage substance per-100ml lookup
- `package.json` - Added @anthropic-ai/sdk dependency

## Decisions Made
- Used `as const` only on `name` and `input_schema.type` fields in tool definitions; required arrays left mutable to satisfy Anthropic SDK TypeScript types (SDK expects `string[]`, not `readonly string[]`)
- CLAUDE_MODELS.fast (claude-haiku-4-5) for simpler tasks (parse, substance-enrich, substance-lookup); CLAUDE_MODELS.quality (claude-sonnet-4-5) for complex clinical/pharmaceutical reasoning (medicine-search, interaction-check, titration-warnings)
- Cached singleton client in claude-client.ts to avoid re-instantiation per request

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @anthropic-ai/sdk dependency**
- **Found during:** Task 1 (pre-execution check)
- **Issue:** Anthropic SDK not installed in project dependencies
- **Fix:** Ran `pnpm add @anthropic-ai/sdk`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** SDK imports resolve, build succeeds
- **Committed in:** 2dc608e

**2. [Rule 3 - Blocking] Created _shared/claude-client.ts**
- **Found during:** Task 1 (plan interface check)
- **Issue:** Shared client file did not exist (Plan 01 runs in parallel)
- **Fix:** Created claude-client.ts as specified in plan interfaces section
- **Files modified:** src/app/api/ai/_shared/claude-client.ts
- **Verification:** All routes import successfully
- **Committed in:** 8fcda7f

**3. [Rule 1 - Bug] Fixed TypeScript readonly array errors**
- **Found during:** Task 2 verification (pnpm build)
- **Issue:** `as const` on tool definition `required` arrays made them `readonly string[]`, incompatible with Anthropic SDK's `string[]` type
- **Fix:** Removed `as const` from required arrays and property type literals; kept only on `name` and `input_schema.type`
- **Files modified:** All 6 route files
- **Verification:** `pnpm build` succeeds
- **Committed in:** 2dc608e (Task 1 files), 30096cc (Task 2 files)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and functionality. No scope creep.

## Issues Encountered
- Anthropic SDK TypeScript types are strict about mutable vs readonly arrays in tool definitions. Resolved by removing `as const` from property-level annotations while keeping the `as const` on structurally significant fields like `name` and `type: "object"`.

## User Setup Required

The ANTHROPIC_API_KEY environment variable must be set for the AI routes to function. This replaces the previous PERPLEXITY_API_KEY. Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Known Stubs

None - all routes are fully wired to the Anthropic Claude API with complete request/response handling.

## Next Phase Readiness
- All AI backend routes ready for Plan 03 (status route update, env cleanup)
- substance-lookup route ready for Plan 01's preset UI to call
- PERPLEXITY_API_KEY can be removed from environment after Plan 03 updates status route

## Self-Check: PASSED

All 7 created/modified files verified present. All 4 commit hashes verified in git log.

---
*Phase: 13-liquid-presets-and-ai-lookup*
*Completed: 2026-03-24*
