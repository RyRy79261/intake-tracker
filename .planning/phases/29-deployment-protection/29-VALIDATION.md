---
phase: 29
slug: deployment-protection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | GitHub CLI (`gh api`) for API verification; bash for file checks |
| **Config file** | none — validation uses `gh` CLI and shell commands |
| **Quick run command** | `gh api repos/RyRy79261/intake-tracker/branches/main/protection --jq '.required_status_checks.contexts'` |
| **Full suite command** | `bash .planning/phases/29-deployment-protection/verify-protection.sh` (created in plan) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick `gh api` check for the relevant protection setting
- **After every plan wave:** Run full verification script
- **Before `/gsd-verify-work`:** All `gh api` checks must return expected values
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | DEP-03 | — | N/A | file | `test -f .github/workflows/promote-to-production.yml` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | DEP-02 | — | Env gate blocks unapproved deploys | grep | `grep -q "environment: Production" .github/workflows/promote-to-production.yml` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 1 | DEP-01 | — | Snapshot before promote | grep | `grep -q "snapshots" .github/workflows/promote-to-production.yml` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | DEP-01 | — | CI must pass to merge | api | `gh api .../branches/main/protection --jq '.required_status_checks.contexts'` | N/A | ⬜ pending |
| 29-02-02 | 02 | 1 | DEP-02 | — | Reviewer approval required | api | `gh api .../environments/Production --jq '.protection_rules'` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework installation needed — verification uses GitHub CLI API checks and file/grep checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Branch protection blocks direct push | DEP-01 | Requires attempting direct push to protected branch | Try `git push origin main` directly — should be rejected |
| Environment approval pauses workflow | DEP-02 | Requires triggering workflow and checking for approval prompt | Create staging→main PR, verify workflow pauses at approval step |
| Neon snapshot created before merge | DEP-01 | Requires actual PR merge to trigger workflow | Check Neon dashboard for snapshot after promotion workflow runs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
