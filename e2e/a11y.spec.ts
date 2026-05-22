import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

/**
 * Accessibility scan across the four top-level routes.
 *
 * Strategy: run axe-core on each page and assert there are no `critical`
 * impact violations. We deliberately ignore `minor`, `moderate`, and
 * `serious` for now — those become the "next ratchet" once critical is
 * clean. Surfacing them as `console.log` keeps the signal visible without
 * gating CI on issues this suite has never enforced.
 *
 * Per the axe-core impact taxonomy:
 *   - critical: blocks users with disabilities entirely
 *   - serious:  major barrier for some users
 *   - moderate: notable friction
 *   - minor:    polish
 *
 * Reference: https://www.deque.com/axe/core-documentation/api-documentation/
 */
const ROUTES: ReadonlyArray<{ name: string; path: string; waitFor: string }> = [
  { name: "dashboard", path: "/", waitFor: "Intake Tracker" },
  { name: "history", path: "/history", waitFor: "History" },
  { name: "medications", path: "/medications", waitFor: "Medications" },
  { name: "settings", path: "/settings", waitFor: "Settings" },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} has no critical violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByText(route.waitFor, { exact: false }).first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      // wcag2a + wcag2aa is the floor most teams target; "best-practice" tags
      // produce a lot of noise on Radix-based UIs so we leave them off.
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");

    if (serious.length > 0) {
      // Visible in the Playwright report; doesn't gate CI yet.
      console.log(
        `[a11y][${route.name}] ${serious.length} serious violation(s):`,
        serious.map((v) => `${v.id} (${v.nodes.length} nodes)`).join(", "),
      );
    }

    expect(
      critical,
      `Critical a11y violations on ${route.name}: ${critical.map((v) => v.id).join(", ")}`,
    ).toEqual([]);
  });
}
