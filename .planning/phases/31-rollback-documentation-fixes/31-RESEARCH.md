# Phase 31: Rollback & Documentation Fixes — Research

**Researched:** 2026-04-05
**Confidence:** HIGH
**Phase Goal:** Fix rollback documentation that contradicts branch protection and document missing secrets for operator setup

## Executive Summary

Phase 31 is a documentation-only gap closure phase with no code changes. The scope is well-defined by the v1.3 milestone audit (OBS-02 unsatisfied). Three files need modification: `docs/ROLLBACK.md`, `docs/staging-setup.md`, and nothing else. The fixes are straightforward text edits with clear before/after states.

## Current State Analysis

### ROLLBACK.md Section 2 (Git Revert) — Lines 34-52

Current instructions direct-push to main:
```
git checkout main
git revert <bad-commit-sha>
git push origin main
```

This contradicts Phase 29's `enforce_admins: true` branch protection. Direct push to main will be rejected with HTTP 403. The entire section needs rewriting to use a PR-based workflow.

### ROLLBACK.md Section 3 (Neon Database Restore) — Lines 56-83

Two naming inconsistencies:
- Line 60: `pre-promote-{sha7}-{date}` (correct format matching workflow)
- Line 67 (Neon Dashboard step 4): `pre-promote-{sha}-{YYYYMMDD}` (inconsistent — uses `{sha}` not `{sha7}`)

The actual workflow (`promote-to-production.yml` line 26) uses:
```bash
SNAPSHOT_NAME="pre-promote-$(echo ${{ github.sha }} | cut -c1-7)-$(date +%Y%m%d)"
```

So `{sha7}` is correct. Line 67 must be fixed.

Additionally, `github.sha` in the workflow is the merge commit SHA (ephemeral), not the PR head SHA. This is tech debt (recorded in milestone audit) but operators need to know that snapshot SHAs won't match `git log --oneline`. A clarifying note is needed.

### ROLLBACK.md Neon API Section — Lines 72-83

The API commands reference three environment variables: `NEON_PROJECT_ID`, `NEON_PROD_BRANCH_ID`, and `NEON_API_KEY`. But there's no indication of where to find/set these. A cross-reference to `docs/staging-setup.md` section 7 is needed.

### staging-setup.md Section 7 — Lines 102-109

Currently documents only two secrets:
1. `NEON_PROJECT_ID`
2. `NEON_API_KEY`

Missing: `NEON_PROD_BRANCH_ID` — required by `promote-to-production.yml` line 31 (`secrets.NEON_PROD_BRANCH_ID`). Also referenced in `scripts/setup-branch-protection.sh` line 10 prerequisites. The setup guide is incomplete without it.

## Implementation Approach

### Fix 1: Rewrite ROLLBACK.md Git Revert Section

Replace lines 34-52 with PR-based workflow:
1. Identify the bad commit SHA
2. Create a revert branch: `git checkout -b revert/<sha7>`
3. Revert the commit on the branch: `git revert <bad-commit-sha>`
4. Push the branch: `git push -u origin revert/<sha7>`
5. Open a PR to main
6. CI runs on the PR (required — revert is still a code change)
7. Self-approve and merge

Add a note explaining when git revert is preferred over Vercel Instant Rollback:
- Vercel rollback = fastest recovery for any production issue (30 seconds)
- Git revert = permanently remove a bad commit from the codebase (2-3 minutes)

### Fix 2: Standardize Snapshot SHA Naming

Change line 67 from `{sha}` to `{sha7}` to match line 60 and the actual workflow.

Add a clarifying note that snapshot SHAs come from the merge commit (`github.sha`), not the PR head SHA, so operators should look for the merge commit SHA when identifying snapshots.

### Fix 3: Add Cross-Reference for Neon Secrets

Add a note in the Neon API section of ROLLBACK.md pointing to `docs/staging-setup.md` section 7 for where to set up the required secrets.

### Fix 4: Document NEON_PROD_BRANCH_ID in staging-setup.md

Add a third bullet to section 7 alongside the existing two secrets:
- `NEON_PROD_BRANCH_ID` — Your Neon production branch ID (found in Neon Console > Branches > main branch > Branch ID)

Keep the same format as the existing entries.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Docs drift from actual workflow | Low | Acceptance criteria verify exact strings match workflow file |
| Operator confusion during emergency | Low | PR-based revert is standard practice; copy-pasteable commands provided |
| Missing NEON_PROD_BRANCH_ID causes silent snapshot failure | Medium | Documenting it in staging-setup.md prevents this |

## Dependencies

- Phase 29 (branch protection rules) — completed, defines the constraint
- Phase 30 (ROLLBACK.md creation) — completed, provides the file to fix
- `promote-to-production.yml` — read-only reference, not modified

## Validation Architecture

### Verification Strategy

All fixes are documentation changes verifiable via grep:

1. **ROLLBACK.md git revert section** — Must NOT contain `git push origin main`; MUST contain `git checkout -b revert/` and `git push -u origin revert/`
2. **ROLLBACK.md snapshot naming** — All occurrences must use `{sha7}` consistently (no bare `{sha}`)
3. **ROLLBACK.md Neon API section** — Must contain cross-reference to staging-setup.md
4. **staging-setup.md section 7** — Must list three secrets including `NEON_PROD_BRANCH_ID`

### Test Commands

```bash
# Verify git revert section uses PR-based workflow
grep -c "git push origin main" docs/ROLLBACK.md  # Should be 0
grep -c "revert/" docs/ROLLBACK.md  # Should be >= 2

# Verify SHA naming consistency
grep "{sha}" docs/ROLLBACK.md | grep -v "{sha7}"  # Should return nothing

# Verify cross-reference exists
grep -c "staging-setup.md" docs/ROLLBACK.md  # Should be >= 1

# Verify NEON_PROD_BRANCH_ID documented
grep -c "NEON_PROD_BRANCH_ID" docs/staging-setup.md  # Should be >= 1
```

## RESEARCH COMPLETE
