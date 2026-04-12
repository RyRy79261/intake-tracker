# E2E Tests (Playwright + Neon Auth)

Phase 41 rewired the E2E suite around a real Neon Auth test user.
Playwright's `globalSetup` signs in once via the `/auth` page, captures
the authenticated cookie session, and persists it to
`playwright/.auth/user.json`. Every spec inherits the session via
`use: { storageState: "playwright/.auth/user.json" }` and starts already
signed in — no per-test login flow.

## Local development

### One-time setup

1. Provision a Neon Postgres branch (or use your dev branch — you do
   not need a separate one for local runs).
2. Add to `.env.local`:

   ```bash
   DATABASE_URL=postgres://...               # your Neon branch
   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   BETTER_AUTH_URL=http://localhost:3000
   NEON_AUTH_URL=http://localhost:3000
   NEON_AUTH_TEST_EMAIL=e2e@example.com
   NEON_AUTH_TEST_PASSWORD=correct-horse-battery-staple
   ALLOWED_EMAILS=e2e@example.com,you@example.com
   ```

3. Seed the test user (idempotent — safe to re-run):

   ```bash
   pnpm dev                          # in one terminal
   pnpm tsx scripts/seed-e2e-user.ts # in another terminal
   ```

   The seed script POSTs to `/api/auth/sign-up/email`. A `409` (user
   already exists) is treated as success.

### Running tests

```bash
pnpm test:e2e                       # full suite
pnpm exec playwright test --list    # list tests without running
npx playwright test e2e/dashboard.spec.ts  # single file
```

If `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD` are unset,
`globalSetup` writes an empty `playwright/.auth/user.json` and logs a
warning. Specs will then run unauthenticated and most will fail when
they hit `/api/ai/*` endpoints — this is expected for "is the runner
working at all" smoke checks but does not exercise real flows.

## CI (GitHub Actions)

The `.github/workflows/ci.yml` `e2e` job creates an isolated Neon
branch per run, seeds the test user on it, runs the full Playwright
suite against the production build, and deletes the branch on cleanup.

```
create-branch -> seed-user -> playwright (build + test) -> delete-branch
```

`delete-branch` runs with `if: always()` so the branch is cleaned up
even on test failure. Trace artifacts are uploaded on failure for
post-mortem investigation.

### Required repository secrets

Add these via Settings -> Secrets and variables -> Actions:

| Secret                       | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `NEON_API_KEY`               | Used by `neondatabase/create-branch-action@v5`       |
| `NEON_PROJECT_ID`            | The Neon project that hosts the test branches       |
| `NEON_AUTH_TEST_EMAIL`       | Seeded as the E2E user email + doubles as ALLOWED_EMAILS |
| `NEON_AUTH_TEST_PASSWORD`    | Seeded as the E2E user password                     |
| `BETTER_AUTH_SECRET`         | Cookie signing secret (Neon Auth / Better Auth)     |
| `NEON_AUTH_COOKIE_SECRET`    | Same role as BETTER_AUTH_SECRET — kept for backwards naming |

If any of these secrets are missing, the e2e job fails fast with a
clear error from the action that needs them. The job is gated on
`needs.changes.outputs.src == 'true'`, so docs-only PRs skip it
entirely.

## Why per-run Neon branches

- **Data isolation:** every CI run gets a fresh database, so a flaky
  test cannot pollute the next run's state.
- **Cheap and fast:** Neon branches are copy-on-write and provision in
  ~1 second.
- **Deterministic seeding:** the seed script always starts from an
  empty users table, guaranteeing the same starting state.

## Troubleshooting

- **`Specs running unauthenticated`:** missing
  `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD`. Check `.env.local`
  for local runs or repo secrets for CI.
- **`Seed failed: 401`:** the auth handler is up but
  `BETTER_AUTH_SECRET` differs between the seeding step and the
  webServer that the specs hit. They must match — pass the secret
  from a single source.
- **`waitForURL timed out`:** the `/auth` page redirected somewhere
  unexpected after sign-in. Check the trace artifact uploaded on
  failure to see what URL the test browser landed on.
