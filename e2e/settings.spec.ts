import { test, expect } from '@playwright/test';

test.describe('Settings Persistence', () => {
  test('theme persists across page reload', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');
    await expect(page.locator('h3', { hasText: 'Appearance' })).toBeVisible();

    // Open theme select (Radix Select with id="theme")
    await page.locator('#theme').click();

    // Select "Dark" from the portal-rendered options
    await page.locator('[role="option"]', { hasText: 'Dark' }).click();

    // Verify dark class is applied to html element
    await expect(page.locator('html')).toHaveAttribute('class', /dark/);

    // Reload the page
    await page.reload();

    // Wait for settings page content to load
    await expect(page.locator('h3', { hasText: 'Appearance' })).toBeVisible();

    // Verify dark theme persisted after reload (html still has dark class)
    await expect(page.locator('html')).toHaveAttribute('class', /dark/);
  });

  test('day-start-hour persists across page reload', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');
    await expect(page.locator('h3', { hasText: 'Day Settings' })).toBeVisible();

    // Open day-start select (Radix Select with id="day-start")
    await page.locator('#day-start').click();

    // Select "4:00 AM" from the options
    await page.locator('[role="option"]', { hasText: '4:00 AM' }).click();

    // Verify the select now shows "4:00 AM"
    await expect(page.locator('#day-start')).toContainText('4:00 AM');

    // Reload the page
    await page.reload();

    // Wait for settings page content to load
    await expect(page.locator('h3', { hasText: 'Day Settings' })).toBeVisible();

    // Verify day-start-hour persisted after reload
    await expect(page.locator('#day-start')).toContainText('4:00 AM');
  });
});
