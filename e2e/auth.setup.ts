import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

const PRIVY_API = 'https://api.privy.io';

setup('authenticate via Privy test account', async ({ page }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET env vars. ' +
      'Set them in .env.local (local) or GitHub secrets (CI).'
    );
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const headers = {
    Authorization: `Basic ${basicAuth}`,
    'privy-app-id': appId,
    'Content-Type': 'application/json',
    Origin: 'https://intake-tracker.ryanjnoble.dev',
  };

  // 1. Fetch test account credentials from Privy dashboard
  const credRes = await fetch(`${PRIVY_API}/v1/apps/${appId}/test_credentials`, { headers });
  if (!credRes.ok) {
    throw new Error(`Failed to fetch test credentials: ${credRes.status} ${await credRes.text()}`);
  }
  const { data: testAccounts } = await credRes.json();
  if (!testAccounts?.length) {
    throw new Error('No test accounts configured. Create one in the Privy dashboard.');
  }
  const account = testAccounts[0];

  // 2. Authenticate to get the full token set (access, refresh, identity)
  const authRes = await fetch(`${PRIVY_API}/v1/passwordless/authenticate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: account.email, code: account.otp_code }),
  });
  if (!authRes.ok) {
    throw new Error(`Privy auth failed: ${authRes.status} ${await authRes.text()}`);
  }
  const authData = await authRes.json();

  // 3. Set cookies for the Privy client SDK
  const cookieDefaults = {
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  };
  const cookies = [
    { name: 'privy-token', value: authData.token, ...cookieDefaults },
    { name: 'privy-session', value: 't', ...cookieDefaults },
  ];
  if (authData.refresh_token) {
    cookies.push({ name: 'privy-refresh-token', value: authData.refresh_token, ...cookieDefaults });
  }
  if (authData.identity_token) {
    cookies.push({ name: 'privy-id-token', value: authData.identity_token, ...cookieDefaults });
  }
  await page.context().addCookies(cookies);

  // 4. Inject tokens into localStorage before the page loads —
  //    the Privy React SDK reads from localStorage, not cookies
  await page.addInitScript((tokens: Record<string, string | undefined>) => {
    if (tokens.token) localStorage.setItem('privy:token', tokens.token);
    if (tokens.refresh_token) localStorage.setItem('privy:refresh_token', tokens.refresh_token);
    if (tokens.identity_token) localStorage.setItem('privy:id_token', tokens.identity_token);
    if (tokens.privy_access_token) localStorage.setItem('privy:pat', tokens.privy_access_token);
  }, {
    token: authData.token,
    refresh_token: authData.refresh_token,
    identity_token: authData.identity_token,
    privy_access_token: authData.privy_access_token,
  });

  // 5. Navigate — SDK should find tokens in localStorage and authenticate
  await page.goto('/');
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
