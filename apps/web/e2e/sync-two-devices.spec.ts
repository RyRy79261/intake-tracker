import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createInMemorySyncServer } from '../src/__tests__/helpers/in-memory-sync-server';

/**
 * Two devices, one account, one server: what one device logs or deletes
 * reaches the other through the real sync engine.
 *
 * Runs offline. Each device is its own browser context (its own IndexedDB).
 * The session is faked by answering `/api/auth/get-session`, and
 * `/api/sync/push` and `/api/sync/pull` are answered by an in-memory server
 * in this test process that applies the same conflict rules as the real push
 * route (lib/sync-protocol.ts).
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
  // Cloud sync on, before the app reads its settings.
  await context.addInitScript(() => {
    const key = 'intake-tracker-settings';
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 8 };
    parsed.state = { ...parsed.state, storageMode: 'cloud-sync' };
    localStorage.setItem(key, JSON.stringify(parsed));
  });
  await context.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 'e2e-session',
          userId: USER.id,
          token: 'e2e-token',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
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
  await page.goto('/');
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30_000 });
  return page;
}

const recent = (page: Page) => page.locator('#section-water').getByTestId('recent-entry');

test.describe('Sync between two devices', () => {
  test('water logged on one device shows on the other, and a delete follows it', async ({ browser }) => {
    const server = createInMemorySyncServer();
    const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const a = await openDevice(contextA, server);
      const b = await openDevice(contextB, server);

      // Device A logs water; the debounced push reaches the server.
      await a.locator('#section-water').getByRole('button', { name: 'Confirm Entry' }).click();
      await expect(recent(a)).toHaveCount(1);
      await expect.poll(() => server.rows('intakeRecords').length, { timeout: 20_000 }).toBe(1);

      // Device B pulls it on start.
      await b.reload();
      await expect(recent(b)).toHaveCount(1, { timeout: 30_000 });

      // Device B deletes it; the delete reaches the server, then device A.
      await recent(b).getByRole('button', { name: 'Delete entry' }).click();
      await expect(recent(b)).toHaveCount(0);
      await expect
        .poll(() => server.rows('intakeRecords')[0]?.deletedAt ?? null, { timeout: 20_000 })
        .not.toBeNull();

      await a.reload();
      await expect(recent(a)).toHaveCount(0, { timeout: 30_000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
