---
phase: 20
slug: core-ci-pipeline
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
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
| 20-01-01 | 01 | 1 | CIPL-01 | unit | `pnpm typecheck` | ✅ package.json typecheck script | ✅ green |
| 20-01-02 | 01 | 1 | CIPL-01, CIPL-02 | unit | `pnpm typecheck && pnpm exec vitest run src/__tests__/bundle-security.test.ts` | ✅ bundle-security.test.ts has Neon patterns | ✅ green |
| 20-02-01 | 02 | 2 | CIPL-01, CIPL-02, CIPL-03 | unit (static) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ 13 tests | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

- [x] All tasks have `<automated>` verify or Manual-Only designation
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

**Gap resolved:** CI workflow structure validation test (`ci-workflow-structure.test.ts`) — 13 tests verifying CIPL-01, CIPL-02, CIPL-03 against ci.yml structure.
