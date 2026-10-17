import { test, expect, type Page } from "@playwright/test";

/**
 * Daily Totals: the Today gadget, the Liquids card header and the Food card
 * show the same totals for today, from one module (`@intake/core/daily-totals`).
 * Runs on a phone (Home as one column) and on the desktop (the intake modules
 * as windows), so it is listed with the desktop specs and sets its viewport
 * per describe.
 *
 * The clock is fixed at 12:00 local time, so "later today" is a known time.
 */

const NOW = new Date(2026, 8, 24, 12, 0); // Thu 24 Sep 2026, 12:00 local
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime();

interface SeedRow {
  type: "water" | "salt";
  amount: number;
  timestamp: number;
}

/** Targets, and skip the Metrics intro. Runs before the app reads settings. */
async function setTargets(page: Page, targets: Record<string, number>) {
  await page.addInitScript((t) => {
    const key = "intake-tracker-settings";
    let parsed: { state?: Record<string, unknown>; version?: number } = {};
    try {
      parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      // Unparseable persisted settings: start fresh.
    }
    parsed.state = { ...(parsed.state ?? {}), analyticsIntroSeen: true, dayStartHour: 2, ...t };
    parsed.version ??= 18;
    localStorage.setItem(key, JSON.stringify(parsed));
  }, targets);
}

/**
 * Open Home with these intake rows already stored. The app creates its
 * database on the first load; the rows go straight into IndexedDB, then the
 * page reloads and reads them.
 */
async function openHomeWith(page: Page, rows: SeedRow[]) {
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  await expect(page.getByTestId("today-gadget")).toBeVisible();
  await page.evaluate(async (seed) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("IntakeTrackerDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("intakeRecords", "readwrite");
      for (const r of seed) {
        tx.objectStore("intakeRecords").put({
          id: crypto.randomUUID(),
          ...r,
          source: "manual",
          createdAt: r.timestamp,
          updatedAt: r.timestamp,
          deletedAt: null,
          deviceId: "e2e",
          timezone: "UTC",
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, rows);
  await page.reload();
  await expect(page.getByTestId("today-gadget")).toBeVisible();
}

const gadgetValue = (page: Page, metric: string) => page.getByTestId(`today-${metric}-value`);
const gadgetStatus = (page: Page, metric: string) => page.getByTestId(`today-${metric}-status`);
const liquidsHeader = (page: Page) => page.getByTestId("liquids-today-total");
const foodSodium = (page: Page) => page.getByTestId("food-card-sodium");

function dailyTotalsJourneys() {
  test("a drink dated later today is not counted: gadget = Liquids header = Food card", async ({ page }) => {
    await setTargets(page, {
      waterLimit: 1000,
      waterExtendedBuffer: 500,
      saltLimit: 1500,
      saltExtendedBuffer: 500,
    });
    await openHomeWith(page, [
      // Yesterday's logical day (before the 02:00 day start).
      { type: "water", amount: 900, timestamp: at(1, 30) },
      // Today, up to now.
      { type: "water", amount: 400, timestamp: at(9) },
      { type: "water", amount: 300, timestamp: at(11, 59) },
      { type: "salt", amount: 1600, timestamp: at(11) },
      // Later today: dated in the future, so not counted yet.
      { type: "water", amount: 500, timestamp: at(20) },
      { type: "salt", amount: 800, timestamp: at(21) },
    ]);

    await expect(gadgetValue(page, "water")).toHaveText("700");
    await expect(gadgetStatus(page, "water")).toHaveText("300 ml left");
    await expect(liquidsHeader(page)).toHaveText("700ml");

    await expect(gadgetValue(page, "sodium")).toHaveText("1,600");
    await expect(foodSodium(page)).toContainText("1600mg / 1500mg");
    await expect(foodSodium(page)).toContainText("100mg / 500mg extra");
    await expect(gadgetStatus(page, "sodium")).toHaveText("100 / 500 mg extra");
  });

  test("past the target the gadget reads the buffer used from the target (#309)", async ({ page }) => {
    await setTargets(page, { waterLimit: 1500, waterExtendedBuffer: 500 });
    await openHomeWith(page, [{ type: "water", amount: 2501, timestamp: at(10) }]);

    // The total against the configured target, then 1,001 ml into a 500 ml
    // buffer: not "501 over limit" measured from target + buffer.
    await expect(gadgetValue(page, "water")).toHaveText("2,501");
    await expect(page.getByTestId("today-row-water")).toContainText("2,501 / 1,500");
    await expect(gadgetStatus(page, "water")).toHaveText("▲ 1,001 / 500 ml extra");
    await expect(page.getByTestId("today-row-water")).toHaveAttribute("data-status", "over");
    await expect(liquidsHeader(page)).toHaveText("2.501L");
  });

  test("logging water updates the gadget and the Liquids header together", async ({ page }) => {
    await setTargets(page, { waterLimit: 1000, waterExtendedBuffer: 500, waterIncrement: 250 });
    await openHomeWith(page, [{ type: "water", amount: 1200, timestamp: at(11) }]);

    await expect(gadgetValue(page, "water")).toHaveText("1,200");
    await expect(liquidsHeader(page)).toHaveText("1.2L");
    await expect(gadgetStatus(page, "water")).toHaveText("200 / 500 ml extra");

    await page.getByTestId("liquids-card").getByRole("button", { name: "Confirm Entry" }).click();

    await expect(gadgetValue(page, "water")).toHaveText("1,450");
    await expect(liquidsHeader(page)).toHaveText("1.45L");
    await expect(gadgetStatus(page, "water")).toHaveText("450 / 500 ml extra");
  });
}

test.describe("Daily totals on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  dailyTotalsJourneys();
});

test.describe("Daily totals on the desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  dailyTotalsJourneys();
});
