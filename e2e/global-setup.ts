import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

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
    await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for successful redirect away from /auth
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/auth"),
      { timeout: 30_000 }
    );

    await context.storageState({ path: authFile });
    console.log("[e2e-global-setup] Authenticated state saved to", authFile);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
