/**
 * Local-only bootstrap: create the Neon Auth test user on a fresh Neon Auth
 * instance by driving the app's own proxy handler.
 *
 * Neon Auth is a hosted service. `src/app/api/auth/[...path]/route.ts` is a
 * catch-all proxy that forwards everything under `/api/auth/...` to Neon via
 * the createNeonAuth handler. That means the ONLY correct target for a raw
 * sign-up POST is the running Next.js dev server on localhost — hitting
 * NEON_AUTH_URL directly bypasses the proxy and 404s because Neon's hosted
 * API doesn't expose `/api/auth/sign-up/email` under that path.
 *
 * Prerequisites:
 *   1. `pnpm dev` is already running on http://localhost:3000
 *   2. .env.local has NEON_AUTH_URL + NEON_AUTH_COOKIE_SECRET so the proxy
 *      can talk to Neon upstream
 *   3. ALLOWED_EMAILS includes NEON_AUTH_TEST_EMAIL (whitelist enforcement)
 *
 * Why this isn't in CI: Neon Auth is project-wide (one instance shared across
 * all Neon branches), so the test user is a one-time manual bootstrap, not a
 * per-run CI step. Once created, it persists across CI runs and branches.
 *
 * Usage:
 *   pnpm tsx scripts/seed-e2e-user.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const LOCAL_DEV_SERVER = "http://localhost:3000";

export async function main() {
  const email = process.env.NEON_AUTH_TEST_EMAIL;
  const password = process.env.NEON_AUTH_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing NEON_AUTH_TEST_EMAIL / NEON_AUTH_TEST_PASSWORD env vars"
    );
  }

  const url = `${LOCAL_DEV_SERVER}/api/auth/sign-up/email`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "E2E Test" }),
  });

  // 409 = already exists; treat as success for idempotency
  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `Seed failed: ${res.status} ${res.statusText} — ${body}`
    );
  }

  console.log(`[seed-e2e] User ${email} ready (status=${res.status})`);
}

// Allow direct execution via tsx
if (
  typeof require !== "undefined" &&
  require.main === module
) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
