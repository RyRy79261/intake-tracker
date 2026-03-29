---
phase: 23
slug: supply-chain-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run src/__tests__/supply-chain-config.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~600ms (config validation) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run src/__tests__/supply-chain-config.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | SCHN-01 | unit (static) | `pnpm exec vitest run src/__tests__/supply-chain-config.test.ts` | ✅ minimumReleaseAge test | ✅ green |
| 23-01-02 | 01 | 1 | SCHN-02 | unit (static) | `pnpm exec vitest run src/__tests__/supply-chain-config.test.ts` | ✅ trustPolicy test | ✅ green |
| 23-01-03 | 01 | 1 | SCHN-03 | unit (static) | `pnpm exec vitest run src/__tests__/supply-chain-config.test.ts` | ✅ blockExoticSubdeps test | ✅ green |
| 23-02-01 | 02 | 1 | SCHN-04 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ 8 tests (SCHN-04 block) | ✅ green |
| 23-03-01 | 03 | 1 | SCHN-04 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ audit --ignore flag test | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| pnpm blocks install of package published <24h ago | SCHN-01 | Requires publishing a test package | Verify by checking `pnpm install` error on fresh package |
| trustPolicy blocks publisher downgrade | SCHN-02 | Requires simulating account compromise | Verify via pnpm docs confirmation of behavior |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

**Gap 1 resolved:** Supply chain config validation (`supply-chain-config.test.ts`) — 6 tests verifying SCHN-01/02/03 settings in pnpm-workspace.yaml plus auditLevel, auditConfig with ignoreCves, and documented rationale for each ignored advisory.

**Gap 2 resolved:** Supply chain CI wiring (`ci-workflow-structure.test.ts`) — 8 tests verifying supply-chain job exists, checks config drift for required settings, runs pnpm audit with --audit-level high, and is wired to ci-pass gate.
