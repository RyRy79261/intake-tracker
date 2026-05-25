import { test, expect, type Page } from "@playwright/test";

/**
 * Auth lifecycle E2E. The app's auth surface:
 *   - /auth                  — sign-in form (Better Auth via Neon Auth)
 *   - /auth/sign-up          — sign-up form
 *   - /auth/forgot-password  — password reset request
 *   - /auth/reset-password   — reset-password landing
 *   - withAuth() server middleware gates /api/* per request
 *   - useAuthGate() client hook gates AI features in the UI but does NOT
 *     redirect the dashboard; the page renders in a degraded mode when
 *     unauthenticated.
 *
 * Specs that need to start unauthenticated override the project-level
 * storageState (set in playwright.config.ts) by using `test.use(UNAUTHED)`
 * inside a describe block. WELCOME_SEEN_KEY is pre-seeded so the first-
 * run welcome dialog never intercepts clicks.
 */

const WELCOME_SEEN_KEY = "intake-tracker-welcome-seen";

const UNAUTHED = {
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [{ name: WELCOME_SEEN_KEY, value: "true" }],
      },
    ],
  },
};

async function gotoStable(page: Page, url: string) {
  await page.goto(url);
  // Better Auth's client hydrates after the initial paint. Waiting for
  // networkidle prevents the "click before onSubmit attaches" hydration
  // race that bit globalSetup.ts before its waitForLoadState was added.
  await page.waitForLoadState("networkidle");
}

test.describe("Auth lifecycle — unauthenticated", () => {
  test.use(UNAUTHED);

  test("sign-in page renders the form", async ({ page }) => {
    await gotoStable(page, "/auth");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("client-side validation blocks empty submission", async ({ page }) => {
    // Native HTML required-field validation catches an empty submit before
    // the Better Auth client runs. We assert the form did not navigate
    // away — proving the submission was rejected client-side. The browser
    // also surfaces a built-in tooltip we don't need to inspect.
    await gotoStable(page, "/auth");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("invalid credentials display an inline error", async ({ page }) => {
    // Mock the Better Auth sign-in endpoint to return an error. The form
    // surfaces `result.error.message` in a <p role="alert">.
    await page.route("**/api/auth/sign-in/email", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Invalid email or password" },
        }),
      });
    });

    await gotoStable(page, "/auth");
    await page.getByLabel(/email/i).fill("ghost@example.com");
    await page.getByLabel(/password/i).fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page.getByRole("alert")).toContainText(/invalid email or password/i);
    // Still on /auth — no redirect occurred.
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("forgot-password link navigates to /auth/forgot-password", async ({ page }) => {
    await gotoStable(page, "/auth");
    await page.getByRole("link", { name: /forgot.*password/i }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password$/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("sign-up link navigates to /auth/sign-up", async ({ page }) => {
    await gotoStable(page, "/auth");
    await page.getByRole("link", { name: /^sign up$/i }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up$/);
    // Sign-up form requires confirm-password.
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
  });

  test("sign-up page renders all required fields", async ({ page }) => {
    await gotoStable(page, "/auth/sign-up");
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    // There are two password inputs (password + confirm-password). Both must
    // be present; we don't care about the specific order here.
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(2);
  });

  test("forgot-password page renders the email field", async ({ page }) => {
    await gotoStable(page, "/auth/forgot-password");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe("Auth lifecycle — authenticated", () => {
  // Inherits the authenticated storageState from playwright.config.ts.

  test("sign out from settings redirects to /auth", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=Signed in via Neon Auth")).toBeVisible();
    await page.locator("button", { hasText: "Sign Out" }).click();
    // handleSignOut() uses window.location.href = "/auth" — wait for nav.
    await page.waitForURL(/\/auth(\?|$)/, { timeout: 10_000 });
    // Sign-in form is rendered after the redirect.
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("clearing session cookies degrades settings to unauthenticated UI", async ({
    page,
    context,
  }) => {
    // Verify we're signed in first.
    await page.goto("/settings");
    await expect(page.locator("text=Signed in via Neon Auth")).toBeVisible();

    // Clear the Better Auth session cookie + any storage so the next
    // session check returns null. clearCookies wipes all cookies for the
    // origin; we don't need to be selective.
    await context.clearCookies();

    // Reload — the useSession hook should now report no user, and the
    // account section's unauthenticated branch should surface "Not signed
    // in" + a Sign In CTA instead of the email + Sign Out controls.
    await page.reload();
    await expect(page.locator("text=Signed in via Neon Auth")).toBeHidden();
    await expect(page.locator("text=Not signed in")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
