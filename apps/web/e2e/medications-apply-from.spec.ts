import { test, expect, type Page } from '@playwright/test';
import { DAY, prepare, readStore, seedSlot, ZONE } from './helpers/meds';

/**
 * "Apply from" schedule edits (Medisafe parity, PR 2b). One medicine is due
 * at 08:30 Berlin time; today is Monday 2026-10-19 and the page clock is at
 * 10:00. The edit drawer changes the time to 09:00 from a date; the week
 * strip shows yesterday, today and tomorrow. Offline, no AI.
 */

const YESTERDAY = '18';
const TODAY = '19';
const TOMORROW = '20';

const win = (page: Page) => page.getByTestId('window');
const drawer = (page: Page) => page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Schedule' }) });

/** Select a day of the week strip by its date number, paging a week if needed. */
async function showDay(page: Page, date: string) {
  const day = win(page).getByRole('button', { name: new RegExp(`^\\D+ ${date}$`) });
  // The week starts on Monday: Sunday the 18th is in the week before.
  if (!(await day.count())) {
    await win(page).getByRole('button', { name: date === YESTERDAY ? 'Previous week' : 'Next week' }).click();
  }
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
}

/** The slot times shown for the selected day. */
async function expectSlots(page: Page, date: string, times: string[], status?: string) {
  await showDay(page, date);
  const slots = win(page).getByTestId('time-slot');
  await expect(slots).toHaveCount(times.length);
  for (const [i, t] of times.entries()) await expect(slots.nth(i)).toHaveAttribute('data-time', t);
  if (status) await expect(slots.first().getByTestId('dose-row')).toHaveAttribute('data-status', status);
}

/** Open the edit drawer from the dose dialog, set 09:00, apply from `date`, save. */
async function editTimeFrom(page: Page, applyFrom: string) {
  await win(page).getByRole('button', { name: /^Brand1(, .*)?\. Open dose$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit Generic1' }).click();
  const d = drawer(page);
  await expect(d).toBeVisible();
  await d.getByLabel('Time').fill('09:00');

  const field = d.getByLabel('Apply from');
  await expect(field).toHaveValue(DAY);
  await expect(field).toHaveAttribute('min', DAY);
  await field.fill(applyFrom);
  await d.getByRole('button', { name: 'Save schedule' }).click();
  await expect(d.getByRole('button', { name: 'Save schedule' })).toBeHidden();
  // The drawer stays open after the save, also when the save replaced the
  // dose's schedule row; the dose dialog under it follows the dose.
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Tapping the dose again opens only the dose dialog, not the edit drawer. */
async function expectDoseDialogOnly(page: Page) {
  await win(page).getByRole('button', { name: /^Brand1(, .*)?\. Open dose$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit Generic1' })).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('Medications: Apply from schedule edits', () => {
  test.use({ timezoneId: ZONE, locale: 'en-GB' });

  test('Apply from today: yesterday keeps 08:30, today and tomorrow show 09:00', async ({ page }) => {
    await prepare(page, '10:00');
    await seedSlot(page, 1);
    await expectSlots(page, TODAY, ['08:30']);

    await editTimeFrom(page, DAY);
    await expect(page.getByText('The change starts today.', { exact: true })).toBeVisible();
    await expectDoseDialogOnly(page);

    await expectSlots(page, YESTERDAY, ['08:30'], 'missed');
    await expectSlots(page, TODAY, ['09:00']);
    await expectSlots(page, TOMORROW, ['09:00'], 'pending');

    // The old row is kept, closed at today; the new one starts today.
    const rows = await readStore(page, 'phaseSchedules');
    expect(rows.find((r) => r.id === 'e2e-schedule-1')).toMatchObject({ time: '08:30', effectiveTo: DAY });
    expect(rows.find((r) => r.id !== 'e2e-schedule-1')).toMatchObject({ time: '09:00', effectiveFrom: DAY });
  });

  test('Apply from tomorrow: yesterday and today keep 08:30, tomorrow shows 09:00', async ({ page }) => {
    await prepare(page, '10:00');
    await seedSlot(page, 1);

    await editTimeFrom(page, '2026-10-20');
    await expect(page.getByText('The change starts tomorrow. Days before it keep their schedule.', { exact: true })).toBeVisible();

    await expectSlots(page, YESTERDAY, ['08:30'], 'missed');
    await expectSlots(page, TODAY, ['08:30']);
    await expectSlots(page, TOMORROW, ['09:00'], 'pending');
  });

  test("today's dose already taken: Apply from today keeps it under 08:30 and starts 09:00 tomorrow", async ({ page }) => {
    await prepare(page, '10:00');
    await seedSlot(page, 1, [{ status: 'taken', at: '08:35' }]);

    await editTimeFrom(page, DAY);
    await expect(page.getByText("Today's dose is already logged. The change starts tomorrow.", { exact: true })).toBeVisible();

    await expectSlots(page, TODAY, ['08:30'], 'taken');
    await expectSlots(page, TOMORROW, ['09:00'], 'pending');
    await expectSlots(page, YESTERDAY, ['08:30'], 'missed');
  });
});
