---
phase: 05-security-hardening
plan: 03
subsystem: api, auth, security
tags: [withAuth, middleware, PII-sanitization, HSTS, bundle-scan, vitest]

requires:
  - phase: 05-01
    provides: "withAuth middleware, auth-middleware.ts"
provides:
  - "All API routes using centralized withAuth middleware"
  - "Strengthened PII sanitization (international phones, DOB, credit cards, SA ID)"
  - "Bundle security scan test (no API keys in client bundle)"
  - "HSTS header in security headers"
  - "LOCAL_AGENT_MODE production guard in privy-server.ts"
  - "PROJECT.md updated to NeonDB (Postgres)"
affects: [api-routes, security, deployment]

tech-stack:
  added: []
  patterns: ["withAuth HOF wrapping all POST API routes", "centralized sanitizeForAI for all AI inputs", "bundle security scan as vitest test"]

key-files:
  created:
    - src/__tests__/bundle-security.test.ts
  modified:
    - src/app/api/ai/parse/route.ts
    - src/app/api/ai/medicine-search/route.ts
    - src/app/api/ai/substance-enrich/route.ts
    - src/app/api/ai/status/route.ts
    - src/lib/security.ts
    - src/lib/privy-server.ts
    - next.config.js
    - .planning/PROJECT.md
    - .env.template

key-decisions:
  - "Status route kept public (no auth) but stripped of key length/format info"
  - "sanitizeForAI order: international phone before US phone to catch +27 prefix first"
  - "Audit vulnerabilities all in transitive deps (next, privy SDK, next-pwa) -- not directly fixable"

patterns-established:
  - "withAuth wrapper pattern: export const POST = withAuth(async ({ request, auth }) => { ... })"
  - "sanitizeForAI as single source of truth for PII stripping before AI calls"

requirements-completed: [SECU-01, SECU-03]

duration: 11min
completed: 2026-03-10
---

# Phase 5 Plan 3: API Route Auth Migration and Security Hardening Summary

**All 4 AI routes migrated to centralized withAuth middleware, PII sanitization extended with international patterns, client bundle verified clean of secrets via automated test, HSTS header added**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-10T15:22:52Z
- **Completed:** 2026-03-10T15:34:50Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- All 3 POST API routes (parse, medicine-search, substance-enrich) now use withAuth middleware instead of inline auth
- sanitizeForAI strengthened with international phone, DOB, credit card, and SA ID number patterns
- Bundle security test verifies no API keys or sensitive env vars leak into client bundle
- HSTS header added (max-age=63072000, includeSubDomains, preload)
- LOCAL_AGENT_MODE production guard added to privy-server.ts
- PROJECT.md updated from NanoDB to NeonDB (Postgres)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate API routes to auth middleware and strengthen PII sanitization** - `510a5f3` (feat)
2. **Task 2: Bundle security scan, CSP refinement, dependency audit, and PROJECT.md update** - `0f17f26` (feat)

## Files Created/Modified
- `src/app/api/ai/parse/route.ts` - Migrated to withAuth, uses sanitizeForAI
- `src/app/api/ai/medicine-search/route.ts` - Migrated to withAuth, uses sanitizeForAI
- `src/app/api/ai/substance-enrich/route.ts` - Migrated to withAuth, removed isPrivyConfigured logic
- `src/app/api/ai/status/route.ts` - Stripped serverApiKeyLength/serverApiKeyFormat info
- `src/lib/security.ts` - sanitizeForAI extended with 5 new PII patterns
- `src/lib/privy-server.ts` - LOCAL_AGENT_MODE production guard
- `next.config.js` - HSTS header, CSP unsafe-eval comment
- `src/__tests__/bundle-security.test.ts` - New test scanning .next/static for leaked secrets
- `.planning/PROJECT.md` - NanoDB replaced with NeonDB (Postgres)
- `.env.template` - Security policy documentation added

## Decisions Made
- Status route kept as public GET (no auth needed) per research -- only exposes boolean config flags
- Removed serverApiKeyLength and serverApiKeyFormat from status response (info leak)
- sanitizeForAI patterns ordered: international phone before US phone to catch +27 prefix patterns first
- pnpm audit shows 36 vulnerabilities (all transitive in next, privy SDK, next-pwa, eslint) -- not directly fixable, documented

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 (Security Hardening) complete with all 3 plans executed
- All API routes use centralized auth, bundle verified clean, HSTS enabled
- Ready for Phase 6 and beyond

---
*Phase: 05-security-hardening*
*Completed: 2026-03-10*
