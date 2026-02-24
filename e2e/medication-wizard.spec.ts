import { test, expect } from '@playwright/test';

test.describe('Medication Wizard', () => {
  test('should mock AI search and create medication', async ({ page }) => {
    // Mock the AI API
    await page.route('/api/ai/medicine-search', async route => {
      const json = {
        brandNames: ['Aviolix'],
        genericName: 'Aviolix Compound',
        dosageStrengths: ['75mg'],
        commonIndications: ['Testing'],
        foodInstruction: 'after',
        foodNote: 'Take with food',
        pillColor: 'purple',
        pillShape: 'round',
        pillDescription: 'A purple reddish round pill',
        drugClass: 'Test Class'
      };
      await route.fulfill({ json });
    });

    // Go to medications page
    await page.goto('/medications');

    // Ensure the page is loaded
    await expect(page.locator('text=Medications').first()).toBeVisible();

    // Click "Add a med"
    await page.click('button:has-text("Add a med")');

    // Wait for the wizard drawer
    await expect(page.locator('text=Search Medicine')).toBeVisible();

    // Type in the search query
    await page.fill('input[placeholder="e.g. Aviolix, Clopidogrel..."]', 'Aviolix 75mg');

    // Press Enter to trigger search
    await page.keyboard.press('Enter');

    // Wait for the mock response to populate
    await expect(page.locator('text=Found: Aviolix Compound')).toBeVisible();
    await expect(page.locator('text=Appearance: A purple reddish round pill')).toBeVisible();

    // Verify Brand Name input is populated
    await expect(page.locator('input[value="Aviolix"]')).toBeVisible();

    // Step 2: Appearance
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Pill Appearance')).toBeVisible();
    
    // We expect "purple" and "round" to be active. In the UI, the custom color text might show the hex
    // #9C27B0 is purple from COLOR_NAME_MAP
    await expect(page.locator('text=#9C27B0').or(page.locator('text=purple'))).toBeVisible();

    // Step 3: Indication
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Indication & Notes')).toBeVisible();

    // Verify Food Instruction is set to "After eating"
    // Since "After eating" is the label and it's selected, it should have the active class
    const afterEatingBtn = page.locator('button', { hasText: 'After eating' });
    await expect(afterEatingBtn).toHaveClass(/bg-teal-50|text-teal-700/);

    // Verify Food note
    await expect(page.locator('input[value="Take with food"]')).toBeVisible();

    // Step 4: Dosage
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Dosage')).toBeVisible();

    // Step 5: Schedule
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Schedule 1')).toBeVisible();

    // Step 6: Inventory
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();

    // Fill inventory to enable Save
    await page.fill('input[placeholder="e.g. 36"]', '30');

    // Save Medication
    await page.click('button:has-text("Save Medication")');

    // Go to the Medications tab to view the active meds list
    await page.click('button:has-text("Medications")');

    // Verify it appears in the active meds list
    await expect(page.locator('text=Aviolix').first()).toBeVisible();
  });
});
