---
phase: 31-rollback-documentation-fixes
plan: 01
subsystem: docs
tags: [rollback, neon, branch-protection, runbook, secrets]

# Dependency graph
requires:
  - phase: 29-deployment-protection
    provides: enforce_admins branch protection that necessitates PR-based revert
  - phase: 30-observability-rollback
    provides: ROLLBACK.md runbook to fix
provides:
  - PR-based git revert workflow in ROLLBACK.md compatible with branch protection
  - NEON_PROD_BRANCH_ID documented in staging-setup.md
  - Consistent snapshot SHA naming throughout ROLLBACK.md
  - Cross-reference between ROLLBACK.md and staging-setup.md for Neon secrets
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - docs/ROLLBACK.md
    - docs/staging-setup.md

key-decisions:
  - "PR-based revert workflow replaces direct push — consistent with enforce_admins"
  - "All snapshot SHAs standardized to {sha7} to match promote-to-production.yml"

patterns-established:
  - "Runbook commands must be compatible with branch protection rules"
  - "Cross-reference between docs when secrets are shared across workflows"

requirements-completed: [OBS-02]

# Metrics
duration: 3min
completed: 2026-04-05
---

# Phase 31-01: Fix Rollback Documentation and Document Missing Secrets

**PR-based git revert workflow replacing blocked direct-push path, SHA naming consistency, and NEON_PROD_BRANCH_ID documented for operator setup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Rewrote ROLLBACK.md git revert section to use PR-based workflow (branch, push, open PR, CI, merge) — compatible with enforce_admins branch protection
- Fixed snapshot SHA naming inconsistency (bare `{sha}` to `{sha7}`) and added merge commit clarification note
- Added cross-reference in ROLLBACK.md Neon API section pointing to staging-setup.md section 7 for secrets
- Documented NEON_PROD_BRANCH_ID as third required GitHub secret in staging-setup.md section 7

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3: Fix ROLLBACK.md (revert workflow, SHA naming, secrets cross-ref)** - `4cf065c` (docs)
2. **Task 4: Document NEON_PROD_BRANCH_ID in staging-setup.md** - `b80e624` (docs)

## Files Created/Modified
- `docs/ROLLBACK.md` - Rewrote git revert section for PR-based workflow, fixed SHA naming, added merge commit note, added Neon secrets cross-reference
- `docs/staging-setup.md` - Added NEON_PROD_BRANCH_ID as third GitHub secret in section 7

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OBS-02 gap from v1.3 milestone audit is now closed
- All documentation is consistent with Phase 29's branch protection and Phase 30's rollback workflow
- ROLLBACK.md git revert path is now compatible with enforce_admins

---
*Phase: 31-rollback-documentation-fixes*
*Completed: 2026-04-05*
