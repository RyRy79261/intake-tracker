# Phase 41: Neon Auth + Privy Removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 41-Neon Auth + Privy Removal
**Areas discussed:** Auth UI & login flow, Session & route protection, Push identity migration, E2E test auth strategy

---

## Auth UI & Login Flow

### Login methods

| Option | Description | Selected |
|--------|-------------|----------|
| Email + password only | Simplest scope. Single-user app, no need for OAuth complexity. | |
| Email + password + Google OAuth | Keeps Google login parity with current Privy config. | ✓ |
| Email magic link | Passwordless email link flow. Lower friction but requires SMTP. | |

**User's choice:** Email + password + Google OAuth
**Notes:** Preserves current Privy method parity.

### Sign-in / sign-up presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Single page with tabs | /auth route with shadcn Tabs. Compact, mobile-first. | ✓ |
| Separate /sign-in and /sign-up pages | Two routes with cross-links. More conventional. | |
| Modal overlay over blurred app | Closer to current Privy modal feel but harder to deep-link. | |

**User's choice:** Single page with tabs

### Unauthenticated experience

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate at root — redirect to /auth | Middleware redirects unauthenticated. App shell never renders without session. | ✓ |
| Soft gate — show app shell with sign-in card | Current AuthGuard behavior. Familiar but mixes states. | |
| Per-route gate | Public landing/about pages, gated dashboard. | |

**User's choice:** Hard gate at root — redirect to /auth

### Sign-up restriction

| Option | Description | Selected |
|--------|-------------|----------|
| Restricted via ALLOWED_EMAILS whitelist | Keep current pattern, friendly "contact admin" error. | ✓ |
| Open sign-up | Anyone with the URL can register. | |
| Sign-up disabled entirely | Pre-create users in Neon Auth manually. | |

**User's choice:** Restricted via ALLOWED_EMAILS whitelist

---

## Session & Route Protection

### API route auth

| Option | Description | Selected |
|--------|-------------|----------|
| Cookie session via auth.getSession() in withAuth | Replace Bearer token logic. Cookie travels automatically same-origin. | ✓ |
| Bearer token in Authorization header | Keep current pattern; client fetches token, attaches header. | |

**User's choice:** Cookie session via auth.getSession() in withAuth

### Whitelist enforcement location

| Option | Description | Selected |
|--------|-------------|----------|
| Inside withAuth() after getSession() | Centralized in one wrapper. Minimal change. | ✓ |
| In Next.js middleware.ts at edge | Faster but duplicates check across pages and APIs. | |
| In sign-up handler only | Trust everything after sign-up. Higher risk. | |

**User's choice:** Inside withAuth() after getSession()

---

## Push Identity Migration

### Existing push subscription handling

| Option | Description | Selected |
|--------|-------------|----------|
| Wipe push_subscriptions table, re-subscribe on first login | Simplest, single-user app, one notification gap. | ✓ |
| Map old Privy IDs to new Neon Auth IDs | Preserves continuity but adds migration script and orphan risk. | |
| Drop push_subscriptions table entirely — redefine in Phase 42 | Lets Phase 42 own all schema concerns. | |

**User's choice:** Wipe push_subscriptions table, re-subscribe on first login

### Related push tables

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate alongside push_subscriptions | Wipe all 3 push tables atomically. | ✓ |
| Leave them, let stale rows expire | Old rows reference dead user IDs. | |

**User's choice:** Truncate alongside push_subscriptions

---

## E2E Test Auth Strategy

### Playwright auth approach

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded test user + storageState login fixture | Standard Playwright pattern. Sign in once, reuse storageState. | ✓ |
| Direct cookie injection from server-side session | Bypasses login UI but fragile to Neon Auth internals. | |
| Test-mode bypass env var | Fastest setup but adds an auth bypass to production code paths. | |

**User's choice:** Seeded test user + storageState login fixture

### Neon environment for E2E

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Neon test branch with fresh DB per CI run | Isolated, no cross-test pollution. Phase 36 already documents the pattern. | ✓ |
| Shared staging Neon branch | Faster setup but tests can collide. | |
| Local Postgres in CI container | Avoids Neon entirely for tests. | |

**User's choice:** Dedicated Neon test branch with fresh DB per CI run

---

## Claude's Discretion

- Exact auth form layout / validation messages
- Password strength rules (Neon Auth defaults)
- Forgot-password flow specifics
- Loading/error UI states during sign-in
- Specific Neon Auth env var names (per STACK.md)
- E2E test user seeding mechanism
- CSP allowlist domain for Neon Auth

## Deferred Ideas

- Cross-phase concern: Auth migration data safety (Phase 45 must explicitly guarantee)
- Forgot-password polish (use Neon Auth defaults in P41)
- Multi-device session management (single-device app)
- Account deletion UI (no requirement)
