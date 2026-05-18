import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { neon } from "@neondatabase/serverless";

/**
 * Phase 41 E2E auth setup.
 *
 * Signs in once via the /auth page using NEON_AUTH_TEST_EMAIL /
 * NEON_AUTH_TEST_PASSWORD, saves the authenticated storage state to
 * playwright/.auth/user.json. All specs load via
 * `use: { storageState: "playwright/.auth/user.json" }` and start already
 * signed in.
 *
 * If the env vars are unset (local dev without Neon Auth configured),
 * globalSetup logs a warning and writes an empty storage state — specs
 * then run unauthenticated and may fail. This is expected for local-only
 * runs without a Neon Auth test user.
 */
async function globalSetup(config: FullConfig) {
  const authDir = path.resolve(process.cwd(), "playwright/.auth");
  const authFile = path.join(authDir, "user.json");

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const email = process.env.NEON_AUTH_TEST_EMAIL;
  const password = process.env.NEON_AUTH_TEST_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[e2e-global-setup] NEON_AUTH_TEST_EMAIL / NEON_AUTH_TEST_PASSWORD not set; " +
        "writing empty storage state. Specs will run unauthenticated."
    );
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const baseURL =
    config.projects[0]?.use.baseURL ?? "http://localhost:3000";

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/auth`);
    // Dev-mode route compiles are slow and React hydrates after network quiets.
    // Clicking Sign In before the onSubmit handler attaches causes a native
    // GET form submission and no POST to /api/auth/sign-in/email — the wait
    // below would then hang until timeout. Block until hydration is done.
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);

    // Fail fast if the click didn't trigger React's handler (hydration race):
    // the Better Auth client POSTs to /api/auth/sign-in/email when it runs.
    const signInResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: /sign in/i }).click();
    await signInResponse;

    // Wait for Better Auth's callbackURL redirect to leave /auth
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/auth"),
      { timeout: 30_000 }
    );

    await context.storageState({ path: authFile });
    console.log("[e2e-global-setup] Authenticated state saved to", authFile);

    // Neon Auth replicates users to neon_auth.users_sync only on the primary
    // branch. Ephemeral CI branches may have an empty copy. Seed the
    // authenticated user's ID so FK constraints on app tables don't break.
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const session = await page.evaluate(() =>
        fetch("/api/auth/get-session", { credentials: "include" }).then((r) =>
          r.json(),
        ),
      );
      const userId = session?.user?.id;
      if (userId) {
        const sql = neon(dbUrl);
        await sql`
          INSERT INTO neon_auth.users_sync (id)
          VALUES (${userId})
          ON CONFLICT (id) DO NOTHING
        `;
        console.log(
          "[e2e-global-setup] Seeded neon_auth.users_sync with userId",
          userId,
        );
      } else {
        console.warn(
          "[e2e-global-setup] Could not extract userId from session — sync tests may fail",
        );
      }
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
