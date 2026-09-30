import { test, expect, type Page } from '@playwright/test';

/**
 * Settings is a global sheet (src/components/settings/settings-sheet.tsx),
 * opened by the sys-bar gear or the /settings deep link. Its groups are
 * independent collapsibles (Tracking starts open); Drink presets is a
 * sub-page with a Back button.
 */
function sheet(page: Page) {
  return page.getByRole('dialog', { name: 'Settings' });
}

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(sheet(page)).toBeVisible();
}

async function openGroup(page: Page, name: string) {
  const group = sheet(page).getByRole('button', { name, exact: true });
  if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Settings', () => {
  test('the gear opens the sheet over Home and Back closes it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('sys-bar').getByRole('button', { name: 'Settings' }).click();
    await expect(sheet(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);

    await page.goBack();
    await expect(sheet(page)).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Drink presets opens as a page with Back', async ({ page }) => {
    await openSettings(page);
    await sheet(page).getByRole('button', { name: /Drink presets/ }).click();

    const presets = page.getByRole('dialog', { name: 'Drink presets' });
    await expect(presets).toBeVisible();
    await expect(presets.getByRole('button', { name: 'Edit Espresso' })).toBeVisible();

    await presets.getByRole('button', { name: 'Back to settings' }).click();
    await expect(sheet(page).getByRole('button', { name: 'Tracking', exact: true })).toBeVisible();
  });

  test('theme persists across page reload', async ({ page }) => {
    await openSettings(page);
    await openGroup(page, 'Appearance');
    await sheet(page).getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await openGroup(page, 'Appearance');
    await expect(sheet(page).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  test('Bigger text and Reduce motion apply to the whole app', async ({ page }) => {
    await openSettings(page);
    await openGroup(page, 'Appearance');
    await sheet(page).getByRole('switch', { name: /Bigger text/ }).click();
    await sheet(page).getByRole('switch', { name: /Reduce motion/ }).click();
    await expect(page.locator('html')).toHaveClass(/big-text/);
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
    const size = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(size).toBe('18px');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/big-text/);
  });

  test('day-start-hour persists across page reload', async ({ page }) => {
    await openSettings(page);
    await openGroup(page, 'Tracking');

    await page.locator('#set-day-start').click();
    await page.locator('[role="option"]', { hasText: '4:00 AM' }).click();
    await expect(page.locator('#set-day-start')).toContainText('4:00 AM');

    await page.reload();
    await expect(sheet(page)).toBeVisible();
    await openGroup(page, 'Tracking');
    await expect(page.locator('#set-day-start')).toContainText('4:00 AM');
  });

  test('export data triggers download', async ({ page }) => {
    await openSettings(page);
    await openGroup(page, 'Data & storage');

    const downloadPromise = page.waitForEvent('download');
    await sheet(page).getByRole('button', { name: 'Export Data' }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});
