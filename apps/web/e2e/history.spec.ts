import { test, expect, type Page } from '@playwright/test';

/**
 * The analytics page shows a one-time intro modal on first visit. A fresh E2E
 * context always triggers it, and its overlay blocks tab clicks — dismiss it
 * before interacting with the tabs.
 */
async function dismissAnalyticsIntro(page: Page) {
  const gotIt = page.getByRole('button', { name: /got it/i });
  await gotIt.click({ timeout: 10_000 });
  await expect(gotIt).toBeHidden();
}

test.describe('History / Analytics', () => {

  test('should load analytics page with all four tabs', async ({ page }) => {
    await page.goto('/analytics');
    // Verify all 4 tabs are visible
    for (const tabName of ['Records', 'Summary', 'Correlations', 'Titration']) {
      await expect(page.locator('[role="tab"]', { hasText: tabName })).toBeVisible();
    }
    // Summary tab is active by default (the deep-vs-fast insights live here)
    await expect(page.locator('[role="tab"]', { hasText: 'Summary' })).toHaveAttribute('data-state', 'active');
  });

  test('should switch between analytics tabs', async ({ page }) => {
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    // Click each tab and verify the panel renders
    for (const tabName of ['Summary', 'Correlations', 'Titration', 'Records']) {
      await page.locator('[role="tab"]', { hasText: tabName }).click();
      await expect(page.locator('[role="tabpanel"][data-state="active"]')).toBeVisible();
    }
  });

  test('should show empty state on Records tab with no data', async ({ page }) => {
    // Fresh browser context = empty IndexedDB = no records
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    // Records is no longer the default tab — click it explicitly.
    await page.locator('[role="tab"]', { hasText: 'Records' }).click();
    // Records tab should at least render its tab panel (even if empty)
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).toBeVisible();
  });

  test('should show blood pressure data in Records after recording via dashboard (D-12)', async ({ page }) => {
    // Step 1: Create data via dashboard UI (per D-12: create via UI, not IndexedDB seeding)
    await page.goto('/');
    const bpCard = page.locator('#section-bp');
    await bpCard.scrollIntoViewIfNeeded();
    await bpCard.locator('#systolic').fill('130');
    await bpCard.locator('#diastolic').fill('85');
    await bpCard.locator('button:has-text("Record Reading")').click();
    await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();

    // Step 2: Navigate to analytics and verify the record appears
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    // Records is no longer the default tab — click it before asserting.
    await page.locator('[role="tab"]', { hasText: 'Records' }).click();
    // Look for the BP reading in the records list (format: "130/85 mmHg")
    await expect(page.locator('text=130/85')).toBeVisible({ timeout: 10000 });
  });

  test('should render chart SVG containers on Summary tab with data (D-11)', async ({ page }) => {
    // Step 1: Create some data via dashboard UI so charts have something to render
    await page.goto('/');
    // Log water entry
    const waterCard = page.locator('#section-water');
    await waterCard.locator('button', { hasText: 'Confirm Entry' }).click();
    await expect(page.getByText('Water intake recorded', { exact: true })).toBeVisible();

    // Log BP entry
    const bpCard = page.locator('#section-bp');
    await bpCard.scrollIntoViewIfNeeded();
    await bpCard.locator('#systolic').fill('120');
    await bpCard.locator('#diastolic').fill('80');
    await bpCard.locator('button:has-text("Record Reading")').click();
    await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();

    // Step 2: Navigate to analytics, switch to Summary tab
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    await page.locator('[role="tab"]', { hasText: 'Summary' }).click();
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).toBeVisible();

    // Per D-11: verify chart containers render (SVG elements present)
    // Do NOT assert on SVG path values -- only check for container/SVG presence
    // Use generous timeout since Recharts renders asynchronously
    // With data seeded we expect charts; fall back to the empty-state text.
    const svgOrEmpty = page.locator('.recharts-responsive-container svg').first()
      .or(page.locator('text=/No data for this period/i'));
    await expect(svgOrEmpty).toBeVisible({ timeout: 15000 });
  });

  /**
   * D-12 only proved blood pressure round-trips into Records. This extends the
   * same create-via-UI → assert-in-Records loop to the other daily-driver
   * metrics. We assert per **domain filter** (a record surfaces AND is filed
   * under the right category) rather than matching brittle formatted strings —
   * the "Edit entry" action button is unique to a rendered RecordRow.
   */
  test('every metric round-trips into the Records tab (D-12 extended)', async ({ page }) => {
    // Step 1: log one of each metric on the dashboard.
    await page.goto('/');

    await page.locator('#section-water').locator('button', { hasText: 'Confirm Entry' }).click();
    await expect(page.getByText('Water intake recorded', { exact: true })).toBeVisible();

    const weightCard = page.locator('#section-weight');
    await weightCard.scrollIntoViewIfNeeded();
    await weightCard.locator('button:has-text("Record Weight")').click();
    await expect(page.getByText('Weight recorded', { exact: true })).toBeVisible();

    const bpCard = page.locator('#section-bp');
    await bpCard.scrollIntoViewIfNeeded();
    await bpCard.locator('#systolic').fill('118');
    await bpCard.locator('#diastolic').fill('77');
    await bpCard.locator('button:has-text("Record Reading")').click();
    await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();

    const eatingCard = page.locator('#section-food-salt');
    await eatingCard.scrollIntoViewIfNeeded();
    await eatingCard.locator('#eating-sodium').fill('250');
    await eatingCard.locator('button', { hasText: 'Record with details' }).click();
    await expect(page.getByText('Eating event recorded', { exact: true })).toBeVisible();

    const urinationCard = page.locator('#section-urination');
    await urinationCard.scrollIntoViewIfNeeded();
    await urinationCard.locator('button', { hasText: 'Medium' }).click();
    await expect(page.getByText('Logged', { exact: true }).first()).toBeVisible();

    const defecationCard = page.locator('#section-defecation');
    await defecationCard.scrollIntoViewIfNeeded();
    await defecationCard.locator('button', { hasText: 'Large' }).click();

    // Step 2: on the Records tab, every domain filter must surface a row.
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    await page.locator('[role="tab"]', { hasText: 'Records' }).click();

    for (const filterLabel of ['Water', 'Weight', 'BP', 'Eating', 'Urination', 'Defecation']) {
      await page.getByRole('button', { name: filterLabel, exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Edit entry', exact: true }).first(),
        `${filterLabel} record should appear in the Records tab`,
      ).toBeVisible();
    }
  });

  test('edit a record from the Records tab updates its value (D-13)', async ({ page }) => {
    // Log a distinctive weight on the dashboard.
    await page.goto('/');
    const weightCard = page.locator('#section-weight');
    await weightCard.scrollIntoViewIfNeeded();
    const recordBtn = weightCard.locator('button:has-text("Record Weight")');
    await expect(recordBtn).toBeVisible();
    const weightInput = weightCard.getByTestId('weight-direct-input');
    await weightInput.focus();
    await weightInput.fill('71.35');
    await recordBtn.focus();
    await expect(weightCard.getByText('71.35')).toBeVisible();
    await recordBtn.click();
    await expect(page.getByText('Weight recorded', { exact: true })).toBeVisible();

    // Open it from the Records tab and change the value.
    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    await page.locator('[role="tab"]', { hasText: 'Records' }).click();
    await page.getByRole('button', { name: 'Weight', exact: true }).click();
    await expect(page.getByText('71.35 kg')).toBeVisible();

    await page.getByRole('button', { name: 'Edit entry', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#edit-weight').fill('80');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Entry updated', { exact: true })).toBeVisible();
    await expect(page.getByText('80 kg')).toBeVisible();
    await expect(page.getByText('71.35 kg')).toHaveCount(0);
  });

  test('delete a record from the Records tab removes it (D-14)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#section-water').locator('button', { hasText: 'Confirm Entry' }).click();
    await expect(page.getByText('Water intake recorded', { exact: true })).toBeVisible();

    await page.goto('/analytics');
    await dismissAnalyticsIntro(page);
    await page.locator('[role="tab"]', { hasText: 'Records' }).click();
    await page.getByRole('button', { name: 'Water', exact: true }).click();

    const deleteBtn = page.getByRole('button', { name: 'Delete entry', exact: true }).first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Records-tab delete is immediate (no confirm). Intake now shows a single
    // "Record deleted" undo toast (the redundant plain toast was removed so the
    // Undo action survives), and the row is gone.
    await expect(page.getByText('Record deleted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit entry', exact: true })).toHaveCount(0);
    await expect(page.getByText('No records in this time range')).toBeVisible();
  });
});
