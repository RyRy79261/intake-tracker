import { test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WELCOME_SEEN_KEY } from '../../src/lib/constants';

/**
 * Captures reference screenshots of every app screen for the Pencil recreation.
 * Writes full-page PNGs to design/reference/ at a mobile viewport.
 *
 * Run via: pnpm design:capture
 *
 * Two flows:
 *  - authenticated screens (uses the seeded storageState from capture.config.ts)
 *  - auth screens (a fresh, logged-out context so /auth doesn't redirect away)
 *
 * Tab/overlay captures are best-effort (wrapped in try/catch) so a selector
 * drift never fails the whole run; the core route screenshots always land.
 */

const OUT = path.resolve(process.cwd(), 'design/reference');
fs.mkdirSync(OUT, { recursive: true });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // Let route-transition animations and recharts render settle.
  await page.waitForTimeout(800);
}

async function shot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  // eslint-disable-next-line no-console
  console.log(`captured ${name}.png`);
}

async function clickTab(page: Page, label: string, name: string) {
  try {
    await page
      .getByRole('tab', { name: new RegExp(label, 'i') })
      .first()
      .click({ timeout: 4000 });
    await shot(page, name);
  } catch {
    // eslint-disable-next-line no-console
    console.log(`skipped ${name} (tab "${label}" not found)`);
  }
}

test('capture authenticated screens', async ({ page }) => {
  // Belt-and-suspenders: suppress the first-run welcome modal.
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      /* ignore */
    }
  }, WELCOME_SEEN_KEY);

  // Dashboard
  await page.goto('/');
  await shot(page, '01-dashboard');

  // Medications — schedule (default) + each tab
  await page.goto('/medications');
  await shot(page, '02-medications-schedule');
  await clickTab(page, 'Medications', '03-medications-compounds');
  await clickTab(page, 'Prescriptions', '04-medications-prescriptions');
  await clickTab(page, 'Titrations', '04-medications-titrations');
  await clickTab(page, 'Settings', '04-medications-settings');

  // Analytics — summary (default) + each tab
  await page.goto('/analytics');
  await shot(page, '05-analytics-summary');
  await clickTab(page, 'Correlations', '05-analytics-correlations');
  await clickTab(page, 'Records', '06-analytics-records');
  await clickTab(page, 'Titration', '06-analytics-titration');

  // Settings
  await page.goto('/settings');
  await shot(page, '07-settings');

  // Profile
  await page.goto('/profile');
  await shot(page, '08-profile');

  // Help index + first article (best-effort)
  await page.goto('/help');
  await shot(page, '11-help-index');
  try {
    await page
      .getByRole('link')
      .filter({ hasText: /.+/ })
      .first()
      .click({ timeout: 4000 });
    await page.waitForURL(/\/help\/.+/, { timeout: 6000 });
    await shot(page, '12-help-article');
  } catch {
    // eslint-disable-next-line no-console
    console.log('skipped 12-help-article (no article link found)');
  }

  // Best-effort overlay capture on the dashboard: history drawer.
  await page.goto('/');
  await settle(page);
  try {
    await page
      .getByRole('button', { name: /history/i })
      .first()
      .click({ timeout: 3000 });
    await shot(page, '13-history-drawer');
    await page.keyboard.press('Escape');
  } catch {
    // eslint-disable-next-line no-console
    console.log('skipped 13-history-drawer (trigger not found)');
  }
});

test('capture auth screens (logged out)', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    colorScheme: (process.env.CAPTURE_THEME as 'light' | 'dark') ?? 'light',
  });
  await context.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      /* ignore */
    }
  }, WELCOME_SEEN_KEY);
  const page = await context.newPage();

  const authRoutes: ReadonlyArray<readonly [string, string]> = [
    ['/auth', '09-auth-signin'],
    ['/auth/sign-up', '10-auth-signup'],
    ['/auth/forgot-password', '10-auth-forgot-password'],
    ['/auth/reset-password', '10-auth-reset-password'],
  ];
  for (const [route, name] of authRoutes) {
    await page.goto(route);
    await shot(page, name);
  }

  await context.close();
});
