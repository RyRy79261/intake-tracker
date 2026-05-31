import { test, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WELCOME_SEEN_KEY } from '../../src/lib/constants';

/**
 * Captures CLEAN, POPULATED reference screenshots of every app page.
 * Writes PNGs to design/reference/ at a mobile viewport.
 *
 * Run via: pnpm design:capture   (CAPTURE_THEME=dark for dark mode)
 *
 * Strategy:
 *  - Seed real data through the UI (same flows as the e2e specs): log
 *    water/salt/BP/weight/urination/defecation, and add a prescription via the
 *    medication wizard (AI search mocked). The app is local-first, so this fills
 *    IndexedDB and every downstream page (dashboard, analytics, medications).
 *  - Then capture: dismiss intro dialogs/banners, suppress `position:fixed`
 *    floating bars (so they don't render through the page), and grab the
 *    populated pages + the inline edit forms + the wizard.
 */

const OUT = path.resolve(process.cwd(), 'design/reference');
fs.mkdirSync(OUT, { recursive: true });

// Tailwind `.fixed` is on every floating overlay (quick-nav footer, voice bar,
// sync banner, meds FAB). Hide them for clean full-page body captures.
const HIDE_FIXED = '[class~="fixed"]{display:none !important;}';

const MEDICINE_SEARCH_MOCK = {
  brandNames: ['Aviolix'],
  genericName: 'Aviolix Compound',
  dosageStrengths: ['75mg'],
  commonIndications: ['Hypertension'],
  foodInstruction: 'after',
  foodNote: 'Take with food',
  pillColor: 'purple',
  pillShape: 'round',
  pillDescription: 'A purple reddish round pill',
  drugClass: 'Test Class',
};

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function tryClick(loc: Locator, timeout = 4000): Promise<boolean> {
  try {
    await loc.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function dismissOverlays(page: Page) {
  for (const name of [/got it/i, /^done$/i, /dismiss/i, /^close$/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
}

/** Clean full-page body shot: overlays dismissed, fixed bars hidden. */
async function shot(page: Page, name: string) {
  await settle(page);
  await dismissOverlays(page);
  await settle(page);
  await page.addStyleTag({ content: HIDE_FIXED }).catch(() => {});
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  // eslint-disable-next-line no-console
  console.log(`captured ${name}.png`);
}

/** Raw full-page shot WITHOUT dismissing/hiding — for dialogs/drawers (wizard). */
async function rawShot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  // eslint-disable-next-line no-console
  console.log(`captured ${name}.png (dialog)`);
}

/** Viewport shot with fixed chrome visible (header + floating bottom bar), scrolled to top. */
async function chromeShot(page: Page, name: string) {
  await settle(page);
  await dismissOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`captured ${name}.png (chrome)`);
}

async function clickTab(page: Page, label: string, name: string) {
  const re = new RegExp(`^\\s*${label}\\s*$`, 'i');
  for (const locator of [
    page.getByRole('tab', { name: re }),
    page.getByRole('button', { name: re }),
    page.getByText(re, { exact: false }),
  ]) {
    try {
      const el = locator.first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ timeout: 3000 });
        await shot(page, name);
        return;
      }
    } catch {
      /* next locator */
    }
  }
  // eslint-disable-next-line no-console
  console.log(`skipped ${name} (tab "${label}" not found)`);
}

/** Open the inline edit form on a card's first recent entry, screenshot the card. */
async function captureEdit(page: Page, cardSel: string, name: string) {
  try {
    const card = page.locator(cardSel);
    await card.scrollIntoViewIfNeeded();
    const row = card.locator('div[role="button"][tabindex="0"]').first();
    if (await row.isVisible({ timeout: 2500 }).catch(() => false)) {
      await row.click();
      await page.waitForTimeout(500);
      await card.screenshot({ path: path.join(OUT, `${name}.png`) });
      // eslint-disable-next-line no-console
      console.log(`captured ${name}.png (inline edit)`);
      await tryClick(card.getByRole('button', { name: /^cancel$/i }), 1500);
    } else {
      // eslint-disable-next-line no-console
      console.log(`skipped ${name} (no recent entry)`);
    }
  } catch {
    // eslint-disable-next-line no-console
    console.log(`skipped ${name} (edit capture failed)`);
  }
}

async function seedDashboard(page: Page) {
  await page.goto('/');
  await settle(page);

  // Water — log a few presets for a real total + recent entries.
  for (let i = 0; i < 3; i++) {
    await tryClick(page.locator('#section-water').locator('button', { hasText: 'Confirm Entry' }));
    await page.waitForTimeout(500);
  }

  // Salt / food — sodium amount, then record.
  try {
    const food = page.locator('#section-food-salt');
    await food.scrollIntoViewIfNeeded();
    await food.locator('#eating-sodium').fill('850');
    await tryClick(food.locator('button', { hasText: 'Record with details' }));
    await page.waitForTimeout(500);
  } catch {
    /* best effort */
  }

  // Blood pressure — two readings (different values) for a small trend.
  for (const [s, d] of [['128', '82'], ['134', '86']] as const) {
    try {
      const bp = page.locator('#section-bp');
      await bp.scrollIntoViewIfNeeded();
      await bp.locator('#systolic').fill(s);
      await bp.locator('#diastolic').fill(d);
      await tryClick(bp.locator('button', { hasText: 'Record Reading' }));
      await page.waitForTimeout(600);
    } catch {
      /* best effort */
    }
  }

  // Weight — set a value then record.
  try {
    const w = page.locator('#section-weight');
    await w.scrollIntoViewIfNeeded();
    const inp = w.getByTestId('weight-direct-input');
    await inp.focus();
    await inp.fill('69.40');
    await page.waitForTimeout(200);
  } catch {
    /* best effort */
  }
  await tryClick(page.locator('#section-weight').locator('button', { hasText: 'Record Weight' }));
  await page.waitForTimeout(500);

  // Urination + defecation quick-logs.
  await tryClick(page.locator('#section-urination').locator('button', { hasText: 'Medium' }));
  await page.waitForTimeout(300);
  await tryClick(page.locator('#section-defecation').locator('button', { hasText: 'Large' }));
  await page.waitForTimeout(300);
}

async function seedAndCaptureMedication(page: Page) {
  await page.goto('/medications');
  await settle(page);

  if (await tryClick(page.locator('button', { hasText: 'Add a prescription' }))) {
    await page.waitForTimeout(600);
    // Search step
    try {
      await page.fill('input[placeholder="e.g. Aviolix, Clopidogrel..."]', 'Aviolix 75mg');
      await page.keyboard.press('Enter');
      await page.getByText('Found: Aviolix Compound').waitFor({ timeout: 8000 });
      await rawShot(page, '03b-medication-wizard');
    } catch {
      /* best effort */
    }
    // Next through Appearance → Indication → Dosage → Schedule → Inventory.
    for (let i = 0; i < 5; i++) {
      if (!(await tryClick(page.locator('button', { hasText: 'Next' }), 3000))) break;
      await page.waitForTimeout(500);
    }
    try {
      await rawShot(page, '04b-medication-wizard-inventory');
      await page.fill('input[placeholder="e.g. 36"]', '30');
    } catch {
      /* best effort */
    }
    await tryClick(page.locator('button', { hasText: 'Save Medication' }));
    await page.waitForTimeout(1800);
    await page.keyboard.press('Escape').catch(() => {});
  }

  // Populated medications page + tabs.
  await page.goto('/medications');
  await chromeShot(page, '02-medications-chrome');
  await shot(page, '02-medications-schedule');
  await clickTab(page, 'Meds', '03-medications-compounds');
  await clickTab(page, 'Rx', '04-medications-prescriptions');
  await clickTab(page, 'Titrations', '04-medications-titrations');
  await clickTab(page, 'Settings', '04-medications-settings');
}

test('capture authenticated screens', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('/api/ai/medicine-search', (route) => route.fulfill({ json: MEDICINE_SEARCH_MOCK }));
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      /* ignore */
    }
  }, WELCOME_SEEN_KEY);

  // 1. Seed dashboard data, then capture the populated dashboard.
  await seedDashboard(page);
  await page.goto('/');
  await chromeShot(page, '01-dashboard-chrome');
  await shot(page, '01-dashboard');

  // 2. Inline edit forms (populated entries).
  await page.goto('/');
  await settle(page);
  await captureEdit(page, '#section-water', '14-edit-water');
  await page.goto('/');
  await settle(page);
  await captureEdit(page, '#section-bp', '14-edit-bp');
  await page.goto('/');
  await settle(page);
  await captureEdit(page, '#section-weight', '14-edit-weight');

  // 3. Medications: add prescription via wizard, capture wizard + populated tabs.
  await seedAndCaptureMedication(page);

  // 4. Analytics (now has data).
  await page.goto('/analytics');
  await shot(page, '05-analytics-summary');
  await clickTab(page, 'Records', '06-analytics-records');
  await clickTab(page, 'Correlations', '05-analytics-correlations');
  await clickTab(page, 'Titration', '06-analytics-titration');

  // 5. Settings, Profile, Help (no data needed).
  await page.goto('/settings');
  await shot(page, '07-settings');
  await page.goto('/profile');
  await shot(page, '08-profile');
  await page.goto('/help');
  await shot(page, '11-help-index');
  try {
    await page.getByRole('link').filter({ hasText: /.+/ }).first().click({ timeout: 4000 });
    await page.waitForURL(/\/help\/.+/, { timeout: 6000 });
    await shot(page, '12-help-article');
  } catch {
    // eslint-disable-next-line no-console
    console.log('skipped 12-help-article (no article link found)');
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
