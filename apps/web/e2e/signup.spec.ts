import { test, expect } from "@playwright/test";

/**
 * Real signup → land-in-app e2e.
 *
 * Unlike the other specs (which run offline / pre-authenticated against the
 * client-side Dexie app), this drives the ACTUAL Neon Auth email/password
 * signup flow — account creation, not just returning-user login. It is the
 * "go through the whole procedure as a real user" coverage.
 *
 * SKIPPED by default because it needs a live backend. To enable, provide the
 * prerequisites in docs/e2e-live-user-testing.md and set RUN_SIGNUP_E2E=1:
 *
 *   - DATABASE_URL → an ephemeral Neon branch (isolated test data)
 *   - NEON_AUTH_URL + NEON_AUTH_COOKIE_SECRET
 *   - Neon Auth email-verification OFF for the test project (simplest) — OR, if
 *     ON, wire the marked mail.tm verification step at the hook below
 *     (ALLOWED_EMAILS is no longer used, so no whitelist step is needed)
 *
 *   RUN_SIGNUP_E2E=1 pnpm --filter @intake/web exec playwright test signup
 *
 * NOTE: this spec has not yet had a green run (no Neon branch was available
 * when it was authored). Selectors are taken from src/app/auth/sign-up-form.tsx;
 * verify them on the first live run.
 */
const ENABLED = process.env.RUN_SIGNUP_E2E === "1";

test.describe("Signup (live Neon Auth)", () => {
  test.skip(
    !ENABLED,
    "Needs a live Neon Auth backend + branch — set RUN_SIGNUP_E2E=1 (see docs/e2e-live-user-testing.md)",
  );

  test("a new user can sign up with email/password and land in the app", async ({
    page,
    context,
  }) => {
    // Fresh identity per run so re-runs never collide. When email verification
    // is required, replace this with a real address from the agent-inbox skill
    // (mail.tm), and retrieve the link at the hook below.
    const stamp = Date.now();
    const email = `e2e-signup-${stamp}@intake-tracker.test`;
    const password = `Test-${stamp}-Pw!`;

    // This spec mints its own session — drop the shared, pre-seeded one.
    await context.clearCookies();

    await page.goto("/auth/sign-up");
    await expect(
      page.getByRole("heading", { name: /create an account/i }),
    ).toBeVisible();

    await page.getByLabel(/name/i).fill("E2E Test User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);

    await page.getByRole("button", { name: /create account/i }).click();

    // ── email-verification hook (only if the project requires it) ──────────
    // If verification is ON, the app shows "check your email" instead of
    // redirecting. In a headless CI run, receive it via the mail.tm REST API in
    // a helper (POST /accounts → poll GET /messages → extract the confirm link)
    // and `await page.goto(link)` — the address must then come from mail.tm, not
    // the placeholder above. (Interactively, the agent-inbox skill wraps the
    // same API.) With verification OFF, signup redirects straight to "/".
    // ───────────────────────────────────────────────────────────────────────

    // Landed in the app as the newly-created user (past the auth gate).
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.locator("text=Intake").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
