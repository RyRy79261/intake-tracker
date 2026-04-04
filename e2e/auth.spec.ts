import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should be authenticated via Privy test account', async ({ page }) => {
    // The setup project handles authentication; storageState is loaded automatically
    await page.goto('/');

    // Verify we reach the dashboard (not the login prompt)
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
    await expect(page.locator('#section-water')).toBeVisible();
  });

  test('should handle logout and re-login lifecycle', async ({ page }) => {
    // Step 1: Verify currently authenticated (dashboard loads)
    await page.goto('/');
    await expect(page.locator('#section-water')).toBeVisible();

    // Step 2: Navigate to settings and click Sign Out
    await page.goto('/settings');
    await page.locator('button', { hasText: 'Sign Out' }).click();

    // Step 3: Verify redirected to auth guard login prompt
    // After logout, AuthGuard shows "Sign in Required" card
    await expect(page.locator('text=Sign in Required')).toBeVisible({ timeout: 15000 });

    // Step 4: Re-authenticate via __privyE2E bridge (same approach as auth.setup.ts)
    // The E2EAuthBridge component re-exposes the bridge after PrivyProvider re-mounts
    const email = process.env.PRIVY_TEST_EMAIL!;
    const otp = process.env.PRIVY_TEST_OTP!;

    // Wait for the E2E bridge to become available again after logout
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.waitForFunction(
      () => (window as any).__privyE2E != null,
      { timeout: 30000 },
    );

    // Use Privy's headless login — no modal/iframe interaction needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(async (e: string) => {
      await (window as any).__privyE2E.sendCode(e);
    }, email);

    // Wait for Privy OTP state machine to reach 'awaiting-code-input'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.waitForFunction(
      () => (window as any).__privyE2E?.state?.status === 'awaiting-code-input',
      { timeout: 15000 },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(async (code: string) => {
      await (window as any).__privyE2E.loginWithCode(code);
    }, otp);

    // Step 5: Verify dashboard returns after re-authentication
    await expect(page.locator('#section-water')).toBeVisible({ timeout: 15000 });
  });

  test('should handle API rejection for non-whitelisted user', async ({ page }) => {
    // Mock an API endpoint to return 403 (simulating whitelist rejection)
    // This tests the client's handling of server-side whitelist enforcement
    await page.route('/api/ai/status', async route => {
      await route.fulfill({
        status: 403,
        json: { error: 'Not authorized - email not on whitelist' },
      });
    });

    await page.goto('/');
    await expect(page.locator('#section-water')).toBeVisible();

    // The app should still load (auth guard passes because Privy authenticated)
    // but API calls would fail with 403
    // Verify the dashboard is still accessible (whitelist is API-level, not page-level)
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
  });
});
