# Phase 22: E2E Testing in CI - Research

**Researched:** 2026-03-28
**Domain:** Playwright E2E testing in GitHub Actions CI, production build testing
**Confidence:** HIGH

## Summary

Phase 22 adds Playwright E2E tests to the existing CI pipeline. The project already has Playwright 1.58.2 installed with three spec files (`auth-bypass`, `intake-logs`, `medication-wizard`), a working `playwright.config.ts`, and a `test:e2e` script. The CI workflow (`ci.yml`) has six existing jobs plus a `ci-pass` gate. The work involves: (1) expanding existing test files with composable entry and dose logging scenarios, (2) adding a settings persistence spec, (3) making `playwright.config.ts` CI-aware with dual webServer configs, and (4) adding an `e2e` job to `ci.yml` with trace artifact upload.

A critical discovery: the production build enables PWA service workers via `next-pwa`, and service workers intercept requests **before** `page.route()` can see them. This means AI API mocks via `page.route()` would silently fail in production builds unless `serviceWorkers: 'block'` is added to the Playwright config. This is the single most important pitfall for this phase.

**Primary recommendation:** Add `serviceWorkers: 'block'` to Playwright's `use` config, switch `webServer` command based on `process.env.CI`, and keep browser install simple with `npx playwright install chromium --with-deps` (no caching -- official docs explicitly recommend against it).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Composable entry test covers both food and liquid flows. Food: enter description -> mock AI parse -> verify preview with linked entries (intake + eating + salt) -> confirm. Liquid: select preset (e.g. coffee) -> verify substance auto-calc -> confirm
- **D-02:** Medication dose logging lifecycle: extend existing wizard test to create medication -> navigate to medication detail -> log a dose for a scheduled time -> verify dose recorded in history -> verify inventory decremented
- **D-03:** Settings persistence: test theme toggle (light->dark) and day-start-hour change, reload page, verify both persist. Covers Zustand/localStorage persistence mechanism
- **D-04:** Dual config via `process.env.CI` in `playwright.config.ts`. Local runs use dev server (`pnpm run dev`) for fast iteration. CI runs use production build (`pnpm build && pnpm start`) to catch prod-only regressions
- **D-05:** Evolve existing test files to align with E2E-02 requirements: `auth-bypass.spec.ts` (keep as-is), `intake-logs.spec.ts` (expand), `medication-wizard.spec.ts` (expand), `settings.spec.ts` (new)
- **D-06:** Flat `e2e/` directory (no subdirectories) -- 4 spec files total
- **D-07:** Independent E2E job in `ci.yml` -- runs its own `pnpm build && pnpm start` internally via Playwright's webServer config. Runs in parallel with all other jobs
- **D-08:** Add `e2e` job to `ci-pass` gate's `needs` list so it blocks merge like all other jobs
- **D-09:** Upload Playwright trace files as GitHub Actions artifacts on test failure only (`if: failure()`), 7-day retention. Current config already collects traces on first retry
- **D-10:** Browser caching via `npx playwright install chromium --with-deps` -- Playwright handles caching internally

### Claude's Discretion
- Playwright browser install caching strategy (actions/cache for ~/.cache/ms-playwright or let it download each time)
- Exact retry count in CI (currently 2 in playwright.config.ts, adjust if needed)
- Test timeout values
- Whether to add a dedicated `test:e2e:ci` script or use env detection in existing `test:e2e`
- Port for production server (3000 or different to avoid conflicts)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | Playwright runs in headless Chromium in CI with browser caching for fast startup | Playwright 1.58.2 already installed; `npx playwright install chromium --with-deps` is the standard approach. Official docs recommend against caching browser binaries (restore time ~= download time). CI job config pattern established. |
| E2E-02 | E2E scenarios cover composable entry creation, medication dose logging lifecycle, and settings persistence | Existing spec files provide foundation patterns (AI route mocking, wizard flow, toast assertions). Food section uses `/api/ai/parse` mock with `{water, salt, reasoning}` response. Settings persistence via next-themes localStorage key `"theme"` + Zustand key `"intake-tracker-settings"`. |
| E2E-03 | E2E tests run against production build (`pnpm build && pnpm start`) not dev server | Playwright `webServer` config supports CI-conditional command. Critical: must set `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` during build (inlined at build time). Must add `serviceWorkers: 'block'` to prevent PWA service worker from intercepting `page.route()` mocks. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced via preinstall hook)
- Existing command: `pnpm test:e2e` runs `playwright test`
- `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` bypasses auth for E2E testing
- Path alias: `@/*` -> `src/*`
- All data lives in IndexedDB via Dexie.js (client-side only)
- AI API routes handle server-side Claude API calls -- must be mocked in E2E

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E test framework | Already installed, latest stable |
| Chromium (Playwright) | bundled with 1.58.2 | Headless browser | Only browser project needs (single project in config) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| actions/upload-artifact | v4 | CI trace upload | On test failure for debugging |
| pnpm/action-setup | v5 | pnpm in CI | Already used in all CI jobs |
| actions/setup-node | v4 | Node.js in CI | Already used in all CI jobs |
| actions/checkout | v4 | Repo checkout | Already used in all CI jobs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| No browser caching | actions/cache for ~/.cache/ms-playwright | Official Playwright docs explicitly recommend against caching -- restore time comparable to download time, plus OS deps still needed |
| Port 3000 for prod server | Different port (e.g. 3001) | Unnecessary -- CI runs in isolated container, no port conflicts. Keep 3000 for consistency |
| Dedicated `test:e2e:ci` script | Env detection in existing `test:e2e` | Keep existing `test:e2e` script. Playwright already detects CI via `process.env.CI`. No new script needed |

**Installation:**
```bash
# No new packages needed -- @playwright/test already installed
# Browser install in CI:
npx playwright install chromium --with-deps
```

**Version verification:** `@playwright/test` 1.58.2 is the current latest on npm (verified 2026-03-28).

## Architecture Patterns

### Current vs Target Playwright Config

The existing `playwright.config.ts` has a single `webServer` pointing to `pnpm run dev`. The target adds CI-conditional switching:

```typescript
// playwright.config.ts - CI-aware webServer
webServer: process.env.CI
  ? {
      command: 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm build && NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm start',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 120 * 1000,
    }
  : {
      command: 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120 * 1000,
    },
```

### CI Job Pattern (matches existing jobs)

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v5
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - name: Install Playwright Chromium
      run: npx playwright install chromium --with-deps
    - name: Run E2E tests
      run: pnpm test:e2e
    - name: Upload test traces
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-traces
        path: test-results/
        retention-days: 7
```

### AI Route Mock Pattern (established)

```typescript
// From medication-wizard.spec.ts -- reuse for food parse
await page.route('/api/ai/parse', async route => {
  const json = {
    water: 200,
    salt: 450,
    reasoning: 'Bowl of soup: ~200ml water, ~450mg sodium'
  };
  await route.fulfill({ json });
});
```

### Settings Persistence Test Pattern

```typescript
// Theme: next-themes stores in localStorage key "theme"
// Day start: Zustand stores in localStorage key "intake-tracker-settings"
// Test approach:
// 1. Navigate to /settings
// 2. Change theme (light -> dark) via Select component
// 3. Change day-start-hour via Select component
// 4. Reload page
// 5. Verify theme persisted (check <html> class contains "dark")
// 6. Verify day-start-hour persisted (check Select shows new value)
```

### Anti-Patterns to Avoid
- **Mocking at network level without blocking service workers:** In production builds, the PWA service worker intercepts fetch requests before `page.route()`. Always set `serviceWorkers: 'block'`
- **Setting `NEXT_PUBLIC_LOCAL_AGENT_MODE` only at runtime:** This env var is inlined by Next.js at build time. It must be set during `pnpm build`, not just during `pnpm start`
- **Using `reuseExistingServer: true` in CI:** CI should always start a fresh server to ensure clean test state. Use `reuseExistingServer: !process.env.CI` pattern

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser download in CI | Custom download/cache scripts | `npx playwright install chromium --with-deps` | Handles OS deps, version matching, architecture detection |
| CI-aware server switching | Custom shell scripts to detect CI | Playwright's `webServer` config with `process.env.CI` ternary | Built-in, waits for server ready, handles timeout/cleanup |
| Test failure artifacts | Custom log collection | `actions/upload-artifact@v4` with Playwright's `test-results/` | Standard GH Actions pattern, already contains traces |
| Auth bypass in tests | Test-specific auth mocking | `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` (set at build time) | Already established pattern, bypasses both Privy client and AuthGuard |

**Key insight:** Playwright's built-in `webServer` config handles the entire lifecycle (build, start, wait for ready, cleanup after tests). No need for separate build/start scripts.

## Common Pitfalls

### Pitfall 1: Service Worker Intercepts `page.route()` Mocks
**What goes wrong:** AI API mocks (food parse, medicine search, substance lookup) silently fail. Tests see network errors or unexpected responses because the PWA service worker handles the fetch before Playwright's route handler.
**Why it happens:** `next-pwa` is enabled in production builds (`process.env.NODE_ENV !== 'development'`). The service worker registers a fetch handler that intercepts all requests.
**How to avoid:** Add `serviceWorkers: 'block'` to Playwright's `use` config. This disables service workers entirely during tests.
**Warning signs:** Tests pass locally (dev mode, no SW) but fail in CI (production build, SW active). Network requests return cached/unexpected responses.

### Pitfall 2: `NEXT_PUBLIC_LOCAL_AGENT_MODE` Not Set at Build Time
**What goes wrong:** Auth guard shows login screen instead of app content. All tests fail with "Sign in Required" text visible.
**Why it happens:** `NEXT_PUBLIC_*` env vars are inlined by Next.js during `next build`. Setting them only at `next start` time has no effect on the client bundle.
**How to avoid:** Set `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` in the `pnpm build` command within the webServer config.
**Warning signs:** Auth bypass test (`auth-bypass.spec.ts`) fails in CI but passes locally.

### Pitfall 3: Server-Side Auth Rejects in Production Mode
**What goes wrong:** API route mocks work, but if any test accidentally hits a real API route, the server returns 401 because `LOCAL_AGENT_MODE` bypass is disabled in production (`NODE_ENV=production`).
**Why it happens:** `privy-server.ts` explicitly ignores `LOCAL_AGENT_MODE` when `NODE_ENV === 'production'` (line 76-78).
**How to avoid:** Mock ALL API routes that tests interact with via `page.route()`. Never let a test hit a real server endpoint in CI. The food parse, medicine search, and substance lookup routes must all be mocked.
**Warning signs:** Tests that work in dev but get 401 errors in CI production mode.

### Pitfall 4: Select Component Interaction in Playwright
**What goes wrong:** Clicking on shadcn/ui Select component doesn't open the dropdown or select the value.
**Why it happens:** shadcn/ui Select uses Radix UI which renders options in a portal (separate DOM element). Standard `click` + `getByText` may not find portal-rendered content.
**How to avoid:** Use `page.locator('[role="combobox"]')` to open the select, then `page.locator('[role="option"]')` to find options in the portal. Or use `selectOption` if the underlying element supports it.
**Warning signs:** Tests timeout waiting for Select options to appear.

### Pitfall 5: Theme Hydration Mismatch on Reload
**What goes wrong:** After page reload in E2E test, the theme class on `<html>` briefly shows wrong value due to SSR/hydration.
**Why it happens:** `next-themes` uses `suppressHydrationWarning` and adds theme class via script injection, but there can be a brief flash.
**How to avoid:** After `page.reload()`, wait for the `<html>` element to have the expected class. Use `await expect(page.locator('html')).toHaveClass(/dark/)` with Playwright's auto-retry.
**Warning signs:** Flaky theme assertion that sometimes passes, sometimes fails.

### Pitfall 6: Production Build Timeout in CI
**What goes wrong:** Playwright's `webServer` timeout expires before `pnpm build && pnpm start` completes.
**Why it happens:** Production build can take 30-60+ seconds. Default timeout is 60 seconds.
**How to avoid:** Set `timeout: 120 * 1000` (2 minutes) in the webServer config. Current config already has this.
**Warning signs:** CI job fails with "Server did not start" before tests run.

## Code Examples

### Food Composable Entry Flow (D-01 Food)

```typescript
// Mock AI parse API -- returns water + salt for composable preview
await page.route('/api/ai/parse', async route => {
  const json = {
    water: 200,
    salt: 450,
    reasoning: 'Bowl of soup estimated at 200ml water, 450mg sodium'
  };
  await route.fulfill({ json });
});

// Enter food description
const foodInput = page.locator('input[aria-label="Describe food for AI nutritional parsing"]');
await foodInput.fill('bowl of chicken soup');
await foodInput.press('Enter');

// Verify composable preview shows linked records
await expect(page.locator('text=Eating')).toBeVisible();
await expect(page.locator('text=Water')).toBeVisible();
await expect(page.locator('text=200 ml')).toBeVisible();
await expect(page.locator('text=Salt')).toBeVisible();
await expect(page.locator('text=450 mg')).toBeVisible();

// Confirm all
await page.click('button:has-text("Confirm All")');
await expect(page.locator('text=Food logged')).toBeVisible();
```

### Coffee Preset Flow (D-01 Liquid)

```typescript
// Navigate to Liquids card, Coffee tab
await page.locator('text=Liquids').first().scrollIntoViewIfNeeded();
// Click "Coffee" tab in the Liquids card
const coffeeTab = page.locator('[role="tablist"]').locator('text=Coffee');
await coffeeTab.click();

// Click a preset (e.g., "Espresso" if default presets exist)
await page.click('button:has-text("Espresso")');

// Verify substance auto-calc display shows calculated caffeine
await expect(page.locator('text=/\\d+ mg caffeine/')).toBeVisible();

// Log the entry
await page.click('button:has-text("Log Entry")');
await expect(page.locator('text=recorded')).toBeVisible();
```

### Theme + Day Start Persistence (D-03)

```typescript
// Navigate to settings
await page.goto('/settings');
await expect(page.locator('text=Appearance')).toBeVisible();

// Open theme select and change to dark
const themeSelect = page.locator('#theme');
await themeSelect.click();
await page.locator('[role="option"]', { hasText: 'Dark' }).click();

// Verify dark class applied
await expect(page.locator('html')).toHaveClass(/dark/);

// Change day-start-hour
const dayStartSelect = page.locator('#day-start');
await dayStartSelect.click();
await page.locator('[role="option"]', { hasText: '4:00 AM' }).click();

// Reload page
await page.reload();

// Verify theme persisted (html has dark class)
await expect(page.locator('html')).toHaveClass(/dark/);

// Verify day-start persisted (select shows the updated value)
await expect(page.locator('#day-start')).toContainText('4:00 AM');
```

### Dose Logging After Wizard (D-02)

```typescript
// After wizard creates medication (existing test pattern)...
// Navigate to Schedule tab to see today's doses
await page.click('button:has-text("Schedule")');

// Find the dose slot for the medication we just created
const doseSlot = page.locator('text=Aviolix').first();
await expect(doseSlot).toBeVisible();

// Click the dose slot to open detail dialog
await doseSlot.click();

// Click TAKE button in the dose detail drawer
await page.click('text=TAKE');

// Verify dose taken toast/confirmation
await expect(page.locator('text=taken')).toBeVisible();
```

### Updated Playwright Config (full)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    serviceWorkers: 'block',  // CRITICAL: prevent PWA SW from intercepting page.route() mocks
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm build && NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120 * 1000,
      }
    : {
        command: 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120 * 1000,
      },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cache Playwright browsers in CI | Don't cache (official recommendation) | Playwright docs updated | Simplifies CI config, no actions/cache needed |
| `actions/upload-artifact@v3` | `actions/upload-artifact@v4` | 2024 | New artifact backend, better performance |
| `actions/checkout@v3` | `actions/checkout@v4` (already used) | 2024 | Node.js 20 support |
| `reuseExistingServer: !process.env.CI` | Same pattern still recommended | Current | No change -- still the right approach |

**Deprecated/outdated:**
- `microsoft/playwright-github-action`: Deprecated in favor of `npx playwright install --with-deps` directly in workflow

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.58.2 |
| Config file | `playwright.config.ts` (exists) |
| Quick run command | `pnpm test:e2e` |
| Full suite command | `pnpm test:e2e` (same -- all 4 spec files) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-01 | Playwright runs in CI with Chromium | CI integration | GitHub Actions `ci.yml` e2e job | Partially (ci.yml exists, e2e job does not) |
| E2E-02a | Composable food entry (AI parse -> preview -> confirm) | E2E | `pnpm test:e2e e2e/intake-logs.spec.ts` | Exists, needs expansion |
| E2E-02b | Composable liquid entry (preset -> substance calc -> log) | E2E | `pnpm test:e2e e2e/intake-logs.spec.ts` | Exists, needs expansion |
| E2E-02c | Medication dose logging lifecycle | E2E | `pnpm test:e2e e2e/medication-wizard.spec.ts` | Exists, needs expansion |
| E2E-02d | Settings persistence (theme + day-start) | E2E | `pnpm test:e2e e2e/settings.spec.ts` | Does not exist |
| E2E-03 | Tests run against production build | CI integration | Playwright webServer CI config in `playwright.config.ts` | Partially (config exists, CI mode does not) |

### Sampling Rate
- **Per task commit:** `pnpm test:e2e` (runs all 4 spec files locally against dev server)
- **Per wave merge:** Same -- `pnpm test:e2e` locally
- **Phase gate:** Full E2E suite green in CI against production build

### Wave 0 Gaps
- [ ] `e2e/settings.spec.ts` -- covers E2E-02d (new file)
- [ ] `serviceWorkers: 'block'` in playwright.config.ts -- critical for production build test correctness
- [ ] CI-conditional `webServer` in playwright.config.ts -- needed for E2E-03

## Open Questions

1. **Coffee preset availability in clean state**
   - What we know: Coffee presets come from `DEFAULT_LIQUID_PRESETS` in the Zustand store, persisted to localStorage. Clean browser in E2E has no localStorage.
   - What's unclear: Does Zustand's `persist` middleware hydrate defaults on first load, making presets available immediately?
   - Recommendation: Verify in test that default presets render. If not, the liquid test may need to use AI lookup flow instead of preset selection. Zustand's persist middleware initializes with `defaultSettings` which includes `DEFAULT_LIQUID_PRESETS`, so presets should be available on first load.

2. **Medication schedule rendering for today**
   - What we know: After wizard creates a medication with a schedule, the schedule view shows dose slots for the current day. The test needs to interact with a dose slot.
   - What's unclear: The default schedule time from the wizard -- does it default to a specific time or require manual entry?
   - Recommendation: The wizard Step 5 (Schedule) likely has default time values. The test should verify the created medication appears in the schedule view for today and interact with its dose slot.

## Sources

### Primary (HIGH confidence)
- Playwright official docs: [CI Intro](https://playwright.dev/docs/ci-intro) -- GitHub Actions workflow template
- Playwright official docs: [CI Advanced](https://playwright.dev/docs/ci) -- **"Caching browser binaries is not recommended"** (explicit guidance)
- Playwright official docs: [Web Server](https://playwright.dev/docs/test-webserver) -- `reuseExistingServer: !process.env.CI` pattern
- Playwright official docs: [Service Workers](https://playwright.dev/docs/service-workers) -- `serviceWorkers: 'block'` option, SW intercepts before `page.route()`
- Source code: `src/lib/privy-server.ts` lines 74-81 -- production guard ignoring LOCAL_AGENT_MODE
- Source code: `src/components/auth-guard.tsx` line 21 -- client-side LOCAL_AGENT_MODE check (build-time inlined)
- Source code: `next.config.js` line 69 -- PWA enabled in production only
- Source code: `src/stores/settings-store.ts` line 278 -- localStorage key `"intake-tracker-settings"`
- next-themes [GitHub](https://github.com/pacocoursey/next-themes) -- default localStorage key is `"theme"`

### Secondary (MEDIUM confidence)
- npm registry: `@playwright/test` 1.58.2 is current latest (verified via `npm view`)
- GitHub Actions: `actions/upload-artifact@v4` is current stable

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed, versions verified against npm
- Architecture: HIGH -- extending existing patterns (CI job structure, Playwright config, AI mocking)
- Pitfalls: HIGH -- service worker interception verified against official Playwright docs and app source code

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- Playwright and GH Actions change slowly)
