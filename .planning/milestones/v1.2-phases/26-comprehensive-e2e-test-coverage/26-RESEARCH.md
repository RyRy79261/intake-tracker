# Phase 26: Comprehensive E2E Test Coverage - Research

**Researched:** 2026-04-03
**Domain:** Playwright E2E testing, Next.js App Router, Privy auth, Recharts, IndexedDB/Dexie
**Confidence:** HIGH

## Summary

This phase expands the existing 4-spec E2E test suite (auth-bypass, intake-logs, medication-wizard, settings) into comprehensive per-route coverage. The existing infrastructure is solid: Playwright 1.58.2 with Privy headless login via `__privyE2E` bridge, `page.route()` API mocking, dual webServer config (dev locally / prod build in CI), service worker blocking, and authenticated storage state sharing via a setup project.

The key work is (1) renaming/consolidating existing spec files to mirror app routes, (2) adding tests for currently untested dashboard cards (blood pressure, weight, urination, defecation), (3) adding analytics/history page tests that create data via UI then verify chart rendering, (4) expanding auth lifecycle tests (logout/re-login, whitelist rejection), and (5) expanding settings coverage (backup/restore, account section).

**Primary recommendation:** Keep the existing Playwright patterns (no page object model needed for a 5-spec suite). Focus on comprehensive scenario coverage per route, reusing established patterns: `page.route()` for AI mocks, section IDs for card targeting, `getByRole()`/`getByText()` for accessible locators, toast assertions for confirmation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** One spec file per page, mirroring app routes: `auth.spec.ts`, `dashboard.spec.ts`, `medications.spec.ts`, `history.spec.ts`, `settings.spec.ts`
- **D-02:** Rename/consolidate existing files: `auth-bypass.spec.ts` -> `auth.spec.ts`, `intake-logs.spec.ts` -> `dashboard.spec.ts`, `medication-wizard.spec.ts` -> `medications.spec.ts`, `settings.spec.ts` stays
- **D-03:** Keep flat `e2e/` directory (carried forward from Phase 22 D-06)
- **D-04:** `auth.setup.ts` remains as the Playwright setup project for authenticated state
- **D-05:** Comprehensive coverage: happy paths + error states + edge cases, ~4-6 tests per section
- **D-06:** All sections equal priority -- dashboard cards (BP, weight, urination, defecation, liquids, daily notes), medication dose logging, history page, backup/restore, auth lifecycle
- **D-07:** No sections skipped or deferred -- every area of the app gets tested
- **D-08:** Full auth lifecycle testing: verify authenticated state, logout, verify redirected to login, re-login, verify dashboard returns
- **D-09:** Test whitelist rejection with invalid email
- **D-10:** Verify Privy test account integration works in CI end-to-end (run E2E suite, confirm creds from GitHub secrets work)
- **D-11:** Verify chart containers render (SVG elements present), data labels/legends show correct categories, summary text/metrics display. Do NOT assert on SVG path values
- **D-12:** Create test data via UI first (dashboard interactions), then navigate to history page to verify data appears in charts -- tests the full pipeline
- **D-13:** AI endpoints mocked via `page.route()` (existing pattern in intake-logs + medication-wizard)
- **D-14:** Dual webServer config: dev server locally (`pnpm run dev`), production build in CI (`pnpm build && pnpm start`)
- **D-15:** Service workers blocked in Playwright config so `page.route()` mocks work against production builds

### Claude's Discretion
- Exact test case breakdown per section (how many tests, which edge cases)
- Test data values used in page.evaluate() seeding vs UI creation
- Timeout values for chart rendering assertions
- Whether to add Playwright test tags/annotations for filtering

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | Playwright runs in headless Chromium in CI with browser caching | Already complete (Phase 22); this phase preserves existing CI config |
| E2E-02 | E2E scenarios cover composable entry creation, medication dose logging lifecycle, and settings persistence | Already partially complete; this phase expands coverage to ALL app sections |
| E2E-03 | E2E tests run against production build in CI | Already complete (Phase 22); dual webServer config preserved |
| (Phase 26 scope) | Comprehensive per-route E2E coverage | All research findings below enable this -- existing patterns, card structures, route analysis |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 (installed) | E2E test framework | Already installed and configured; latest is 1.59.1 but upgrade unnecessary for this phase |
| Playwright Chromium | (bundled) | Headless browser | Configured in playwright.config.ts with caching in CI |

### Supporting
No new packages needed. All testing uses existing Playwright APIs and project conventions.

**Installation:** None required -- all dependencies already present.

## Architecture Patterns

### Current E2E File Structure (before this phase)
```
e2e/
  auth.setup.ts           # Privy headless login, saves storage state
  auth-bypass.spec.ts     # Auth smoke test (1 test)
  intake-logs.spec.ts     # Water/salt + AI food + liquid preset (3 tests)
  medication-wizard.spec.ts  # Wizard creation + dose logging (2 tests)
  settings.spec.ts        # Theme + day-start persistence (2 tests)
  .auth/
    user.json             # Saved auth state (gitignored)
```

### Target E2E File Structure (after this phase)
```
e2e/
  auth.setup.ts           # Unchanged -- Privy headless login setup project
  auth.spec.ts            # Renamed from auth-bypass.spec.ts, expanded with lifecycle tests
  dashboard.spec.ts       # Renamed from intake-logs.spec.ts, expanded with all dashboard cards
  medications.spec.ts     # Renamed from medication-wizard.spec.ts, expanded
  history.spec.ts         # NEW -- analytics page tests (note: route is /analytics, not /history)
  settings.spec.ts        # Expanded with backup/restore, account section
  .auth/
    user.json             # Unchanged
```

### Pattern 1: Section ID Targeting for Dashboard Cards
**What:** Each dashboard card is wrapped in a div with a unique `id` attribute.
**When to use:** All dashboard card tests.
**Available section IDs:**
- `#section-water` -- LiquidsCard (water tab + coffee/liquids tabs)
- `#section-food-salt` -- FoodSaltCard (food + salt entry with AI parse)
- `#section-bp` -- BloodPressureCard (systolic/diastolic/HR form)
- `#section-weight` -- WeightCard (increment/decrement + record)
- `#section-urination` -- UrinationCard (quick-log buttons: Small/Medium/Large)
- `#section-defecation` -- DefecationCard (quick-log buttons: Small/Medium/Large)

**Example:**
```typescript
// Source: existing pattern from e2e/intake-logs.spec.ts
const bpCard = page.locator('#section-bp');
await bpCard.locator('#systolic').fill('120');
await bpCard.locator('#diastolic').fill('80');
await bpCard.locator('button:has-text("Record Reading")').click();
await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();
```

### Pattern 2: AI Endpoint Mocking via page.route()
**What:** Intercept API calls with mock responses to avoid needing real API keys in tests.
**When to use:** Any test involving AI features (food parse, medicine search, substance lookup).
**Endpoints to mock:**
- `POST /api/ai/parse` -- Food/drink nutritional parsing
- `POST /api/ai/medicine-search` -- Medicine lookup
- `POST /api/ai/substance-lookup` -- Substance enrichment (used by liquids)

**Example:**
```typescript
// Source: existing pattern from e2e/intake-logs.spec.ts
await page.route('/api/ai/parse', async route => {
  const json = {
    water: 200,
    salt: 450,
    reasoning: 'Bowl of soup estimated at 200ml water, 450mg sodium'
  };
  await route.fulfill({ json });
});
```

### Pattern 3: Toast Assertion for Action Confirmation
**What:** After submitting data, verify success via toast messages.
**When to use:** Every card submission test.
**Known toast messages (from component analysis):**
- Water: "Water intake recorded"
- Salt/Sodium: "Sodium intake recorded"
- Food (AI): "Food logged"
- Blood Pressure: "Blood pressure recorded"
- Weight: "Weight recorded"
- Urination: "Logged" (description: "Urination ({amount}) recorded")
- Defecation: "Logged" (description: "Defecation ({amount}) recorded")

**Example:**
```typescript
// Source: existing pattern, exact: true avoids aria-live duplication
await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();
```

### Pattern 4: Quick-Log Buttons for Urination/Defecation
**What:** Both urination and defecation cards have a 3-button grid for quick logging (Small/Medium/Large).
**When to use:** Tests for urination and defecation cards.
**Example:**
```typescript
const urinationCard = page.locator('#section-urination');
await urinationCard.locator('button', { hasText: 'Medium' }).click();
// Toast appears with "Logged" title
await expect(page.getByText('Logged', { exact: true })).toBeVisible();
```

### Pattern 5: Radix Select Interaction
**What:** Settings page uses Radix UI Select components that render options in portals.
**When to use:** Settings tests involving dropdowns (theme, day-start).
**Example:**
```typescript
// Source: existing pattern from e2e/settings.spec.ts
await page.locator('#theme').click();
await page.locator('[role="option"]', { hasText: 'Dark' }).click();
```

### Pattern 6: Navigation Between Routes
**What:** App uses button-based navigation in AppHeader (not anchor links). Navigation items are icon buttons.
**When to use:** Any test that needs to navigate between pages.
**Routes and labels:**
- `/` -- "Intake" (icon: Droplets)
- `/medications` -- "Meds" (icon: Pill)
- `/analytics` -- "Analytics" (icon: BarChart3)
- `/settings` -- "Settings" (icon: Settings)

**Example:**
```typescript
// Navigate via header buttons using aria-label or direct goto
await page.goto('/analytics');
// OR use the nav button (but page.goto is more reliable)
```

### Pattern 7: Privy Auth Lifecycle Testing
**What:** Test logout and re-login flow using Privy's E2E bridge.
**Critical finding:** The `__privyE2E` bridge is only available when Privy SDK is loaded. After logout, the auth guard shows a "Sign In" button that opens Privy's modal -- but E2E tests use the headless bridge, not the modal.
**Approach for logout test:** Navigate to settings, click "Sign Out", verify redirected to login prompt (auth guard with "Sign in Required" text). For re-login, use the `__privyE2E` bridge pattern from auth.setup.ts.

**Example:**
```typescript
// Logout
await page.goto('/settings');
await page.locator('button', { hasText: 'Sign Out' }).click();
// Verify auth guard appears
await expect(page.locator('text=Sign in Required')).toBeVisible();
```

### Pattern 8: Analytics Chart Verification (D-11 compliant)
**What:** Verify Recharts SVG containers render without asserting path values.
**When to use:** History/analytics page tests.
**Key insight:** Recharts renders SVG inside `ResponsiveContainer`. The analytics page has 4 tabs: Records, Insights, Correlations, Titration. Records tab shows a list, not charts. Charts appear in Insights (bar/line charts) and Correlations (scatter/bar charts).
**Important:** The `/history` route REDIRECTS to `/analytics` -- tests should navigate to `/analytics` directly.

**Example:**
```typescript
await page.goto('/analytics');
// Verify Records tab loads
await expect(page.locator('[role="tab"]', { hasText: 'Records' })).toBeVisible();
// Switch to a chart tab
await page.locator('[role="tab"]', { hasText: 'Insights' }).click();
// Verify SVG container renders (DO NOT assert path values per D-11)
await expect(page.locator('.recharts-responsive-container svg')).toBeVisible({ timeout: 10000 });
```

### Anti-Patterns to Avoid
- **Asserting Recharts SVG path values:** SVG paths are non-deterministic (D-11). Assert container presence, legends, labels only.
- **Seeding data via IndexedDB/page.evaluate() when UI creation is specified:** D-12 requires data creation via UI first, then navigating to history to verify pipeline.
- **Using CSS selectors for interactive elements:** Prefer `getByRole()`, `getByText()`, section IDs, and `locator()` with `hasText`.
- **Testing auth with Privy modal UI:** Use the `__privyE2E` headless bridge, never interact with Privy's iframe/modal.
- **Forgetting `{ exact: true }` on toast assertions:** Toast messages appear twice (visible + aria-live region). Use `exact: true` to avoid double-match flakiness.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication state | Custom cookie/token manipulation | Playwright setup project + storageState | Auth state sharing is built into Playwright's project dependencies |
| API mocking | Custom mock server or intercept library | `page.route()` | Native Playwright API, works with service workers blocked |
| Waiting for elements | `page.waitForTimeout()` or manual sleep | `expect(locator).toBeVisible()` with web-first assertions | Auto-retries with configurable timeout, no flaky sleeps |
| Page navigation | Clicking through menus for setup | `page.goto('/route')` | Direct navigation is faster and more reliable for test setup |
| Test data cleanup | Manual IndexedDB clearing between tests | Fresh browser context per test (Playwright default) | Each test gets a clean IndexedDB since contexts are isolated |

**Key insight:** Playwright's built-in web-first assertions (`toBeVisible()`, `toContainText()`, `toHaveAttribute()`) handle all waiting automatically. Never use manual timeouts for element appearance.

## Common Pitfalls

### Pitfall 1: History Route Redirects to Analytics
**What goes wrong:** Tests navigate to `/history` and get unexpected behavior or flaky redirects.
**Why it happens:** `src/app/history/page.tsx` contains `redirect("/analytics")` -- it's a server-side redirect.
**How to avoid:** Always navigate to `/analytics` directly in history/chart tests. The "history" concept in CONTEXT.md D-06/D-11/D-12 maps to the `/analytics` route.
**Warning signs:** Tests that `goto('/history')` may work but add unnecessary redirect latency.

### Pitfall 2: Toast Double-Match from Aria-Live Region
**What goes wrong:** `getByText('Blood pressure recorded')` matches twice -- the visible toast AND its aria-live duplicate.
**Why it happens:** Accessible toast implementations duplicate text in a live region for screen readers.
**How to avoid:** Use `{ exact: true }` on toast text assertions, or use `.first()` when appropriate.
**Warning signs:** "strict mode violation" errors from Playwright when matching toast text.

### Pitfall 3: Weight Card Pre-fill Timing
**What goes wrong:** Weight card shows "--" or "70.0" briefly before real value loads.
**Why it happens:** `useEffect` pre-fills pendingWeight from latest record with a 200ms delay fallback to 70.
**How to avoid:** When testing weight recording, wait for the card to fully load before asserting the displayed value. The "Record Weight" button text is a reliable indicator the card is ready.
**Warning signs:** Assertions on weight value fail intermittently due to timing.

### Pitfall 4: Medication Tabs Name Collision
**What goes wrong:** `page.locator('button', { hasText: 'Meds' })` matches both the global nav button AND the medication page's tab bar button.
**Why it happens:** The AppHeader has a "Meds" nav icon, and the medication page has a MedTabBar with its own "Meds" button.
**How to avoid:** Use `nth(1)` for the tab bar button (as done in existing medication-wizard.spec.ts), or use `page.goto('/medications')` for navigation instead of clicking the nav button.
**Warning signs:** Wrong button clicked, unexpected navigation instead of tab switch.

### Pitfall 5: Recharts Chart Rendering Timeout
**What goes wrong:** Chart SVG elements not found because Recharts renders asynchronously and needs data.
**Why it happens:** Charts depend on analytics hooks which query Dexie. With no data, some chart sections show "no data" states instead of SVG.
**How to avoid:** Per D-12, create test data via UI first (log entries on dashboard), then navigate to analytics. Use generous timeouts (10-15s) for chart container assertions. Check for both "no data" empty states and SVG containers.
**Warning signs:** Tests pass locally but fail in CI due to slower rendering.

### Pitfall 6: Auth Lifecycle Test Requires Re-authentication
**What goes wrong:** After logout, the `__privyE2E` bridge is no longer available because Privy SDK re-initializes.
**Why it happens:** Logging out tears down the Privy session. The E2E bridge (`__privyE2E`) is set up in a useEffect inside PrivyProvider, which re-runs when the provider re-mounts.
**How to avoid:** After logout, wait for the page to fully reload/re-render the auth guard. Then wait for `__privyE2E` to become available again before calling `sendCode`/`loginWithCode`.
**Warning signs:** "Cannot read property 'sendCode' of null" errors after logout.

### Pitfall 7: Whitelist Rejection Test Complexity
**What goes wrong:** Testing D-09 (whitelist rejection with invalid email) requires a second Privy test account that is NOT on the ALLOWED_EMAILS whitelist.
**Why it happens:** Whitelist enforcement happens server-side on API calls, not on Privy login itself. Privy authenticates the user, but API routes check ALLOWED_EMAILS.
**How to avoid:** The whitelist check is server-side only (in `src/lib/privy-server.ts`). An unlisted email CAN log in via Privy but will get 403 on API calls. Testing this requires either: (a) a second test email not in ALLOWED_EMAILS, or (b) mocking the server-side whitelist check. Consider testing this as an API-level smoke test rather than full UI flow, or mark as manual-only if no second test account is available.
**Warning signs:** Need additional Privy test credentials to properly test this scenario.

## Code Examples

Verified patterns from existing E2E files and component source code:

### Blood Pressure Card Test
```typescript
// Source: Derived from src/components/blood-pressure-card.tsx component analysis
test('should record a blood pressure reading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#section-bp')).toBeVisible();

  const bpCard = page.locator('#section-bp');
  await bpCard.locator('#systolic').fill('120');
  await bpCard.locator('#diastolic').fill('80');
  await bpCard.locator('button:has-text("Record Reading")').click();

  await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();
});
```

### Weight Card Test
```typescript
// Source: Derived from src/components/weight-card.tsx component analysis
test('should record a weight entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#section-weight')).toBeVisible();

  const weightCard = page.locator('#section-weight');
  // Wait for card to initialize (shows value or --)
  await expect(weightCard.locator('button:has-text("Record Weight")')).toBeVisible();
  await weightCard.locator('button:has-text("Record Weight")').click();

  await expect(page.getByText('Weight recorded', { exact: true })).toBeVisible();
});
```

### Urination Quick-Log Test
```typescript
// Source: Derived from src/components/urination-card.tsx + constants.ts
test('should quick-log urination', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#section-urination');
  await card.scrollIntoViewIfNeeded();

  // Quick-log buttons: Small, Medium, Large
  await card.locator('button', { hasText: 'Medium' }).click();
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
});
```

### Analytics Page Tab Navigation
```typescript
// Source: Derived from src/app/analytics/page.tsx
test('should navigate analytics tabs', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.locator('text=Analytics')).toBeVisible();

  // Verify all 4 tabs present
  for (const tab of ['Records', 'Insights', 'Correlations', 'Titration']) {
    await expect(page.locator('[role="tab"]', { hasText: tab })).toBeVisible();
  }

  // Switch tabs
  await page.locator('[role="tab"]', { hasText: 'Insights' }).click();
  // Insights tab renders with or without data
  await expect(page.locator('[role="tabpanel"]')).toBeVisible();
});
```

### Full Pipeline: Dashboard to Analytics (D-12)
```typescript
// Source: Pattern combining existing test patterns
test('should show recorded data in analytics', async ({ page }) => {
  // Step 1: Create data via dashboard UI
  await page.goto('/');
  const bpCard = page.locator('#section-bp');
  await bpCard.locator('#systolic').fill('130');
  await bpCard.locator('#diastolic').fill('85');
  await bpCard.locator('button:has-text("Record Reading")').click();
  await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();

  // Step 2: Navigate to analytics
  await page.goto('/analytics');
  // Records tab is default
  await expect(page.locator('[role="tab"]', { hasText: 'Records' })).toBeVisible();
  // Verify the recorded BP appears in the records list
  await expect(page.locator('text=130/85')).toBeVisible({ timeout: 10000 });
});
```

### Auth Lifecycle Test (D-08)
```typescript
// Source: Derived from auth-guard.tsx + account-section.tsx + auth.setup.ts patterns
test('should handle logout and re-login', async ({ page }) => {
  // Verify currently authenticated
  await page.goto('/');
  await expect(page.locator('#section-water')).toBeVisible();

  // Navigate to settings and logout
  await page.goto('/settings');
  await page.locator('button', { hasText: 'Sign Out' }).click();

  // Verify redirected to login prompt
  await expect(page.locator('text=Sign in Required')).toBeVisible({ timeout: 15000 });

  // Re-authenticate via Privy E2E bridge
  const email = process.env.PRIVY_TEST_EMAIL!;
  const otp = process.env.PRIVY_TEST_OTP!;

  await page.waitForFunction(
    () => (window as any).__privyE2E != null,
    { timeout: 30000 },
  );

  await page.evaluate(async (e: string) => {
    await (window as any).__privyE2E.sendCode(e);
  }, email);

  await page.evaluate(async (code: string) => {
    await (window as any).__privyE2E.loginWithCode(code);
  }, otp);

  // Verify dashboard returns
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 15000 });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LOCAL_AGENT_MODE bypass | Privy test account (fixed OTP) | Quick task 260330-131 | Auth tests now exercise real Privy flow |
| Per-test login | Setup project + storageState | Phase 22 | All tests share authenticated state, faster suite |
| Dev server in CI | Production build in CI | Phase 22 | E2E tests catch prod-only regressions |

**Deprecated/outdated:**
- `LOCAL_AGENT_MODE`: Removed in quick task 260330-131. All auth uses Privy test credentials now.

## Project Constraints (from CLAUDE.md)

- Package manager: **pnpm** (enforced via preinstall hook)
- E2E command: `pnpm test:e2e` (runs `playwright test`)
- Privy auth with test account: `PRIVY_TEST_EMAIL` / `PRIVY_TEST_OTP` env vars
- All data in IndexedDB via Dexie.js (no server-side user data)
- Path alias: `@/*` maps to `src/*`
- Never start the dev server; let user run `pnpm dev` themselves (from MEMORY.md)

## Open Questions

1. **Whitelist rejection test (D-09)**
   - What we know: Whitelist enforcement is server-side in `privy-server.ts`. Privy will authenticate any valid test account, but API routes will return 403 for unlisted emails.
   - What's unclear: Whether a second Privy test account exists or can be created for testing rejection. The `.env.template` only has one set of test credentials.
   - Recommendation: Test at the API mock level -- mock the server response for an unauthorized user showing the appropriate error state. Alternatively, mark this as needing a second test account from the Privy dashboard. The client-side auth guard does NOT block unlisted users (it only checks `authenticated`, not whitelist). The rejection would only manifest on API calls.

2. **Daily Notes testing location**
   - What we know: DailyNotesDrawer is part of the medications page (opened from schedule view). Not a separate dashboard card.
   - What's unclear: Whether D-06 mention of "daily notes" means testing via medications.spec.ts (where it lives) or dashboard.spec.ts.
   - Recommendation: Test daily notes in `medications.spec.ts` since it's accessed from the medication schedule view.

3. **Analytics chart rendering without data**
   - What we know: Some analytics tabs show empty states ("No notable insights for this period") when there's no data. Charts only render SVG when data exists.
   - What's unclear: Exact behavior of each tab with zero data.
   - Recommendation: Test both empty states (verify "no data" messaging) AND populated states (create data via UI per D-12, then verify SVG renders).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.58.2 |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test e2e/dashboard.spec.ts` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01/D-02 | File renaming and route-mirror organization | structural | `ls e2e/*.spec.ts` (verify 5 files) | Wave 0 |
| D-05 (dashboard) | All dashboard cards: BP, weight, urination, defecation, liquids, food-salt | e2e | `npx playwright test e2e/dashboard.spec.ts` | Wave 0 (rename) |
| D-05 (medications) | Medication wizard + dose logging + daily notes | e2e | `npx playwright test e2e/medications.spec.ts` | Wave 0 (rename) |
| D-05 (history) | Analytics tabs, chart rendering, data pipeline | e2e | `npx playwright test e2e/history.spec.ts` | Wave 0 (new) |
| D-05 (settings) | Theme, day-start, backup/restore, account | e2e | `npx playwright test e2e/settings.spec.ts` | Exists (expand) |
| D-08 | Auth lifecycle: login/logout/re-login | e2e | `npx playwright test e2e/auth.spec.ts` | Wave 0 (rename) |
| D-09 | Whitelist rejection | e2e/manual | `npx playwright test e2e/auth.spec.ts` | Wave 0 |
| D-10 | Privy CI integration | CI | GitHub Actions E2E job | Exists |
| D-11/D-12 | Chart rendering + full data pipeline | e2e | `npx playwright test e2e/history.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/{changed-file}.spec.ts`
- **Per wave merge:** `pnpm test:e2e` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Rename `e2e/auth-bypass.spec.ts` to `e2e/auth.spec.ts`
- [ ] Rename `e2e/intake-logs.spec.ts` to `e2e/dashboard.spec.ts`
- [ ] Rename `e2e/medication-wizard.spec.ts` to `e2e/medications.spec.ts`
- [ ] Create `e2e/history.spec.ts` (new file for analytics page tests)

## Detailed Component Analysis for Test Planning

### Dashboard Page (`/`) -- 6 testable card sections

| Card | Section ID | Submit Button Text | Success Toast | Input Method |
|------|-----------|-------------------|---------------|-------------|
| Liquids (Water) | `#section-water` | "Confirm Entry" | "Water intake recorded" | Pre-filled amount, just confirm |
| Liquids (Coffee) | `#section-water` | "Log Entry" | matches `/recorded/i` | Tab to Coffee, select preset, log |
| Food/Salt | `#section-food-salt` | "Confirm Entry" / "Confirm All" | "Sodium intake recorded" / "Food logged" | Direct confirm or AI parse |
| Blood Pressure | `#section-bp` | "Record Reading" | "Blood pressure recorded" | Fill systolic + diastolic inputs |
| Weight | `#section-weight` | "Record Weight" | "Weight recorded" | Increment/decrement or use default |
| Urination | `#section-urination` | "Small"/"Medium"/"Large" | "Logged" | Quick-log buttons |
| Defecation | `#section-defecation` | "Small"/"Medium"/"Large" | "Logged" | Quick-log buttons |

### Medications Page (`/medications`) -- 5 tab views

| Tab | Button Text | Content |
|-----|-------------|---------|
| Schedule | "Schedule" | WeekDaySelector + ScheduleView with dose slots |
| Medications | "Meds" | CompoundList with medication cards |
| Prescriptions | "Prescriptions" | PrescriptionsView |
| Titrations | "Titrations" | TitrationsView |
| Settings | "Settings" | MedicationSettingsView |

### Analytics Page (`/analytics`) -- 4 tabs

| Tab | Content | Data Dependency |
|-----|---------|-----------------|
| Records | RecordsTab -- filtered list of all records | Shows records if data exists, empty state otherwise |
| Insights | InsightsTab -- insight banners + drill-down charts | Shows "No notable insights" if no data, charts if data exists |
| Correlations | CorrelationsTab -- correlation analysis with charts | Requires multiple data points |
| Titration | TitrationTab -- titration progress | Requires active titration plan |

### Settings Page (`/settings`) -- 11 sections

| Section | Component | Key Interactions |
|---------|-----------|------------------|
| Account | AccountSection | Shows email, "Sign Out" button |
| Day Settings | DaySettingsSection | Day-start-hour select |
| Water Settings | WaterSettingsSection | Water limit config |
| Salt Settings | SaltSettingsSection | Salt limit config |
| Substance Settings | SubstanceSettingsSection | Substance tracking config |
| Appearance | AppearanceSection | Theme select (Light/Dark/System) |
| Quick Nav | QuickNavSection | Toggle quick nav footer |
| Data Management | DataManagementSection | Export/Import/Clear All |
| Privacy & Security | PrivacySecuritySection | Privacy settings |
| Permissions | PermissionsSection | Notification permissions |
| App Updates | AppUpdatesSection | Update checker |

## Sources

### Primary (HIGH confidence)
- Existing E2E files: `e2e/auth-bypass.spec.ts`, `e2e/intake-logs.spec.ts`, `e2e/medication-wizard.spec.ts`, `e2e/settings.spec.ts`, `e2e/auth.setup.ts`
- Playwright config: `playwright.config.ts`
- App source: `src/app/page.tsx`, `src/app/medications/page.tsx`, `src/app/analytics/page.tsx`, `src/app/settings/page.tsx`
- Component source: All dashboard card components, settings sections, analytics tabs
- CI config: `.github/workflows/ci.yml` (e2e job configuration)
- Phase 22 context: `.planning/phases/22-e2e-testing-in-ci/22-CONTEXT.md`
- Phase 26 context: `.planning/phases/26-comprehensive-e2e-test-coverage/26-CONTEXT.md`

### Secondary (MEDIUM confidence)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) -- Official locator strategies, assertion patterns, test isolation

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all existing Playwright infrastructure
- Architecture: HIGH -- comprehensive analysis of all app routes, section IDs, toast messages, and interaction patterns from source code
- Pitfalls: HIGH -- identified from existing test patterns and component behavior analysis (toast double-match, redirect, tab collision, chart timing)
- Whitelist rejection testing: MEDIUM -- approach depends on availability of second test account

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable -- Playwright config and app routes unlikely to change significantly)
