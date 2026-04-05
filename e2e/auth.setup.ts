import { test as setup, expect } from '@playwright/test';
import { PrivyClient } from '@privy-io/node';

const authFile = 'e2e/.auth/user.json';

/**
 * Authenticate via Privy's server SDK and inject tokens into the browser.
 *
 * This bypasses the Privy login modal entirely — the modal uses iframes and
 * animations that fail in headless CI environments ("Something went wrong").
 * Instead we use @privy-io/node to get a real auth token server-side,
 * then inject it into localStorage + cookies so the client SDK recognises
 * the session on page load.
 */
setup('authenticate via Privy test account', async ({ page }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET env vars. ' +
        'Set them in .env.local (local) or GitHub secrets (CI).',
    );
  }

  // --- Step 1: Get a real access token via Privy's server SDK ---
  // The SDK handles auth headers, origin, and test credential lookup internally.
  const privy = new PrivyClient({ appId, appSecret });

  const testEmail = process.env.PRIVY_TEST_EMAIL;
  const { access_token } = await privy
    .apps()
    .getTestAccessToken(testEmail ? { email: testEmail } : undefined);

  // --- Step 2: Inject token into browser ---
  // Navigate first to establish the localhost origin for localStorage/cookies.
  await page.goto('/');

  // Set localStorage — Privy v3 SDK reads values via JSON.parse wrapper
  await page.evaluate((token: string) => {
    localStorage.setItem('privy:token', JSON.stringify(token));
  }, access_token);

  // Set cookies (non-secure for http://localhost in CI)
  await page.context().addCookies([
    {
      name: 'privy-token',
      value: access_token,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
    {
      name: 'privy-session',
      value: 't',
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ]);

  // --- Step 3: Reload — Privy SDK finds tokens and authenticates ---
  await page.reload();
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
