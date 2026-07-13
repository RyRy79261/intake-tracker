import { test as setup, request as apiRequest } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { neon } from "@neondatabase/serverless";
import { WELCOME_SEEN_KEY } from "../src/lib/constants";

/**
 * E2E auth setup — a Playwright **setup project** (replaces the old
 * globalSetup function, so auth failures show up in the HTML report + trace
 * instead of as an opaque throw).
 *
 * Managed Neon Auth validates every session with a live server-side lookup
 * (see auth-middleware.ts `validateBearerToken`), so a session can't be forged
 * — a real login by the persistent test account is the only sound approach.
 * This does that once and saves cookie storageState for all specs to reuse.
 *
 * Fast path: sign in via the API (`POST /api/auth/sign-in/email`) — no browser,
 * no hydration race. Fallback: if that yields no session cookie (Neon's cookie
 * is `__Secure-`-prefixed and a CSRF/callback hop may be needed over http), do
 * the previously-working browser login. The fallback IS the old flow, so this
 * can't regress even where the API path can't be exercised locally.
 *
 * With no NEON_AUTH_TEST_* creds (local offline runs), it writes an empty
 * session so specs run unauthenticated against the client-side (Dexie) app.
 */
const authFile = path.resolve(process.cwd(), "playwright/.auth/user.json");

async function seedUsersSync(userId: string | undefined): Promise<void> {
  // The ephemeral CI branch inherits an empty neon_auth.users_sync (Neon Auth
  // replicates into it only on the primary branch), so seed the id to satisfy
  // FK constraints on app tables. Orthogonal to how we logged in.
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !userId) return;
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO neon_auth.users_sync (id)
    VALUES (${userId})
    ON CONFLICT (id) DO NOTHING
  `;
}

setup("authenticate", async ({ page, baseURL }) => {
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const email = process.env.NEON_AUTH_TEST_EMAIL;
  const password = process.env.NEON_AUTH_TEST_PASSWORD;
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  // Pre-seen the first-run welcome dialog so its overlay never intercepts
  // clicks in specs. request.storageState() captures cookies only, so this
  // localStorage entry must be merged into the state explicitly.
  const welcomeOrigin = {
    origin,
    localStorage: [{ name: WELCOME_SEEN_KEY, value: "true" }],
  };

  if (!email || !password) {
    setup
      .info()
      .annotations.push({
        type: "auth",
        description:
          "NEON_AUTH_TEST_EMAIL/_PASSWORD unset — writing empty (unauthenticated) state",
      });
    fs.writeFileSync(
      authFile,
      JSON.stringify({ cookies: [], origins: [welcomeOrigin] }),
    );
    return;
  }

  // ── Fast path: API sign-in (no browser) ────────────────────────────────
  try {
    const api = await apiRequest.newContext({ baseURL });
    const res = await api.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    const state = await api.storageState();
    const hasSession =
      res.ok() && state.cookies.some((c) => /session/i.test(c.name));
    if (hasSession) {
      const session = await api
        .get("/api/auth/get-session")
        .then((r) => r.json())
        .catch(() => null);
      await api.dispose();
      state.origins = [
        ...(state.origins ?? []).filter((o) => o.origin !== origin),
        welcomeOrigin,
      ];
      fs.writeFileSync(authFile, JSON.stringify(state));
      await seedUsersSync(session?.user?.id);
      return;
    }
    await api.dispose();
  } catch {
    // fall through to the browser login
  }

  // ── Fallback: browser login (the previously-working flow) ──────────────
  await page.goto("/auth");
  // Dev-mode compiles + hydration finish after network quiets; clicking before
  // React attaches its handler triggers a native GET and no POST.
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  const signInResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/auth/sign-in/email") &&
      r.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  await signInResponse;
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 30_000,
  });
  await page.evaluate((key) => {
    localStorage.setItem(key, "true");
  }, WELCOME_SEEN_KEY);
  await page.context().storageState({ path: authFile });

  const session = await page.evaluate(() =>
    fetch("/api/auth/get-session", { credentials: "include" }).then((r) =>
      r.json(),
    ),
  );
  await seedUsersSync(session?.user?.id);
});
