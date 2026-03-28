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

  test('should create medication and log a dose with inventory decrement', async ({ page }) => {
    // Mock the AI API (same as existing test)
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
    await expect(page.locator('text=Medications').first()).toBeVisible();

    // === Create medication via wizard (same flow as existing test) ===
    await page.click('button:has-text("Add a med")');
    await expect(page.locator('text=Search Medicine')).toBeVisible();

    await page.fill('input[placeholder="e.g. Aviolix, Clopidogrel..."]', 'Aviolix 75mg');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Found: Aviolix Compound')).toBeVisible();

    // Step 2: Appearance
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Pill Appearance')).toBeVisible();

    // Step 3: Indication
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Indication & Notes')).toBeVisible();

    // Step 4: Dosage
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Dosage')).toBeVisible();

    // Step 5: Schedule
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Schedule 1')).toBeVisible();

    // Step 6: Inventory
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();
    await page.fill('input[placeholder="e.g. 36"]', '30');

    // Save
    await page.click('button:has-text("Save Medication")');

    // === Navigate to Schedule tab to find today's dose slot ===
    // After wizard closes, navigate to Schedule tab in the footer tab bar
    // The tab label is "Schedule" (from med-footer.tsx TABS config)
    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await scheduleTab.first().click();

    // Wait for the schedule view to render — look for the medication name in a dose slot
    // The schedule shows dose slots for today by default, grouped by time
    const doseSlot = page.locator('text=Aviolix Compound').first();
    await expect(doseSlot).toBeVisible({ timeout: 10000 });

    // Click the dose slot to open the DoseDetailDialog
    // The dose row is clickable when status is not "pending" (actionable rows have Take/Skip buttons)
    // For a pending dose on today, the row has inline Take/Skip buttons
    // Click the inline "Take" button on the dose row
    const takeRowButton = page.locator('button:has-text("Take")').first();
    await expect(takeRowButton).toBeVisible({ timeout: 5000 });
    await takeRowButton.click();

    // === Per D-02: Verify dose recorded in history ===
    // After Take, the dose row should update to show "Taken at" text (from dose-row.tsx)
    await expect(page.locator('text=/Taken at/')).toBeVisible({ timeout: 5000 });

    // === Per D-02: Verify inventory decremented ===
    // Navigate to the Medications tab (labeled "Meds" in the footer tab bar) to check inventory
    // compound-card.tsx displays "{currentStock} pills" — should now be "29 pills" (was 30)
    const medsTab = page.locator('button', { hasText: 'Meds' });
    await medsTab.first().click();

    // Wait for the compound card to render with the updated inventory
    // The card shows "Aviolix" brand name and "{N} pills" stock display
    await expect(page.locator('text=Aviolix').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=29 pills')).toBeVisible({ timeout: 5000 });
  });
});
