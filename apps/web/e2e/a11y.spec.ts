import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

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
interface Route {
  name: string;
  path: string;
  /** Final URL after any client-side redirect. Defaults to `path`. */
  resolvedPath?: string;
  waitFor: string;
}

const ROUTES: ReadonlyArray<Route> = [
  { name: "dashboard", path: "/", waitFor: "Intake Tracker" },
  // /history resolves to /analytics (the Metrics window on Records, which
  // adds ?tab=records). Wait for the resolved path before running axe.
  { name: "history", path: "/history", resolvedPath: "/analytics", waitFor: "Analytics" },
  { name: "medications", path: "/medications", waitFor: "Medications" },
  { name: "settings", path: "/settings", waitFor: "Settings" },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} has no critical violations`, async ({ page }) => {
    await page.goto(route.path);
    if (route.resolvedPath && route.resolvedPath !== route.path) {
      const resolved = route.resolvedPath;
      await page.waitForURL((url) => url.pathname === resolved);
    }
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
        serious.map((v) => `${v.id} (${v.nodes.length} nodes: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.any[0]?.message ?? ""}`).join(" | ")})`).join(", "),
      );
    }

    expect(
      critical,
      `Critical a11y violations on ${route.name}: ${critical.map((v) => v.id).join(", ")}`,
    ).toEqual([]);
  });
}

/**
 * The Ward Console shell with windows and sheets open, on a phone and on a
 * wide screen. Each window is a labelled region, the Settings sheet a modal
 * dialog; axe runs over the whole page with them on screen.
 */

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  if (serious.length > 0) {
    console.log(
      `[a11y][${name}] ${serious.length} serious violation(s):`,
      serious.map((v) => `${v.id} (${v.nodes.length} nodes: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")})`).join(", "),
    );
  }
  expect(critical, `Critical a11y violations on ${name}: ${critical.map((v) => v.id).join(", ")}`).toEqual([]);
  // Serious ones the shell itself adds (colour contrast, names on controls,
  // ARIA misuse) gate too; the page-level ones above are still a ratchet.
  expect(
    serious.filter((v) => SHELL_RULES.has(v.id)),
    `Serious a11y violations on ${name}: ${serious.map((v) => v.id).join(", ")}`,
  ).toEqual([]);
}

const SHELL_RULES = new Set([
  "aria-allowed-attr",
  "aria-hidden-focus",
  "aria-required-children",
  "aria-required-parent",
  "aria-valid-attr-value",
  "button-name",
  "color-contrast",
  "link-name",
  "nested-interactive",
]);

const sysBar = (page: Page) => page.getByTestId("sys-bar");
const windowNamed = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

for (const vp of [
  { label: "phone", width: 390, height: 844 },
  // Tiled: wide enough for side-by-side windows, too narrow for desktop mode.
  { label: "tiled", width: 1000, height: 800 },
  // Desktop: free, overlapping windows and the task strip in the sys-bar.
  { label: "desktop", width: 1440, height: 900 },
] as const) {
  test.describe(`a11y: shell on ${vp.label} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Medications window open", async ({ page }) => {
      await page.goto("/");
      await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
      const meds = windowNamed(page, "Medications");
      await expect(meds).toBeVisible();
      await expect(meds.getByRole("tab").first()).toBeVisible();
      await scan(page, `${vp.label}: meds window`);
    });

    test("Metrics window open", async ({ page }) => {
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
      if (vp.label !== "phone") {
        // Two windows: side by side when tiled, overlapping on the desktop.
        await sysBar(page).getByRole("button", { name: /^Medications/ }).click();
        await expect(windowNamed(page, "Medications")).toBeVisible();
      }
      await sysBar(page).getByRole("button", { name: "Metrics" }).click();
      const metrics = windowNamed(page, "Metrics");
      await expect(metrics).toBeVisible();
      await expect(metrics.getByRole("tab").first()).toBeVisible();
      await scan(page, `${vp.label}: metrics window`);
    });

    test("Settings sheet open", async ({ page }) => {
      await page.goto("/");
      await sysBar(page).getByRole("button", { name: "Settings" }).click();
      const sheet = page.getByRole("dialog", { name: "Settings" });
      await expect(sheet).toBeVisible();
      await scan(page, `${vp.label}: settings sheet`);
    });

    if (vp.label === "desktop") {
      test("Two free windows, one minimised to the task strip", async ({ page }) => {
        await page.goto("/");
        const launch = page.getByRole("navigation", { name: "Apps" });
        await launch.getByRole("button", { name: /^Medications/ }).click();
        const meds = windowNamed(page, "Medications");
        await expect(meds).toBeVisible();
        await expect(meds).toHaveAttribute("data-free", "true");
        // The /profile deep link opens a second window over the first.
        await page.goto("/profile");
        const profile = windowNamed(page, "Profile");
        await expect(profile).toBeVisible();
        await expect(meds).toBeVisible();
        await scan(page, "desktop: two free windows");

        await meds.getByRole("button", { name: "Minimise Medications" }).click();
        const strip = page.getByRole("toolbar", { name: "Open windows" });
        await expect(strip.getByRole("button", { name: "Medications window, minimised" })).toBeVisible();
        await scan(page, "desktop: task strip with a minimised window");
      });
    }
  });
}

/**
 * The MCP consent screen is the only HTML view in the OAuth flow the user
 * actually sees — every other endpoint is machine-to-machine. It's a
 * hand-rolled HTML string (not a React route), so it needs its own scan.
 */
test("a11y: MCP consent screen has no critical violations", async ({
  page,
  request,
  baseURL,
}) => {
  // Gated alongside the MCP connector E2E spec — same prerequisites
  // (running production server + authenticated session). The consent
  // screen markup itself is a static HTML string; the unit/fuzz/integration
  // suites cover the route logic, so running this a11y scan per-PR is
  // unnecessary for catching regressions on the markup.
  test.skip(
    process.env.RUN_MCP_E2E !== "1",
    "Set RUN_MCP_E2E=1 to scan the MCP consent screen",
  );

  // Register a fresh client so the consent page renders for a real flow.
  const reg = await request.post(
    `${baseURL}/api/mcp/oauth/register`,
    {
      headers: { "content-type": "application/json" },
      data: {
        client_name: "a11y-probe",
        redirect_uris: ["http://localhost:3000/playwright-callback"],
        token_endpoint_auth_method: "none",
      },
    },
  );
  const { client_id, redirect_uris } = (await reg.json()) as {
    client_id: string;
    redirect_uris: string[];
  };

  // Static PKCE challenge — irrelevant to a11y, just needs to satisfy
  // the route's Zod schema so the consent page renders.
  const challenge =
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  const params = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: redirect_uris[0]!,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "a11y-state",
    scope: "intake-tracker:read",
  });

  await page.goto(`/api/mcp/oauth/authorize?${params.toString()}`);
  await expect(page.getByText(/Connect to intake-tracker/i)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  if (serious.length > 0) {
    console.log(
      `[a11y][mcp-consent] ${serious.length} serious violation(s):`,
      serious.map((v) => `${v.id} (${v.nodes.length} nodes)`).join(", "),
    );
  }
  expect(
    critical,
    `Critical a11y violations on MCP consent: ${critical.map((v) => v.id).join(", ")}`,
  ).toEqual([]);
});
