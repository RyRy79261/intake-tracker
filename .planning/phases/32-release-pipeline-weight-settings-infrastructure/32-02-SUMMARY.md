# Plan 32-02 Summary: Release-Please Documentation + Permissions Fix

**Status:** Complete (code changes); Human action pending (GitHub settings)
**Duration:** ~2 min
**Commits:** 1

## What Was Built

Added troubleshooting documentation to the release-please workflow YAML file with step-by-step instructions for fixing GitHub Actions permissions when PR creation fails.

### Changes

1. **`.github/workflows/release-please.yml`** — Added 9-line troubleshooting comment block at the top of the file documenting:
   - How to navigate to GitHub repo Settings > Actions > General > Workflow permissions
   - Setting "Read and write permissions"
   - Enabling "Allow GitHub Actions to create and approve pull requests"
   - Explanation that YAML permissions are necessary but not sufficient without repo-level grants

## Key Files

### Modified
- `.github/workflows/release-please.yml`

## Pending Human Action

The user must manually change GitHub repo settings:
1. Go to https://github.com/RyRy79261/intake-tracker/settings/actions
2. Select "Read and write permissions"
3. Check "Allow GitHub Actions to create and approve pull requests"
4. Save

This cannot be automated — it requires GitHub UI access with repo admin permissions.

## Deviations

None — the YAML comment matches the plan exactly.

## Self-Check: PASSED

- `.github/workflows/release-please.yml` contains troubleshooting comment
- `contents: write` and `pull-requests: write` permissions unchanged
- `googleapis/release-please-action@v4` unchanged
- `pnpm build` exits 0
