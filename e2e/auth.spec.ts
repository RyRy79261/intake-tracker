import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should be authenticated via Privy test account', async ({ page }) => {
    // The setup project handles authentication; storageState is loaded automatically
    await page.goto('/');

    // Verify we reach the dashboard (not the login prompt)
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
    await expect(page.locator('#section-water')).toBeVisible();
  });
});
