---
phase: 41-neon-auth-privy-removal
plan: 03
subsystem: push-notifications
tags: [neon-auth, push, truncate, bearer-removal, cookie-auth]

requires:
  - phase: 41-neon-auth-privy-removal
    plan: 01
    provides: "Server-side withAuth() reads cookie sessions, not Bearer tokens"
provides:
  - "scripts/truncate-push-tables.ts — operator-run atomic TRUNCATE of the three push tables"
  - "pnpm db:truncate-push script entry"
  - "subscribeToPush() / unsubscribeFromPush() with zero auth parameters"
  - "usePushScheduleSync() with zero auth parameters"
  - "src/__tests__/push-client-signature.test.ts — contract test pinning the zero-auth shape"
affects: [41-04, 41-05]

tech-stack:
  added:
    - "tsx (devDependency) — runtime for scripts/truncate-push-tables.ts"
  patterns:
    - "Push client uses same-origin cookie session for auth — no Authorization header ever attached"
    - "One-shot ops scripts live under scripts/ with explicit pnpm entry and header comment documenting intent"

key-files:
  created:
    - scripts/truncate-push-tables.ts
    - src/__tests__/push-client-signature.test.ts
  modified:
    - src/lib/push-notification-service.ts
    - src/hooks/use-push-schedule-sync.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Fold the TDD RED and GREEN commits into one atomic Task-2 commit. The project pre-commit hook runs the entire vitest suite, so a deliberately-failing RED commit cannot land without `--no-verify`. Per user instruction, we never use --no-verify, so the test + implementation are committed together and the TDD sequence is captured in the commit message instead of separate SHAs."
  - "Test runtime is vitest 'node' environment. usePushScheduleSync is a React hook and cannot be rendered without jsdom + @testing-library/react. Instead the signature test checks `usePushScheduleSync.length === 0` (compile-time proof of the zero-arg signature) AND greps the hook source for residual auth plumbing (`['\"]Authorization['\"]`, `\\bauthToken\\b`, `Bearer \\$\\{`). Combined with the pre-existing build, this closes the loop without adding new test infra."
  - "Install tsx as a devDependency. The plan allowed either `tsx` or `node --import tsx/esm`. tsx is the cleaner solution, adds a single well-maintained dep, and lets us wire `pnpm db:truncate-push` with a trivial script entry. No existing script runtime (ts-node, etc.) was installed."
  - "The truncation script uses `sql.transaction([...])` for atomicity with a sequential fallback for drivers that do not support it. Single-user / single-device means the fallback path is safe even though not strictly atomic — no concurrent writers can wedge halfway between TRUNCATE calls."
  - "DID NOT touch src/lib/push-db.ts. Per D-12, user_id column stays `text` (Neon Auth IDs are strings). Drizzle schema rewrite lands in phase 42."
  - "DID NOT touch any server-side /api/push/*/route.ts. They already use withAuth() which plan 41-01 rewrote to read cookie sessions — zero server-side changes required."

patterns-established:
  - "Zero-auth push client — any new /api/push/* caller should rely on same-origin cookies, never a Bearer header"
  - "Contract test via source grep + function.length for signatures that cannot be rendered in node"

requirements-completed:
  - PUSH-02

duration: 18 min
completed: 2026-04-12
---

# Phase 41 Plan 03: Push Truncation + Bearer Removal Summary

Atomic TRUNCATE script for push_subscriptions / push_schedules / push_sent_log plus
complete removal of Bearer-token plumbing from every client push helper
(subscribeToPush, unsubscribeFromPush, usePushScheduleSync). Push calls now ride the
Neon Auth cookie session directly — no Authorization header anywhere in the client.

## Outcome

- **Duration:** ~18 minutes
- **Start:** 2026-04-12 11:21 UTC
- **End:** 2026-04-12 11:26 UTC
- **Tasks:** 2
- **Files created:** 2 (truncate script + contract test)
- **Files modified:** 4 (push service, schedule hook, package.json, pnpm-lock.yaml)
- **Commits:** 2 atomic

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `685d4d9` | feat(41-03): add atomic push table truncation script |
| 2 | `754e7f5` | feat(41-03): drop authToken plumbing from push client |

## Files

### Created
- `scripts/truncate-push-tables.ts` — one-shot TRUNCATE script wrapped in `sql.transaction([...])` with a sequential fallback; includes header comment documenting intent and usage.
- `src/__tests__/push-client-signature.test.ts` — 7 tests: zero-arg signatures for the three helpers, no Authorization header on subscribe/unsubscribe fetches, and source-grep contracts for both client files.

### Modified
- `src/lib/push-notification-service.ts`:
  - `subscribeToPush()` — dropped `authToken` param, removed `Authorization: Bearer ${...}` header from the `/api/push/subscribe` fetch.
  - `unsubscribeFromPush()` — same treatment for `/api/push/unsubscribe`.
- `src/hooks/use-push-schedule-sync.ts`:
  - `usePushScheduleSync()` — dropped the `getAuthToken?` param and the `getAuthTokenRef` machinery; `syncSchedule` now posts with only `Content-Type`.
  - `useDoseReminderToggle` — no longer passes `""` placeholders to subscribe/unsubscribe.
- `package.json` / `pnpm-lock.yaml` — added `tsx` devDependency and `db:truncate-push` script entry.

## Verification Results

- ✅ `pnpm exec vitest run src/__tests__/push-client-signature.test.ts` — 7/7 passing
- ✅ Full pre-commit test suite — 451/451 passing (both Task 1 and Task 2)
- ✅ `grep -n "authToken" src/lib/push-notification-service.ts src/hooks/use-push-schedule-sync.ts` — zero hits
- ✅ `grep -rn "subscribeToPush(\"\")" src/` — zero hits
- ✅ `grep -rn "usePushScheduleSync(" src/` — only the callers at use-medication-notifications.ts line 17 (zero args) and the hook definition itself
- ⚠️ `pnpm typecheck` still red on 6 consumer sites (`getAuthHeader` from `useAuth`). This is the expected carryover from plan 41-02 — plan 41-04 is the explicit sweep that rewrites those call sites.

## Deviations from Plan

**[Rule 2 - Missing Critical] Pre-commit hook blocks TDD RED commit**

- Found during: Task 2 (RED commit)
- Issue: The project pre-commit hook runs the full vitest suite. A deliberately-failing RED test cannot land on its own without `--no-verify`, which the user explicitly forbids.
- Fix: Fold RED and GREEN into one atomic commit (`754e7f5`). The TDD sequence is preserved in the commit message body instead of separate SHAs. The contract test is still the specification of record — it would have failed against the pre-modification code, verified manually before the implementation edits landed.
- Files modified: none beyond the planned scope
- Verification: `pnpm exec vitest run src/__tests__/push-client-signature.test.ts` confirms 7/7 after the combined commit.
- Commit hash: 754e7f5

**[Rule 3 - Blocking] Hook test cannot use renderHook**

- Found during: Task 2 (writing the test)
- Issue: vitest is configured with `environment: "node"` and the project does not ship `@testing-library/react`. Plan text suggested using `renderHook`, but adding a new test framework is Rule 4 territory and out of scope.
- Fix: Proof the signature via `usePushScheduleSync.length === 0` (runtime reflection of the compiled function arity) and assert the source file itself contains no auth plumbing via regex grep. The grep contracts use precise patterns (`['\"]Authorization['\"]`, `\\bauthToken\\b`, `Bearer \\$\\{`, `\\bgetAuthToken\\b`) so doc-comment prose like "no Bearer token plumbing" does not false-positive.
- Files modified: src/__tests__/push-client-signature.test.ts only
- Verification: tests pass, `grep -n "authToken" src/hooks/use-push-schedule-sync.ts` returns zero hits.
- Commit hash: 754e7f5

**Total deviations:** 2 auto-fixed (1 × Rule 2, 1 × Rule 3). **Impact:** None on the shipped behavior — the zero-auth push client is exactly what the plan asked for.

## Issues Encountered

None.

## Authentication Gates

None.

## Next Phase Readiness

Ready for **41-04** (full Privy + PIN gate sweep). That plan will:
- Delete `src/hooks/use-pin-gate.tsx` and all PIN-related artifacts
- Strip `getAuthHeader` / `Authorization: Bearer` usage from the 6 consumer files currently failing `pnpm typecheck`
- Remove `@privy-io/*` dependencies
- Unblock `pnpm build` (currently RED from plan 41-02's deliberate break)

No blockers for 41-04. The push client surface is now completely cookie-native.
