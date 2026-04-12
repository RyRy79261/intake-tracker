/**
 * Phase 41 — seeds the Neon Auth test user for E2E.
 *
 * Run during CI just after creating the Neon branch and after the
 * Playwright webServer is running, before launching the E2E suite.
 * Calls /api/auth/sign-up/email to create the user if they do not yet
 * exist on the branch. A 409 (already exists) is treated as success so
 * the script is idempotent for local development.
 *
 * Required env vars:
 *   NEON_AUTH_BASE_URL    — where the auth handler lives (default: http://localhost:3000)
 *   NEON_AUTH_TEST_EMAIL  — credential to seed
 *   NEON_AUTH_TEST_PASSWORD — credential to seed
 *
 * Recommended:
 *   ALLOWED_EMAILS — must include NEON_AUTH_TEST_EMAIL so the whitelist
 *                    check in withAuth() lets the seeded user through.
 *
 * Usage:
 *   pnpm tsx scripts/seed-e2e-user.ts
 */
export async function main() {
  const baseUrl =
    process.env.NEON_AUTH_BASE_URL ?? "http://localhost:3000";
  const email = process.env.NEON_AUTH_TEST_EMAIL;
  const password = process.env.NEON_AUTH_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing NEON_AUTH_TEST_EMAIL / NEON_AUTH_TEST_PASSWORD env vars"
    );
  }

  const url = `${baseUrl}/api/auth/sign-up/email`;
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
