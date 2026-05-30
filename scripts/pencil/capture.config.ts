import { loadEnvConfig } from '@next/env';
import { defineConfig } from '@playwright/test';

// Mirror playwright.config.ts: load .env.local etc. so globalSetup + webServer
// see real Neon Auth credentials.
loadEnvConfig(process.cwd());

/**
 * Dedicated Playwright config for the Pencil reference-screenshot capture.
 * Kept separate from playwright.config.ts so `pnpm test:e2e` never runs it and
 * vice-versa. Reuses the seeded-auth globalSetup and a running dev server.
 *
 * Run via: pnpm design:capture   (auto-starts the dev server if not running)
 */
export default defineConfig({
  testDir: __dirname,
  testMatch: 'capture-screenshots.ts',
  // Refresh the authenticated storage state before capturing.
  globalSetup: require.resolve('../../e2e/global-setup'),
  // Single worker: the two capture flows write distinct files but share the dev server.
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'playwright/.auth/user.json',
    // Mobile-first surface (iPhone-class). Matches the app's max-w-lg container.
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
    // v1 captures the light theme (Playwright default). Set CAPTURE_THEME=dark to flip.
    colorScheme: (process.env.CAPTURE_THEME as 'light' | 'dark') ?? 'light',
  },
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      NEON_AUTH_URL: process.env.NEON_AUTH_URL ?? '',
      NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET ?? '',
      NEON_AUTH_TEST_EMAIL: process.env.NEON_AUTH_TEST_EMAIL ?? '',
      NEON_AUTH_TEST_PASSWORD: process.env.NEON_AUTH_TEST_PASSWORD ?? '',
      ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? '',
      ENABLE_E2E_TEST_ROUTES: process.env.ENABLE_E2E_TEST_ROUTES ?? '',
    },
  },
});
