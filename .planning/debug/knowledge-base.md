# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## ai-401-errors — Missing Authorization headers on AI endpoint client calls

- **Date:** 2026-04-06
- **Error patterns:** 401, Unauthorized, AI endpoints, parse, substance-lookup, interaction-check, substance-enrich, titration-warnings
- **Root cause:** Client-side fetch calls to AI endpoints (all except medicine-search) did not include the Authorization header with the Privy access token. The withAuth middleware requires a Bearer token, so these requests failed with 401.
- **Fix:** Added useAuth().getAuthHeader() calls to all client-side AI endpoint callers, following the working pattern from use-medicine-search.ts. Each fetch call now spreads the auth headers into the request headers object.
- **Files changed:** src/lib/ai-client.ts, src/components/food-salt/food-section.tsx, src/components/liquids/preset-tab.tsx, src/components/medications/titrations-view.tsx, src/components/substance/substance-type-picker.tsx, src/hooks/use-interaction-check.ts, src/lib/substance-enrich.ts
---
