import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Ward Console window manager.
 * Phone (390×844): one full-screen window at a time, Back closes it.
 * Tiled (1000×800, and touch tablets): windows tile side by side.
 * Desktop (1440×900 with a mouse): free windows that drag, resize, snap and
 * maximise, a task strip in the sys-bar, the intake modules as windows of
 * their own, and a desk band (bug report, minimised modules, mic).
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
    // One window at a time on a phone: no Windows switcher, no Log.
    await expect(windowsButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log", exact: true })).toHaveCount(0);
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

    // Opening another app closes the one on screen; Back then goes Home.
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await sysBar(page).getByRole("button", { name: "Metrics" }).click();
    await expect(windowNamed(page, "Metrics")).toBeVisible();
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

  test("the quick links jump to each card on Home", async ({ page }) => {
    await openHome(page);
    const links = page.getByRole("navigation", { name: "Jump to" });
    await expect(links).toBeVisible();
    // Cards above can still grow as their data loads after the jump: tap
    // again until the page has settled.
    await expect(async () => {
      await links.getByRole("button", { name: "Weight" }).click();
      await page.waitForTimeout(600);
      const top = await page.evaluate(() => document.getElementById("section-weight")!.getBoundingClientRect().top);
      expect(top).toBeLessThan(80);
    }).toPass({ timeout: 15_000 });
    await expect(links.getByRole("button", { name: "Weight" })).toHaveAttribute("aria-current", "true");

    // Not over a window.
    await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await expect(links).toHaveCount(0);
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

test.describe("Swiping on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

  /** A sideways finger swipe across the middle of the screen. */
  async function swipe(page: Page, dx: number) {
    const cdp = await page.context().newCDPSession(page);
    const x0 = dx < 0 ? 330 : 60;
    const y = 420;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / 8, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    // Swipes are ignored until the page has slid in: wait for it to settle.
    await page.waitForTimeout(50);
    await expect
      .poll(() =>
        page.evaluate(() =>
          ['[data-testid="home"]', '[data-testid="window-layer"]']
            .map((sel) => document.querySelector<HTMLElement>(sel)?.style.transform ?? "")
            .join(""),
        ),
      )
      .toBe("");
  }

  test("moves along the sys-bar: Home, Medications, Metrics, History, one window at a time", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("navigation", { name: "Jump to" })).toBeVisible();

    // Home is the first page: nothing to its left.
    await swipe(page, 250);
    await expect(windows(page)).toHaveCount(0);

    await swipe(page, -250);
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await expect(page).toHaveURL(/\/medications$/);
    await swipe(page, -250);
    const metrics = windowNamed(page, "Metrics");
    await expect(metrics).toBeVisible();
    await expect(windows(page)).toHaveCount(1);
    await expect(metrics.getByRole("tab", { name: "Summary" })).toHaveAttribute("data-state", "active");
    // History is Metrics on Records, lit in the sys-bar.
    await swipe(page, -250);
    await expect(metrics.getByRole("tab", { name: "Records" })).toHaveAttribute("data-state", "active");
    await expect(sysBar(page).getByRole("button", { name: "History" })).toHaveAttribute("aria-pressed", "true");

    await swipe(page, 250);
    await expect(metrics.getByRole("tab", { name: "Summary" })).toHaveAttribute("data-state", "active");
    await swipe(page, 250);
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await swipe(page, 250);
    await expect(windows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);

    // Back from a swiped-to window goes Home.
    await swipe(page, -250);
    await expect(windowNamed(page, "Medications")).toBeVisible();
    await page.goBack();
    await expect(windows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
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

/** The intake modules: on the desktop each is a window of its own. */
const MODULES = ["today", "liquids", "food", "bp", "weight", "wee", "bowel"] as const;
const moduleWindows = (page: Page) => page.getByTestId("module-window");
const moduleWindow = (page: Page, id: (typeof MODULES)[number]) =>
  page.locator(`[data-testid="module-window"][data-app="${id}"]`);
/** A minimised module's square icon on the desk band. */
const deskIcons = (page: Page) => page.getByTestId("desk-icon");
const deskIcon = (page: Page, id: (typeof MODULES)[number]) => page.locator(`[data-desk-icon="${id}"]`);

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
  // `next dev` pins its own indicator to the bottom left, over the desk band.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
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
    expect(edge.y + edge.height).toBe(828);
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
    await page.mouse.move(start.x + 500, start.y + 250, { steps: 1 });
    await page.mouse.move(start.x + 420, start.y + 220, { steps: 3 });
    await page.mouse.up();

    expect(await boxOf(meds)).toEqual({
      x: before.x + 420,
      y: before.y + 220,
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
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 784 });
    await expect(meds).toHaveAttribute("data-max", "true");
    // Home is covered: out of the tab order and the accessibility tree.
    // The module windows under it are out of the tab order and the accessibility tree.
    await expect(moduleWindow(page, "liquids")).toHaveAttribute("inert", "");

    await titleBar(page, "Medications").dblclick({ position: { x: 200, y: 16 } });
    expect(await boxOf(meds)).toEqual(before);
    await expect(moduleWindow(page, "liquids")).not.toHaveAttribute("inert", "");

    await meds.getByRole("button", { name: "Maximise Medications" }).click();
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 784 });
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
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 720, height: 784 });

    // Right edge.
    const metrics = await openMetrics(page);
    const m = await boxOf(metrics);
    await mouseDrag(page, { x: m.x + m.width - 200, y: m.y + 16 }, { x: 1438, y: 300 });
    expect(await boxOf(metrics)).toEqual({ x: 720, y: 44, width: 720, height: 784 });

    // Dragging a snapped window away gives it its own size back.
    await mouseDrag(page, { x: 200, y: 60 }, { x: 500, y: 300 });
    const restored = await boxOf(meds);
    expect(restored.width).toBe(before.width);
    expect(restored.height).toBe(before.height);

    // Top edge: maximise.
    await mouseDrag(page, { x: restored.x + 200, y: restored.y + 16 }, { x: 700, y: 20 });
    expect(await boxOf(meds)).toEqual({ x: 0, y: 44, width: 1440, height: 784 });
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
    await page.getByRole("button", { name: "Tidy windows" }).click();
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
    await page.keyboard.press("Control+Shift+Backquote");
    await expect(meds).toHaveAttribute("data-focused", "true");
    await expect(title).toBeFocused();
    await page.keyboard.press("Control+Backquote");
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
    await mouseDrag(page, { x: before.x + 300, y: before.y + 16 }, { x: before.x + 800, y: before.y + 116 });
    const se = centre(await boxOf(grip(page, "Metrics", "se")));
    await mouseDrag(page, se, { x: se.x - 100, y: se.y - 60 });
    const placed = await boxOf(metrics);
    expect(placed).toEqual({ x: before.x + 500, y: before.y + 100, width: 780, height: 540 });

    await page.reload();
    await expect(metrics).toBeVisible();
    expect(await boxOf(metrics)).toEqual(placed);

    // A smaller browser window: still desktop mode, the window wholly on screen.
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect(layer(page)).toHaveAttribute("data-mode", "desktop");
    await expect
      .poll(async () => {
        const b = await boxOf(metrics);
        return b.x >= 0 && b.y >= 44 && b.x + b.width <= 1100 && b.y + b.height <= 700 - 72;
      })
      .toBe(true);
    // Back at full size it returns to where it was put.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => boxOf(metrics)).toEqual(placed);
  });

  test("the three title bar controls are one group: equal sizes, no gaps", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    for (const win of [meds, moduleWindow(page, "liquids")]) {
      const [min, max, close] = await Promise.all(
        [/^Minimise /, /^(Maximise|Restore) /, /^Close /].map((name) => boxOf(win.getByRole("button", { name }))),
      );
      expect([min!.width, max!.width, close!.width]).toEqual([32, 32, 32]);
      expect([min!.height, max!.height, close!.height]).toEqual([32, 32, 32]);
      // Minimise | Maximise | Close, touching, with the same (zero) gap.
      expect(max!.x - (min!.x + min!.width)).toBe(0);
      expect(close!.x - (max!.x + max!.width)).toBe(0);
      expect(new Set([min!.y, max!.y, close!.y]).size).toBe(1);
    }
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

test.describe("Intake modules as windows on the desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => skipAnalyticsIntro(page));

  const overlapping = (boxes: Record<string, Box>) => {
    const ids = Object.keys(boxes);
    const out: string[] = [];
    ids.forEach((a, i) =>
      ids.slice(i + 1).forEach((b) => {
        const p = boxes[a]!;
        const q = boxes[b]!;
        if (p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height) {
          out.push(`${a}/${b}`);
        }
      }),
    );
    return out;
  };

  async function moduleBoxes(page: Page) {
    const boxes: Record<string, Box> = {};
    for (const id of MODULES) boxes[id] = await boxOf(moduleWindow(page, id));
    return boxes;
  }

  test("first load: all seven modules are open, side by side, with nothing scrolling sideways", async ({ page }) => {
    await openDesktop(page);
    await expect(moduleWindows(page)).toHaveCount(7);
    for (const id of MODULES) await expect(moduleWindow(page, id)).toBeVisible();

    const boxes = await moduleBoxes(page);
    expect(overlapping(boxes)).toEqual([]);
    for (const b of Object.values(boxes)) {
      expect(b.x).toBeGreaterThanOrEqual(8);
      expect(b.x + b.width).toBeLessThanOrEqual(1440 - 8);
      // Under the sys-bar, over the desk band.
      expect(b.y).toBeGreaterThanOrEqual(44 + 8);
      expect(b.y + b.height).toBeLessThanOrEqual(900 - 72 - 8);
    }
    // Today is top left, two columns wide, in its wide layout.
    expect(boxes.today).toMatchObject({ x: 8, y: 52, width: 708 });
    await expect(moduleWindow(page, "today").getByTestId("today-day-label").first()).toHaveText(/^[A-Z][a-z]{2} \d+$/);
    expect(await noSidewaysScroll(page)).toEqual({ page: true, body: true, layer: true });
    const vertical = await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight);
    expect(vertical).toBe(true);

    // Nothing is minimised, there is no bottom bar and no compact Log gadget.
    await expect(deskIcons(page)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Bottom bar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log", exact: true })).toHaveCount(0);
    // The task strip lists app windows only.
    await expect(taskStrip(page).getByRole("button")).toHaveCount(0);
    // The cards are the full forms.
    await expect(moduleWindow(page, "liquids").getByRole("tab", { name: "Beverage" })).toBeVisible();
  });

  test("the Food form is taller than its window: it scrolls inside, down to the last field", async ({ page }) => {
    await openDesktop(page);
    const food = moduleWindow(page, "food");
    const body = food.getByTestId("window-body");
    const win = await boxOf(food);
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // Only up and down: nothing is cut off sideways.
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    // The top of the form shows without scrolling.
    await expect(food.getByPlaceholder("What I ate…").or(food.getByPlaceholder("What I ate...")).first()).toBeInViewport({
      ratio: 1,
    });

    // Scrolled to the end, the save button and the last line are whole and inside the window.
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const save = food.getByRole("button", { name: "Record with details" });
    await expect(save).toBeInViewport({ ratio: 1 });
    const last = await boxOf(food.locator("#section-food-salt").getByText("Nothing logged yet."));
    expect(last.y + last.height).toBeLessThanOrEqual(win.y + win.height - 1);
    expect(last.y).toBeGreaterThanOrEqual(win.y + 32);
    // The window itself did not move or grow.
    expect(await boxOf(food)).toEqual(win);
  });

  test("minimised modules show their real names on the desk icons", async ({ page }) => {
    await openDesktop(page);
    for (const name of ["Urination", "Defecation", "Food"]) {
      await page.getByRole("button", { name: `Minimise ${name}` }).click();
    }
    for (const [id, name] of [
      ["wee", "Urination"],
      ["bowel", "Defecation"],
      ["food", "Food"],
    ] as const) {
      const icon = deskIcon(page, id);
      await expect(icon).toHaveText(name);
      await expect(icon).toHaveAccessibleName(`Open ${name}`);
      await expect(icon).toHaveAttribute("title", `Open ${name}`);
      // The label fits the 56px tile: not cut off.
      const label = icon.locator("span");
      expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });

  test("the default arrangement also fits 1920×1080 without overlap", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openDesktop(page);
    await expect(moduleWindows(page)).toHaveCount(7);
    const boxes = await moduleBoxes(page);
    expect(overlapping(boxes)).toEqual([]);
    for (const b of Object.values(boxes)) {
      expect(b.x + b.width).toBeLessThanOrEqual(1920 - 8);
      expect(b.y + b.height).toBeLessThanOrEqual(1080 - 72 - 8);
    }
    expect(await noSidewaysScroll(page)).toEqual({ page: true, body: true, layer: true });
  });

  test("drag and resize the Liquids window with the mouse", async ({ page }) => {
    await openDesktop(page);
    const liquids = moduleWindow(page, "liquids");
    const before = await boxOf(liquids);

    // Across other windows: the title bar keeps the pointer.
    const start = { x: before.x + 120, y: before.y + 16 };
    await mouseDrag(page, start, { x: start.x - 400, y: start.y + 200 });
    const moved = await boxOf(liquids);
    expect(moved).toEqual({ x: before.x - 400, y: before.y + 200, width: before.width, height: before.height });
    await expect(liquids).toHaveAttribute("data-focused", "true");

    const se = centre(await boxOf(liquids.locator('[data-grip="se"]')));
    await mouseDrag(page, se, { x: se.x + 150, y: se.y - 60 });
    const bigger = await boxOf(liquids);
    expect(bigger).toEqual({ x: moved.x, y: moved.y, width: moved.width + 150, height: moved.height - 60 });

    // Down to the minimum: still the whole phone layout, nothing cut off sideways.
    const again = centre(await boxOf(liquids.locator('[data-grip="se"]')));
    await mouseDrag(page, again, { x: 0, y: again.y });
    expect((await boxOf(liquids)).width).toBe(340);
    const body = liquids.getByTestId("window-body");
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // (The tab row hangs 1px over its rule, so not quite ratio 1.)
    await expect(liquids.getByRole("tab", { name: "Alcohol" })).toBeInViewport({ ratio: 0.95 });
    const tab = await boxOf(liquids.getByRole("tab", { name: "Alcohol" }));
    expect(tab.x + tab.width).toBeLessThanOrEqual(moved.x + 340);
    // ...and to the minimum height: it scrolls.
    const last = centre(await boxOf(liquids.locator('[data-grip="se"]')));
    await mouseDrag(page, last, { x: last.x, y: 0 });
    expect(await boxOf(liquids)).toEqual({ x: moved.x, y: moved.y, width: 340, height: 150 });
  });

  test("minimise Liquids: its icon appears on the desk, and the icon restores the same rect", async ({ page }) => {
    await openDesktop(page);
    const liquids = moduleWindow(page, "liquids");
    const at = await boxOf(liquids);
    await mouseDrag(page, { x: at.x + 120, y: at.y + 16 }, { x: at.x + 20, y: at.y + 116 });
    const placed = await boxOf(liquids);
    expect(placed.x).toBe(at.x - 100);

    await liquids.getByRole("button", { name: "Minimise Liquids" }).click();
    await expect(liquids).toBeHidden();
    const icon = deskIcon(page, "liquids");
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAccessibleName("Open Liquids");
    await expect(icon).toBeFocused();
    await expect(deskIcons(page)).toHaveCount(1);
    // A square tile on the desk band, left of centre, clear of the windows.
    const tile = await boxOf(icon);
    expect(tile.width).toBe(56);
    expect(tile.height).toBe(56);
    expect(tile.y).toBeGreaterThanOrEqual(900 - 72);
    expect(tile.x).toBeLessThan(200);

    await icon.click();
    await expect(liquids).toBeVisible();
    expect(await boxOf(liquids)).toEqual(placed);
    await expect(deskIcons(page)).toHaveCount(0);
    await expect(liquids.getByRole("heading", { name: "Liquids" })).toBeFocused();

    // Close (×) is the same as minimise: a module can never be lost. Enter restores it.
    await liquids.getByRole("button", { name: "Close Liquids" }).click();
    await expect(liquids).toBeHidden();
    await expect(moduleWindows(page)).toHaveCount(7);
    await expect(icon).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(liquids).toBeVisible();
    expect(await boxOf(liquids)).toEqual(placed);
  });

  test("a reload keeps each module's place and which ones are minimised", async ({ page }) => {
    await openDesktop(page);
    const liquids = moduleWindow(page, "liquids");
    const at = await boxOf(liquids);
    await mouseDrag(page, { x: at.x + 120, y: at.y + 16 }, { x: at.x - 80, y: at.y + 96 });
    const se = centre(await boxOf(liquids.locator('[data-grip="se"]')));
    await mouseDrag(page, se, { x: se.x + 70, y: se.y + 30 });
    const placed = await boxOf(liquids);
    expect(placed).toEqual({ x: at.x - 200, y: at.y + 80, width: at.width + 70, height: at.height + 30 });
    await moduleWindow(page, "bp").getByRole("button", { name: "Minimise Blood Pressure" }).click();
    await expect(deskIcon(page, "bp")).toBeVisible();

    await page.reload();
    await expect(layer(page)).toHaveAttribute("data-mode", "desktop");
    await expect(liquids).toBeVisible();
    expect(await boxOf(liquids)).toEqual(placed);
    await expect(moduleWindow(page, "bp")).toBeHidden();
    await expect(deskIcon(page, "bp")).toBeVisible();

    // Tidy: every module back in the default arrangement, open.
    await page.getByRole("button", { name: "Tidy windows" }).click();
    await expect(moduleWindow(page, "bp")).toBeVisible();
    await expect(deskIcons(page)).toHaveCount(0);
    expect(await boxOf(liquids)).toEqual(at);
    expect(overlapping(await moduleBoxes(page))).toEqual([]);
  });

  test("modules share the stacking order with app windows, and Back never closes one", async ({ page }) => {
    await openDesktop(page);
    const meds = await openMeds(page);
    const today = moduleWindow(page, "today");
    const zOf = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(await zOf(meds)).toBeGreaterThan(await zOf(today));
    await expect(taskStrip(page).getByRole("button")).toHaveCount(1);

    // Liquids shows to the right of Medications: a click on its title bar raises it over the app window.
    await page.mouse.click(900, 68);
    await expect(moduleWindow(page, "liquids")).toHaveAttribute("data-focused", "true");
    expect(await zOf(moduleWindow(page, "liquids"))).toBeGreaterThan(await zOf(meds));
    await expect(meds).toHaveAttribute("data-focused", "false");

    // Back closes the app window; the seven modules stay.
    await page.goBack();
    await expect(meds).toHaveCount(0);
    await expect(moduleWindows(page)).toHaveCount(7);
    for (const id of MODULES) await expect(moduleWindow(page, id)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the hazard button opens the bug report dialog", async ({ page }) => {
    await openDesktop(page);
    const hazard = page.getByRole("button", { name: "Report a bug" });
    await expect(hazard).toBeVisible();
    // Bottom left of the desk, a square, clear of every window.
    const box = await boxOf(hazard);
    expect(box).toMatchObject({ x: 8, width: 56, height: 56 });
    expect(box.y).toBeGreaterThanOrEqual(900 - 72);

    await hazard.click();
    const dialog = page.getByRole("dialog", { name: "Report a bug" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("logging 250 ml of water in the Liquids window updates the Today window", async ({ page }) => {
    await openDesktop(page);
    const today = moduleWindow(page, "today");
    await expect(today.getByTestId("today-water-value")).toHaveText("0");

    const liquids = moduleWindow(page, "liquids");
    await expect(liquids.getByRole("button", { name: /\+250ml/ })).toBeVisible();
    await liquids.getByRole("button", { name: "Confirm Entry" }).click();
    await expect(page.getByText("Water intake recorded", { exact: true })).toBeVisible();

    await expect(today.getByTestId("today-water-value")).toHaveText("250");
    await expect(liquids.locator("#section-water")).toContainText("250");
  });

  test("the whole value box takes the tap: Weight, the Liquids amount and the BP fields", async ({ page }) => {
    await openDesktop(page);
    // Weight: a click in the corner of the big box, far from the "-- kg" text, starts typing.
    const weight = moduleWindow(page, "weight");
    const tapBox = weight.locator("label").filter({ hasText: "kg" }).first();
    const field = tapBox.locator("input");
    const box = await boxOf(tapBox);
    expect(box.width).toBeGreaterThan(150);
    await page.mouse.click(box.x + 6, box.y + 6);
    await expect(field).toBeFocused();
    await page.keyboard.type("78.4");
    await page.keyboard.press("Tab");
    await expect(weight.locator("#section-weight")).toContainText("78.40");

    // Liquids: the whole amount box is the button.
    const liquids = moduleWindow(page, "liquids");
    const amount = liquids.getByRole("button", { name: /tap to edit/i });
    const a = await boxOf(amount);
    await page.mouse.click(a.x + 5, a.y + 5);
    // It opens the amount editor.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Blood pressure: the big fields are inputs edge to edge.
    const bp = moduleWindow(page, "bp");
    const sys = bp.getByLabel(/Systolic/);
    const s = await boxOf(sys);
    expect(s.width).toBeGreaterThan(100);
    await page.mouse.click(s.x + 4, s.y + 4);
    await expect(sys).toBeFocused();
  });
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
