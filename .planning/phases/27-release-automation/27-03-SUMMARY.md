---
phase: 27-release-automation
plan: 03
subsystem: infra
tags: [release-please, github-actions, changelog, github-releases]

requires:
  - phase: 27-01
    provides: package.json v1.2.0, Release Please manifest, v1.2.0 tag
  - phase: 27-02
    provides: commitlint + husky for conventional commit enforcement
provides:
  - Release Please config (release-please-config.json) with changelog sections and bootstrap-sha
  - Release Please GitHub Actions workflow (.github/workflows/release-please.yml)
  - Removal of deprecated version-bump.yml
affects: [28, 30]

tech-stack:
  added: [googleapis/release-please-action@v4]
  patterns: [release-please-config-manifest, conventional-release-pipeline]

key-files:
  created:
    - release-please-config.json
    - .github/workflows/release-please.yml
  modified: []

key-decisions:
  - "Used full SHA a3a0b2d0db39613fe964d7f58137f8063768ef77 for bootstrap-sha (short SHA not reliable)"
  - "Changelog sections restricted to feat and fix only (D-06) — clean user-facing changelog"
  - "Minimal workflow file — Release Please reads config from repo files, not workflow inputs"

patterns-established:
  - "Release Please config+manifest pattern: release-please-config.json defines behavior, .release-please-manifest.json tracks version"
  - "Workflow triggers on push to main only — separate from CI which triggers on pull_request"

requirements-completed: [REL-02, REL-03, REL-04, REL-06]

duration: 2min
completed: 2026-04-04
---

# Plan 27-03: Release Please Workflow & Cleanup Summary

**Created Release Please pipeline and removed deprecated version-bump.yml — merges to main now trigger automated release PRs with changelogs**

## Performance

- **Duration:** 2 min
- **Tasks:** 3/3
- **Files modified:** 3 (1 created, 1 created, 1 deleted)

## Accomplishments

1. Created `release-please-config.json` with `release-type: node`, changelog restricted to feat/fix, and bootstrap-sha anchored at v1.2 completion
2. Created `.github/workflows/release-please.yml` with `contents: write` and `pull-requests: write` permissions
3. Deleted `.github/workflows/version-bump.yml` (keyword-based version bumping replaced by Release Please)

## Verification

- `release-please-config.json` has `release-type: node`, 2 changelog sections, correct bootstrap-sha
- `.release-please-manifest.json` has version `1.2.0`
- `.github/workflows/release-please.yml` uses `googleapis/release-please-action@v4`
- `.github/workflows/version-bump.yml` does NOT exist
- `.github/workflows/` contains `ci.yml` and `release-please.yml` only
- All 396 tests pass

## Issues Encountered

None.

## Self-Check: PASSED
