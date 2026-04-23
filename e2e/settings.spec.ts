import { test, expect } from '@playwright/test';

/**
 * Settings page is a two-level accordion (see src/app/settings/page.tsx):
 *   - Top level: Radix Accordion with groups like "Tracking", "Customization",
 *     "Data & Storage", etc. Only one group open at a time. All closed by
 *     default.
 *   - Inside each group, several sections use ExpandableSettingsSection which
 *     is an independent Collapsible (closed by default).
 *
 * Sections like Appearance, Data Management, Storage Info, Quick Nav render
 * their h3 directly (no inner Collapsible) — expanding the parent group is
 * enough. Sections like Day Settings, Water Settings, etc. ARE wrapped in
 * ExpandableSettingsSection and need a second click to reveal their controls.
 */
async function openGroup(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

async function openInnerSection(
  page: import('@playwright/test').Page,
  name: string
) {
  // The inner trigger is a button containing <h3>{name}</h3>. Scope to the
  // h3 and click the enclosing button to avoid clashing with the h3 selector
  // assertions below.
  await page.locator('button', { has: page.locator('h3', { hasText: name }) }).click();
}

test.describe('Settings', () => {
  test('theme persists across page reload', async ({ page }) => {
    await page.goto('/settings');
    await openGroup(page, 'Customization');

    // Appearance renders its h3 directly once the parent group is open.
    await expect(page.locator('h3', { hasText: 'Appearance' })).toBeVisible();

    await page.locator('#theme').click();
    await page.locator('[role="option"]', { hasText: 'Dark' }).click();

    await expect(page.locator('html')).toHaveAttribute('class', /dark/);

    await page.reload();
    await openGroup(page, 'Customization');
    await expect(page.locator('h3', { hasText: 'Appearance' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('class', /dark/);
  });

  test('day-start-hour persists across page reload', async ({ page }) => {
    await page.goto('/settings');
    await openGroup(page, 'Tracking');

    // Day Settings uses ExpandableSettingsSection — the h3 is in the always-
    // visible trigger but the #day-start select is in the collapsed body.
    await expect(page.locator('h3', { hasText: 'Day Settings' })).toBeVisible();
    await openInnerSection(page, 'Day Settings');

    await page.locator('#day-start').click();
    await page.locator('[role="option"]', { hasText: '4:00 AM' }).click();
    await expect(page.locator('#day-start')).toContainText('4:00 AM');

    await page.reload();
    await openGroup(page, 'Tracking');
    await openInnerSection(page, 'Day Settings');
    await expect(page.locator('#day-start')).toContainText('4:00 AM');
  });

  test('export data triggers download', async ({ page }) => {
    await page.goto('/settings');
    await openGroup(page, 'Data & Storage');
    await expect(page.locator('h3', { hasText: 'Data Management' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Export Data' }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('account section displays email and sign out option', async ({ page }) => {
    // AccountSection is rendered above the accordion (no h3 heading) — just
    // verify the "Signed in via Neon Auth" copy and a Sign Out button.
    await page.goto('/settings');
    await expect(page.locator('text=Signed in via Neon Auth')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Sign Out' })).toBeVisible();
  });
});
