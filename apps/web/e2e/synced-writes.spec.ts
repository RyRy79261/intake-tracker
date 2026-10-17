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

test.describe('Synced writes: medications', () => {
  test('adding a prescription and undoing an extra dose queue every row with its op', async ({ page }) => {
    await page.goto('/medications');
    const medsWindow = page.getByTestId('window');
    await medsWindow.getByRole('tab', { name: 'Rx' }).click({ timeout: 30_000 });
    await medsWindow.getByRole('button', { name: /Add your first prescription|Add prescription/ }).click();

    // An as-needed prescription with 30 tablets, filled in by hand.
    const wizard = page.getByRole('dialog');
    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Search Medicine');
    await wizard.getByPlaceholder('e.g. Aviolix', { exact: true }).fill('Lasix');
    await wizard.getByPlaceholder('e.g. Clopidogrel', { exact: true }).fill('Furosemide');
    await wizard.getByPlaceholder('e.g. 75mg', { exact: true }).fill('40mg');
    await wizard.getByRole('button', { name: /^Next/ }).click(); // Appearance
    await wizard.getByRole('button', { name: /^Next/ }).click(); // Indication
    await wizard.getByRole('button', { name: /^Next/ }).click(); // Dosage
    await expect(wizard.getByTestId('wizard-step-label')).toHaveText('Dosage');
    await wizard.getByRole('switch').click(); // As needed: no schedule step
    await wizard.getByRole('button', { name: /^Next/ }).click();
    await wizard.getByPlaceholder('e.g. 36').fill('30');
    await wizard.getByRole('button', { name: /Save Medication/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Everything the wizard wrote is queued as an upsert.
    const rx = await readStore<{ id: string }>(page, 'prescriptions');
    const items = await readStore<{ id: string }>(page, 'inventoryItems');
    expect(rx).toHaveLength(1);
    expect(items).toHaveLength(1);
    let ops = await queuedOps(page);
    expect(ops[`prescriptions:${rx[0]!.id}`]).toBe('upsert');
    expect(ops[`inventoryItems:${items[0]!.id}`]).toBe('upsert');

    // Log an extra dose, then undo it.
    await medsWindow.getByRole('tab', { name: /^Schedule/ }).click();
    await page.getByRole('button', { name: 'Log a dose' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log a dose' });
    await dialog.getByLabel('Dose').fill('80');
    await dialog.getByRole('button', { name: 'Log dose' }).click();
    await expect(dialog).toBeHidden();
    await expect(medsWindow.getByText('Other doses today')).toBeVisible();

    await medsWindow.getByRole('button', { name: /^Undo Furosemide at/ }).click();
    await medsWindow.getByRole('button', { name: /^Confirm remove Furosemide at/ }).click();
    await expect(medsWindow.getByText('Other doses today')).toBeHidden();

    // The dose and the pills it took are tombstones queued as deletes; the
    // stock change is an upsert of the inventory item.
    const [dose] = await readStore<{ id: string; deletedAt: number | null }>(page, 'doseLogs');
    const consumed = (
      await readStore<{ id: string; type: string; deletedAt: number | null }>(page, 'inventoryTransactions')
    ).filter((t) => t.type === 'consumed');
    expect(dose?.deletedAt).not.toBeNull();
    expect(consumed).toHaveLength(1);
    ops = await queuedOps(page);
    expect(ops[`doseLogs:${dose!.id}`]).toBe('delete');
    expect(ops[`inventoryTransactions:${consumed[0]!.id}`]).toBe('delete');
    expect(ops[`inventoryItems:${items[0]!.id}`]).toBe('upsert');
  });
});
