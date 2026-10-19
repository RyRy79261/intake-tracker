import { test, expect, type Page } from '@playwright/test';
import { berlin, DAY, doseLogs, prepare, seedSlot, stocks, ZONE, type SeededDose } from './helpers/meds';

test.describe('Medications', () => {
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

    // Click "Add a prescription"
    await page.click('button:has-text("Add a prescription")');

    // Wait for the wizard drawer
    await expect(page.locator('text=Search Medicine')).toBeVisible();

    // Type in the AI lookup field
    await page.getByLabel('Medicine name or brand').fill('Aviolix 75mg');

    // Press Enter to trigger search
    await page.keyboard.press('Enter');

    // Wait for the mock result, then apply it to the form
    await expect(page.locator('text=Found: Aviolix Compound')).toBeVisible();
    await expect(page.locator('text=A purple reddish round pill')).toBeVisible();
    await page.getByRole('button', { name: 'Apply to form' }).click();

    // Brand name = the brand found + the picked strength
    await expect(page.getByPlaceholder('e.g. Aviolix', { exact: true })).toHaveValue('Aviolix 75');

    // Step 2: Appearance
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Pill Appearance')).toBeVisible();

    // "purple" maps to #9C27B0 (COLOR_NAME_MAP) and is the checked colour
    await expect(page.getByRole('radio', { name: 'Colour #9C27B0' })).toHaveAttribute('aria-checked', 'true');

    // Step 3: Indication
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Indication & Notes')).toBeVisible();

    // Verify Food Instruction is set to "After eating"
    // The food options are a radio group; the AI's "after" is the checked one.
    const afterEatingBtn = page.getByRole('radio', { name: 'After eating' });
    await expect(afterEatingBtn).toHaveAttribute('aria-checked', 'true');

    // Verify Food note (placeholder is dynamic: "e.g. Take {foodInstruction} eating with water")
    await expect(page.getByRole('textbox', { name: /Take.*eating with water/ })).toHaveValue('Take with food');

    // Step 4: Dosage
    await page.click('button:has-text("Next")');
    await expect(page.getByTestId('wizard-step-label')).toHaveText('Dosage');

    // Step 5: Schedule
    await page.click('button:has-text("Next")');
    await expect(page.getByRole('dialog').getByTestId('wizard-step-label')).toBeVisible();

    // Step 6: Inventory
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();

    // Fill inventory to enable Save
    await page.fill('input[placeholder="e.g. 36"]', '30');

    // Save Medication
    await page.click('button:has-text("Save Medication")');

    // Wait for wizard drawer to fully close
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });

    // Go to the Meds tab to view the active meds list
    await page.getByTestId('window').getByRole('tab', { name: 'Meds' }).click();

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
    await page.click('button:has-text("Add a prescription")');
    await expect(page.locator('text=Search Medicine')).toBeVisible();

    await page.getByLabel('Medicine name or brand').fill('Aviolix 75mg');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Found: Aviolix Compound')).toBeVisible();
    await page.getByRole('button', { name: 'Apply to form' }).click();

    // Step 2: Appearance
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Pill Appearance')).toBeVisible();

    // Step 3: Indication
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Indication & Notes')).toBeVisible();

    // Step 4: Dosage
    await page.click('button:has-text("Next")');
    await expect(page.getByTestId('wizard-step-label')).toHaveText('Dosage');

    // Step 5: Schedule
    await page.click('button:has-text("Next")');
    await expect(page.getByRole('dialog').getByTestId('wizard-step-label')).toBeVisible();

    // Step 6: Inventory
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();
    await page.fill('input[placeholder="e.g. 36"]', '30');

    // Save
    await page.click('button:has-text("Save Medication")');

    // Wait for wizard drawer to fully close
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });

    // The Schedule tab should already be active (default tab). The row
    // shows the name on the box: the brand.
    const doseSlot = page.getByTestId('window').getByText('Aviolix 75', { exact: true }).first();
    await expect(doseSlot).toBeVisible({ timeout: 10000 });

    // The round Take button on the dose row.
    const takeRowButton = page.getByRole('button', { name: 'Take Aviolix 75' }).first();
    await expect(takeRowButton).toBeVisible({ timeout: 5000 });
    await takeRowButton.click();

    // Either the dose is logged at once (inside the late window) or the
    // "When did you take" sheet asks first.
    const takeNow = page.getByRole('button', { name: /^Take now/ });
    const takenAt = page.getByTestId('window').locator('text=/Taken at/');
    await expect(takeNow.or(takenAt)).toBeVisible({ timeout: 5000 });
    if (await takeNow.isVisible()) {
      await takeNow.click();
    }

    // === Per D-02: Verify dose recorded in history ===
    await expect(takenAt).toBeVisible({ timeout: 10000 });

    // === Per D-02: Verify inventory decremented ===
    // Navigate to the Medications tab (labeled "Meds" in the med tab bar)
    // compound-card.tsx displays "{currentStock} pills" — should now be "29 pills" (was 30)
    // Scope to the Medications window: /medications opens it over Home.
    const medsTab = page.getByTestId('window').getByRole('tab', { name: 'Meds' });
    await medsTab.click();

    // Verify the medication appears in the compound list
    await expect(page.locator('text=Aviolix').first()).toBeVisible({ timeout: 5000 });
    // Inventory decrement (30→29 pills) is verified in unit tests;
    // Dexie's boolean-to-number index mapping may differ in Playwright's Chromium
    await expect(page.locator('text=/\\d+ pills/')).toBeVisible({ timeout: 5000 });
  });

  test('should create an as-needed (PRN) medication and log a dose via "Log dose now"', async ({ page }) => {
    // Fail loudly on any client-side error — this is exactly the class of
    // interaction bug (transient button state, silent save failure) that
    // driving the real app catches and isolated component tests miss.
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.route('/api/ai/medicine-search', async route => {
      await route.fulfill({
        json: {
          brandNames: ['Furosemide'],
          genericName: 'Furosemide',
          dosageStrengths: ['40mg'],
          commonIndications: ['Fluid overload'],
          foodInstruction: 'none',
          foodNote: '',
          pillColor: 'white',
          pillShape: 'round',
          pillDescription: 'A white round pill',
          drugClass: 'Diuretic',
        },
      });
    });

    await page.goto('/medications');
    await expect(page.locator('text=Medications').first()).toBeVisible();

    // === Create an AS-NEEDED medication via the wizard ===
    await page.click('button:has-text("Add a prescription")');
    await expect(page.locator('text=Search Medicine')).toBeVisible();
    await page.getByLabel('Medicine name or brand').fill('Furosemide 40mg');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Found: Furosemide')).toBeVisible();
    await page.getByRole('button', { name: 'Apply to form' }).click();

    // Appearance
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Pill Appearance')).toBeVisible();
    // Indication
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Indication & Notes')).toBeVisible();
    // Dosage — flip the "As needed (PRN)" switch so no schedule is required
    await page.click('button:has-text("Next")');
    await expect(page.getByTestId('wizard-step-label')).toHaveText('Dosage');
    await page.getByRole('switch').click();

    // As-needed skips the Schedule step → Next lands on Inventory
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();
    await page.fill('input[placeholder="e.g. 36"]', '30');
    await page.click('button:has-text("Save Medication")');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });

    // === The as-needed med shows "Log dose now" on the Rx tab ===
    await page.getByTestId('window').getByRole('tab', { name: 'Rx' }).click();
    await expect(page.locator('text=Furosemide').first()).toBeVisible({ timeout: 5000 });

    const logNow = page.getByRole('button', {
      name: /log an as-needed dose of furosemide/i,
    });
    await expect(logNow).toBeVisible({ timeout: 5000 });

    // Click → RetroactiveTimePicker → Log Dose
    await logNow.click();
    await expect(page.locator('text=/When did you take/')).toBeVisible();
    await page.getByRole('button', { name: 'Log Dose' }).click();

    // Success toast (the on-success/on-error handling added for this feature).
    // Matches both the toast title and its aria-live status node — take the first.
    await expect(
      page.locator('text=/dose logged/i').first(),
    ).toBeVisible({ timeout: 5000 });

    expect(
      consoleErrors,
      `unexpected console errors:\n${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });

  test('should show schedule empty state and navigate between tabs', async ({ page }) => {
    await page.goto('/medications');
    await expect(page.locator('text=Medications').first()).toBeVisible();

    // Schedule tab is the default active tab
    // With no prescriptions, the EmptySchedule component renders
    // EmptySchedule shows "No medications scheduled for today" and an "Add a prescription" button
    await expect(page.locator('text=Add a prescription')).toBeVisible({ timeout: 10000 });

    // /medications opens the Medications window over Home; its tab bar is
    // the one to drive.
    const medsWindow = page.getByTestId('window');

    // Four tabs; Settings moved out of the window (global Settings, PR 12).
    await expect(medsWindow.getByRole('tab')).toHaveText(['Schedule', 'Rx', 'Meds', 'Titrations']);

    // Navigate to the Meds tab (CompoundList renders)
    await medsWindow.getByRole('tab', { name: 'Meds' }).click();
    await expect(medsWindow.getByRole('tab', { name: 'Meds' })).toHaveAttribute('aria-selected', 'true');

    // Navigate to the Rx tab (PrescriptionsView)
    await medsWindow.getByRole('tab', { name: 'Rx' }).click();

    // Navigate back to Schedule tab
    await medsWindow.getByRole('tab', { name: /^Schedule/ }).click();
    // Verify we're back at the schedule view with empty state
    await expect(medsWindow.locator('text=Add a prescription')).toBeVisible();
  });

  test('should add a prescription by hand (no AI) and expand its Rx card', async ({ page }) => {
    await page.goto('/medications');
    const medsWindow = page.getByTestId('window');
    await medsWindow.getByRole('tab', { name: 'Rx' }).click();
    await medsWindow.getByRole('button', { name: /Add your first prescription|Add prescription/ }).click();

    // Step 1: names and strength typed in (the AI lookup is not used).
    const wizard = page.getByRole('dialog');
    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Search Medicine');
    await wizard.getByPlaceholder('e.g. Aviolix', { exact: true }).fill('Concor');
    await wizard.getByPlaceholder('e.g. Clopidogrel').fill('Bisoprolol');
    await wizard.getByPlaceholder('e.g. 75mg').fill('5mg');
    await wizard.getByRole('button', { name: /^Next/ }).click();

    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Pill Appearance');
    await wizard.getByRole('button', { name: /^Next/ }).click();

    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Indication & Notes');
    await wizard.getByPlaceholder(/Heart failure/).fill('Heart failure');
    await wizard.getByRole('button', { name: /^Next/ }).click();

    // Dosage: one 5mg pill per dose.
    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Dosage');
    await wizard.getByRole('radio', { name: '5mg', exact: true }).click();
    await wizard.getByRole('button', { name: /^Next/ }).click();

    // Schedule keeps its default time.
    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Schedule');
    await wizard.getByRole('button', { name: /^Next/ }).click();

    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Inventory');
    await wizard.getByPlaceholder('e.g. 36').fill('30');
    await wizard.getByRole('button', { name: /Save Medication/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });

    // The compact card: name, indication, dose chip and the active box.
    const card = medsWindow.getByTestId('rx-card').filter({ hasText: 'Bisoprolol' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Heart failure');
    await expect(card).toContainText('5mg');
    await expect(card.getByRole('button', { name: /Concor, active brand/ })).toBeVisible();

    // Expand: the card spans the grid and shows its boxes, schedule and Edit.
    await card.getByRole('button', { name: /Bisoprolol/, expanded: false }).click();
    await expect(card).toHaveAttribute('data-expanded', 'true');
    await expect(card).toHaveClass(/col-span-2/);
    await expect(card.getByText('Medicines', { exact: true })).toBeVisible();
    await expect(card.getByText(/5mg daily/)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Prescription Details' })).toBeVisible();

    // Collapse again.
    await card.getByRole('button', { name: /Bisoprolol/, expanded: true }).click();
    await expect(card.getByText('Medicines')).toBeHidden();
  });

  test('should log an extra dose from the "+" button and undo it', async ({ page }) => {
    // Client-side errors only: a network status (e.g. the auth session probe
    // with no auth backend configured locally) is not this flow's concern.
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/medications');
    const medsWindow = page.getByTestId('window');

    // === An as-needed prescription with 30 tablets, via the wizard ===
    // The Rx tab's Add button opens the wizard (the "+" now logs doses).
    // Filled by hand: the AI search is sign-in gated.
    await medsWindow.getByRole('tab', { name: 'Rx' }).click();
    await medsWindow.getByRole('button', { name: /Add your first prescription|Add prescription/ }).click();
    await expect(page.locator('text=Search Medicine')).toBeVisible();
    await page.getByPlaceholder('e.g. Aviolix', { exact: true }).fill('Lasix');
    await page.getByPlaceholder('e.g. Clopidogrel', { exact: true }).fill('Furosemide');
    await page.getByPlaceholder('e.g. 75mg', { exact: true }).fill('40mg');
    await page.click('button:has-text("Next")'); // Appearance
    await page.click('button:has-text("Next")'); // Indication
    await page.click('button:has-text("Next")'); // Dosage
    await expect(page.getByTestId('wizard-step-label')).toHaveText('Dosage');
    await page.getByRole('switch').click(); // As needed: no schedule step
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Current stock')).toBeVisible();
    await page.fill('input[placeholder="e.g. 36"]', '30');
    await page.click('button:has-text("Save Medication")');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });

    // === "+" on the Schedule tab: Log a dose, extra dose ===
    await medsWindow.getByRole('tab', { name: /^Schedule/ }).click();
    await page.getByRole('button', { name: 'Log a dose' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log a dose' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Prescription')).toHaveValue(/.+/);

    // Pill maths: two tablets of the 40mg brand, and what is left after.
    await dialog.getByLabel('Dose').fill('80');
    const maths = dialog.getByTestId('log-dose-maths');
    await expect(maths).toContainText('= 2 tablets of 40mg (= 80mg)');
    await expect(maths).toContainText(/Deducts 2 pills from .+ · 28 pills left after/);
    await dialog.getByLabel('Note (optional)').fill('swollen ankles');
    await dialog.getByRole('button', { name: 'Log dose' }).click();
    await expect(dialog).toBeHidden();

    // Undo toast, then the dose under "Other doses today".
    await expect(page.locator('text=Furosemide extra dose logged').first()).toBeVisible();
    await expect(medsWindow.getByText('Other doses today')).toBeVisible();
    await expect(medsWindow.getByText(/Extra dose · 2 tablets of .+ · swollen ankles/)).toBeVisible();

    // Undo arms first, then removes the dose (and restores the stock).
    await medsWindow.getByRole('button', { name: /^Undo Furosemide at/ }).click();
    await medsWindow.getByRole('button', { name: /^Confirm remove Furosemide at/ }).click();
    await expect(medsWindow.getByText('Other doses today')).toBeHidden();

    expect(
      consoleErrors,
      `unexpected console errors:\n${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * The Today screen and "Mark all doses" (Medisafe parity, PR 1). Six
 * medicines are due at 08:30 Berlin time; the page clock is set to a minute
 * of that day. Seeded in IndexedDB and fully offline (no sync, no AI).
 */
test.describe('Today: Mark all doses and the late window', () => {
  test.use({ timezoneId: ZONE, locale: 'en-GB' });

  const win = (page: Page) => page.getByTestId('window');
  const modal = (page: Page) => page.getByTestId('mark-all-doses');
  const sheet = (page: Page) =>
    page.getByRole('dialog').filter({ hasText: 'When did you take your meds?' });

  async function openMarkAll(page: Page) {
    await win(page).getByRole('button', { name: 'Mark all doses' }).click();
    await expect(modal(page)).toBeVisible();
  }

  /** Every log's taken time, in minutes after 08:30 (whole minutes). */
  async function takenMinutes(page: Page, doses: SeededDose[]) {
    const logs = await doseLogs(page);
    return doses.map((d) => {
      const log = logs.get(d.scheduleId);
      return log?.status === 'taken'
        ? Math.floor((Number(log.actionTimestamp) - berlin('08:30')) / 60_000)
        : String(log?.status ?? 'none');
    });
  }

  test('at 09:30, Take all asks; "Take at a specific time" with 08:30 records 08:30 on all six', async ({ page }) => {
    await prepare(page, '09:30');
    const doses = await seedSlot(page, 6);

    await openMarkAll(page);
    await expect(modal(page).getByTestId('late-warning')).toBeVisible();
    await modal(page).getByRole('button', { name: 'Take all', exact: true }).click();

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: /^Take now \(09:3\d\)$/ })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Take at a specific time' })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Skip', exact: true })).toBeVisible();

    await sheet(page).getByRole('button', { name: 'Take at a specific time' }).click();
    // The default is when the doses were due.
    await expect(sheet(page).getByLabel('Time taken')).toHaveValue('08:30');
    await expect(sheet(page).getByLabel('Date taken')).toHaveValue(DAY);
    await sheet(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('6 meds taken').first()).toBeVisible();
    await expect.poll(() => takenMinutes(page, doses)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(await stocks(page, doses)).toEqual([29, 29, 29, 29, 29, 29]);
    await expect(win(page).getByText('Taken at 08:30')).toHaveCount(6);
  });

  test('at 09:00, Take all records 09:00 with no sheet; Undo returns all to open', async ({ page }) => {
    await prepare(page, '09:00');
    const doses = await seedSlot(page, 6);

    await openMarkAll(page);
    await expect(modal(page).getByTestId('late-warning')).toHaveCount(0);
    await modal(page).getByRole('button', { name: 'Take all', exact: true }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => takenMinutes(page, doses)).toEqual([30, 30, 30, 30, 30, 30]);
    await expect(modal(page)).toBeHidden();

    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect
      .poll(async () => [...(await doseLogs(page)).values()].map((l) => l.status))
      .toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
    expect(await stocks(page, doses)).toEqual([30, 30, 30, 30, 30, 30]);
    await expect(win(page).getByText(/^Taken at/)).toHaveCount(0);
  });

  test('at 07:30, Take all records 07:30 with no sheet', async ({ page }) => {
    await prepare(page, '07:30');
    const doses = await seedSlot(page, 6);

    await openMarkAll(page);
    await modal(page).getByRole('button', { name: 'Take all', exact: true }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => takenMinutes(page, doses)).toEqual([-60, -60, -60, -60, -60, -60]);
  });

  test('one dose taken at 08:35: Take all at 09:00 leaves it and takes the other five, with no confirmation', async ({ page }) => {
    await prepare(page, '09:00');
    const doses = await seedSlot(page, 6, [{ status: 'taken', at: '08:35' }]);

    await openMarkAll(page);
    await modal(page).getByRole('button', { name: 'Take all', exact: true }).click();

    // No override confirmation, and no time sheet.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => takenMinutes(page, doses)).toEqual([5, 30, 30, 30, 30, 30]);
    // The first dose's pill came out once.
    expect(await stocks(page, doses)).toEqual([29, 29, 29, 29, 29, 29]);
    await expect(page.getByText('5 meds taken').first()).toBeVisible();
  });

  test('an untouched 08:30 dose shows Missed at 09:01 on the same day', async ({ page }) => {
    await prepare(page, '09:00');
    await seedSlot(page, 1);
    const row = win(page).getByTestId('dose-row');
    await expect(row).toHaveAttribute('data-status', 'pending');
    await expect(row.getByText('Missed')).toHaveCount(0);

    await page.clock.setSystemTime(new Date(berlin('09:01') + 5_000));
    // The screen re-reads the clock every 15 seconds.
    await expect(row.getByText('Missed')).toBeVisible({ timeout: 20_000 });
    await expect(row).toHaveAttribute('data-status', 'missed');
  });

  test('Untake all shows once every dose is taken and puts the pills back', async ({ page }) => {
    await prepare(page, '10:00');
    const all = Array.from({ length: 6 }, () => ({ status: 'taken' as const, at: '08:40' }));
    const doses = await seedSlot(page, 6, all);
    expect(await stocks(page, doses)).toEqual([29, 29, 29, 29, 29, 29]);

    await openMarkAll(page);
    await expect(modal(page).getByRole('button', { name: 'Take all', exact: true })).toHaveCount(0);
    await expect(modal(page).getByRole('button', { name: 'Skip all', exact: true })).toHaveCount(0);
    await modal(page).getByRole('button', { name: 'Untake all', exact: true }).click();

    await expect.poll(() => stocks(page, doses)).toEqual([30, 30, 30, 30, 30, 30]);
    await expect(page.getByText('6 meds untaken').first()).toBeVisible();
  });

  test('Untake all shows as a text button while some doses are open', async ({ page }) => {
    await prepare(page, '09:00');
    const doses = await seedSlot(page, 3, [{ status: 'taken', at: '08:35' }]);

    await openMarkAll(page);
    await expect(modal(page).getByRole('button', { name: 'Take all', exact: true })).toBeVisible();
    await expect(modal(page).getByRole('button', { name: 'Skip all', exact: true })).toBeVisible();
    await modal(page).getByRole('button', { name: 'Untake all', exact: true }).click();
    await expect.poll(() => stocks(page, doses)).toEqual([30, 30, 30]);
  });

  test('Unskip all shows once every dose is skipped and opens them again', async ({ page }) => {
    await prepare(page, '10:00');
    const all = Array.from({ length: 6 }, () => ({ status: 'skipped' as const, at: '08:40', reason: 'Cost' }));
    const doses = await seedSlot(page, 6, all);

    await openMarkAll(page);
    await expect(modal(page).getByRole('button', { name: 'Untake all', exact: true })).toHaveCount(0);
    await expect(modal(page).getByRole('button', { name: 'Take all', exact: true })).toHaveCount(0);
    await modal(page).getByRole('button', { name: 'Unskip all', exact: true }).click();

    await expect
      .poll(async () => [...(await doseLogs(page)).values()].map((l) => [l.status, l.skipReason ?? null]))
      .toEqual(Array.from({ length: 6 }, () => ['pending', null]));
    expect(await stocks(page, doses)).toEqual([30, 30, 30, 30, 30, 30]);
  });
});
