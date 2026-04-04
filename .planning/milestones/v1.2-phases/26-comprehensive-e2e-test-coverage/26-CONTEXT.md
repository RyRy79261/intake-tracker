# Phase 26: Comprehensive E2E Test Coverage - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand E2E test coverage to exercise every app section with comprehensive scenario tests. Each page gets its own spec file mirroring app routes. Tests cover happy paths, error states, and edge cases. Verify Privy test account integration works end-to-end in CI.

</domain>

<decisions>
## Implementation Decisions

### Test Organization
- **D-01:** One spec file per page, mirroring app routes: `auth.spec.ts`, `dashboard.spec.ts`, `medications.spec.ts`, `history.spec.ts`, `settings.spec.ts`
- **D-02:** Rename/consolidate existing files: `auth-bypass.spec.ts` → `auth.spec.ts`, `intake-logs.spec.ts` → `dashboard.spec.ts`, `medication-wizard.spec.ts` → `medications.spec.ts`, `settings.spec.ts` stays
- **D-03:** Keep flat `e2e/` directory (carried forward from Phase 22 D-06)
- **D-04:** `auth.setup.ts` remains as the Playwright setup project for authenticated state

### Scenario Depth
- **D-05:** Comprehensive coverage: happy paths + error states + edge cases, ~4-6 tests per section
- **D-06:** All sections equal priority — dashboard cards (BP, weight, urination, defecation, liquids, daily notes), medication dose logging, history page, backup/restore, auth lifecycle
- **D-07:** No sections skipped or deferred — every area of the app gets tested

### Auth Flow Coverage
- **D-08:** Full auth lifecycle testing: verify authenticated state, logout, verify redirected to login, re-login, verify dashboard returns
- **D-09:** Test whitelist rejection with invalid email
- **D-10:** Verify Privy test account integration works in CI end-to-end (run E2E suite, confirm creds from GitHub secrets work)

### History & Charts
- **D-11:** Verify chart containers render (SVG elements present), data labels/legends show correct categories, summary text/metrics display. Do NOT assert on SVG path values
- **D-12:** Create test data via UI first (dashboard interactions), then navigate to history page to verify data appears in charts — tests the full pipeline

### Test Patterns (carried forward from Phase 22)
- **D-13:** AI endpoints mocked via `page.route()` (existing pattern in intake-logs + medication-wizard)
- **D-14:** Dual webServer config: dev server locally (`pnpm run dev`), production build in CI (`pnpm build && pnpm start`)
- **D-15:** Service workers blocked in Playwright config so `page.route()` mocks work against production builds

### Claude's Discretion
- Exact test case breakdown per section (how many tests, which edge cases)
- Test data values used in page.evaluate() seeding vs UI creation
- Timeout values for chart rendering assertions
- Whether to add Playwright test tags/annotations for filtering

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E2E Infrastructure
- `playwright.config.ts` — Playwright config with setup project, dual webServer, service worker blocking
- `e2e/auth.setup.ts` — Privy test account authentication setup (uses PRIVY_TEST_EMAIL/PRIVY_TEST_OTP env vars)
- `e2e/auth-bypass.spec.ts` — Current auth smoke test (to be renamed → auth.spec.ts and expanded)
- `e2e/intake-logs.spec.ts` — Current water/salt + AI food tests (to be renamed → dashboard.spec.ts and expanded)
- `e2e/medication-wizard.spec.ts` — Current wizard test with AI mock (to be renamed → medications.spec.ts and expanded)
- `e2e/settings.spec.ts` — Current theme + day-start persistence tests (to be expanded)

### App Routes (pages to test)
- `src/app/page.tsx` — Dashboard (main intake page with all cards)
- `src/app/medications/` — Medications page
- `src/app/history/` — History/analytics with Recharts
- `src/app/settings/` — App configuration
- `src/app/providers.tsx` — Provider stack including Privy auth + E2E bridge (`__privyE2E`)

### CI Integration
- `.github/workflows/ci.yml` — CI workflow with E2E job (uses Privy secrets)
- `.env.template` — Template showing required env vars including PRIVY_TEST_EMAIL/PRIVY_TEST_OTP

### Prior Phase Context
- `.planning/phases/22-e2e-testing-in-ci/22-CONTEXT.md` — Phase 22 E2E decisions (flat dir, dual server, mock patterns)
- `.planning/quick/260330-131-replace-local-agent-mode-bypass-with-pri/` — Quick task that wired Privy test creds into CI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auth.setup.ts`: Privy headless login via `__privyE2E.sendCode()` + `loginWithCode()` — reuse for auth lifecycle tests
- `page.route()` mock pattern: Used in intake-logs and medication-wizard for AI endpoint mocking
- Section IDs on dashboard: `#section-water`, `#section-food-salt` — likely similar IDs for other sections

### Established Patterns
- All E2E tests use `@playwright/test` with `test.describe()` blocks
- AI mocks return structured JSON matching API response shapes
- Assertions use `toBeVisible()`, `toContainText()`, `toHaveAttribute()`
- Composable entry tests verify preview → confirm flow

### Integration Points
- Dashboard cards each have section IDs for targeting
- Settings page uses Radix Select components with `role="option"` selectors
- Medication wizard uses step-by-step navigation with "Next" buttons
- History page uses Recharts (SVG-based charts)

</code_context>

<specifics>
## Specific Ideas

- User wants to verify the Privy test account (fixed OTP) is properly integrated in workflows — this was set up in quick task 260330-131 but user is unsure if it's fully working
- History tests should create data via UI interactions (not IndexedDB seeding) to test the full pipeline
- Every section must have its own set of scenario testing — no area left uncovered

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-comprehensive-e2e-test-coverage*
*Context gathered: 2026-04-03*
