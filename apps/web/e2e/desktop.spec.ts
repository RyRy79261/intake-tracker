import { test, expect, type Page } from "@playwright/test";

/**
 * Desktop mode journeys (the `desktop` project: 1440×900 with a mouse).
 *
 * The feature specs (dashboard, history, medications, settings) run in the
 * `phone` project against Home's column of cards. Here the same things are
 * done the desktop way: the intake modules are windows on the desk, apps
 * open as windows over them, and Settings is a panel on the right.
 * Window mechanics (drag, resize, snap, the desk icons) are in
 * windows.spec.ts.
 */

const MODULES = ["today", "liquids", "food", "bp", "weight", "wee", "bowel"] as const;
const moduleWindow = (page: Page, id: (typeof MODULES)[number]) =>
  page.locator(`[data-testid="module-window"][data-app="${id}"]`);
const appWindow = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const apps = (page: Page) => page.getByRole("navigation", { name: "Apps" });

async function openDesk(page: Page) {
  await page.addInitScript(() => {
    const key = "intake-tracker-settings";
    let parsed: { state?: Record<string, unknown>; version?: number } = {};
    try {
      parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      // Unparseable persisted settings: start fresh.
    }
    parsed.state = { ...(parsed.state ?? {}), analyticsIntroSeen: true };
    parsed.version ??= 18;
    localStorage.setItem(key, JSON.stringify(parsed));
  });
  await page.goto("/");
  await expect(page.getByTestId("window-layer")).toHaveAttribute("data-mode", "desktop");
  await expect(page.getByTestId("module-window")).toHaveCount(7);
  // `next dev` pins its own indicator to the bottom left, over the desk band.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test.describe("Desktop journeys", () => {
  test("log water in the Liquids window: Today, the card and Records all show it", async ({ page }) => {
    await openDesk(page);
    const today = moduleWindow(page, "today");
    const liquids = moduleWindow(page, "liquids");
    await expect(today.getByTestId("today-water-value")).toHaveText("0");
    await expect(today.getByTestId("today-water-status")).toHaveText("1,000 ml left");

    // A preset, then confirm: both inside the Liquids window.
    await liquids.getByRole("button", { name: "150", exact: true }).click();
    await expect(liquids.getByRole("button", { name: /tap to edit/i })).toContainText("150ml");
    await liquids.getByRole("button", { name: "Confirm Entry" }).click();
    await expect(page.getByText("Water intake recorded", { exact: true })).toBeVisible();

    // The Today window follows at once, with what is left of the target.
    await expect(today.getByTestId("today-water-value")).toHaveText("150");
    await expect(today.getByTestId("today-water-status")).toHaveText("850 ml left");
    // So does the card's own running total and its Recent list.
    await expect(liquids.locator("#section-water")).toContainText("150ml");

    // A Today row opens Metrics on Records, filtered to water, as a window over the desk.
    await today.getByTestId("today-row-water").click();
    const metrics = appWindow(page, "Metrics");
    await expect(metrics).toBeVisible();
    await expect(metrics.getByRole("tab", { name: "Records" })).toHaveAttribute("data-state", "active");
    await expect(
      metrics.getByRole("group", { name: "Filter records" }).getByRole("button", { name: "Water", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(metrics.getByText("150 ml").first()).toBeVisible();
    await expect(page).toHaveURL(/\/analytics\?tab=records/);
  });

  test("record a blood pressure reading in its window, and find it in Metrics", async ({ page }) => {
    await openDesk(page);
    const bp = moduleWindow(page, "bp");
    await expect(bp.getByRole("heading", { name: "Blood Pressure" })).toBeVisible();

    await bp.locator("#systolic").fill("128");
    await bp.locator("#diastolic").fill("84");
    await bp.getByRole("button", { name: "Record Reading" }).click();
    await expect(page.getByText("Blood pressure recorded", { exact: true })).toBeVisible();
    // The reading is in the window's Recent list (the window scrolls to it).
    const recent = bp.getByText("128/84").first();
    await recent.scrollIntoViewIfNeeded();
    await expect(recent).toBeVisible();

    // History (the sys-bar) opens Metrics on Records over the modules.
    await apps(page).getByRole("button", { name: "History" }).click();
    const metrics = appWindow(page, "Metrics");
    await expect(metrics).toBeVisible();
    await expect(metrics.getByText("128/84").first()).toBeVisible({ timeout: 10_000 });
    // The module windows are still there underneath.
    await expect(page.getByTestId("module-window")).toHaveCount(7);
    await expect(bp).toBeVisible();
  });

  test("Settings opens as a panel on the right, and Medications as a window, over the modules", async ({ page }) => {
    await openDesk(page);

    // Settings: a 420px panel against the right edge, under the sys-bar; Back closes it.
    await apps(page).getByRole("button", { name: "Settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Settings" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect
      .poll(async () => {
        const b = await sheet.boundingBox();
        return b ? { width: b.width, right: Math.round(b.x + b.width), top: Math.round(b.y) } : null;
      })
      .toEqual({ width: 420, right: 1440 - 6, top: 50 });
    // Tracking starts open: a setting is there to change.
    await expect(sheet.getByRole("button", { name: "Tracking", exact: true })).toHaveAttribute("aria-expanded", "true");
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("module-window")).toHaveCount(7);

    // Medications: an app window over the modules, in the task strip, with its own route.
    await apps(page).getByRole("button", { name: /^Medications/ }).click();
    const meds = appWindow(page, "Medications");
    await expect(meds).toBeVisible();
    await expect(page).toHaveURL(/\/medications$/);
    await expect(meds).toHaveAttribute("data-focused", "true");
    const strip = page.getByRole("toolbar", { name: "Open windows" });
    await expect(strip.getByRole("button", { name: "Medications window" })).toHaveAttribute("aria-pressed", "true");
    const zOf = (id: (typeof MODULES)[number]) =>
      moduleWindow(page, id).evaluate((el) => Number(getComputedStyle(el).zIndex));
    const medsZ = await meds.evaluate((el) => Number(getComputedStyle(el).zIndex));
    for (const id of MODULES) expect(medsZ).toBeGreaterThan(await zOf(id));

    // Its tabs work inside the window.
    await meds.getByRole("tab", { name: "Rx" }).click();
    await expect(meds.getByRole("tab", { name: "Rx" })).toHaveAttribute("aria-selected", "true");
    await expect(meds.getByRole("button", { name: /Add/ }).first()).toBeVisible();

    // Esc closes it; the desk is as it was.
    await meds.getByRole("heading", { name: "Medications" }).focus();
    await page.keyboard.press("Escape");
    await expect(meds).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    for (const id of MODULES) await expect(moduleWindow(page, id)).toBeVisible();
  });
});
