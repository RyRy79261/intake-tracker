import { test, expect, type Page } from "@playwright/test";

/**
 * The estimate trackers as desk windows (the `desktop` project: the file name
 * ends in desktop.spec.ts, which playwright.config.ts routes there). Each
 * tracker's card is the body of its module window; minimising puts its icon
 * on the desk band and the icon brings the window back.
 */

const TRACKERS = [
  { id: "wee", name: "Urination", section: "section-urination", testId: "urination-card" },
  { id: "bowel", name: "Defecation", section: "section-defecation", testId: "defecation-card" },
] as const;

const moduleWindow = (page: Page, id: string) => page.locator(`[data-testid="module-window"][data-app="${id}"]`);
const deskIcon = (page: Page, id: string) => page.locator(`[data-desk-icon="${id}"]`);

async function openDesk(page: Page) {
  // In CI the session is real: without this the app may switch to cloud sync
  // and pull rows other specs left on the server into these cards.
  await page.route("**/api/sync/**", (route) => route.abort());
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
  // The first load of a route under `next dev` can be slow while it compiles.
  await expect(page.getByTestId("window-layer")).toHaveAttribute("data-mode", "desktop", { timeout: 30_000 });
  await expect(page.getByTestId("module-window")).toHaveCount(7);
  // `next dev` pins its own indicator to the bottom left, over the desk band.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test.describe("Estimate tracker windows", () => {
  for (const t of TRACKERS) {
    test(`${t.name}: its window holds the card; one tap logs in it`, async ({ page }) => {
      await openDesk(page);
      const win = moduleWindow(page, t.id);
      await expect(win.getByRole("heading", { name: t.name })).toBeVisible();
      await expect(win.locator(`#${t.section}`).getByTestId(t.testId)).toBeVisible();

      await win.getByRole("button", { name: "Small", exact: true }).click();
      await expect(page.getByText(`${t.name} (small) recorded`, { exact: true })).toBeVisible();
      await expect(win).toContainText("1 today");
      await expect(win.getByTestId("recent-entry")).toHaveCount(1);
    });
  }

  test("minimise both trackers to the desk band, then restore them with their entries", async ({ page }) => {
    await openDesk(page);
    await moduleWindow(page, "wee").getByRole("button", { name: "Medium", exact: true }).click();
    await expect(moduleWindow(page, "wee").getByTestId("recent-entry")).toHaveCount(1);

    for (const t of TRACKERS) {
      await page.getByRole("button", { name: `Minimise ${t.name}` }).click();
      await expect(moduleWindow(page, t.id)).toBeHidden();
    }
    const band = page.getByRole("list", { name: "Minimised modules" });
    await expect(band.getByTestId("desk-icon")).toHaveText(["Urination", "Defecation"]);

    for (const t of TRACKERS) {
      const icon = deskIcon(page, t.id);
      await expect(icon).toHaveAccessibleName(`Open ${t.name}`);
      await icon.click();
      await expect(moduleWindow(page, t.id)).toBeVisible();
      await expect(icon).toHaveCount(0);
    }
    await expect(page.getByTestId("desk-icon")).toHaveCount(0);
    // The entry logged before minimising is still there; the other card is empty.
    await expect(moduleWindow(page, "wee").getByTestId("recent-entry")).toHaveCount(1);
    await expect(moduleWindow(page, "bowel").getByTestId("recent-entry")).toHaveCount(0);
  });
});
