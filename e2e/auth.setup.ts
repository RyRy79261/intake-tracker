import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';
const PRIVY_API = 'https://api.privy.io';

/**
 * Authenticate via Privy's server API and inject tokens into the browser.
 *
 * This bypasses the Privy login modal entirely — the modal uses iframes and
 * animations that fail in headless CI environments ("Something went wrong").
 * Instead we call Privy's REST API server-side to get real auth tokens,
 * then inject them into localStorage + cookies so the client SDK recognises
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

  // --- Step 1: Get test account credentials from Privy dashboard ---
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const headers = {
    Authorization: `Basic ${basicAuth}`,
    'privy-app-id': appId,
    'Content-Type': 'application/json',
  };

  const credRes = await fetch(`${PRIVY_API}/v1/apps/${appId}/test_credentials`, {
    method: 'GET',
    headers,
  });
  if (!credRes.ok) {
    const body = await credRes.text();
    throw new Error(
      `Failed to fetch Privy test credentials (${credRes.status}): ${body}\n` +
        'Ensure test accounts are enabled: Privy Dashboard → Settings → Test accounts.',
    );
  }
  const { data: testAccounts } = (await credRes.json()) as {
    data: Array<{ email: string; otp_code: string }>;
  };
  if (!testAccounts?.length) {
    throw new Error(
      'No test accounts configured in Privy. ' +
        'Create one in: Privy Dashboard → Settings → Test accounts.',
    );
  }

  // Match by PRIVY_TEST_EMAIL if set, otherwise use the first test account
  const testEmail = process.env.PRIVY_TEST_EMAIL;
  const account = testEmail
    ? (testAccounts.find((a) => a.email === testEmail) ?? testAccounts[0])
    : testAccounts[0];

  // --- Step 2: Authenticate server-side to get full token set ---
  const authRes = await fetch(`${PRIVY_API}/v1/passwordless/authenticate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: account.email, code: account.otp_code }),
  });
  if (!authRes.ok) {
    const body = await authRes.text();
    throw new Error(`Privy authentication failed (${authRes.status}): ${body}`);
  }
  const authData = (await authRes.json()) as {
    token: string;
    refresh_token?: string;
    identity_token?: string;
    privy_access_token?: string;
  };

  if (!authData.token) {
    throw new Error(
      'Privy auth response missing token. Check test account configuration.',
    );
  }

  // --- Step 3: Inject tokens into browser ---
  // Navigate first to establish the localhost origin for localStorage/cookies.
  // The page will render the AuthGuard (unauthenticated) — that's fine, we reload after injection.
  await page.goto('/');

  // Set localStorage — Privy v3 SDK reads values via JSON.parse wrapper
  await page.evaluate(
    (tokens: { token: string; refresh_token?: string; identity_token?: string; privy_access_token?: string }) => {
      localStorage.setItem('privy:token', JSON.stringify(tokens.token));
      if (tokens.refresh_token)
        localStorage.setItem('privy:refresh_token', JSON.stringify(tokens.refresh_token));
      if (tokens.identity_token)
        localStorage.setItem('privy:id-token', JSON.stringify(tokens.identity_token));
      if (tokens.privy_access_token)
        localStorage.setItem('privy:pat', JSON.stringify(tokens.privy_access_token));
    },
    {
      token: authData.token,
      refresh_token: authData.refresh_token,
      identity_token: authData.identity_token,
      privy_access_token: authData.privy_access_token,
    },
  );

  // Set cookies (non-secure for http://localhost in CI)
  const cookieBase = {
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  };
  const cookies = [
    { ...cookieBase, name: 'privy-token', value: authData.token },
    { ...cookieBase, name: 'privy-session', value: 't' },
  ];
  if (authData.refresh_token) {
    cookies.push({
      ...cookieBase,
      name: 'privy-refresh-token',
      value: authData.refresh_token,
    });
  }
  if (authData.identity_token) {
    cookies.push({
      ...cookieBase,
      name: 'privy-id-token',
      value: authData.identity_token,
    });
  }
  await page.context().addCookies(cookies);

  // --- Step 4: Reload — Privy SDK finds tokens and authenticates ---
  await page.reload();
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
