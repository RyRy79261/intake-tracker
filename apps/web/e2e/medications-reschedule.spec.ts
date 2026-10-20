import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createInMemorySyncServer } from '../src/__tests__/helpers/in-memory-sync-server';
import { berlin, DAY, doseLogs, prepare, seedSlot, stocks, ZONE } from './helpers/meds';

/**
 * Rescheduling (Medisafe parity, PR 2). Medicines are due at 08:30 Berlin
 * time on Monday 2026-10-19; the page clock is set to a minute of that day.
 * Seeded in IndexedDB and offline (no AI; sync answered in-process for the
 * two-device check).
 */

const NEXT_DAY = '2026-10-20';
const TWO_DAYS = '2026-10-21';

const win = (page: Page) => page.getByTestId('window');
const modal = (page: Page) => page.getByTestId('mark-all-doses');
const resched = (page: Page) => page.getByTestId('reschedule-sheet');
const takenSheet = (page: Page) => page.getByRole('dialog').filter({ hasText: /^When did you take/ });

async function openDose(page: Page, brand: string) {
  await win(page).getByRole('button', { name: new RegExp(`^${brand}(, .*)?\\. Open dose$`) }).click();
}

async function rescheduleTo(page: Page, date: string, time: string) {
  await expect(resched(page)).toBeVisible();
  await expect(resched(page).getByRole('heading', { name: 'Reschedule for' })).toBeVisible();
  await resched(page).getByLabel('Reschedule date').fill(date);
  await resched(page).getByLabel('Reschedule time').fill(time);
  await resched(page).getByRole('button', { name: 'Reschedule', exact: true }).click();
  await expect(resched(page)).toBeHidden();
}

/** Move the page clock to an instant; the day key re-reads it every minute. */
async function clockTo(page: Page, instant: number) {
  await page.clock.setSystemTime(new Date(instant));
  await page.clock.runFor(61_000);
}

test.describe('Today: rescheduling', () => {
  test.use({ timezoneId: ZONE, locale: 'en-GB' });

  test('one 08:30 dose rescheduled to 10:00 stays under 08:30; at 10:05 Take records now with no sheet', async ({ page }) => {
    await prepare(page, '09:00');
    const [dose] = await seedSlot(page, 1);

    await openDose(page, 'Brand1');
    await page.getByRole('dialog').getByRole('button', { name: 'Reschedule', exact: true }).click();
    await rescheduleTo(page, DAY, '10:00');

    const slot = win(page).getByTestId('time-slot');
    await expect(slot).toHaveAttribute('data-time', '08:30');
    await expect(slot.getByTestId('slot-time')).toHaveText('08:30');
    await expect(slot.getByTestId('dose-status')).toHaveText('Rescheduled for 10:00');
    await expect.poll(async () => (await doseLogs(page)).get(dose!.scheduleId)?.remindAt).toBe(berlin('10:00'));

    // Past the old 09:00 end of the reminder period, it is not missed.
    await clockTo(page, berlin('10:05'));
    await expect(slot.getByTestId('dose-row')).toHaveAttribute('data-status', 'rescheduled');
    const tappedAt = await page.evaluate(() => Date.now());
    await win(page).getByRole('button', { name: 'Take Brand1' }).click();
    await expect(takenSheet(page)).toHaveCount(0);
    // "Now": the minute of the tap (the clock ran on a minute past 10:05).
    await expect
      .poll(async () => {
        const log = (await doseLogs(page)).get(dose!.scheduleId);
        return log?.status === 'taken' ? Math.floor((Number(log.actionTimestamp) - tappedAt) / 60_000) : log?.status;
      })
      .toBe(0);
    expect(await stocks(page, [dose!])).toEqual([29]);
  });

  test('Cancel reschedule puts the dose back to 08:30', async ({ page }) => {
    await prepare(page, '09:00');
    const [dose] = await seedSlot(page, 1, [{ status: 'rescheduled', at: '08:45', remindAt: berlin('11:00') }]);

    await expect(win(page).getByTestId('dose-status')).toHaveText('Rescheduled for 11:00');
    await openDose(page, 'Brand1');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Scheduled for 08:30', { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel reschedule' }).click();
    await expect.poll(async () => (await doseLogs(page)).get(dose!.scheduleId)?.status).toBe('pending');
    await expect(win(page).getByTestId('dose-status')).toHaveCount(0);
  });

  test('"Reschedule" in the modal moves every open dose; Undo restores them', async ({ page }) => {
    await prepare(page, '09:00');
    const doses = await seedSlot(page, 3, [{ status: 'taken', at: '08:35' }]);

    await win(page).getByRole('button', { name: 'Mark all doses' }).click();
    await expect(modal(page)).toBeVisible();
    await modal(page).getByRole('button', { name: 'Reschedule', exact: true }).click();
    await rescheduleTo(page, DAY, '10:00');

    await expect(page.getByText('2 meds rescheduled for 10:00').first()).toBeVisible();
    await expect.poll(async () => {
      const logs = await doseLogs(page);
      return doses.map((d) => [logs.get(d.scheduleId)?.status, logs.get(d.scheduleId)?.remindAt ?? null]);
    }).toEqual([
      ['taken', null],
      ['rescheduled', berlin('10:00')],
      ['rescheduled', berlin('10:00')],
    ]);
    await expect(win(page).getByText('Rescheduled for 10:00')).toHaveCount(2);
    await expect(modal(page)).toBeHidden();

    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect
      .poll(async () => {
        const logs = await doseLogs(page);
        return doses.map((d) => logs.get(d.scheduleId)?.status);
      })
      .toEqual(['taken', 'pending', 'pending']);
    await expect(win(page).getByText(/^Rescheduled for/)).toHaveCount(0);
    expect(Number((await doseLogs(page)).get(doses[0]!.scheduleId)?.actionTimestamp)).toBe(berlin('08:35'));
  });

  test('a 22:00 dose rescheduled to 00:30 shows in "From earlier days" after midnight and is not missed', async ({ page }) => {
    await prepare(page, '22:05');
    const [dose] = await seedSlot(page, 1, [], ['22:00']);

    await openDose(page, 'Brand1');
    await page.getByRole('dialog').getByRole('button', { name: 'Reschedule', exact: true }).click();
    await expect(resched(page)).toBeVisible();
    await resched(page).getByRole('button', { name: 'Tomorrow' }).click();
    await rescheduleTo(page, NEXT_DAY, '00:30');
    await expect(win(page).getByTestId('dose-status')).toHaveText('Rescheduled for 00:30, tomorrow');

    await clockTo(page, berlin('00:40', NEXT_DAY));
    const group = win(page).getByTestId('carried-over');
    await expect(group).toBeVisible({ timeout: 20_000 });
    await expect(group.getByRole('heading', { name: 'From earlier days' })).toBeVisible();
    await expect(group.getByTestId('dose-origin')).toHaveText('From Monday, Oct 19, 22:00');
    await expect(group.getByTestId('dose-row')).toHaveAttribute('data-status', 'rescheduled');
    await expect(group.getByText('Missed')).toHaveCount(0);

    // Take on it writes the original day's log.
    await group.getByRole('button', { name: 'Take Brand1' }).click();
    await expect.poll(async () => (await doseLogs(page)).get(dose!.scheduleId)?.status).toBe('taken');
    expect((await doseLogs(page)).get(dose!.scheduleId)?.scheduledDate).toBe(DAY);
    await expect(group).toBeHidden();
  });

  test('a dose rescheduled 2 days ahead shows in "From earlier days" on that day', async ({ page }) => {
    await prepare(page, '08:00');
    await seedSlot(page, 1, [{ status: 'rescheduled', at: '08:00', remindAt: berlin('09:00', TWO_DAYS) }]);
    await expect(win(page).getByTestId('dose-status')).toHaveText('Rescheduled for 09:00, Oct 21');

    await clockTo(page, berlin('08:00', NEXT_DAY));
    await expect(win(page).getByTestId('carried-over')).toHaveCount(0);

    await clockTo(page, berlin('08:00', TWO_DAYS));
    const group = win(page).getByTestId('carried-over');
    await expect(group).toBeVisible({ timeout: 20_000 });
    await expect(group.getByTestId('dose-origin')).toHaveText('From Monday, Oct 19, 08:30');
    await expect(group.getByTestId('dose-status')).toHaveText('Rescheduled for 09:00, today');
  });
});

/**
 * Two devices, one account, one in-memory sync server (the same rules as
 * the real push route): a reschedule made on device A reaches device B with
 * its `remindAt`.
 */
const USER = {
  id: 'e2e-sync-user',
  email: 'e2e-sync@example.test',
  name: 'E2E Sync',
  emailVerified: true,
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function openDevice(context: BrowserContext, server: ReturnType<typeof createInMemorySyncServer>) {
  await context.addInitScript(() => {
    const key = 'intake-tracker-settings';
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 8 };
    parsed.state = { ...parsed.state, storageMode: 'cloud-sync' };
    localStorage.setItem(key, JSON.stringify(parsed));
  });
  await context.route('**/api/ai/**', (route) => route.fulfill({ status: 503, json: { error: 'mocked' } }));
  await context.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 'e2e-session',
          userId: USER.id,
          token: 'e2e-token',
          expiresAt: new Date(berlin('09:00') + 86_400_000).toISOString(),
          createdAt: USER.createdAt,
          updatedAt: USER.updatedAt,
        },
        user: USER,
      },
    }),
  );
  await context.route('**/api/sync/push', async (route) => {
    const res = await server.transport.push(route.request().postDataJSON());
    await route.fulfill({ status: res.status, json: await res.json() });
  });
  await context.route('**/api/sync/pull', async (route) => {
    const res = await server.transport.pull(route.request().postDataJSON());
    await route.fulfill({ status: res.status, json: await res.json() });
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(berlin('09:00')) });
  return page;
}

test.describe('Sync between two devices: rescheduling', () => {
  test('remindAt of a rescheduled dose syncs to the other device', async ({ browser }) => {
    const server = createInMemorySyncServer();
    const options = { viewport: { width: 390, height: 844 }, timezoneId: ZONE, locale: 'en-GB' };
    const contextA = await browser.newContext(options);
    const contextB = await browser.newContext(options);
    try {
      const a = await openDevice(contextA, server);
      const b = await openDevice(contextB, server);
      // The same regimen on both devices (same ids).
      const [dose] = await seedSlot(a, 1);
      await seedSlot(b, 1);

      await openDose(a, 'Brand1');
      await a.getByRole('dialog').getByRole('button', { name: 'Reschedule', exact: true }).click();
      await rescheduleTo(a, DAY, '10:00');
      await expect
        .poll(() => server.rows('doseLogs').find((r) => r.scheduleId === dose!.scheduleId)?.remindAt ?? null, {
          timeout: 30_000,
        })
        .toBe(berlin('10:00'));

      await b.reload();
      await expect
        .poll(async () => (await doseLogs(b)).get(dose!.scheduleId)?.remindAt ?? null, { timeout: 30_000 })
        .toBe(berlin('10:00'));
      await expect(win(b).getByTestId('dose-status')).toHaveText('Rescheduled for 10:00', { timeout: 30_000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
