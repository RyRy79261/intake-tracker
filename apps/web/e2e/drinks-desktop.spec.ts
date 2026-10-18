import { test, expect, type Page } from "@playwright/test";
import {
  SPIKED_COLA,
  fixedNow,
  dateTimeLocal,
  prepareDrinkPage,
  hideDevIndicator,
  pickPreset,
  recentEntry,
  openInlineEdit,
  expectDrinkFields,
  recordRow,
  dayOf,
  liveDrinkRows,
} from "./helpers/drinks";

/**
 * The Drink module on the desk (the `desktop` project: 1440×900 with a
 * mouse). Here the Liquids card is a module window and Records is in the
 * Metrics window over it. The phone versions, and the cases where the UI is
 * the same (delete, Undo, the slow lookup, the v26 repair, the Beverage tab),
 * are in drinks.spec.ts.
 */

const liquidsWindow = (page: Page) =>
  page.locator('[data-testid="module-window"][data-app="liquids"]');
const todayWindow = (page: Page) =>
  page.locator('[data-testid="module-window"][data-app="today"]');
const metrics = (page: Page) => page.getByRole("region", { name: "Metrics", exact: true });

async function openDesk(page: Page) {
  await prepareDrinkPage(page);
  await page.goto("/");
  // The first paint of the desk can be slow while `next dev` compiles.
  await expect(page.getByTestId("window-layer")).toHaveAttribute("data-mode", "desktop", { timeout: 30_000 });
  await expect(page.getByTestId("module-window")).toHaveCount(7);
  await hideDevIndicator(page);
}

async function logSpikedCola(page: Page) {
  const liquids = liquidsWindow(page);
  const panel = await pickPreset(liquids, "Alcohol", SPIKED_COLA.name);
  await expect(panel.getByText("33 mg caffeine, 5.5% ABV (1.4 std drinks), 35 g sugar", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Log Entry" }).click();
  await expect(page.getByText("Spiked cola recorded", { exact: true })).toBeVisible();
}

test.describe("Drinks on the desk", () => {
  test("a preset drink in the Liquids window counts its full volume in Today", async ({ page }) => {
    await openDesk(page);
    await expect(todayWindow(page).getByTestId("today-water-value")).toHaveText("0");
    await logSpikedCola(page);

    await expect(todayWindow(page).getByTestId("today-water-value")).toHaveText("330");
    await expect(liquidsWindow(page).getByTestId("liquids-today-total")).toHaveText("330ml");
    await expect(recentEntry(liquidsWindow(page), "330ml")).toContainText("35g sugar");
    const rows = await liveDrinkRows(page);
    expect(rows.map((r) => r.type).sort()).toEqual(["alcohol", "caffeine", "sugar", "water"]);
    expect(new Set(rows.map((r) => r.timestamp)).size).toBe(1);
  });

  test("the Liquids window's inline edit keeps the drink's strength", async ({ page }) => {
    await openDesk(page);
    await logSpikedCola(page);
    const liquids = liquidsWindow(page);

    const form = await openInlineEdit(liquids, "330ml", { volume: "330", caffeine: "33", abv: "5.5", sugar: "35" });
    await form.getByLabel("Amount (ml)").fill("165");
    await form.getByRole("button", { name: "Save" }).click();

    await expect(todayWindow(page).getByTestId("today-water-value")).toHaveText("165");
    // Half the volume: half the caffeine (16.5 → 17) and sugar (17.5 → 18).
    await openInlineEdit(liquids, "165ml", { volume: "165", caffeine: "17", abv: "5.5", sugar: "18" });
  });

  // Bug fixed in #424: the Records time edit moved only the water row.
  test("a time edit in the Metrics window moves the whole drink across midnight", async ({ page }) => {
    await openDesk(page);
    await logSpikedCola(page);
    await page.getByRole("navigation", { name: "Apps" }).getByRole("button", { name: "History" }).click();
    const win = metrics(page);
    await expect(win.getByRole("tab", { name: "Records" })).toHaveAttribute("data-state", "active");
    const water = recordRow(win, /^Water 330 ml/);
    const caffeine = recordRow(win, /^Caffeine Spiked cola · 33 mg/);
    const alcohol = recordRow(win, /^Alcohol Spiked cola · 1\.43 drinks/);
    await expect(caffeine).toBeVisible();
    const today = await dayOf(water);

    const moved = fixedNow();
    moved.setDate(moved.getDate() - 1);
    moved.setHours(23, 40, 0, 0);
    await water.getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="datetime-local"]').fill(dateTimeLocal(moved));
    await dialog.getByRole("button", { name: /save/i }).click();
    await expect(dialog).toBeHidden();

    for (const row of [water, caffeine, alcohol]) {
      await expect(row.getByRole("button", { name: /at (23:40|11:40 PM), edit$/ })).toBeVisible();
    }
    expect(await dayOf(caffeine)).not.toBe(today);
    expect(await dayOf(caffeine)).toBe(await dayOf(water));
    expect(await dayOf(alcohol)).toBe(await dayOf(water));
    // Moved out of today, so Today shows none of it.
    await expect(todayWindow(page).getByTestId("today-water-value")).toHaveText("0");
  });

  test("editing from the caffeine row in the Metrics window opens the whole drink", async ({ page }) => {
    await openDesk(page);
    await logSpikedCola(page);
    await page.getByRole("navigation", { name: "Apps" }).getByRole("button", { name: "History" }).click();
    const win = metrics(page);
    await recordRow(win, /^Caffeine Spiked cola · 33 mg/).getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Drink" });
    await expect(dialog).toBeVisible();
    await expectDrinkFields(dialog, { volume: "330", caffeine: "33", abv: "5.5", sugar: "35" });
  });
});
