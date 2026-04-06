import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should allow adding water and salt logs', async ({ page }) => {
    // Go to the dashboard
    await page.goto('/');

    // Ensure the page is loaded
    await expect(page.locator('text=Intake Tracker')).toBeVisible();

    // Click "Confirm Entry" in the Water card
    const waterCard = page.locator('#section-water');
    await expect(waterCard).toBeVisible();
    await waterCard.locator('button', { hasText: 'Confirm Entry' }).click();

    // Wait for the success toast (use getByText with exact match to avoid aria-live duplication)
    await expect(page.getByText('Water intake recorded', { exact: true })).toBeVisible();

    // Click "Confirm Entry" in the Food/Salt card
    const foodSaltCard = page.locator('#section-food-salt');
    await expect(foodSaltCard).toBeVisible();
    await foodSaltCard.locator('button', { hasText: 'Confirm Entry' }).click();

    // Wait for the success toast
    await expect(page.getByText('Sodium intake recorded', { exact: true })).toBeVisible();
  });

  test('should create composable food entry via AI parse', async ({ page }) => {
    // Mock the AI parse endpoint to return water and salt estimates
    await page.route('/api/ai/parse', async route => {
      const json = {
        water: 200,
        salt: 450,
        reasoning: 'Bowl of soup estimated at 200ml water, 450mg sodium'
      };
      await route.fulfill({ json });
    });

    await page.goto('/');
    await expect(page.locator('text=Intake Tracker')).toBeVisible();

    // Find the AI food input by aria-label
    const foodInput = page.locator('input[aria-label="Describe food for AI nutritional parsing"]');
    await foodInput.scrollIntoViewIfNeeded();
    await foodInput.fill('bowl of chicken soup');
    await foodInput.press('Enter');

    // Wait for composable preview to appear with linked records
    // The preview shows record type labels and amounts from composable-preview.tsx
    // Scope to the food-salt card to avoid matching quick-nav footer labels
    const preview = page.locator('#section-food-salt');
    await expect(preview.getByText('Eating', { exact: true }).first()).toBeVisible();
    await expect(preview.getByText('200 ml')).toBeVisible();
    await expect(preview.getByText('Sodium', { exact: true }).first()).toBeVisible();
    await expect(preview.getByText('450 mg')).toBeVisible();

    // Confirm all linked records
    await page.click('button:has-text("Confirm All")');

    // Verify success toast
    await expect(page.getByText('Food logged', { exact: true })).toBeVisible();
  });

  test('should log a liquid entry via coffee preset', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Intake Tracker')).toBeVisible();

    // Find the Liquids card and click the Coffee tab
    // The tab triggers are inside a TabsList in the LiquidsCard
    const coffeeTab = page.locator('[role="tab"]', { hasText: 'Coffee' });
    await coffeeTab.scrollIntoViewIfNeeded();
    await coffeeTab.click();

    // Wait for Coffee tab content to load — default coffee presets from Zustand
    // Click the first visible preset button (e.g., "Espresso") in the active tab panel
    // All tab panels are force-mounted but hidden via CSS — only match visible ones
    const presetButton = page.locator('[role="tabpanel"][data-state="active"] button').first();
    await expect(presetButton).toBeVisible();
    await presetButton.click();

    // Per D-01: verify substance auto-calc is displayed after selecting a coffee preset
    // The PresetTab displays calculated caffeine as "{N} mg caffeine"
    // Scope to the Liquids card area to avoid matching other mg values on the page
    await expect(page.locator('text=/\\d+\\s*mg caffeine/i')).toBeVisible();

    // After selecting a preset, volume and substance fields are populated
    // Click "Log Entry" in the active tab panel (other force-mounted panels also have this button)
    const activePanel = page.locator('[role="tabpanel"][data-state="active"]');
    const logButton = activePanel.locator('button:has-text("Log Entry")');
    await expect(logButton).toBeVisible();
    await logButton.click();

    // Verify success feedback toast
    await expect(page.getByText(/recorded/i).first()).toBeVisible();
  });

  test('should record a blood pressure reading', async ({ page }) => {
    await page.goto('/');
    const bpCard = page.locator('#section-bp');
    await bpCard.scrollIntoViewIfNeeded();
    await expect(bpCard).toBeVisible();

    // Fill systolic and diastolic fields
    await bpCard.locator('#systolic').fill('120');
    await bpCard.locator('#diastolic').fill('80');

    // Submit the reading
    await bpCard.locator('button:has-text("Record Reading")').click();

    // Verify success toast
    await expect(page.getByText('Blood pressure recorded', { exact: true })).toBeVisible();
  });

  test('should record a weight entry', async ({ page }) => {
    await page.goto('/');
    const weightCard = page.locator('#section-weight');
    await weightCard.scrollIntoViewIfNeeded();
    await expect(weightCard).toBeVisible();

    // Wait for card to fully initialize (button becomes visible when ready)
    const recordBtn = weightCard.locator('button:has-text("Record Weight")');
    await expect(recordBtn).toBeVisible();

    // Click Record Weight (uses default/pre-filled value)
    await recordBtn.click();

    // Verify success toast
    await expect(page.getByText('Weight recorded', { exact: true })).toBeVisible();
  });

  test('should quick-log urination', async ({ page }) => {
    await page.goto('/');
    const urinationCard = page.locator('#section-urination');
    await urinationCard.scrollIntoViewIfNeeded();
    await expect(urinationCard).toBeVisible();

    // Click "Medium" quick-log button
    await urinationCard.locator('button', { hasText: 'Medium' }).click();

    // Verify success toast (title is "Logged")
    await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  });

  test('should quick-log defecation', async ({ page }) => {
    await page.goto('/');
    const defecationCard = page.locator('#section-defecation');
    await defecationCard.scrollIntoViewIfNeeded();
    await expect(defecationCard).toBeVisible();

    // Click "Large" quick-log button (use different size than urination test)
    await defecationCard.locator('button', { hasText: 'Large' }).click();

    // Verify success toast (title is "Logged")
    await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  });
});
