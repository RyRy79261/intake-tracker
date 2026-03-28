# Phase 22: E2E Testing in CI - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Real user workflows are exercised against the production build on every PR, catching functional regressions that unit tests miss. Playwright runs in headless Chromium in CI with browser caching. Covers requirements E2E-01, E2E-02, E2E-03.

</domain>

<decisions>
## Implementation Decisions

### Scenario Coverage (E2E-02)
- **D-01:** Composable entry test covers both food and liquid flows. Food: enter description → mock AI parse → verify preview with linked entries (intake + eating + salt) → confirm. Liquid: select preset (e.g. coffee) → verify substance auto-calc → confirm
- **D-02:** Medication dose logging lifecycle: extend existing wizard test to create medication → navigate to medication detail → log a dose for a scheduled time → verify dose recorded in history → verify inventory decremented
- **D-03:** Settings persistence: test theme toggle (light→dark) and day-start-hour change, reload page, verify both persist. Covers Zustand/localStorage persistence mechanism

### Dev vs Prod Server (E2E-03)
- **D-04:** Dual config via `process.env.CI` in `playwright.config.ts`. Local runs use dev server (`pnpm run dev`) for fast iteration. CI runs use production build (`pnpm build && pnpm start`) to catch prod-only regressions

### Test Organization
- **D-05:** Evolve existing test files to align with E2E-02 requirements:
  - `auth-bypass.spec.ts` — keep as-is (utility test)
  - `intake-logs.spec.ts` — expand with food+liquid composable flows alongside existing water/salt tests
  - `medication-wizard.spec.ts` — expand with dose logging after wizard creation
  - `settings.spec.ts` — new file for theme + day-start persistence
- **D-06:** Flat `e2e/` directory (no subdirectories) — 4 spec files total

### CI Job Configuration
- **D-07:** Independent E2E job in `ci.yml` — runs its own `pnpm build && pnpm start` internally via Playwright's webServer config. Runs in parallel with all other jobs (lint, typecheck, test-tz-*, build, data-integrity)
- **D-08:** Add `e2e` job to `ci-pass` gate's `needs` list so it blocks merge like all other jobs
- **D-09:** Upload Playwright trace files as GitHub Actions artifacts on test failure only (`if: failure()`), 7-day retention. Current config already collects traces on first retry
- **D-10:** Browser caching via `npx playwright install chromium --with-deps` — Playwright handles caching internally

### Claude's Discretion
- Playwright browser install caching strategy (actions/cache for ~/.cache/ms-playwright or let it download each time)
- Exact retry count in CI (currently 2 in playwright.config.ts, adjust if needed)
- Test timeout values
- Whether to add a dedicated `test:e2e:ci` script or use env detection in existing `test:e2e`
- Port for production server (3000 or different to avoid conflicts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E2E Infrastructure
- `playwright.config.ts` — Current Playwright config (webServer, projects, retries). Needs CI-aware webServer switch (D-04)
- `e2e/auth-bypass.spec.ts` — Auth bypass test pattern (LOCAL_AGENT_MODE)
- `e2e/intake-logs.spec.ts` — Existing water/salt test, expand with composable flows (D-01)
- `e2e/medication-wizard.spec.ts` — Existing wizard test with AI mock pattern, expand with dose logging (D-02)

### CI Infrastructure
- `.github/workflows/ci.yml` — Current CI workflow (Phase 20+21). Add E2E job here (D-07, D-08)
- `.planning/phases/20-core-ci-pipeline/20-CONTEXT.md` — Phase 20 decisions (job structure, ci-pass gate pattern)

### App Code (test targets)
- `src/components/food-salt-card.tsx` — Food+Salt composable entry UI (D-01 food flow)
- `src/components/liquids-card.tsx` — Liquids card with preset grid and substance auto-calc (D-01 liquid flow)
- `src/app/medications/page.tsx` — Medications page (D-02 dose logging target)
- `src/app/settings/page.tsx` — Settings page (D-03 theme + day-start)
- `src/stores/settings-store.ts` — Zustand store with localStorage persistence (D-03 verification target)

### Requirements
- `.planning/REQUIREMENTS.md` — E2E-01, E2E-02, E2E-03 map to this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `medication-wizard.spec.ts`: AI mock pattern (`page.route('/api/ai/medicine-search', ...)`) — reuse for food AI parse mock
- `auth-bypass.spec.ts`: Confirms LOCAL_AGENT_MODE bypasses auth — all tests depend on this
- `playwright.config.ts`: Already configured for Chromium, retries in CI, trace on first retry
- `@playwright/test ^1.58.2`: Already installed, `test:e2e` script exists in package.json

### Established Patterns
- AI route mocking via `page.route()` — used in medication-wizard, extend for food parse
- `LOCAL_AGENT_MODE=true` env var bypasses Privy auth for E2E
- Section IDs (`#section-water`, `#section-salt`) for locating dashboard cards
- Toast messages as success indicators ("Water intake recorded", "Salt intake recorded")

### Integration Points
- `ci.yml` — new `e2e` job added to jobs list and ci-pass needs array
- `playwright.config.ts` — webServer config switches on `process.env.CI`
- `package.json` — may need `test:e2e:ci` script or env-aware `test:e2e`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-e2e-testing-in-ci*
*Context gathered: 2026-03-28*
