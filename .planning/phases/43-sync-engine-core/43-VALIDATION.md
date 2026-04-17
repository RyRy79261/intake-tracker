---
phase: 43
slug: sync-engine-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (unit) + Playwright (E2E) — both already installed |
| **Config file** | `vitest.config.ts` + `playwright.config.ts` (existing) |
| **Quick run command** | `pnpm vitest run src/__tests__/sync-*.test.ts` |
| **Full suite command** | `pnpm test && pnpm test:e2e` |
| **Estimated runtime** | ~5s (quick) · ~30s (unit suite) · ~60s (E2E against ephemeral Neon branch) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/__tests__/sync-*.test.ts` (~5s)
- **After every plan wave:** Run `pnpm test` (full Vitest ~30s) + `pnpm test:e2e e2e/sync-engine.spec.ts` (~60s)
- **Before `/gsd-verify-work`:** Full `pnpm test && pnpm test:e2e` must be green; schema-migration CI job green; verify-schema.ts green.
- **Max feedback latency:** 5 seconds (quick) / 90 seconds (full per-wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | Wave 0 infra | — | fake-indexeddb installed as dev-dep; dev-only `__syncEngine` hook guarded by `NODE_ENV !== 'production'` | infra | `pnpm ls fake-indexeddb` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | SYNC-01 | — | Write to Dexie completes without network calls | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "writes locally without network"` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | SYNC-01 | — | Write + enqueue is atomic (both roll back on throw) | unit | `pnpm vitest run src/__tests__/sync-queue.test.ts -t "atomic write and enqueue"` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | SYNC-02 | — | Coalesce-on-enqueue deduplicates upserts; delete supersedes | unit | `pnpm vitest run src/__tests__/sync-queue.test.ts -t "coalesce"` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | SYNC-02 | — | Topo order respects FK graph (prescriptions→phases→schedules→doseLogs; intake→substance) | unit (introspects schema.ts) | `pnpm vitest run src/__tests__/sync-topology.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | SYNC-02 | — | Backoff sequence is 2→4→8→16→32→60s with ±20% jitter | unit | `pnpm vitest run src/__tests__/sync-backoff.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 03 | 1 | Dexie v16 | — | v15→v16 migration preserves all existing data; adds `_syncQueue` + `_syncMeta` | unit (fake-indexeddb) | `pnpm vitest run src/__tests__/migration/dexie-v16.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-01 | Record-level LWW by `updatedAt` | unit (push route handler) | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "LWW"` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-02 | Server wins exact tie | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "server wins tie"` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-03 | `deletedAt != null` wins any tie (no resurrection from stale edit) | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "deletedAt wins"` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-04 | Push clamps future `updatedAt` to `min(client.updatedAt, serverNow + 60s)` | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "clamp future"` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-05 | Push route `.omit({userId: true})` on drizzle-zod insert schema; server derives userId from session | unit (security) | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "rejects client-forged userId"` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | SYNC-04 | T-sync-06 | Push body cap: ops array `max(500)` (DoS mitigation) | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "rejects oversized batch"` | ❌ W0 | ⬜ pending |
| TBD | 05 | 2 | SYNC-03 | — | Pull on startup advances cursor correctly | unit (MSW) | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "pull startup"` | ❌ W0 | ⬜ pending |
| TBD | 05 | 2 | SYNC-03 | T-sync-07 | Cursor clamps to `serverTime - 30s` skewMargin (race-safety) | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "cursor skew margin"` | ❌ W0 | ⬜ pending |
| TBD | 05 | 2 | SYNC-03 | T-sync-05 | Pull route scopes every query by `eq(table.userId, auth.userId!)` | unit (security) | `pnpm vitest run src/__tests__/sync-pull-route.test.ts -t "user_id scoped"` | ❌ W0 | ⬜ pending |
| TBD | 06 | 3 | SYNC-02 | — | Debounced push fires ~2–5s after last write when online | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "debounced push"` | ❌ W0 | ⬜ pending |
| TBD | 06 | 3 | SYNC-05 | — | `online` event triggers push | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "online triggers push"` | ❌ W0 | ⬜ pending |
| TBD | 06 | 3 | SYNC-05 | — | `visibilitychange → visible` triggers push | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "visibility triggers push"` | ❌ W0 | ⬜ pending |
| TBD | 06 | 3 | SYNC-04 | — | Server-authoritative ack overwrites local `updatedAt` | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "ack overwrites"` | ❌ W0 | ⬜ pending |
| TBD | 07 | 4 | SYNC-01,02,03 | — | Pilot `intake-service.ts` writes go via `writeWithSync()` helper; reads filter `deletedAt === null` | regression | `pnpm vitest run src/__tests__/intake-service.test.ts` + grep audit | ❌ W0 | ⬜ pending |
| TBD | 07 | 4 | schema-parity | — | Existing schema-parity test still passes after v16 changes | existing | `pnpm vitest run src/__tests__/schema-parity.test.ts` | ✅ exists (P42) |
| TBD | 07 | 4 | bundle-security | T-sync-08 | `window.__syncEngine` and `/api/__test__/*` do NOT appear in production bundle | unit (security) | `pnpm vitest run src/__tests__/bundle-security.test.ts -t "no dev-only sync hooks"` | ✅ exists (extend) |
| TBD | 08 | 5 | SYNC-02 | — | Full push cycle against real Neon branch | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "push"` | ❌ W0 |
| TBD | 08 | 5 | SYNC-03 | — | Pull against real Neon branch retrieves server-written rows | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "pull"` | ❌ W0 |
| TBD | 08 | 5 | SYNC-05 | — | Offline→online round-trip flushes queued ops | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "offline reconnect"` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Task IDs will be resolved once PLAN.md files are generated by the planner.** The plan/wave numbers above are the planner's recommended groupings from RESEARCH.md §Planner Handoff.

---

## Wave 0 Requirements

- [ ] `src/__tests__/sync-queue.test.ts` — stubs for SYNC-01 (atomicity) + SYNC-02 (coalesce, delete-supersedes)
- [ ] `src/__tests__/sync-topology.test.ts` — stubs for SYNC-02 (FK invariants against src/db/schema.ts)
- [ ] `src/__tests__/sync-backoff.test.ts` — stubs for SYNC-02 (backoff math + jitter bounds)
- [ ] `src/__tests__/sync-engine.test.ts` — stubs for SYNC-01, SYNC-02, SYNC-03, SYNC-05 (loop wiring via MSW)
- [ ] `src/__tests__/sync-push-route.test.ts` — stubs for SYNC-04 (LWW, tie rules, clamp, security)
- [ ] `src/__tests__/sync-pull-route.test.ts` — stubs for SYNC-03 (cursor, user_id scope)
- [ ] `src/__tests__/migration/dexie-v16.test.ts` — stubs for v16 migration data preservation
- [ ] `e2e/sync-engine.spec.ts` — stubs for SYNC-02, SYNC-03, SYNC-05 E2E flows
- [ ] Install `fake-indexeddb` as dev dep (for Dexie unit tests outside browser)
- [ ] Add dev-only `window.__syncEngine` test hook in dev/test builds (guarded by `NODE_ENV !== 'production'`)
- [ ] Add test-only helper route `/api/__test__/count-intake?userId=...` guarded by `NODE_ENV !== 'production'` for E2E row-count assertions
- [ ] Extend `src/__tests__/bundle-security.test.ts` to assert dev-only sync hooks are absent from production bundle

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-world offline→online reconnect on user's phone | SYNC-05 | E2E covers synthetic offline via Playwright `context.setOffline()`; actual cellular/Wi-Fi transitions can behave differently on real devices | User toggles airplane mode, logs a water intake, toggles airplane mode off, inspects Neon branch via dev script for the record. Document in `43-HUMAN-UAT.md` at phase end. |
| Dev seed script end-to-end against real fixture | D-16/D-17 | Fixture is git-ignored and contains real user data; CI can't seed from it | User runs `pnpm seed:dev` with `DEV_SEED_JSON=.private-fixtures/intake-tracker-backup-2026-04-17.json`, verifies row counts in Dexie via DevTools match fixture. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (10 test files + dev-hook infra)
- [ ] No watch-mode flags (all commands use `vitest run`, not `vitest`)
- [ ] Feedback latency < 5s for quick / < 90s for full
- [ ] `nyquist_compliant: true` set in frontmatter after planner resolves TBD task IDs

**Approval:** pending
