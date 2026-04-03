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

    // Step 4: Re-authenticate via Privy modal (same approach as auth.setup.ts)
    // Click the "Sign In" button rendered by AuthGuard
    await page.locator('button', { hasText: 'Sign In' }).click();

    // Privy opens a modal dialog (iframe from auth.privy.io)
    const privyFrame = page.frameLocator('iframe[title*="privy"], iframe[src*="auth.privy.io"]');

    // Enter test email
    const emailInput = privyFrame.getByRole('textbox');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(process.env.PRIVY_TEST_EMAIL ?? '');
    await emailInput.press('Enter');

    // Enter test OTP (Privy test accounts have a fixed OTP)
    const otpInput = privyFrame.locator('input[type="text"], input[autocomplete="one-time-code"]').first();
    await otpInput.waitFor({ state: 'visible', timeout: 10000 });

    // Privy OTP uses individual digit inputs — type the full OTP
    const otp = process.env.PRIVY_TEST_OTP ?? '';
    await privyFrame.locator('input').first().focus();
    await page.keyboard.type(otp);

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
