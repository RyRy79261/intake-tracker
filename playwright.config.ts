import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Phase 41: globalSetup signs in once via /auth and persists session */
  globalSetup: require.resolve('./e2e/global-setup'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  ...(process.env.CI ? { workers: 1 } : {}),
  /* Dev server compiles routes on first hit (~20s each); allow headroom */
  timeout: process.env.CI ? 30_000 : 60_000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Reuse the authenticated session captured by globalSetup */
    storageState: 'playwright/.auth/user.json',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Block service workers so page.route() mocks work against production builds */
    serviceWorkers: 'block',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? {
        command: 'pnpm build && pnpm start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? '',
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? '',
          BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? '',
          NEON_AUTH_URL: process.env.NEON_AUTH_URL ?? '',
          NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET ?? '',
          NEON_AUTH_TEST_EMAIL: process.env.NEON_AUTH_TEST_EMAIL ?? '',
          NEON_AUTH_TEST_PASSWORD: process.env.NEON_AUTH_TEST_PASSWORD ?? '',
          ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? '',
        },
      }
    : {
        command: 'pnpm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120 * 1000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? '',
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? '',
          BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? '',
          NEON_AUTH_URL: process.env.NEON_AUTH_URL ?? '',
          NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET ?? '',
          NEON_AUTH_TEST_EMAIL: process.env.NEON_AUTH_TEST_EMAIL ?? '',
          NEON_AUTH_TEST_PASSWORD: process.env.NEON_AUTH_TEST_PASSWORD ?? '',
          ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? '',
        },
      },
});
