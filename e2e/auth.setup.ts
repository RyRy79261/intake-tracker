import { test as setup, expect } from '@playwright/test';
import { PrivyClient } from '@privy-io/node';

const authFile = 'e2e/.auth/user.json';

setup('authenticate via Privy test account', async ({ page }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET env vars. ' +
      'Set them in .env.local (local) or GitHub secrets (CI).'
    );
  }

  // Get a test access token from Privy's server-side SDK
  const privy = new PrivyClient({
    appId,
    appSecret,
    defaultHeaders: { origin: 'https://intake-tracker.ryanjnoble.dev' },
  });
  const { access_token } = await privy.apps().getTestAccessToken();

  // Set the privy-token cookie so the client SDK recognizes the session
  await page.context().addCookies([
    {
      name: 'privy-token',
      value: access_token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // Navigate to app — Privy client SDK should pick up the cookie
  await page.goto('/');
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
