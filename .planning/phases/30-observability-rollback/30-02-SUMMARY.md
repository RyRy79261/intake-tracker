---
phase: 30
plan: 2
title: "Create Rollback Runbook and README Link"
status: complete
started: 2026-04-05T01:23:00Z
completed: 2026-04-05T01:25:00Z
duration_minutes: 2
---

# Plan 30-02 Summary: Create Rollback Runbook and README Link

## Outcome

Created `docs/ROLLBACK.md` with recovery procedures covering all deployment failure scenarios. Added a Documentation section to README.md linking to the runbook and existing staging setup guide.

## What Was Built

### docs/ROLLBACK.md (109 lines)
- **Quick Decision Tree** — symptom-to-recovery-path routing table
- **Vercel Instant Rollback** — 5-step dashboard procedure (~30s recovery)
- **Git Revert** — commit-level rollback through normal pipeline (~2-3 min)
- **Neon Database Restore** — both dashboard and API paths, references `pre-promote-{sha7}-{date}` snapshot naming from `promote-to-production.yml`
- **Environment Variable Fix** — Vercel dashboard env var correction
- **Post-Recovery Checklist** — 5-item verification checklist

### README.md update
- Added `## Documentation` section before License
- Links to `docs/ROLLBACK.md` and `docs/staging-setup.md`

## Self-Check: PASSED

All acceptance criteria met:
- [x] docs/ROLLBACK.md exists (109 lines)
- [x] Has all 5 required sections (Vercel, Git Revert, Neon, Env Var, Checklist)
- [x] References correct snapshot naming convention (`pre-promote-`)
- [x] Has Quick Decision Tree for fast routing
- [x] README.md links to ROLLBACK.md
- [x] README.md has Documentation section header
- [x] Link path matches actual file location

## Deviations

None — implemented as planned.

## Key Files

### Created
- `docs/ROLLBACK.md` — Rollback & Recovery Runbook

### Modified
- `README.md` — Added Documentation section with links
