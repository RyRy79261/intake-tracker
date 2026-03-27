---
phase: 05-security-hardening
plan: 01
subsystem: auth
tags: [auth-middleware, zustand-migration, api-key-removal, security]

# Dependency graph
requires:
  - phase: 02-typescript-contracts
    provides: Zod validation schemas in API routes
provides:
  - withAuth HOF for centralized API route authentication
  - Clean settings store without client-side API key fields
  - Zustand persist migration removing deprecated fields
affects: [05-02, 05-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [withAuth HOF for API route auth, Zustand persist versioned migration]

key-files:
  created: [src/lib/auth-middleware.ts]
  modified: [src/stores/settings-store.ts, src/hooks/use-settings.ts, src/lib/security.ts, src/lib/perplexity.ts, src/components/voice-input.tsx, src/hooks/use-medicine-search.ts, src/app/settings/page.tsx, src/components/settings-drawer.tsx, src/lib/backup-service.ts, src/lib/retention.ts, src/app/api/ai/parse/route.ts, src/app/api/ai/medicine-search/route.ts]

key-decisions:
  - "Zustand persist migration uses version 0->1 with double-cast (as unknown as T) for TypeScript strictness"
  - "API routes now require auth always (no clientApiKey fallback) -- server-side PERPLEXITY_API_KEY is the only path"
  - "LOCAL_AGENT_MODE production guard logs warning but does not bypass auth in production"

patterns-established:
  - "withAuth HOF: wrap API route handlers for centralized auth verification"
  - "Zustand persist versioning: use migrate function to clean deprecated fields from localStorage"

requirements-completed: [SECU-01, SECU-03]

# Metrics
duration: 13min
completed: 2026-03-10
---

# Phase 05 Plan 01: Auth Middleware and Client API Key Removal Summary

**Centralized withAuth middleware for API routes plus complete removal of client-side API key storage, obfuscation code, and AI settings UI**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-10T14:46:25Z
- **Completed:** 2026-03-10T14:59:25Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created `withAuth` higher-order function in `auth-middleware.ts` for centralized API route authentication
- Removed all client-side API key storage (perplexityApiKey, aiAuthSecret) from settings store with Zustand persist migration
- Eliminated obfuscation code (obfuscateApiKey, deobfuscateApiKey, OBFUSCATION_KEY) from security.ts
- Deleted AI integration settings section from UI (settings page and drawer)
- Cleaned API routes to require auth always (no client API key fallback)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth middleware and clean settings store** - `1adc4b2` (feat)
2. **Task 2: Remove obfuscation code and client API key references** - `8645b6d` (feat)

## Files Created/Modified
- `src/lib/auth-middleware.ts` - New withAuth HOF for API route authentication
- `src/stores/settings-store.ts` - Removed API key fields, added persist migration v0->v1
- `src/hooks/use-settings.ts` - Removed usePerplexityKey and useAiAuthSecret hooks
- `src/lib/security.ts` - Removed obfuscation functions and OBFUSCATION_KEY constant
- `src/lib/perplexity.ts` - Removed clientApiKey option from parseIntakeWithPerplexity
- `src/components/voice-input.tsx` - Removed client API key fallback logic
- `src/hooks/use-medicine-search.ts` - Removed clientApiKey from fetch body
- `src/components/settings/ai-integration-section.tsx` - DELETED
- `src/app/settings/page.tsx` - Removed AiIntegrationSection import/render
- `src/components/settings-drawer.tsx` - Removed AiIntegrationSection import/render
- `src/lib/backup-service.ts` - Removed perplexityApiKey exclusion from export
- `src/lib/retention.ts` - Removed perplexityApiKey deletion from GDPR export
- `src/app/api/ai/parse/route.ts` - Removed clientApiKey from schema and fallback logic
- `src/app/api/ai/medicine-search/route.ts` - Removed clientApiKey from schema and fallback logic

## Decisions Made
- Zustand persist migration uses `as unknown as T` double-cast for TypeScript strict mode compatibility
- API routes now always require authentication (verifyAndCheckWhitelist) -- removed clientApiKey fallback path entirely
- LOCAL_AGENT_MODE production guard: logs warning and ignores the flag (does not bypass auth in production)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Cleaned API routes to remove clientApiKey acceptance**
- **Found during:** Task 2 (grep for remaining references)
- **Issue:** API routes in `src/app/api/ai/parse/route.ts` and `src/app/api/ai/medicine-search/route.ts` still accepted `clientApiKey` in request body and used it as fallback. Dead code path since client no longer sends it.
- **Fix:** Removed clientApiKey from Zod schemas, removed fallback logic, simplified to always require auth + server API key
- **Files modified:** src/app/api/ai/parse/route.ts, src/app/api/ai/medicine-search/route.ts
- **Verification:** Build passes, grep returns zero matches for clientApiKey
- **Committed in:** 8645b6d (Task 2 commit)

**2. [Rule 1 - Bug] Fixed TypeScript strict cast error in Zustand migration**
- **Found during:** Task 1 (build verification)
- **Issue:** `state as Settings & SettingsActions` failed TypeScript strict check because Record<string, unknown> doesn't overlap
- **Fix:** Used double-cast `as unknown as Settings & SettingsActions`
- **Files modified:** src/stores/settings-store.ts
- **Committed in:** 8645b6d (Task 2 commit, same build cycle)

---

**Total deviations:** 2 auto-fixed (1 correctness, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness and build success. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth middleware ready for API route migration in Plan 02
- Settings store cleanly migrated, no client-side API key paths remain
- All API routes require authentication (prepared for Plan 03 withAuth migration)

---
*Phase: 05-security-hardening*
*Completed: 2026-03-10*
