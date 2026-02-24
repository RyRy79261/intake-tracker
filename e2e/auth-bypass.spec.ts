import { test, expect } from '@playwright/test';

test.describe('Auth Bypass', () => {
  test('should bypass Privy login when NEXT_PUBLIC_LOCAL_AGENT_MODE is true', async ({ page }) => {
    // The webServer config runs the dev server with NEXT_PUBLIC_LOCAL_AGENT_MODE=true
    await page.goto('/');

    // Verify we are not redirected to a login page and the dashboard loads
    await expect(page.locator('text=Intake Tracker')).toBeVisible();
    await expect(page.locator('#section-water')).toBeVisible();
  });
});
