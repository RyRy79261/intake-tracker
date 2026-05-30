import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WELCOME_SEEN_KEY } from '../../src/lib/constants';

/**
 * Lightweight auth setup for the Pencil screenshot capture.
 *
 * Mirrors e2e/global-setup.ts's sign-in flow, but intentionally DROPS the
 * `neon_auth.users_sync` DB seeding. The capture only needs an authenticated
 * browser session; the users_sync upsert needs a valid DATABASE_URL that may be
 * stale locally (it is only relevant to the sync E2E specs, not screenshots).
 */
async function captureSetup(config: FullConfig) {
  const authDir = path.resolve(process.cwd(), 'playwright/.auth');
  const authFile = path.join(authDir, 'user.json');
  fs.mkdirSync(authDir, { recursive: true });

  const email = process.env.NEON_AUTH_TEST_EMAIL;
  const password = process.env.NEON_AUTH_TEST_PASSWORD;
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';

  if (!email || !password) {
    console.warn(
      '[capture-setup] NEON_AUTH_TEST_EMAIL/PASSWORD not set; writing empty auth state. ' +
        'Authenticated screens will be blank/redirected.',
    );
    fs.writeFileSync(
      authFile,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: new URL(baseURL).origin,
            localStorage: [{ name: WELCOME_SEEN_KEY, value: 'true' }],
          },
        ],
      }),
    );
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    const signIn = page.waitForResponse(
      (r) =>
        r.url().includes('/api/auth/sign-in/email') &&
        r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /sign in/i }).click();
    await signIn;
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
      timeout: 30_000,
    });
    await page.evaluate((key) => localStorage.setItem(key, 'true'), WELCOME_SEEN_KEY);
    await context.storageState({ path: authFile });
    // eslint-disable-next-line no-console
    console.log('[capture-setup] Authenticated state saved to', authFile);
  } finally {
    await browser.close();
  }
}

export default captureSetup;
