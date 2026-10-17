import { test, expect, type Page } from '@playwright/test';

/**
 * Synced writes (lib/synced-write.ts): every change made through the UI is
 * queued for sync with the op its row stands for, and a tombstone is switched
 * off. These run offline; the sync queue (`_syncQueue` in IndexedDB) is the
 * stored result the bugs were about, so the tests read it back directly.
 */

const DB_NAME = 'IntakeTrackerDB';

type QueueRow = { tableName: string; recordId: string; op: string };

/** Every row of one IndexedDB store. */
function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    ({ dbName, store }) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction(store, 'readonly').objectStore(store).getAll();
          get.onsuccess = () => {
            db.close();
            resolve(get.result as T[]);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { dbName: DB_NAME, store },
  );
}

/** Add rows to one IndexedDB store, outside the app. */
function seedStore(page: Page, store: string, rows: Record<string, unknown>[]): Promise<void> {
  return page.evaluate(
    ({ dbName, store, rows }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(store, 'readwrite');
          for (const row of rows) tx.objectStore(store).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { dbName: DB_NAME, store, rows },
  );
}

/** The queued op for each record id. */
async function queuedOps(page: Page): Promise<Record<string, string>> {
  const rows = await readStore<QueueRow>(page, '_syncQueue');
  return Object.fromEntries(rows.map((q) => [`${q.tableName}:${q.recordId}`, q.op]));
}

async function openHome(page: Page) {
  await page.goto('/');
  // The shell mounts on the client; a cold dev server can take a while.
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30_000 });
}

test.describe('Synced writes', () => {
  test('logging water queues the new row for sync', async ({ page }) => {
    await openHome(page);
    await page.locator('#section-water').getByRole('button', { name: 'Confirm Entry' }).click();
    await expect(page.locator('#section-water').getByTestId('recent-entry')).toHaveCount(1);

    const [water] = await readStore<{ id: string; amount: number }>(page, 'intakeRecords');
    expect(water).toBeDefined();
    expect(await queuedOps(page)).toEqual({ [`intakeRecords:${water!.id}`]: 'upsert' });
  });

  test('deleting a drink queues every row of it as a delete', async ({ page }) => {
    await openHome(page);
    const liquids = page.locator('#section-water');
    await liquids.getByRole('tab', { name: 'Coffee' }).click();
    await liquids.getByRole('button', { name: /^Coffee\s*250ml$/ }).click();
    await liquids.getByRole('button', { name: 'Log Entry' }).click();
    await expect(liquids.getByTestId('recent-entry')).toHaveCount(1);

    // A coffee is a water row plus a caffeine row in one group.
    const substances = await readStore<{ id: string }>(page, 'substanceRecords');
    const intakes = await readStore<{ id: string }>(page, 'intakeRecords');
    expect(substances).toHaveLength(1);

    await liquids.getByRole('button', { name: 'Delete entry' }).click();
    await expect(liquids.getByTestId('recent-entry')).toHaveCount(0);

    const ops = await queuedOps(page);
    for (const { id } of intakes) expect(ops[`intakeRecords:${id}`]).toBe('delete');
    expect(ops[`substanceRecords:${substances[0]!.id}`]).toBe('delete');
  });

  test('a form the app rejects writes an audit entry that is queued for sync', async ({ page }) => {
    await openHome(page);
    const bp = page.locator('#section-bp');
    // 400 mmHg is outside the range the reading schema accepts.
    await bp.getByLabel(/Systolic/).fill('400');
    await bp.getByLabel(/Diastolic/).fill('80');
    await bp.getByRole('button', { name: 'Record Reading' }).click();

    // logAudit flushes on a 1 s timer.
    await expect
      .poll(async () => (await readStore<{ action: string }>(page, 'auditLogs')).map((a) => a.action))
      .toContain('validation_error');
    const [audit] = await readStore<{ id: string }>(page, 'auditLogs');
    expect(await queuedOps(page)).toMatchObject({ [`auditLogs:${audit!.id}`]: 'upsert' });
  });

  test('restoring a backup tombstone over a prescription switches it off', async ({ page }) => {
    await openHome(page);
    const now = Date.now();
    const rx = {
      id: 'e2e-rx-1',
      genericName: 'Metoprolol',
      indication: 'Hypertension',
      contraindications: [],
      warnings: [],
      isActive: true,
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
      deletedAt: null,
      deviceId: 'e2e-test',
    };
    await seedStore(page, 'prescriptions', [rx]);

    // A backup holding the same prescription deleted, but still marked
    // active (backups exported before the v23 repair look like this).
    const backup = {
      version: 5,
      exportedAt: new Date(now).toISOString(),
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
      prescriptions: [{ ...rx, deletedAt: now - 30_000, updatedAt: now - 30_000 }],
    };

    await page.goto('/settings');
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const group = sheet.getByRole('button', { name: 'Data & storage', exact: true });
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();

    await sheet.locator('input[type="file"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await sheet.getByRole('button', { name: 'Continue Import' }).click();
    await sheet.getByRole('button', { name: /Review 1 conflicts/ }).click();

    const drawer = page.getByRole('dialog').filter({ hasText: 'choose which version to keep' });
    await drawer.getByRole('button', { name: 'Use Backup' }).click();
    await drawer.getByRole('button', { name: 'Apply Decisions' }).click();
    await expect(drawer).toBeHidden();

    await expect
      .poll(async () => {
        const [row] = await readStore<{ deletedAt: number | null; isActive: boolean }>(page, 'prescriptions');
        return { deleted: row?.deletedAt != null, isActive: row?.isActive };
      })
      .toEqual({ deleted: true, isActive: false });
    expect((await queuedOps(page))['prescriptions:e2e-rx-1']).toBe('delete');
  });
});
