import { test, expect, type Page } from "@playwright/test";

/**
 * Ward Console window manager (behind the device-only `wardShell` setting).
 * Phone (390×844): one full-screen window at a time, Back closes it.
 * Wide (1280×800): windows tile side by side.
 */

async function enableWardShell(page: Page) {
  await page.addInitScript(() => {
    const key = "intake-tracker-settings";
    let parsed: { state?: Record<string, unknown>; version?: number } = {};
    try {
      parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      // Unparseable persisted settings: start fresh.
    }
    parsed.state = { ...(parsed.state ?? {}), wardShell: true, analyticsIntroSeen: true };
    parsed.version ??= 18;
    localStorage.setItem(key, JSON.stringify(parsed));
  });
}

const sysBar = (page: Page) => page.getByTestId("sys-bar");
// Closed windows unmount; minimised and background ones stay mounted.
const windows = (page: Page) => page.getByTestId("window");
const windowNamed = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const windowsButton = (page: Page) => page.getByRole("button", { name: /^Windows, \d+ open$/ });

async function openHome(page: Page) {
  await page.goto("/");
  await expect(sysBar(page)).toBeVisible();
}

test.describe("Windows on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => enableWardShell(page));

  test("a header icon opens its window full screen", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();

    const meds = windowNamed(page, "Medications");
    await expect(meds).toBeVisible();
    await expect(page).toHaveURL(/\/medications$/);
    await expect(meds.getByRole("heading", { name: "Medications" })).toBeFocused();
    await expect(windowsButton(page)).toHaveAccessibleName("Windows, 1 open");
    // Full screen under the sys-bar: as wide as the viewport.
    const box = await meds.boundingBox();
    expect(box?.width).toBe(390);
  });

  test("the UI Back button and browser Back both close the window", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await expect(windowNamed(page, "Medications")).toBeVisible();

    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(windows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-pressed", "true");

    // Two windows: each Back closes the one on top.
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await sysBar(page).getByRole("button", { name: "Metrics" }).click();
    await expect(windowNamed(page, "Metrics")).toBeVisible();
    await expect(page.getByLabel("Window 2 of 2")).toHaveText("2/2");

    await page.goBack();
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await expect(windows(page)).toHaveCount(1);
    await page.goBack();
    await expect(windows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test("the switcher shows the count and closes windows", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await sysBar(page).getByRole("button", { name: "Metrics" }).click();
    await expect(windowsButton(page)).toHaveAccessibleName("Windows, 2 open");

    await windowsButton(page).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Windows · 2 open")).toBeVisible();
    await expect(sheet.getByTestId("switcher-row")).toHaveCount(2);

    // Switch to Medications.
    await sheet.getByRole("button", { name: /^Medications/ }).click();
    await expect(windowNamed(page, "Medications")).toBeVisible();

    await windowsButton(page).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close Metrics" }).click();
    await expect(page.getByRole("dialog").getByText("Windows · 1 open")).toBeVisible();
    await expect(page.getByRole("dialog").getByTestId("switcher-row")).toHaveCount(1);
    // The sheet is modal: close it before reading the bottom bar.
    await page.keyboard.press("Escape");
    await expect(windowsButton(page)).toHaveAccessibleName("Windows, 1 open");
  });

  test("the /medications deep link opens the window over Home", async ({ page }) => {
    await page.goto("/medications");
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a prescription" })).toBeVisible();

    // Back closes the window rather than leaving the app.
    await page.goBack();
    await expect(windows(page)).toHaveCount(0);
    await expect(sysBar(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("/analytics?tab= still picks the tab, and History opens Records", async ({ page }) => {
    await page.goto("/analytics?tab=correlations");
    const metrics = windowNamed(page, "Metrics");
    await expect(metrics).toBeVisible();
    await expect(metrics.getByRole("tab", { name: "Correlations" })).toHaveAttribute("data-state", "active");

    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(windows(page)).toHaveCount(0);

    await sysBar(page).getByRole("button", { name: "History" }).click();
    await expect(windowNamed(page, "Metrics").getByRole("tab", { name: "Records" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page).toHaveURL(/\/analytics\?tab=records$/);
  });
});

test.describe("Windows on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => enableWardShell(page));

  test("windows tile side by side and Esc closes the focused one", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await sysBar(page).getByRole("button", { name: "Metrics" }).click();

    const meds = windowNamed(page, "Medications");
    const metrics = windowNamed(page, "Metrics");
    await expect(meds).toBeVisible();
    await expect(metrics).toBeVisible();
    // Wait for the open animation to settle, then measure the tiles.
    await expect
      .poll(async () => {
        const [x, y] = [await meds.boundingBox(), await metrics.boundingBox()];
        return Math.abs((x?.width ?? 0) - (y?.width ?? 0));
      })
      .toBeLessThanOrEqual(2);
    const a = await meds.boundingBox();
    const b = await metrics.boundingBox();
    expect(a && b).toBeTruthy();
    // Two equal columns, Metrics to the right of Medications, no overlap.
    expect(Math.abs((a?.width ?? 0) - (b?.width ?? 0))).toBeLessThanOrEqual(2);
    expect((a?.x ?? 0) + (a?.width ?? 0)).toBeLessThanOrEqual(b?.x ?? 0);

    await metrics.getByRole("heading", { name: "Metrics" }).focus();
    await page.keyboard.press("Escape");
    await expect(metrics).toHaveCount(0);
    await expect(meds).toBeVisible();
  });

  test("minimise hides a window and the switcher brings it back", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await page.getByRole("button", { name: "Minimise Medications" }).click();
    await expect(windowNamed(page, "Medications")).toBeHidden();
    await expect(windowsButton(page)).toHaveAccessibleName("Windows, 1 open");

    await windowsButton(page).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Medications/ }).click();
    await expect(windowNamed(page, "Medications")).toBeVisible();
  });
});
