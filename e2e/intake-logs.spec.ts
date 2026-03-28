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
    await expect(page.locator('text=Eating')).toBeVisible();
    await expect(page.locator('text=Water')).toBeVisible();
    await expect(page.locator('text=200 ml')).toBeVisible();
    await expect(page.locator('text=Salt')).toBeVisible();
    await expect(page.locator('text=450 mg')).toBeVisible();

    // Confirm all linked records
    await page.click('button:has-text("Confirm All")');

    // Verify success toast
    await expect(page.locator('text=Food logged')).toBeVisible();
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
    // Click the first available preset button (e.g., "Espresso") in the coffee tab content
    // Presets render as buttons in a grid within the active tab panel
    const presetButton = page.locator('[role="tabpanel"] button').first();
    await expect(presetButton).toBeVisible();
    await presetButton.click();

    // Per D-01: verify substance auto-calc is displayed after selecting a coffee preset
    // The PresetTab displays calculated caffeine as "{N} mg caffeine"
    // Scope to the Liquids card area to avoid matching other mg values on the page
    await expect(page.locator('text=/\\d+\\s*mg caffeine/i')).toBeVisible();

    // After selecting a preset, volume and substance fields are populated
    // Click "Log Entry" button to submit the entry
    const logButton = page.locator('button:has-text("Log Entry")');
    await expect(logButton).toBeVisible();
    await logButton.click();

    // Verify success feedback toast
    await expect(page.locator('text=/recorded/i')).toBeVisible();
  });
});
