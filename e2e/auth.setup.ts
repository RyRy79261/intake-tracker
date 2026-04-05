import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

/**
 * Authenticate via Privy's API and inject the full token set into the browser.
 *
 * This bypasses the Privy login modal entirely — the modal uses iframes and
 * animations that fail in headless CI environments ("Something went wrong").
 * Instead we call the Privy API directly with test account credentials,
 * then inject all tokens into localStorage + cookies so the client SDK
 * recognises the session on page load.
 */
setup('authenticate via Privy test account', async ({ page }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const testEmail = process.env.PRIVY_TEST_EMAIL;
  const testOtp = process.env.PRIVY_TEST_OTP;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET env vars. ' +
        'Set them in .env.local (local) or GitHub secrets (CI).',
    );
  }
  if (!testEmail || !testOtp) {
    throw new Error(
      'Missing PRIVY_TEST_EMAIL or PRIVY_TEST_OTP env vars. ' +
        'Set them in .env.local (local) or GitHub secrets (CI).',
    );
  }

  // --- Step 1: Authenticate via Privy API to get full token set ---
  // We call the endpoint directly (not via getTestAccessToken) because
  // the SDK wrapper only returns access_token, but the client SDK needs
  // refresh_token and identity_token too.
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const res = await fetch('https://api.privy.io/v1/passwordless/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
      'privy-app-id': appId,
      Origin: 'https://intake-tracker.ryanjnoble.dev',
    },
    body: JSON.stringify({ email: testEmail, code: testOtp }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Privy auth failed (${res.status}): ${body}`);
  }

  const auth = await res.json();
  const accessToken: string = auth.token;
  const refreshToken: string | null = auth.refresh_token;
  const identityToken: string | null = auth.identity_token;
  const privyAccessToken: string | null = auth.privy_access_token;

  if (!accessToken) {
    throw new Error('Privy auth returned no access token');
  }

  // --- Step 2: Navigate to establish the localhost origin ---
  await page.goto('/');

  // --- Step 3: Inject full token set into localStorage ---
  // Privy v3 client SDK reads these via JSON.parse wrapper
  await page.evaluate(
    (tokens: {
      access: string;
      refresh: string | null;
      identity: string | null;
      pat: string | null;
    }) => {
      localStorage.setItem('privy:token', JSON.stringify(tokens.access));
      if (tokens.refresh)
        localStorage.setItem('privy:refresh_token', JSON.stringify(tokens.refresh));
      if (tokens.identity)
        localStorage.setItem('privy:id-token', JSON.stringify(tokens.identity));
      if (tokens.pat)
        localStorage.setItem('privy:pat', JSON.stringify(tokens.pat));
    },
    { access: accessToken, refresh: refreshToken, identity: identityToken, pat: privyAccessToken },
  );

  // Set cookies (non-secure for http://localhost in CI)
  const cookies = [
    { name: 'privy-token', value: accessToken },
    { name: 'privy-session', value: 't' },
  ];
  if (refreshToken) cookies.push({ name: 'privy-refresh-token', value: refreshToken });
  if (identityToken) cookies.push({ name: 'privy-id-token', value: identityToken });

  await page.context().addCookies(
    cookies.map((c) => ({
      ...c,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    })),
  );

  // --- Step 4: Reload — Privy SDK finds tokens and authenticates ---
  await page.reload();
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
