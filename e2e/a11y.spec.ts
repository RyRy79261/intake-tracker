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
interface Route {
  name: string;
  path: string;
  /** Final URL after any client-side redirect. Defaults to `path`. */
  resolvedPath?: string;
  waitFor: string;
}

const ROUTES: ReadonlyArray<Route> = [
  { name: "dashboard", path: "/", waitFor: "Intake Tracker" },
  // src/app/history/page.tsx is a client-side redirect to /analytics
  // (router.replace). Wait for the resolved URL before running axe.
  { name: "history", path: "/history", resolvedPath: "/analytics", waitFor: "Analytics" },
  { name: "medications", path: "/medications", waitFor: "Medications" },
  { name: "settings", path: "/settings", waitFor: "Settings" },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} has no critical violations`, async ({ page }) => {
    await page.goto(route.path);
    if (route.resolvedPath && route.resolvedPath !== route.path) {
      await page.waitForURL(route.resolvedPath);
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
        serious.map((v) => `${v.id} (${v.nodes.length} nodes)`).join(", "),
      );
    }

    expect(
      critical,
      `Critical a11y violations on ${route.name}: ${critical.map((v) => v.id).join(", ")}`,
    ).toEqual([]);
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
