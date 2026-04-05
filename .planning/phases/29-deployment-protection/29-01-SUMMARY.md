# Plan 29-01 Summary: Create Promotion Workflow with Neon Snapshot and Environment Gate

**Status:** Complete
**Started:** 2026-04-04T18:41:55Z
**Duration:** ~1 min

## What was built

Created `.github/workflows/promote-to-production.yml` — a GitHub Actions workflow that gates staging-to-main promotions with the Production GitHub Environment approval gate and creates a Neon database snapshot before merge.

## Tasks

| # | Task | Status |
|---|------|--------|
| 29-01-01 | Create promote-to-production.yml workflow file | ✓ Complete |

## Key Decisions

- Workflow triggers on `pull_request` to `main` with `if: github.head_ref == 'staging'` guard — only staging PRs activate the promotion job
- `environment: Production` pauses the job for reviewer approval before any steps run
- Neon snapshot uses `continue-on-error: true` since the API is Beta — won't block promotions on API failure
- No deployment logic in workflow — Vercel handles deployment on merge via git integration

## Self-Check: PASSED

- [x] promote-to-production.yml exists as separate file from ci.yml (DEP-03)
- [x] Workflow references Production GitHub Environment (DEP-02)
- [x] Neon snapshot step present with proper error handling
- [x] Staging-only guard prevents unnecessary runs on non-staging PRs
- [x] All secrets referenced via `${{ secrets.* }}` — no hardcoded values

## Key Files

<key-files>
created:
  - .github/workflows/promote-to-production.yml
modified: []
</key-files>

## Commits

| Hash | Message |
|------|---------|
| 56ebb68 | ci(29): add staging-to-production promotion workflow |
