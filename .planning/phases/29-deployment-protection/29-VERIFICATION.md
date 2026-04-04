---
status: human_needed
phase: 29-deployment-protection
verified: 2026-04-04
---

# Phase 29: Deployment Protection — Verification

## Phase Goal
Production deployments are gated by CI checks and human approval, with promotion managed through dedicated workflows separate from ci.yml.

## Requirements Coverage

| REQ-ID | Description | Plan | Status |
|--------|-------------|------|--------|
| DEP-01 | Branch protection rules require CI to pass before merging to staging or main | 29-02 | ✓ Script configures `ci-pass` required status check on both branches |
| DEP-02 | GitHub environment protection rules gate production deployments with required reviewer approval | 29-01, 29-02 | ✓ Workflow references Production environment; script adds reviewer |
| DEP-03 | Deployment workflows are separate files from existing ci.yml | 29-01 | ✓ promote-to-production.yml exists as separate file |

## Must-Haves Verification

### Plan 29-01: Promotion Workflow
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | promote-to-production.yml exists as separate file from ci.yml | ✓ | `ls .github/workflows/promote-to-production.yml` — exists, different file from ci.yml |
| 2 | Workflow references Production GitHub Environment for approval gate | ✓ | `grep "environment: Production" .github/workflows/promote-to-production.yml` — match found |
| 3 | Neon production snapshot created before promotion proceeds | ✓ | `grep "snapshots" .github/workflows/promote-to-production.yml` — API call present |
| 4 | Snapshot failure does not block promotion | ✓ | `grep "continue-on-error: true" .github/workflows/promote-to-production.yml` — match found |
| 5 | Only staging-to-main PRs trigger the promotion job | ✓ | `grep "github.head_ref == 'staging'" .github/workflows/promote-to-production.yml` — match found |

### Plan 29-02: Branch Protection Setup Script
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Setup script configures branch protection on main with ci-pass + enforce_admins | ✓ | `grep "ci-pass" scripts/setup-branch-protection.sh` and `grep "enforce_admins" scripts/setup-branch-protection.sh` — both present |
| 2 | Setup script configures identical protection on staging (when branch exists) | ✓ | `grep "branches/staging" scripts/setup-branch-protection.sh` — staging section present with existence check |
| 3 | Setup script adds repo owner as required reviewer on Production environment | ✓ | `grep "environments/Production" scripts/setup-branch-protection.sh` — reviewer config present |
| 4 | Setup script gracefully handles missing staging branch | ✓ | Script checks `gh api .../branches/staging` and skips with warning if not found |
| 5 | Script includes built-in verification | ✓ | Script has verification section that checks all rules after applying |
| 6 | Script marked autonomous: false | ✓ | Plan frontmatter has `autonomous: false` |

## Success Criteria Verification

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | A PR to staging or main cannot be merged unless CI passes | ⚠ Human needed | Script creates the protection rules — user must run `bash scripts/setup-branch-protection.sh` |
| 2 | Production deployment via promotion workflow requires reviewer approval | ⚠ Human needed | Workflow uses `environment: Production` — user must run setup script to add reviewer |
| 3 | Deployment and promotion workflows exist as separate .yml files from ci.yml | ✓ Passed | promote-to-production.yml is a separate file; ci.yml unchanged |

## Automated Checks

All 396 tests pass. No regressions detected.

```
Test Files: 35 passed (35)
Tests: 396 passed (396)
```

## Human Verification Required

The following items require the user to run the setup script and verify protection rules are active:

1. **Run setup script**: `bash scripts/setup-branch-protection.sh` — configures branch protection on main (and staging once it exists), adds required reviewer on Production environment
2. **Verify branch protection active**: After running script, attempt a direct push to main — should be rejected
3. **Verify environment gate**: Create a test staging-to-main PR — workflow should pause at approval step
4. **Verify Neon secrets**: Ensure `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PROD_BRANCH_ID` are configured in repository secrets (done as part of Phase 28)

## Deviations

None. All plans executed as designed.

## Score

**Automated:** 8/8 must-haves verified
**Human needed:** 4 items require manual setup and verification (protection rules are repo settings, not code)
