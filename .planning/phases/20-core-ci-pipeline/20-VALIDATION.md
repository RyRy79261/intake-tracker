---
phase: 20
slug: core-ci-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test:tz` |
| **Estimated runtime** | ~2.2 seconds (quick), ~5 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test:tz && pnpm lint && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | CIPL-01 | unit | `pnpm exec tsc --noEmit` | ❌ W0 (57 TS errors to fix) | ⬜ pending |
| 20-01-02 | 01 | 0 | CIPL-01 | unit | `pnpm typecheck` | ❌ W0 (script to add) | ⬜ pending |
| 20-02-01 | 02 | 1 | CIPL-02 | unit | `pnpm exec vitest run src/__tests__/bundle-security.test.ts` | ✅ (needs Neon patterns) | ⬜ pending |
| 20-03-01 | 03 | 1 | CIPL-01 | integration | Push PR branch → verify all jobs appear | Manual | ⬜ pending |
| 20-03-02 | 03 | 1 | CIPL-03 | integration | Push PR branch → verify dual-TZ jobs | Manual | ⬜ pending |
| 20-04-01 | 04 | 2 | CIPL-01 | integration | Verify ci-pass gate job in Actions UI | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fix 57 TypeScript errors in test files so `tsc --noEmit` passes
- [ ] Add `"typecheck": "tsc --noEmit"` script to package.json
- [ ] Add Neon DB patterns (`postgres://`, `NEON_*`) to `bundle-security.test.ts`

*These must be completed before the CI workflow can pass.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI jobs run in parallel on PR open | CIPL-01 | Requires GitHub Actions runner | Open a test PR, verify lint/typecheck/test-tz-sa/test-tz-de/build appear as separate jobs |
| ci-pass gate blocks merge on failure | CIPL-01 | Requires branch protection config | Fail one job intentionally, verify PR cannot merge |
| Dual-TZ jobs both execute | CIPL-03 | Requires CI environment | Verify both test-tz-sa and test-tz-de jobs run and pass in Actions UI |
| Branch protection enforced | CIPL-01 | GitHub repo settings | After ci.yml is running, manually configure branch protection per CONTEXT.md D-10 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
