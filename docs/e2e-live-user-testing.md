# Live user-flow testing

Why this exists: several bugs (a PRN button flashing for scheduled meds during
load; a failed dose-save looking successful) were the kind that **driving the
running app as a user** catches but isolated unit/dom tests miss. This documents
what we can drive today and how to turn on the real-signup coverage.

## What already works (offline, no setup)

The app is **offline-first** — the Next middleware only guards `/auth`/`/auth/*`
(see `src/middleware.ts`), so the dashboard, medications, food, history and
settings pages render and function via client-side Dexie **without auth**. The
existing Playwright e2e drives exactly this:

- `e2e/global-setup.ts` writes an empty session when `NEON_AUTH_TEST_EMAIL` /
  `_PASSWORD` are unset, and specs run unauthenticated.
- `e2e/medications.spec.ts` creates meds through the wizard and logs doses.

**New:** `medications.spec.ts` › _"should create an as-needed (PRN) medication
and log a dose via 'Log dose now'"_ drives the full PRN flow end-to-end
(wizard → as-needed toggle → save → Rx tab → "Log dose now" → time picker →
dose logged + success toast, asserting **no console errors**). This is the
regression that would have caught the PRN bugs. Run it locally:

```bash
cd apps/web
# empty creds → offline run; a local dev server is auto-started/reused
NEON_AUTH_TEST_EMAIL= NEON_AUTH_TEST_PASSWORD= DATABASE_URL= \
  pnpm exec playwright test -g "as-needed" --project=chromium
```

**Process change:** for any UI-touching change, drive the running app (this
Playwright pattern, or the `run`/`verify` skills) before opening the PR — not
just unit/dom tests.

## Real signup coverage (needs a little setup)

`e2e/signup.spec.ts` drives the actual **Neon Auth email/password signup** —
account creation + landing in the app, i.e. the "whole procedure as a new
user". It is **`test.skip`-ped until `RUN_SIGNUP_E2E=1`** so it never fails CI
unconfigured, and it has not yet had a green run (no Neon branch was available
when authored — verify selectors on the first live run).

### What I need from you (one-time)

1. **A Neon branch** for isolated test data → set `DATABASE_URL` to it. This is
   currently blocked by the **Neon branch-quota / 422** issue (the same one
   failing CI `e2e`/`schema-migration`) — clearing that quota in the Neon
   console unblocks both CI and this. Ideally the signup spec creates + tears
   down its own ephemeral branch (same `neondatabase/create-branch-action`
   pattern CI uses) once the quota has headroom.
2. **`NEON_AUTH_URL` + `NEON_AUTH_COOKIE_SECRET`** for the test env.
   (No whitelist step — `ALLOWED_EMAILS` is no longer used, so any address works.)
3. **Email verification** — the deciding factor for whether an inbox is needed:
   - **Verification OFF** (Neon Auth project setting): signup redirects straight
     to `/`. No email, no inbox — the spec works as-is with any generated
     address. Simplest; recommended for the test project.
   - **Verification ON**: the app shows a "check your email" screen, so the run
     must receive the message and click the link. Two ways to wire that:
     - **Self-contained (CI-friendly):** a Playwright test helper hits the
       **mail.tm REST API directly** (`POST /accounts` → `GET /messages` poll →
       extract link), all inside the node test process. This is what a headless
       CI run needs — see the hook in `signup.spec.ts`.
     - **Agent-in-the-loop (interactive):** the `agent-inbox` skill's MCP tools
       (`create_inbox` → `verify_email`) run in *my* context, not inside a
       headless test — so it fits a one-time "sign up as a real user" walkthrough
       I drive, not an unattended CI spec. It wraps the same mail.tm API.

### Run it

```bash
RUN_SIGNUP_E2E=1 \
DATABASE_URL="postgres://…neon-branch…" NEON_AUTH_URL="…" NEON_AUTH_COOKIE_SECRET="…" \
  pnpm --filter @intake/web exec playwright test signup --project=chromium
```

## Notes

- **Google social sign-in can't be automated** (consent/captcha) — the harness
  deliberately uses the email/password path, which exercises the same Neon Auth
  backend + whitelist + session.
- Google's flow can only be smoke-checked manually; email/password is the
  automatable proxy for "a real user signs up and gets in".
