---
phase: 13-liquid-presets-and-ai-lookup
plan: 03
subsystem: cleanup
tags: [anthropic, perplexity-removal, ai-migration, csp, env, documentation]

# Dependency graph
requires:
  - phase: 13-liquid-presets-and-ai-lookup
    provides: "Plans 01-02 migrated AI routes to Anthropic Claude and created shared client"
provides:
  - "Zero Perplexity references in active source code (only v0 migration cleanup remains)"
  - "Client library renamed from perplexity.ts to ai-client.ts with parseIntakeWithAI export"
  - "CSP, env template, docs, security test all reference Anthropic"
  - "D-08 (AI migration) fully satisfied"
affects: [all-future-phases]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Single AI provider (Anthropic Claude) across entire codebase"]

key-files:
  created: []
  modified:
    - "src/lib/ai-client.ts (renamed from perplexity.ts)"
    - "src/components/voice-input.tsx"
    - "src/components/parsed-intake-display.tsx"
    - "src/app/api/ai/status/route.ts"
    - "src/stores/settings-store.ts"
    - "src/__tests__/bundle-security.test.ts"
    - ".env.template"
    - "next.config.js"
    - "SECURITY.md"
    - "README.md"
    - "CLAUDE.md"
    - "src/lib/db.ts"
    - "src/lib/security.ts"
    - "src/lib/substance-enrich.ts"

key-decisions:
  - "Removed vestigial perplexityApiKey field from Settings interface (dead code since usePerplexityKey hook already removed)"
  - "Kept v0 migration delete state.perplexityApiKey line for upgrading users from old persist format"
  - "Updated README AI section to remove client-side API key fallback (now server-only via Privy auth)"

patterns-established:
  - "All AI references use Anthropic/Claude terminology throughout codebase and docs"
  - "ANTHROPIC_API_KEY is the single env var for AI services"

requirements-completed: [LIQD-02, LIQD-03]

# Metrics
duration: 12min
completed: 2026-03-24
---

# Phase 13 Plan 03: AI Migration Cleanup Summary

**Eliminated all Perplexity references from codebase: renamed client library to ai-client.ts, updated CSP/env/docs/security test to reference Anthropic Claude as sole AI provider**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T07:15:15Z
- **Completed:** 2026-03-24T07:27:29Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Renamed perplexity.ts to ai-client.ts with parseIntakeWithAI function, preserving git history
- Updated all imports in voice-input.tsx and parsed-intake-display.tsx to reference new module
- Cleaned every Perplexity reference across env, CSP, docs, security test, and source comments
- Only remaining Perplexity reference: Zustand v0 migration cleanup line (intentionally preserved for upgrading users)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename perplexity.ts and update all source imports** - `a7c75d7` (feat)
2. **Task 2: Update config, docs, env template, CSP, and bundle security test** - `9d4532d` (chore)

**Build artifacts:** `4d50aa1` (chore: update PWA worker hash)

## Files Created/Modified
- `src/lib/ai-client.ts` - Renamed from perplexity.ts, exports parseIntakeWithAI and ParsedIntake
- `src/components/voice-input.tsx` - Updated import to ai-client, renamed function call, changed footer text
- `src/components/parsed-intake-display.tsx` - Updated import to ai-client
- `src/app/api/ai/status/route.ts` - Checks ANTHROPIC_API_KEY instead of PERPLEXITY_API_KEY
- `src/stores/settings-store.ts` - Removed vestigial perplexityApiKey field, setter, and comments
- `src/lib/db.ts` - Updated comment on aiEnriched field
- `src/lib/security.ts` - Updated comment on sanitizeForAI function
- `src/lib/substance-enrich.ts` - Updated JSDoc comment
- `src/__tests__/bundle-security.test.ts` - Scans for sk-ant- prefix and ANTHROPIC_API_KEY
- `.env.template` - Uses ANTHROPIC_API_KEY with sk-ant- placeholder
- `next.config.js` - CSP connect-src points to api.anthropic.com
- `SECURITY.md` - All references updated to Anthropic
- `README.md` - All references updated to Anthropic, removed client-side API key fallback section
- `CLAUDE.md` - API routes reference Claude, added substance-lookup route

## Decisions Made
- Removed the `perplexityApiKey` field entirely from Settings interface rather than renaming it, since the `usePerplexityKey` hook was already removed by Plan 01 and no component references it (dead code)
- Kept the Zustand v0 migration `delete state.perplexityApiKey` line because it handles upgrading users who had the old persisted field
- Simplified README "Fallback API Key" section to reflect that AI now requires Privy auth + server-side key only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Cleaned additional Perplexity references not listed in plan**
- **Found during:** Task 1 (source import sweep)
- **Issue:** Plan listed specific files but must_haves require zero Perplexity references in src/. Additional references existed in settings-store.ts (field name, setter, comments), db.ts (comment), security.ts (comment), substance-enrich.ts (JSDoc)
- **Fix:** Removed perplexityApiKey field from Settings interface/defaults/actions; updated comments in db.ts, security.ts, substance-enrich.ts
- **Files modified:** src/stores/settings-store.ts, src/lib/db.ts, src/lib/security.ts, src/lib/substance-enrich.ts
- **Verification:** `grep -ri "perplexity" src/` returns only the v0 migration line
- **Committed in:** a7c75d7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix was necessary to meet plan's own must_haves (zero Perplexity references). No scope creep.

## Issues Encountered
- Pre-existing build errors on the feat/ui-fixes branch (missing `substanceConfig` property, missing `obfuscateApiKey`/`deobfuscateApiKey` exports) prevent `pnpm build` from succeeding. These errors exist before any Plan 03 changes and are caused by the Plan 01 merge removing fields from settings-store. TypeScript compilation of Plan 03's changed files has no new errors. Logged as out-of-scope per deviation rules.

## User Setup Required

The `ANTHROPIC_API_KEY` environment variable must be set for AI routes to function. This replaces the previous `PERPLEXITY_API_KEY`. Add to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Known Stubs

None - all changes are renames and reference updates with no new functionality to wire.

## Next Phase Readiness
- D-08 (Perplexity to Anthropic migration) is fully satisfied
- Codebase has single AI provider (Anthropic Claude) throughout
- Phase 13 complete: liquid presets, AI routes, and cleanup all done

## Self-Check: PASSED

All 14 modified files verified present on disk. All 3 commit hashes (a7c75d7, 9d4532d, 4d50aa1) verified in git history. src/lib/perplexity.ts confirmed removed.

---
*Phase: 13-liquid-presets-and-ai-lookup*
*Completed: 2026-03-24*
