import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should be authenticated via Privy test account', async ({ page }) => {
    // The setup project handles authentication; storageState is loaded automatically
    await page.goto('/');

    // Verify we reach the dashboard (not the login prompt)
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
    await expect(page.locator('#section-water')).toBeVisible();
  });

  test('should show auth guard after logout', async ({ page }) => {
    // Step 1: Verify currently authenticated (dashboard loads)
    await page.goto('/');
    await expect(page.locator('#section-water')).toBeVisible();

    // Step 2: Navigate to settings and click Sign Out
    await page.goto('/settings');
    await page.locator('button', { hasText: 'Sign Out' }).click();

    // Step 3: Verify redirected to auth guard login prompt
    await expect(page.locator('text=Sign in Required')).toBeVisible({ timeout: 15000 });
  });

  test('should handle API rejection for non-whitelisted user', async ({ page }) => {
    // Mock an API endpoint to return 403 (simulating whitelist rejection)
    await page.route('/api/ai/status', async (route) => {
      await route.fulfill({
        status: 403,
        json: { error: 'Not authorized - email not on whitelist' },
      });
    });

    await page.goto('/');
    await expect(page.locator('#section-water')).toBeVisible();

    // The app should still load (auth guard passes because Privy authenticated)
    // but API calls would fail with 403
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
  });
});
