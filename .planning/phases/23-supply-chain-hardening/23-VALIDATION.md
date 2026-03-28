---
phase: 23
slug: supply-chain-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x / pnpm CLI |
| **Config file** | `jest.config.ts` (existing) |
| **Quick run command** | `pnpm audit --audit-level high` |
| **Full suite command** | `pnpm audit --audit-level high && grep -q minimumReleaseAge pnpm-workspace.yaml` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm audit --audit-level high`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | SCHN-01 | config | `grep minimumReleaseAge pnpm-workspace.yaml` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | SCHN-02 | config | `grep trustPolicy pnpm-workspace.yaml` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | SCHN-03 | config | `grep blockExoticSubdeps pnpm-workspace.yaml` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | SCHN-04 | CI | `grep 'pnpm audit' .github/workflows/ci.yml` | ❌ W0 | ⬜ pending |
| 23-02-02 | 02 | 1 | D-06 | CI | `grep 'supply-chain' .github/workflows/ci.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework or stubs needed — validation is via pnpm CLI and grep commands against config files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| pnpm blocks install of package published <24h ago | SCHN-01 | Requires publishing a test package | Verify by checking `pnpm install` error on fresh package |
| trustPolicy blocks publisher downgrade | SCHN-02 | Requires simulating account compromise | Verify via pnpm docs confirmation of behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
