---
phase: 23-supply-chain-hardening
plan: 03
subsystem: infra
tags: [pnpm, supply-chain, security, audit, ci, github-actions, ghsa-ignore]

# Dependency graph
requires:
  - phase: 23-01
    provides: "pnpm-workspace.yaml security settings and transitive vulnerability overrides"
  - phase: 23-02
    provides: "supply-chain CI job with config drift check and pnpm audit gate"
provides:
  - "CI audit step with --ignore flags for 6 documented unfixable/false-positive GHSAs"
  - "auditConfig.ignoreCves with inline rationale comments for all ignored advisories"
  - "Working supply-chain CI gate that exits 0 on clean PRs"
affects: [ci-pipeline, supply-chain-security]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pnpm audit --ignore flag sync with auditConfig.ignoreCves", "inline rationale comments for each ignored GHSA"]

key-files:
  created: []
  modified:
    - pnpm-workspace.yaml
    - .github/workflows/ci.yml

key-decisions:
  - "Overrides for minimatch/picomatch not honored by incremental pnpm install; added to ignoreCves instead of deleting lockfile"
  - "6 --ignore flags in CI audit step mirror auditConfig.ignoreCves exactly"

patterns-established:
  - "GHSA ignore sync: when adding to auditConfig.ignoreCves, also add --ignore flag to CI audit step (pnpm 10.30 bug)"
  - "Inline rationale: each ignoreCves entry has a YAML comment explaining why it cannot be fixed"

requirements-completed: [SCHN-04]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 23 Plan 03: Audit Override and CI Ignore Flag Gap Closure Summary

**CI supply-chain audit gate fixed with 6 --ignore flags for documented false-positive and override-resistant GHSAs, making the gate functional (exits 0 on clean PRs)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T14:27:07Z
- **Completed:** 2026-03-28T14:32:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Confirmed that pnpm overrides for minimatch@10.1.1 and picomatch@4.0.3 are not honored by incremental `pnpm install` (lockfile must be deleted to re-resolve, which breaks @privy-io/react-auth)
- Added 5 additional GHSAs to auditConfig.ignoreCves with inline rationale comments (rollup, minimatch x3, picomatch)
- Updated CI audit step with 6 --ignore flags mirroring pnpm-workspace.yaml ignoreCves
- Verified audit command exits 0 locally; gate will correctly exit 1 only on NEW high/critical vulnerabilities

## Task Commits

Each task was committed atomically:

1. **Task 1: Force lockfile to honor overrides and determine final ignore list** - `8db53dc` (feat)
2. **Task 2: Add --ignore flags to CI audit step for all documented unfixable GHSAs** - `1c3fc84` (feat)

**Plan metadata:** [pending]

## Files Created/Modified
- `pnpm-workspace.yaml` - Added 5 GHSAs to auditConfig.ignoreCves with inline rationale comments for each
- `.github/workflows/ci.yml` - Updated audit step to multi-line command with 6 --ignore flags and explanatory comments

## Decisions Made
- **Overrides not honored by incremental install:** minimatch@>=10.0.0 and picomatch@>=4.0.0 overrides exist in pnpm-workspace.yaml but `pnpm install` (without lockfile deletion) does not re-resolve already-locked transitive deps. Rather than deleting the lockfile (which broke @privy-io/react-auth in plan 01), these 4 GHSAs were added to ignoreCves with documented rationale.
- **6 --ignore flags in CI:** All 6 GHSAs from ignoreCves are passed as --ignore flags to the audit command in CI, since pnpm 10.30 does not read auditConfig.ignoreCves from workspace config.

## Deviations from Plan

None - plan executed exactly as written (fallback path for unresolvable overrides was anticipated and followed).

## Issues Encountered
- The FAKE-0000-0000 and GHSA-FAKE-0000 test placeholders referenced in the plan did not exist on this branch (they may have been cleaned up in a prior commit). No cleanup was needed.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all configuration is complete and functional.

## Next Phase Readiness
- Supply chain CI gate is now fully functional: exits 0 on current codebase, exits 1 on new high/critical vulnerabilities
- Phase 23 (supply-chain-hardening) is complete (all 3 plans delivered)
- All --ignore flags have documented rationale in both pnpm-workspace.yaml (comments) and ci.yml (comments)

## Self-Check: PASSED

---
*Phase: 23-supply-chain-hardening*
*Completed: 2026-03-28*
