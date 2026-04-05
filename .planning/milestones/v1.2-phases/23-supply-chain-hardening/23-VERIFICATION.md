---
phase: 23-supply-chain-hardening
verified: 2026-03-28T15:45:00Z
status: passed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "pnpm audit exits 0 — 6 --ignore flags added to CI audit step, exactly mirroring auditConfig.ignoreCves in pnpm-workspace.yaml"
    - "CI supply-chain audit step passes on clean PRs — gate now exits 0 on current codebase, will exit 1 only on NEW high/critical vulnerabilities"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 23: Supply Chain Hardening — Verification Report

**Phase Goal:** pnpm security configuration and vulnerability audit in CI
**Verified:** 2026-03-28T15:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure via Plan 23-03

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | pnpm refuses to install packages published less than 24h ago | VERIFIED | `minimumReleaseAge: 1440` at pnpm-workspace.yaml:5 |
| 2 | pnpm detects publisher trust downgrades on future installs | VERIFIED | `trustPolicy: no-downgrade` at pnpm-workspace.yaml:6; trustPolicyExclude for 5 packages at lines 7-12 |
| 3 | pnpm blocks transitive dependencies using git URLs or tarballs | VERIFIED | `blockExoticSubdeps: true` at pnpm-workspace.yaml:13 |
| 4 | pnpm audit reports zero high/critical vulns with documented ignore list | VERIFIED | `pnpm audit --audit-level high --ignore [6 GHSAs]` exits 0 (EXIT_CODE: 0 confirmed); 6 ignored GHSAs all have inline rationale comments in pnpm-workspace.yaml |
| 5 | CI runs pnpm audit on every PR and fails only on NEW high/critical vulns | VERIFIED | ci.yml lines 133-143: multi-line audit step with 6 --ignore flags; comments explain pnpm 10.30 ignoreCves bug; gate exits 0 on current codebase |
| 6 | CI verifies supply chain security settings are present in pnpm-workspace.yaml | VERIFIED | config drift check at ci.yml:119-132 greps for minimumReleaseAge, trustPolicy, blockExoticSubdeps — unmodified |
| 7 | supply-chain job failure blocks PR merge via ci-pass gate | VERIFIED | ci-pass needs array includes supply-chain (ci.yml:147); explicit `needs.supply-chain.result != success` check at line 159 |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml` | minimumReleaseAge: 1440 | VERIFIED | Line 5 confirmed |
| `pnpm-workspace.yaml` | trustPolicy: no-downgrade | VERIFIED | Line 6 confirmed |
| `pnpm-workspace.yaml` | blockExoticSubdeps: true | VERIFIED | Line 13 confirmed |
| `pnpm-workspace.yaml` | auditLevel: high | VERIFIED | Line 14 confirmed |
| `pnpm-workspace.yaml` | auditConfig.ignoreCves with 6 GHSAs + rationale comments | VERIFIED | Lines 18-31: all 6 GHSAs present with inline comments; no FAKE/test placeholders |
| `.github/workflows/ci.yml` | supply-chain job with config drift check | VERIFIED | Lines 108-132 intact; drift check loop unmodified |
| `.github/workflows/ci.yml` | audit step with 6 --ignore flags matching ignoreCves | VERIFIED | Lines 133-143: 6 --ignore flags exactly mirror pnpm-workspace.yaml ignoreCves list |
| `.github/workflows/ci.yml` | ci-pass includes supply-chain | VERIFIED | Lines 147 and 159 confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| pnpm-workspace.yaml | pnpm install enforcement | minimumReleaseAge:1440 read on install | WIRED | Setting present at line 5 |
| pnpm-workspace.yaml | pnpm audit exit code | auditLevel:high setting | WIRED | `auditLevel: high` at line 14 |
| pnpm-workspace.yaml auditConfig.ignoreCves | ci.yml --ignore flags | manual sync (pnpm 10.30 bug workaround) | WIRED | All 6 GHSAs in ignoreCves have matching --ignore flags in ci.yml; exact 1:1 match confirmed |
| ci.yml supply-chain job | pnpm-workspace.yaml | grep for 3 required settings | WIRED | ci.yml:122-124 loop checks minimumReleaseAge, trustPolicy, blockExoticSubdeps |
| ci.yml supply-chain job | pnpm audit | pnpm audit --audit-level high + 6 --ignore | WIRED | Audit exits 0 locally with exact CI command; commits 8db53dc and 1c3fc84 confirm work |
| ci.yml ci-pass | supply-chain job | needs array + result check | WIRED | needs includes supply-chain (line 147); result check at line 159 |

### Data-Flow Trace (Level 4)

Not applicable. This phase produces configuration files and CI workflow definitions only.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| pnpm-workspace.yaml has all 4 security settings | grep minimumReleaseAge trustPolicy blockExoticSubdeps auditLevel | All 4 present | PASS |
| auditConfig.ignoreCves has exactly 6 GHSAs, no fakes | grep GHSA-, grep FAKE | 6 GHSAs, 0 fakes | PASS |
| CI --ignore flags exactly mirror ignoreCves | compare grep outputs | 6 flags = 6 entries, exact match | PASS |
| pnpm audit exits 0 with exact CI command | pnpm audit --audit-level high --ignore [6 GHSAs] | EXIT_CODE: 0 | PASS |
| Config drift check step unmodified | grep minimumReleaseAge ci.yml | Line 122 intact | PASS |
| ci-pass includes supply-chain | grep needs.supply-chain.result ci.yml | Line 159 present | PASS |
| @privy-io/react-auth version unchanged | pnpm why @privy-io/react-auth | 3.12.0 (unchanged) | PASS |
| Task commits exist in git history | git show 8db53dc 1c3fc84 | Both found with expected commit messages | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHN-01 | 23-01-PLAN.md | pnpm enforces 24h minimum package age via `minimumReleaseAge=1440` | SATISFIED | `minimumReleaseAge: 1440` at pnpm-workspace.yaml:5; marked [x] in REQUIREMENTS.md |
| SCHN-02 | 23-01-PLAN.md | pnpm `trustPolicy=no-downgrade` detects compromised publisher accounts | SATISFIED | `trustPolicy: no-downgrade` at pnpm-workspace.yaml:6; marked [x] in REQUIREMENTS.md |
| SCHN-03 | 23-01-PLAN.md | pnpm `blockExoticSubdeps=true` prevents git/tarball transitive dependencies | SATISFIED | `blockExoticSubdeps: true` at pnpm-workspace.yaml:13; marked [x] in REQUIREMENTS.md |
| SCHN-04 | 23-02-PLAN.md / 23-03-PLAN.md | `pnpm audit` runs in CI and fails on known vulnerabilities | SATISFIED | CI audit step exits 0 on clean current codebase; 6 unfixable/false-positive GHSAs documented in ignoreCves with rationale; will exit 1 on any NEW high/critical finding; marked [x] in REQUIREMENTS.md |

### Anti-Patterns Found

None. Previous blockers resolved:

- ci.yml line 134 (previous: `pnpm audit --audit-level high` with no --ignore) — now multi-line command with 6 documented --ignore flags
- pnpm-lock.yaml minimatch@10.1.1 / picomatch@4.0.3 (previous: override not honored) — accepted as override-resistant and documented in ignoreCves; incremental install cannot re-resolve without lockfile deletion that breaks @privy-io/react-auth; rationale recorded in pnpm-workspace.yaml comments and 23-03-SUMMARY.md

### Human Verification Required

None. All items verified programmatically.

### Re-verification Summary

Both gaps from the initial verification are closed:

**Gap 1 closed — unfixable GHSAs documented and ignored**

The overrides for minimatch and picomatch were confirmed non-applicable via incremental `pnpm install` (lockfile deletion is not safe due to @privy-io/react-auth version pinning documented in Plan 01). Instead, all 6 high-severity GHSAs are now listed in `pnpm-workspace.yaml` `auditConfig.ignoreCves` with inline rationale comments explaining whether each is a false-positive (Next.js RSC, app uses 14.x), unfixable-without-breaking-build (rollup via next-pwa), or override-resistant transitive (minimatch x3, picomatch). `pnpm audit --audit-level high` with the 6 --ignore flags exits 0.

**Gap 2 closed — CI audit step has matching --ignore flags**

The CI audit step at ci.yml lines 133-143 was updated to a multi-line command passing all 6 `--ignore GHSA-*` flags. The flags exactly mirror `auditConfig.ignoreCves` (confirmed 1:1 by direct grep comparison). An explanatory comment states why: pnpm 10.30 does not read `auditConfig.ignoreCves` from workspace config. The config drift check (lines 119-132) was not modified.

**Net result:** The supply-chain CI gate is functional. It exits 0 on the current codebase and will exit 1 if any new high or critical vulnerability is introduced that is not in the documented ignore list.

---

_Verified: 2026-03-28T15:45:00Z_
_Verifier: Claude (gsd-verifier)_
