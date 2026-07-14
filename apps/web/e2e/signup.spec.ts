import { test, expect } from "@playwright/test";
import {
  nylasConfigured,
  uniqueSignupAddress,
  waitForEmail,
  extractVerificationLink,
} from "./helpers/mailbox";

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
 *   - Email verification OFF (simplest) OR, if ON, the NYLAS_* vars below so the
 *     run can receive the verification email from a real .nylas.email inbox.
 *
 *   RUN_SIGNUP_E2E=1 pnpm --filter @intake/web exec playwright test signup
 *
 * Verification handling: the sign-up form always `router.replace("/")`s on a
 * successful signUp.email() — there is NO "check your email" screen. So:
 *   - verification OFF → the redirect to "/" sticks (a session was created).
 *   - verification ON  → no session yet, so the auth middleware bounces us off
 *     "/". That bounce is the signal to fetch the emailed link and visit it;
 *     Better Auth then verifies the address, creates the session, and redirects
 *     back to "/". (If you turn verification ON in production, the app UX also
 *     needs a real "check your email" screen — see docs.)
 *
 * NOTE: not yet green against a live backend (none available when authored).
 * Selectors come from src/app/auth/sign-up-form.tsx; verify on the first run.
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
    const stamp = Date.now();
    // When the Nylas inbox is configured, sign up with a real, deliverable
    // address (required if verification is ON — a synthetic address would
    // bounce). Otherwise fall back to a synthetic address, which only works
    // with verification OFF.
    const useMailbox = nylasConfigured();
    const email = useMailbox
      ? uniqueSignupAddress(String(stamp))
      : `e2e-signup-${stamp}@intake-tracker.test`;
    const password = `Test-${stamp}-Pw!`;
    const startedAt = Math.floor(Date.now() / 1000);

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

    // Verification OFF → we land on "/". Verification ON → the middleware bounces
    // us off "/" (no session yet), which is the cue to verify via email.
    const landed = await page
      .waitForURL((url) => url.pathname === "/", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!landed) {
      test.skip(
        !useMailbox,
        "Signup didn't establish a session (email verification is likely ON), " +
          "but NYLAS_* isn't configured to receive the link — see docs/e2e-live-user-testing.md",
      );
      const msg = await waitForEmail(email, {
        timeoutMs: 90_000,
        since: startedAt,
      });
      const link = extractVerificationLink(msg);
      expect(link, "verification link in the Neon Auth email").toBeTruthy();
      // Better Auth verifies the address, creates the session, and redirects to
      // the callbackURL ("/") baked into the signup call.
      await page.goto(link!);
    }

    // Landed in the app as the newly-created, now-verified user.
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.locator("text=Intake").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
