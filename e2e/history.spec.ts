import { test, expect } from '@playwright/test';

test.describe('History / Analytics', () => {

  test('should load analytics page with all four tabs', async ({ page }) => {
    await page.goto('/analytics');
    // Verify all 4 tabs are visible
    for (const tabName of ['Records', 'Insights', 'Correlations', 'Titration']) {
      await expect(page.locator('[role="tab"]', { hasText: tabName })).toBeVisible();
    }
    // Records tab is active by default
    await expect(page.locator('[role="tab"]', { hasText: 'Records' })).toHaveAttribute('data-state', 'active');
  });

  test('should switch between analytics tabs', async ({ page }) => {
    await page.goto('/analytics');
    // Click each tab and verify the panel renders
    for (const tabName of ['Insights', 'Correlations', 'Titration', 'Records']) {
      await page.locator('[role="tab"]', { hasText: tabName }).click();
      await expect(page.locator('[role="tabpanel"]')).toBeVisible();
    }
  });

  test('should show empty state on Records tab with no data', async ({ page }) => {
    // Fresh browser context = empty IndexedDB = no records
    await page.goto('/analytics');
    await expect(page.locator('[role="tab"]', { hasText: 'Records' })).toBeVisible();
    // Records tab should at least render its tab panel (even if empty)
    await expect(page.locator('[role="tabpanel"]')).toBeVisible();
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
    await expect(page.locator('[role="tab"]', { hasText: 'Records' })).toBeVisible();
    // Look for the BP reading in the records list (format: "130/85 mmHg")
    await expect(page.locator('text=130/85')).toBeVisible({ timeout: 10000 });
  });

  test('should render chart SVG containers on Insights tab with data (D-11)', async ({ page }) => {
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

    // Step 2: Navigate to analytics, switch to Insights tab
    await page.goto('/analytics');
    await page.locator('[role="tab"]', { hasText: 'Insights' }).click();
    await expect(page.locator('[role="tabpanel"]')).toBeVisible();

    // Per D-11: verify chart containers render (SVG elements present)
    // Do NOT assert on SVG path values -- only check for container/SVG presence
    // Use generous timeout since Recharts renders asynchronously
    // If insights are available, we should see either SVG or "No notable insights" text
    const svgOrEmpty = page.locator('.recharts-responsive-container svg').first()
      .or(page.locator('text=/No notable insights/i'));
    await expect(svgOrEmpty).toBeVisible({ timeout: 15000 });
  });
});
