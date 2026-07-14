# E2E Tests (Playwright)

Two run modes, depending on whether a spec needs a real login:

- **Offline (no DB, no auth, no Neon)** — the app is offline-first; the Next
  middleware only guards `/auth`, so the dashboard / medications / food pages
  render and work via client-side Dexie **without a session**. Specs that only
  drive the tracking UI run this way — e.g. `medications.spec.ts` (incl. the
  as-needed "Log dose now" flow). This is the fast path for most feature specs.
- **Authenticated** — the pre-existing specs that assume a signed-in session,
  plus `signup.spec.ts`, need a Neon Auth backend.

Auth is a Playwright **setup project** (`auth.setup.ts`, run before `chromium`):
it signs in **once** — API fast path (`POST /api/auth/sign-in/email` →
`storageState`), falling back to a browser login — and writes
`playwright/.auth/user.json`; the `chromium` project reuses that cookie state.
With no creds it writes an empty session, so the offline specs still run.
Managed Neon Auth validates every session server-side, so this real login is the
only sound approach — you can't forge a session.

## Dependencies

1. **Node 22 + pnpm** (repo toolchain) → `pnpm install`.
2. **The Chromium browser binary** — Playwright's npm package does NOT bundle it:
   ```bash
   pnpm --filter @intake/web exec playwright install chromium
   # add --with-deps on a fresh Linux box / CI to also install the system libs
   ```
3. **Authenticated / signup mode only:** a Neon Auth backend (see below).

The dev server is started automatically by Playwright (`pnpm run dev`, or a
running one on `:3000` is reused) — you don't start it yourself.

## Running

From `apps/web` (or prefix with `pnpm --filter @intake/web exec`).

### Offline — no setup needed
```bash
# Empty creds → the setup project writes an empty session; specs run offline.
NEON_AUTH_TEST_EMAIL= NEON_AUTH_TEST_PASSWORD= DATABASE_URL= \
  pnpm exec playwright test medications.spec.ts     # or: -g "as-needed"
```

### Authenticated — full suite
Put the Neon backend env in `.env.local` (playwright.config loads it via
`loadEnvConfig`):
```bash
DATABASE_URL=postgres://...          # your Neon branch (or dev branch)
NEON_AUTH_URL=<Neon console → Branch → Auth endpoint URL>
NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)
NEON_AUTH_TEST_EMAIL=e2e@example.com
NEON_AUTH_TEST_PASSWORD=correct-horse-battery-staple
```
Create the persistent test account **once** (idempotent; a `409` = already
exists = success):
```bash
pnpm dev                          # one terminal
pnpm exec tsx scripts/seed-e2e-user.ts   # another — POSTs the real signup
```
Then:
```bash
pnpm test:e2e                     # full suite (root: turbo run test:e2e)
pnpm exec playwright test --list  # list without running
pnpm exec playwright test e2e/dashboard.spec.ts   # single file
```

### Real signup flow (`signup.spec.ts`)
Skipped unless `RUN_SIGNUP_E2E=1` **and** a Neon backend is present. Covers
account creation → land-in-app. See `docs/e2e-live-user-testing.md` for the full
setup and the email-verification / mail.tm note.

## CI (GitHub Actions)

The `ci.yml` `e2e` job: `playwright install chromium --with-deps` → create an
ephemeral Neon **data** branch (`create-branch-action@v6`) → reset schema +
`pnpm db:migrate` → `pnpm test:e2e` against the production build → delete the
branch (`if: always()`). The auth *account* is static — the app authenticates
against the fixed `NEON_AUTH_URL` (decoupled from the per-run data branch), and
`auth.setup.ts` seeds `neon_auth.users_sync` on the fresh branch for FK safety.

**Invariant:** keep `NEON_AUTH_URL` static (don't switch `create-branch-action`
to `get_auth_url: true`), or the static account won't exist at the endpoint the
app logs into and every authed spec 401s.

### Required repository secrets
| Secret | Purpose |
| --- | --- |
| `NEON_API_KEY` | `create-branch-action` |
| `NEON_PROJECT_ID` | Neon project hosting the branches |
| `NEON_AUTH_URL` | static auth endpoint the app logs into |
| `NEON_AUTH_COOKIE_SECRET` | cookie signing secret (≥32 chars) |
| `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD` | the persistent test account |

## Notes
- `ALLOWED_EMAILS` is **no longer used** (the whitelist is retired).
- `playwright/.auth/user.json` is a **live session cookie** — git-ignored; never
  commit it (nor `test-results/` / `playwright-report/`).
- Deeper background on the live-user drive-through + signup harness:
  `docs/e2e-live-user-testing.md`.
