---
phase: 25
slug: ci-integration-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 + TypeScript 5.9.3 |
| **Config file** | `vitest.config.ts` (unit tests), `tsconfig.json` (type checking) |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm typecheck && pnpm bench --run --compare benchmarks/results.json` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm typecheck && pnpm bench --run --compare benchmarks/results.json`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | CIPL-01 | smoke | `pnpm typecheck` | N/A (uses tsc) | ⬜ pending |
| 25-01-02 | 01 | 1 | BNCH-01 | smoke | `pnpm bench --run --compare benchmarks/results.json` | N/A (uses vitest bench) | ⬜ pending |
| 25-01-03 | 01 | 1 | SCHN-04 | manual-only | Visual inspection of ci.yml grep loop | N/A (CI config) | ⬜ pending |
| 25-01-04 | 01 | 1 | CIPL-03 | smoke | `pnpm typecheck` | N/A (existing tests) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drift check covers all 4 settings | SCHN-04 | CI config not testable locally | Inspect ci.yml `for setting in` loop contains: minimumReleaseAge, trustPolicy, blockExoticSubdeps, auditLevel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
