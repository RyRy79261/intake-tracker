import { test, expect } from '@playwright/test';

test.describe('Intake Logs', () => {
  test('should allow adding water and salt logs', async ({ page }) => {
    // Go to the dashboard
    await page.goto('/');

    // Ensure the page is loaded
    await expect(page.locator('text=Intake Tracker')).toBeVisible();

    // Click "Confirm Entry" in the Water card
    const waterCard = page.locator('#section-water');
    await expect(waterCard).toBeVisible();
    await waterCard.locator('button', { hasText: 'Confirm Entry' }).click();

    // Wait for the success toast
    await expect(page.locator('text=Water intake recorded')).toBeVisible();

    // Click "Confirm Entry" in the Salt card
    const saltCard = page.locator('#section-salt');
    await expect(saltCard).toBeVisible();
    await saltCard.locator('button', { hasText: 'Confirm Entry' }).click();

    // Wait for the success toast
    await expect(page.locator('text=Salt intake recorded')).toBeVisible();
  });
});
