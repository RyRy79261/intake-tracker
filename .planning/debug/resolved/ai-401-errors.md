---
status: resolved
trigger: "All AI API endpoints returning 401 errors except medicine-search"
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T23:59:59Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED - All client-side AI callers now include Authorization headers
test: Build and lint pass; awaiting human end-to-end verification
expecting: AI features (food parsing, substance lookup, interaction check, titration warnings, substance enrich) should work without 401 errors
next_action: User verifies fix in running app

## Symptoms

expected: AI endpoints (food parse, substance lookup, AI status) return successful responses when called from the app
actual: 401 Unauthorized errors on all AI endpoints except the prescription/medicine-search endpoint
errors: 401 errors from AI API routes
reproduction: Use any AI feature in the app (food parsing, substance lookup) — they all fail with 401
started: Recently broken — these features worked before

## Eliminated

- hypothesis: Server-side API key misconfiguration or different Anthropic client initialization between routes
  evidence: All routes use identical getClaudeClient() from _shared/claude-client.ts and identical withAuth() middleware
  timestamp: 2026-04-06

## Evidence

- timestamp: 2026-04-06
  checked: Server-side route files (parse, medicine-search, substance-lookup, interaction-check, substance-enrich, titration-warnings)
  found: All use identical withAuth() middleware and getClaudeClient(). No differences in server-side auth handling.
  implication: The 401 is not caused by server-side differences between routes.

- timestamp: 2026-04-06
  checked: Client-side callers for all AI endpoints
  found: |
    WORKING: use-medicine-search.ts uses useAuth().getAuthHeader() to include Authorization header
    BROKEN: food-section.tsx calls parseIntakeWithAI() without authToken option — no Authorization header sent
    BROKEN: preset-tab.tsx calls /api/ai/substance-lookup with only Content-Type header — no Authorization
    BROKEN: use-interaction-check.ts calls /api/ai/interaction-check with only Content-Type header — no Authorization
    BROKEN: substance-type-picker.tsx calls /api/ai/substance-enrich with only Content-Type header — no Authorization
    BROKEN: substance-enrich.ts calls /api/ai/substance-enrich with only Content-Type header — no Authorization
    BROKEN: titrations-view.tsx calls /api/ai/titration-warnings with only Content-Type header — no Authorization
  implication: The 401 is caused by missing Authorization headers on client-side fetch calls.

- timestamp: 2026-04-06
  checked: auth-middleware.ts withAuth function
  found: Extracts Bearer token from Authorization header; calls verifyAndCheckWhitelist(authToken); returns 401 if no token or verification fails
  implication: Without an Authorization header, authToken is null, verifyAndCheckWhitelist returns {success: false, error: "No auth token provided"}, and 401 is returned.

## Resolution

root_cause: Client-side fetch calls to AI endpoints (all except medicine-search) do not include the Authorization header with the Privy access token. The withAuth middleware requires a Bearer token, so these requests fail with 401.
fix: Added useAuth().getAuthHeader() calls to all client-side AI endpoint callers, following the working pattern from use-medicine-search.ts. Each fetch call now spreads the auth headers into the request headers object.
verification: Build passes, lint passes (no new warnings). Awaiting human verification of end-to-end functionality.
files_changed:
  - src/lib/ai-client.ts
  - src/components/food-salt/food-section.tsx
  - src/components/liquids/preset-tab.tsx
  - src/components/medications/titrations-view.tsx
  - src/components/substance/substance-type-picker.tsx
  - src/hooks/use-interaction-check.ts
  - src/lib/substance-enrich.ts
