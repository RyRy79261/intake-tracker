import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Ward Console window manager.
 * Phone (390×844): one full-screen window at a time, Back closes it.
 * Tiled (1000×800, and touch tablets): windows tile side by side.
 * Desktop (1440×900 with a mouse): free windows that drag, resize, snap and
 * maximise, a task strip in the sys-bar, and Home as a grid behind them.
 */

async function skipAnalyticsIntro(page: Page) {
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
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

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

  test("closing a window hands keyboard focus back to its sys-bar button", async ({ page }) => {
    await openHome(page);
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await expect(windowNamed(page, "Medications")).toBeVisible();

    await page.getByRole("button", { name: "Close Medications" }).focus();
    await page.keyboard.press("Enter");
    await expect(windows(page)).toHaveCount(0);
    await expect(sysBar(page).getByRole("button", { name: /^Medications/ })).toBeFocused();
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

test.describe("Windows tiled on a narrow wide screen", () => {
  // Under 1024px: wide enough to tile, too narrow for desktop mode.
  test.use({ viewport: { width: 1000, height: 800 } });
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

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
    // Focus moves to the window now on top, so Esc keeps working.
    await expect(meds.getByRole("heading", { name: "Medications" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(meds).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// Desktop mode
// ---------------------------------------------------------------------------

/** The sys-bar's app launchers (the task strip has its own buttons). */
const apps = (page: Page) => page.getByRole("navigation", { name: "Apps" });
const titleBar = (page: Page, name: string) => windowNamed(page, name).getByTestId("window-titlebar");
const grip = (page: Page, name: string, edge: string) => windowNamed(page, name).locator(`[data-grip="${edge}"]`);
const taskStrip = (page: Page) => page.getByRole("toolbar", { name: "Open windows" });
const task = (page: Page, name: string) => taskStrip(page).getByRole("button", { name, exact: true });
const layer = (page: Page) => page.getByTestId("window-layer");

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return box;
}

/** A real mouse drag: press, move in steps, release. */
async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function openDesktop(page: Page, path = "/") {
  await page.goto(path);
  await expect(sysBar(page)).toBeVisible();
  await expect(layer(page)).toHaveAttribute("data-mode", "desktop");
}

async function openMeds(page: Page) {
  await apps(page).getByRole("button", { name: /^Medications/ }).click();
  await expect(windowNamed(page, "Medications")).toBeVisible();
  return windowNamed(page, "Medications");
}

async function openMetrics(page: Page) {
  await apps(page).getByRole("button", { name: "Metrics" }).click();
  await expect(windowNamed(page, "Metrics")).toBeVisible();
  return windowNamed(page, "Metrics");
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const area = document.querySelector<HTMLElement>('[data-testid="window-layer"]');
    return {
      page: root.scrollWidth <= root.clientWidth,
      body: document.body.scrollWidth <= root.clientWidth,
      layer: !area || area.scrollWidth <= area.clientWidth,
    };
  });

test.describe("Windows on the desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

  test("windows open free and cascade; the task strip replaces the bottom bar", async ({ page }) => {
    await openDesktop(page);
    await expect(page.getByRole("navigation", { name: "Bottom bar" })).toHaveCount(0);

    const meds = await openMeds(page);
    const metrics = await openMetrics(page);
    await expect(meds).toHaveAttribute("data-free", "true");
    // Default sizes, each a step down and right of the last, overlapping.
    expect(await boxOf(meds)).toEqual({ x: 16, y: 56, width: 720, height: 520 });
    expect(await boxOf(metrics)).toEqual({ x: 44, y: 84, width: 880, height: 600 });
    await expect(taskStrip(page).getByRole("button")).toHaveCount(2);
    await expect(page).toHaveURL(/\/analytics$/);
  });

  test("a mouse drag on the title bar moves the window", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const before = await boxOf(meds);

    const start = { x: before.x + 200, y: before.y + 16 };
    await mouseDrag(page, start, { x: start.x + 300, y: start.y + 150 });
    const after = await boxOf(meds);
    expect(after).toEqual({ x: before.x + 300, y: before.y + 150, width: before.width, height: before.height });

    // Dragged far past the corner, it stops at the edge of the desktop.
    await mouseDrag(page, { x: after.x + 200, y: after.y + 16 }, { x: 3000, y: 3000 });
    const edge = await boxOf(meds);
    expect(edge.x + edge.width).toBe(1440);
    expect(edge.y + edge.height).toBe(900);
    // ...and never goes under the sys-bar.
    await mouseDrag(page, { x: edge.x + 200, y: edge.y + 16 }, { x: 900, y: 100 }, 6);
    expect((await boxOf(meds)).y).toBeGreaterThanOrEqual(44);
  });

  test("a drag carries on when the pointer passes over another window", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const metrics = await openMetrics(page);
    const before = await boxOf(meds);

    // Medications' title bar shows above Metrics. Press it, then jump in
    // one move to a point that (until the window follows) is over Metrics.
    const start = { x: before.x + 300, y: before.y + 10 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 6, start.y + 6);
    // Mid-drag: nothing else reacts to the pointer.
    await expect(metrics.getByTestId("window-body")).toHaveCSS("pointer-events", "none");
    await page.mouse.move(start.x + 500, start.y + 330, { steps: 1 });
    await page.mouse.move(start.x + 420, start.y + 300, { steps: 3 });
    await page.mouse.up();

    expect(await boxOf(meds)).toEqual({
      x: before.x + 420,
      y: before.y + 300,
      width: before.width,
      height: before.height,
    });
    await expect(meds).toHaveAttribute("data-focused", "true");
    await expect(metrics.getByTestId("window-body")).toHaveCSS("pointer-events", "auto");
    // Metrics did not move.
    expect(await boxOf(metrics)).toEqual({ x: 44, y: 84, width: 880, height: 600 });
  });

  test("resize from the bottom-right grip, down to the minimum size", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const before = await boxOf(meds);

    const se = centre(await boxOf(grip(page, "Medications", "se")));
    await mouseDrag(page, se, { x: se.x + 120, y: se.y + 80 });
    const bigger = await boxOf(meds);
    expect(bigger).toEqual({ x: before.x, y: before.y, width: before.width + 120, height: before.height + 80 });

    // Pulled far inwards it stops at the app's minimum size.
    const again = centre(await boxOf(grip(page, "Medications", "se")));
    await mouseDrag(page, again, { x: 0, y: 0 });
    const smallest = await boxOf(meds);
    expect(smallest).toEqual({ x: before.x, y: before.y, width: 360, height: 400 });

    // The left edge moves the left side and leaves the right edge put.
    const w = centre(await boxOf(grip(page, "Medications", "w")));
    await mouseDrag(page, w, { x: w.x + 200, y: w.y });
    // Already at the minimum width: nothing to give.
    expect(await boxOf(meds)).toEqual(smallest);
    await mouseDrag(page, { x: smallest.x + 100, y: smallest.y + 16 }, { x: smallest.x + 400, y: smallest.y + 16 });
    const moved = await boxOf(meds);
    const w2 = centre(await boxOf(grip(page, "Medications", "w")));
    await mouseDrag(page, w2, { x: w2.x - 140, y: w2.y });
    const wider = await boxOf(meds);
    expect(wider.x).toBe(moved.x - 140);
    expect(wider.width).toBe(moved.width + 140);
    expect(wider.x + wider.width).toBe(moved.x + moved.width);

    // Nothing in the window is clipped at the minimum size.
    await expect(meds.getByRole("tab", { name: "Titrations" })).toBeInViewport({ ratio: 1 });
  });

  test("maximise and restore, by double-click and by the button", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const before = await boxOf(meds);

    await titleBar(page, "Medications").dblclick({ position: { x: 200, y: 16 } });
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 856 });
    await expect(meds).toHaveAttribute("data-max", "true");
    // Home is covered: out of the tab order and the accessibility tree.
    await expect(page.getByTestId("home")).toHaveAttribute("inert", "");

    await titleBar(page, "Medications").dblclick({ position: { x: 200, y: 16 } });
    expect(await boxOf(meds)).toEqual(before);
    await expect(page.getByTestId("home")).not.toHaveAttribute("inert", "");

    await meds.getByRole("button", { name: "Maximise Medications" }).click();
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 856 });
    await meds.getByRole("button", { name: "Restore Medications" }).click();
    expect(await boxOf(meds)).toEqual(before);
  });

  test("dragging to an edge snaps to a half; to the top maximises", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const before = await boxOf(meds);

    // Left edge, with a preview of where it will land.
    await page.mouse.move(before.x + 200, before.y + 16);
    await page.mouse.down();
    await page.mouse.move(2, 300, { steps: 8 });
    await expect(page.getByTestId("snap-hint")).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId("snap-hint")).toHaveCount(0);
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 720, height: 856 });

    // Right edge.
    const metrics = await openMetrics(page);
    const m = await boxOf(metrics);
    await mouseDrag(page, { x: m.x + m.width - 200, y: m.y + 16 }, { x: 1438, y: 300 });
    expect(await boxOf(metrics)).toEqual({ x: 720, y: 44, width: 720, height: 856 });

    // Dragging a snapped window away gives it its own size back.
    await mouseDrag(page, { x: 200, y: 60 }, { x: 500, y: 300 });
    const restored = await boxOf(meds);
    expect(restored.width).toBe(before.width);
    expect(restored.height).toBe(before.height);

    // Top edge: maximise.
    await mouseDrag(page, { x: restored.x + 200, y: restored.y + 16 }, { x: 700, y: 20 });
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 856 });
  });

  test("the task strip focuses, minimises and restores windows", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const metrics = await openMetrics(page);

    await expect(task(page, "Metrics window")).toHaveAttribute("aria-pressed", "true");
    await expect(task(page, "Medications window")).toHaveAttribute("aria-pressed", "false");

    // A background window's button brings it to the front.
    await task(page, "Medications window").click();
    await expect(meds).toHaveAttribute("data-focused", "true");
    await expect(task(page, "Medications window")).toHaveAttribute("aria-pressed", "true");
    await expect(meds.getByRole("heading", { name: "Medications" })).toBeFocused();

    // The front window's button minimises it; it stays mounted.
    await task(page, "Medications window").click();
    await expect(meds).toBeHidden();
    await expect(windows(page)).toHaveCount(2);
    await expect(task(page, "Medications window, minimised")).toBeVisible();
    await expect(metrics).toHaveAttribute("data-focused", "true");

    // ...and restores it where it was.
    await task(page, "Medications window, minimised").click();
    await expect(meds).toBeVisible();
    expect(await boxOf(meds)).toEqual({ x: 16, y: 56, width: 720, height: 520 });

    // Home shows the desktop; the windows keep their state.
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(meds).toBeHidden();
    await expect(metrics).toBeHidden();
    await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(taskStrip(page).getByRole("button")).toHaveCount(2);

    // Tidy puts the windows side by side.
    await task(page, "Medications window, minimised").click();
    await task(page, "Metrics window, minimised").click();
    await page.getByRole("button", { name: "Arrange windows side by side" }).click();
    const a = await boxOf(meds);
    const b = await boxOf(metrics);
    expect(a.width).toBe(b.width);
    expect(a.x + a.width).toBeLessThan(b.x);
  });

  test("two overlapping windows: a click raises the one behind", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const metrics = await openMetrics(page);
    const zOf = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).zIndex));
    const topAt = (x: number, y: number) =>
      page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest("[data-app]")?.getAttribute("data-app"), [
        x,
        y,
      ]);

    await expect(metrics).toHaveAttribute("data-focused", "true");
    expect(await zOf(metrics)).toBeGreaterThan(await zOf(meds));
    // A point inside both windows belongs to Metrics, on top.
    expect(await topAt(400, 300)).toBe("metrics");

    // Medications shows to the left of Metrics: click it there.
    await page.mouse.click(26, 300);
    await expect(meds).toHaveAttribute("data-focused", "true");
    await expect(metrics).toHaveAttribute("data-focused", "false");
    expect(await zOf(meds)).toBeGreaterThan(await zOf(metrics));
    expect(await topAt(400, 300)).toBe("meds");

    // And back again, by Metrics' visible part.
    await page.mouse.click(850, 650);
    await expect(metrics).toHaveAttribute("data-focused", "true");
    expect(await topAt(400, 300)).toBe("metrics");
  });

  test("keyboard: arrows move, Shift+arrows resize, Ctrl+` cycles, Esc closes", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const title = meds.getByRole("heading", { name: "Medications" });
    // Focus moves into the window when it opens.
    await expect(title).toBeFocused();
    const before = await boxOf(meds);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    expect(await boxOf(meds)).toEqual({ ...before, x: before.x + 32, y: before.y + 16 });

    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowUp");
    expect(await boxOf(meds)).toEqual({
      x: before.x + 32,
      y: before.y + 16,
      width: before.width + 16,
      height: before.height - 16,
    });

    const metrics = await openMetrics(page);
    await expect(metrics.getByRole("heading", { name: "Metrics" })).toBeFocused();
    await page.keyboard.press("Control+Backquote");
    await expect(meds).toHaveAttribute("data-focused", "true");
    await expect(title).toBeFocused();
    await page.keyboard.press("Control+Shift+Backquote");
    await expect(metrics.getByRole("heading", { name: "Metrics" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(metrics).toHaveCount(0);
    // Focus returns to the window now on top.
    await expect(title).toBeFocused();
  });

  test("Back closes the most recent window", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const metrics = await openMetrics(page);
    await page.goBack();
    await expect(metrics).toHaveCount(0);
    await expect(meds).toBeVisible();
    await page.goBack();
    await expect(windows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test("a window keeps its place across a reload, and stays on screen when the browser shrinks", async ({ page }) => {
    await openDesktop(page);
    const metrics = await openMetrics(page);
    const before = await boxOf(metrics);
    await mouseDrag(page, { x: before.x + 300, y: before.y + 16 }, { x: before.x + 800, y: before.y + 216 });
    const se = centre(await boxOf(grip(page, "Metrics", "se")));
    await mouseDrag(page, se, { x: se.x - 100, y: se.y - 60 });
    const placed = await boxOf(metrics);
    expect(placed).toEqual({ x: before.x + 500, y: before.y + 200, width: 780, height: 540 });

    await page.reload();
    await expect(metrics).toBeVisible();
    expect(await boxOf(metrics)).toEqual(placed);

    // A smaller browser window: still desktop mode, the window wholly on screen.
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect(layer(page)).toHaveAttribute("data-mode", "desktop");
    await expect
      .poll(async () => {
        const b = await boxOf(metrics);
        return b.x >= 0 && b.y >= 44 && b.x + b.width <= 1100 && b.y + b.height <= 700;
      })
      .toBe(true);
    // Back at full size it returns to where it was put.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => boxOf(metrics)).toEqual(placed);
  });

  test("Home is a grid of the Today gadget and every card, with no Log gadget or bottom bar", async ({ page }) => {
    await openDesktop(page);
    const home = page.getByTestId("home");
    await expect(home.getByTestId("today-gadget")).toBeVisible();
    const ids = ["section-water", "section-food-salt", "section-bp", "section-weight", "section-urination", "section-defecation"];
    const boxes: Box[] = [];
    for (const id of ids) {
      const card = home.locator(`#${id}`);
      await expect(card).toBeVisible();
      boxes.push(await boxOf(card));
    }
    // A grid, not one column: three columns at 1440px, with equal gutters.
    const columns = [...new Set(boxes.map((b) => Math.round(b.x)))].sort((a, b) => a - b);
    expect(columns).toHaveLength(3);
    // Equal widths and equal gutters (to the pixel the grid rounds to).
    const widths = boxes.map((b) => b.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(Math.abs(columns[1]! - columns[0]! - (columns[2]! - columns[1]!))).toBeLessThanOrEqual(1);
    // Every card is inside the viewport's width.
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(1440);

    // Masonry: Today sits top left, every card keeps its natural height (no
    // empty slab stretched to a neighbour's), and each card sits one gutter
    // under whatever is above it in its column.
    const masonry = () =>
      home.evaluate((root) => {
        const items = [...root.querySelectorAll<HTMLElement>(".wd-home > .wc-today, .wd-home > .wc-mods > *")].map(
          (el) => {
            const r = el.getBoundingClientRect();
            const inner = el.classList.contains("wc-today") ? r : el.firstElementChild!.getBoundingClientRect();
            return { id: el.id || "today", x: r.x, right: r.right, y: r.y, bottom: r.bottom, stretch: r.height - inner.height };
          },
        );
        const top = Math.min(...items.map((i) => i.y));
        const gaps = items
          .filter((i) => i.y > top + 1)
          .map((i) => {
            const above = items.filter((o) => o !== i && o.bottom <= i.y && o.x < i.right && o.right > i.x);
            return Math.round(i.y - Math.max(...above.map((o) => o.bottom)));
          });
        const today = items.find((i) => i.id === "today")!;
        return {
          todayTopLeft: today.y === top && today.x === Math.min(...items.map((i) => i.x)),
          stretched: items.filter((i) => Math.abs(i.stretch) > 1).map((i) => i.id),
          gaps,
        };
      });
    await expect.poll(async () => (await masonry()).gaps.every((g) => g >= 16 && g <= 17)).toBe(true);
    const packed = await masonry();
    expect(packed.todayTopLeft).toBe(true);
    expect(packed.stretched).toEqual([]);
    // Three columns: five cards sit under another (only Today and Liquids are on top).
    expect(packed.gaps).toHaveLength(5);

    // The cards are the full forms; no compact Log gadget duplicates them.
    await expect(home.locator("#section-water").getByRole("tab", { name: "Beverage" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Bottom bar" })).toHaveCount(0);

    // Home stays in use behind a free window.
    await openMeds(page);
    await expect(home).not.toHaveAttribute("inert", "");
    await expect(home.getByTestId("today-gadget")).toBeVisible();
  });

  for (const [width, height] of [
    [1024, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    test(`nothing scrolls sideways at ${width}px, with no windows and with three`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      // The /profile deep link opens Profile (signed in or not).
      await openDesktop(page, "/profile");
      const profile = windowNamed(page, "Profile");
      await expect(profile).toBeVisible();
      await profile.getByRole("button", { name: "Close Profile" }).click();
      await expect(windows(page)).toHaveCount(0);
      expect(await noSidewaysScroll(page)).toEqual({ page: true, body: true, layer: true });

      await page.goto("/profile");
      await expect(profile).toBeVisible();
      await openMeds(page);
      await openMetrics(page);
      await expect(windows(page)).toHaveCount(3);
      await expect(taskStrip(page).getByRole("button")).toHaveCount(3);
      expect(await noSidewaysScroll(page)).toEqual({ page: true, body: true, layer: true });
      for (const name of ["Profile", "Medications", "Metrics"]) {
        const b = await boxOf(windowNamed(page, name));
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width);
      }
      // The sys-bar fits too: its last button is on screen.
      await expect(apps(page).getByRole("button", { name: "Settings" })).toBeInViewport({ ratio: 1 });
    });
  }
});

test.describe("Windows on a touch tablet", () => {
  // As wide as a desktop, but no mouse: the tiled layout and the bottom bar stay.
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

  test("keeps tiling and the bottom bar", async ({ page }) => {
    await openHome(page);
    await expect(layer(page)).toHaveAttribute("data-mode", "tiled");
    await expect(page.getByRole("navigation", { name: "Bottom bar" })).toBeVisible();
    await expect(taskStrip(page)).toHaveCount(0);

    await sysBar(page).getByRole("button", { name: /^Medications/ }).tap();
    const meds = windowNamed(page, "Medications");
    await expect(meds).toBeVisible();
    await expect(meds).not.toHaveAttribute("data-free", "true");
    await expect(meds.locator("[data-grip]")).toHaveCount(0);
  });
});
