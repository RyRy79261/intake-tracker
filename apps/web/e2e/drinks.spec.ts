import { test, expect, type Page } from "@playwright/test";
import {
  SPIKED_COLA,
  fixedNow,
  dateTimeLocal,
  prepareDrinkPage,
  pickPreset,
  recentEntry,
  openInlineEdit,
  inlineForm,
  expectDrinkFields,
  recordRow,
  dayOf,
  readStore,
  liveDrinkRows,
  seedV25Database,
  holdIntakeGets,
  heldIntakeGets,
  releaseIntakeGets,
  eatingQueriesSinceRelease,
  nextFrames,
} from "./helpers/drinks";

/**
 * The Drink module on a phone (PRs #424 and #425). A drink is one water row
 * at the full volume, plus its caffeine, alcohol and sugar rows, all at one
 * time. Editing it keeps its strength; any row of it opens the whole drink.
 * See GLOSSARY.md. The desk versions are in drinks-desktop.spec.ts.
 */

const liquidsCard = (page: Page) => page.locator("#section-water");
const todayTotal = (page: Page) => page.getByTestId("liquids-today-total");
const metrics = (page: Page) => page.getByRole("region", { name: "Metrics", exact: true });

/** Log one Spiked cola (330 ml, 33 mg caffeine, 5.5% ABV, 35 g sugar). */
async function logSpikedCola(page: Page) {
  const panel = await pickPreset(liquidsCard(page), "Alcohol", SPIKED_COLA.name);
  await panel.getByRole("button", { name: "Log Entry" }).click();
  await expect(page.getByText("Spiked cola recorded", { exact: true })).toBeVisible();
  await expect(todayTotal(page)).toHaveText("330ml");
}

/** Open Metrics on Records (the History app in the sys-bar). */
async function openRecords(page: Page) {
  await page.getByTestId("sys-bar").getByRole("button", { name: /^History/ }).click();
  const win = metrics(page);
  await expect(win.getByRole("tab", { name: "Records" })).toHaveAttribute("data-state", "active");
  return win;
}

/** The four rows of one Spiked cola in Records. */
function colaRows(win: ReturnType<typeof metrics>) {
  return {
    water: recordRow(win, /^Water 330 ml/),
    caffeine: recordRow(win, /^Caffeine Spiked cola · 33 mg/),
    alcohol: recordRow(win, /^Alcohol Spiked cola · 1\.43 drinks/),
    sugar: recordRow(win, /^Sugar 35 g/),
  };
}

test.describe("Drinks on a phone", () => {
  test.beforeEach(async ({ page }) => prepareDrinkPage(page));

  test("a preset drink with caffeine, alcohol and sugar logs its full volume as water, at one time", async ({ page }) => {
    await page.goto("/");
    const liquids = liquidsCard(page);
    const panel = await pickPreset(liquids, "Alcohol", SPIKED_COLA.name);
    // Standard drinks are shown at 1 decimal (1.432 → 1.4).
    await expect(panel.getByText("33 mg caffeine, 5.5% ABV (1.4 std drinks), 35 g sugar", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Log Entry" }).click();
    await expect(page.getByText("Spiked cola recorded", { exact: true })).toBeVisible();

    // A drink counts at its whole volume: 330 ml of it is 330 ml of fluid.
    await expect(todayTotal(page)).toHaveText("330ml");
    const entry = recentEntry(liquids, "330ml");
    await expect(entry).toContainText("35g sugar");
    await expect(entry).toContainText("Spiked cola");

    // Stored: one water row of 330 ml, caffeine 33 mg, alcohol 1.43 (2 dp),
    // sugar 35 g. One group, one time.
    const rows = await liveDrinkRows(page);
    expect(rows.map((r) => r.type).sort()).toEqual(["alcohol", "caffeine", "sugar", "water"]);
    expect(rows.find((r) => r.type === "water")?.amount).toBe(330);
    expect(rows.find((r) => r.type === "caffeine")?.amountMg).toBe(33);
    expect(rows.find((r) => r.type === "alcohol")?.amountStandardDrinks).toBe(1.43);
    expect(rows.find((r) => r.type === "sugar")?.amount).toBe(35);
    expect(new Set(rows.map((r) => r.groupId)).size).toBe(1);
    expect(new Set(rows.map((r) => r.timestamp)).size).toBe(1);
  });

  test("a 330 ml beer counts 330 ml of water", async ({ page }) => {
    await page.goto("/");
    const panel = await pickPreset(liquidsCard(page), "Alcohol", "Beer");
    // 330 ml at 5% is 1.302 standard drinks: shown as 1.3.
    await expect(panel.getByText("5% ABV (1.3 std drinks)", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Log Entry" }).click();
    await expect(page.getByText("Beer recorded", { exact: true })).toBeVisible();
    await expect(todayTotal(page)).toHaveText("330ml");
    await expect(recentEntry(liquidsCard(page), "330ml")).toContainText("Beer");
  });

  test("Liquids inline edit: a new volume scales caffeine and sugar, ABV stays", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const liquids = liquidsCard(page);

    const form = await openInlineEdit(liquids, "330ml", { volume: "330", caffeine: "33", abv: "5.5", sugar: "35" });
    await form.getByLabel("Amount (ml)").fill("660");
    await form.getByRole("button", { name: "Save" }).click();

    await expect(todayTotal(page)).toHaveText("660ml");
    await expect(recentEntry(liquids, "660ml")).toContainText("70g sugar");
    // Reopen: the strength stayed, so the amounts doubled.
    const again = await openInlineEdit(liquids, "660ml", { volume: "660", caffeine: "66", abv: "5.5", sugar: "70" });
    await again.getByRole("button", { name: "Cancel" }).click();

    // Standard drinks are worked out again from the ABV: 660 ml at 5.5% = 2.86.
    const win = await openRecords(page);
    await expect(recordRow(win, /^Alcohol Spiked cola · 2\.86 drinks/)).toBeVisible();
    await expect(recordRow(win, /^Caffeine Spiked cola · 66 mg/)).toBeVisible();
  });

  test("Liquids inline edit: a caffeine value typed with the new volume wins", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const liquids = liquidsCard(page);

    const form = await openInlineEdit(liquids, "330ml", { volume: "330", caffeine: "33", sugar: "35" });
    await form.getByLabel("Amount (ml)").fill("660");
    await form.getByLabel(/^Caffeine \(mg\)/).fill("50");
    await form.getByRole("button", { name: "Save" }).click();

    await expect(todayTotal(page)).toHaveText("660ml");
    // Caffeine is what was typed; sugar, not typed, followed the volume.
    await openInlineEdit(liquids, "660ml", { volume: "660", caffeine: "50", abv: "5.5", sugar: "70" });
  });

  // Bug fixed in #424: a negative value was dropped and the rest saved.
  test("Liquids inline edit: a negative caffeine value shows Invalid value and saves nothing", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const liquids = liquidsCard(page);
    const before = await liveDrinkRows(page);

    const form = await openInlineEdit(liquids, "330ml", { volume: "330", caffeine: "33" });
    await form.getByLabel("Amount (ml)").fill("500");
    await form.getByLabel(/^Caffeine \(mg\)/).fill("-5");
    await form.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Invalid value", { exact: true })).toBeVisible();
    // The form stays open with what was typed, and nothing was written.
    await expect(form.getByLabel(/^Caffeine \(mg\)/)).toHaveValue("-5");
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(inlineForm(liquids)).toHaveCount(0);
    await expect(todayTotal(page)).toHaveText("330ml");
    await expect(recentEntry(liquids, "330ml")).toBeVisible();
    expect(await liveDrinkRows(page)).toEqual(before);
  });

  // Bug fixed in #424: a Records time edit on the water row moved only that
  // row, so the caffeine and alcohol stayed behind, maybe on another day.
  test("Records: a time edit on a drink's water row moves the whole drink, across midnight", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const win = await openRecords(page);
    const rows = colaRows(win);
    for (const row of Object.values(rows)) await expect(row).toBeVisible();
    const today = await dayOf(rows.water);

    // 23:40 the evening before: across midnight, into yesterday.
    const moved = fixedNow();
    moved.setDate(moved.getDate() - 1);
    moved.setHours(23, 40, 0, 0);
    await rows.water.getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="datetime-local"]').fill(dateTimeLocal(moved));
    await dialog.getByRole("button", { name: /save/i }).click();
    await expect(dialog).toBeHidden();

    // Every row of the drink is now at 23:40, in yesterday's group.
    for (const [kind, row] of Object.entries(rows)) {
      await expect(row.getByRole("button", { name: /at (23:40|11:40 PM), edit$/ }), kind).toBeVisible();
    }
    const yesterday = await dayOf(rows.water);
    expect(yesterday).not.toBe(today);
    for (const row of [rows.caffeine, rows.alcohol, rows.sugar]) expect(await dayOf(row)).toBe(yesterday);

    const stored = await liveDrinkRows(page);
    expect(stored).toHaveLength(4);
    expect(new Set(stored.map((r) => r.timestamp))).toEqual(new Set([moved.getTime()]));
  });

  test("Records: editing from a caffeine row opens the whole drink", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const win = await openRecords(page);

    await colaRows(win).caffeine.getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Drink" });
    await expect(dialog).toBeVisible();
    await expectDrinkFields(dialog, { volume: "330", caffeine: "33", abv: "5.5", sugar: "35" });
    await expect(dialog.getByLabel(/^Beverage name/)).toHaveValue("Spiked cola");
  });

  test("Records: a time edit from the alcohol row moves the whole drink too", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const win = await openRecords(page);
    const rows = colaRows(win);

    const moved = new Date(fixedNow().getTime() - 3 * 60 * 60_000);
    await rows.alcohol.getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Drink" });
    await expectDrinkFields(dialog, { volume: "330", abv: "5.5" });
    await dialog.getByLabel("Time").fill(dateTimeLocal(moved));
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden();

    for (const row of Object.values(rows)) {
      await expect(row.getByRole("button", { name: /at (07:00|7:00 AM), edit$/ })).toBeVisible();
    }
    const stored = await liveDrinkRows(page);
    expect(new Set(stored.map((r) => r.timestamp))).toEqual(new Set([moved.getTime()]));
  });

  test("Records: deleting a caffeine row asks first, removes the whole drink, and Undo brings it back", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const win = await openRecords(page);
    const rows = colaRows(win);
    for (const row of Object.values(rows)) await expect(row).toBeVisible();

    // Cancel the confirm: nothing goes.
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      void d.dismiss();
    });
    await rows.caffeine.getByRole("button", { name: "Delete entry" }).click();
    await expect.poll(() => message).toMatch(/^Delete this whole drink\?/);
    for (const row of Object.values(rows)) await expect(row).toBeVisible();
    expect(await liveDrinkRows(page)).toHaveLength(4);

    // Confirm: the water, alcohol and sugar go with it.
    page.once("dialog", (d) => void d.accept());
    await rows.caffeine.getByRole("button", { name: "Delete entry" }).click();
    for (const row of Object.values(rows)) await expect(row).toHaveCount(0);
    await expect(win.getByText("No records in this time range")).toBeVisible();
    expect(await liveDrinkRows(page)).toHaveLength(0);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    for (const row of Object.values(rows)) await expect(row).toBeVisible();
    await expect.poll(async () => (await liveDrinkRows(page)).length).toBe(4);
  });

  // Guard added in #424 (the Records lookup became async there): a slow
  // drink lookup must not open the drink over a row picked after it.
  test("Records: a slow drink lookup does not open over a row picked after it", async ({ page }) => {
    await page.goto("/");
    await logSpikedCola(page);
    const weight = page.locator("#section-weight");
    await weight.scrollIntoViewIfNeeded();
    const weightInput = weight.getByTestId("weight-direct-input");
    await weightInput.focus();
    await weightInput.fill("72.4");
    await weightInput.blur();
    await weight.getByRole("button", { name: "Record Weight" }).click();
    await expect(page.getByText("Weight recorded", { exact: true })).toBeVisible();

    const win = await openRecords(page);
    const drinkRow = colaRows(win).water;
    const weightRow = recordRow(win, /^Weight 72\.4 kg/);
    await expect(drinkRow).toBeVisible();
    await expect(weightRow).toBeVisible();

    // Hold the drink lookup, then pick the weight row while it waits.
    await holdIntakeGets(page);
    await drinkRow.getByRole("button", { name: "Edit entry" }).click();
    await expect.poll(() => heldIntakeGets(page)).toBeGreaterThan(0);
    await weightRow.getByRole("button", { name: "Edit entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Weight (kg)")).toHaveValue("72.4");

    // Let the lookup finish (its last step reads the meal table twice).
    await releaseIntakeGets(page);
    await expect.poll(() => eatingQueriesSinceRelease(page)).toBeGreaterThanOrEqual(2);
    await nextFrames(page);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByText("Edit Drink", { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel("Weight (kg)")).toHaveValue("72.4");
  });

  test("Beverage tab: water + sugar logs as one drink that edits and deletes as a whole", async ({ page }) => {
    await page.goto("/");
    const liquids = liquidsCard(page);
    await liquids.getByRole("tab", { name: "Beverage", exact: true }).click();
    const panel = liquids.locator('[role="tabpanel"][data-state="active"]');
    await panel.getByPlaceholder("e.g. Juice, Smoothie").fill("Juice");
    await panel.getByRole("button", { name: "330", exact: true }).click();
    await panel.getByLabel(/^Sugar \(g\)/).fill("25");
    await panel.getByRole("button", { name: "Log Beverage" }).click();
    await expect(page.getByText("Added 330ml", { exact: true })).toBeVisible();

    await expect(todayTotal(page)).toHaveText("330ml");
    const entry = recentEntry(liquids, "330ml");
    await expect(entry).toContainText("25g sugar");
    await expect(entry).toContainText("Juice");
    const logged = await liveDrinkRows(page);
    expect(logged.map((r) => r.type).sort()).toEqual(["sugar", "water"]);
    expect(new Set(logged.map((r) => r.groupId)).size).toBe(1);
    expect(new Set(logged.map((r) => r.timestamp)).size).toBe(1);

    // It is a drink: the edit form shows its sugar, and a new volume keeps
    // the sugar's strength.
    const form = await openInlineEdit(liquids, "330ml", { volume: "330", sugar: "25" });
    await expect(form.getByLabel(/^Beverage name/)).toHaveValue("Juice");
    await form.getByLabel("Amount (ml)").fill("660");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(todayTotal(page)).toHaveText("660ml");
    await expect(recentEntry(liquids, "660ml")).toContainText("50g sugar");

    // Deleting its water row takes the sugar with it.
    await recentEntry(liquids, "660ml").getByRole("button", { name: "Delete entry" }).click();
    await expect(todayTotal(page)).toHaveText("0ml");
    await expect.poll(async () => (await liveDrinkRows(page)).length).toBe(0);
  });
});

test.describe("The v26 repair of old drinks", () => {
  test.beforeEach(async ({ page }) => prepareDrinkPage(page));

  // Bug fixed in #425: old drinks stored less water than their volume.
  test("an old drink's water is raised to its full volume and queued for sync; a meal and an edited drink are left alone", async ({ page }) => {
    const at = fixedNow().getTime() - 60 * 60_000;
    const old = at - 30 * 24 * 60 * 60_000;
    const base = { deletedAt: null, deviceId: "e2e-old-device", timezone: "Europe/Berlin" };
    const synced = (updatedAt: number) => ({ ...base, createdAt: old, updatedAt });
    await seedV25Database(page, {
      intakeRecords: [
        // A drink: 200 ml of water for a 330 ml beer.
        { id: "w-drink", type: "water", amount: 200, timestamp: at, source: "preset:default-beer", note: "Beer", groupId: "g-drink", ...synced(old) },
        // A meal with coffee: its water row is food water.
        { id: "w-meal", type: "water", amount: 120, timestamp: at, source: "manual:food_water_content", groupId: "g-meal", ...synced(old) },
        // A drink whose water row was edited after its volume.
        { id: "w-edited", type: "water", amount: 150, timestamp: at, source: "preset:default-coffee", note: "Coffee", groupId: "g-edited", ...synced(old + 1000) },
      ],
      substanceRecords: [
        { id: "s-drink", type: "alcohol", abvPercent: 5, amountStandardDrinks: 1.3, volumeMl: 330, description: "Beer", source: "standalone", aiEnriched: false, timestamp: at, groupId: "g-drink", ...synced(old) },
        { id: "s-meal", type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee", source: "standalone", aiEnriched: false, timestamp: at, groupId: "g-meal", ...synced(old) },
        { id: "s-edited", type: "caffeine", amountMg: 95, volumeMl: 250, description: "Coffee", source: "standalone", aiEnriched: false, timestamp: at, groupId: "g-edited", ...synced(old) },
      ],
      eatingRecords: [
        { id: "e-meal", timestamp: at, note: "Breakfast", groupId: "g-meal", ...synced(old) },
      ],
    });

    await page.goto("/");
    // 330 (repaired) + 120 (meal water) + 150 (edited): 600 ml, not 470.
    // The first read waits for the upgrade, which is slow on a busy machine.
    await expect(todayTotal(page)).toHaveText("600ml", { timeout: 20_000 });
    const liquids = liquidsCard(page);
    await expect(recentEntry(liquids, "330ml")).toContainText("Beer");
    await expect(recentEntry(liquids, "120ml")).toBeVisible();
    await expect(recentEntry(liquids, "150ml")).toBeVisible();

    const intakes = await readStore(page, "intakeRecords");
    const byId = new Map(intakes.map((r) => [r.id, r]));
    expect(byId.get("w-drink")?.amount).toBe(330);
    expect(byId.get("w-drink")?.updatedAt).toBeGreaterThan(old);
    expect(byId.get("w-meal")).toMatchObject({ amount: 120, updatedAt: old });
    expect(byId.get("w-edited")).toMatchObject({ amount: 150, updatedAt: old + 1000 });

    // The repair is queued, so it reaches the server; no other record is.
    // (The settings row the app seeds on first start is queued too.)
    const queue = await readStore(page, "_syncQueue");
    expect(
      queue
        .filter((q) => q.tableName !== "userSettings")
        .map((q) => `${q.tableName}:${q.recordId}`),
    ).toEqual(["intakeRecords:w-drink"]);

    // The repaired drink edits as a whole 330 ml drink.
    await openInlineEdit(liquids, "330ml", { volume: "330", abv: "5" });
  });
});
