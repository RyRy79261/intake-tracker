# Phase 28: Staging Environment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 28-Staging Environment
**Areas discussed:** Service worker disabling, Staging branch workflow, Neon branch reset, DB safety

---

## Service Worker Disabling

| Option | Description | Selected |
|--------|-------------|----------|
| VERCEL_ENV check in next.config.js (Recommended) | Only load next-pwa when VERCEL_ENV === 'production'. Staging gets VERCEL_ENV='preview' automatically. Clean, zero-config per deploy. | ✓ |
| Custom env var (DISABLE_PWA) | Add a DISABLE_PWA=true env var in Vercel staging settings. More explicit, but another env var to manage. | |
| Unregister on client side | Keep next-pwa active but unregister SW in use-service-worker.ts when VERCEL_ENV !== production. Belt-and-suspenders but more complex. | |

**User's choice:** VERCEL_ENV check in next.config.js
**Notes:** None

---

## Staging Branch Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Merge feature branches to staging (Recommended) | Feature branches merge to staging for testing, then staging merges to main for production. Standard gitflow-lite. CI runs on PRs to both. | ✓ |
| Push main to staging manually | Main is the source of truth. When ready to test, fast-forward staging to main. Simpler but staging always mirrors main. | |
| Auto-promote on CI pass | Merge to main triggers CI. If CI passes, auto-push to staging. Staging is always the latest passing main. | |

**User's choice:** Merge feature branches to staging
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Direct push allowed (Recommended) | Single-user app — you can push or merge to staging freely. No PR overhead. Branch protection added in Phase 29. | ✓ |
| PRs required from the start | Enforce PR workflow to staging immediately. CI must pass before merge. More disciplined but adds friction. | |

**User's choice:** Direct push allowed
**Notes:** None

---

## Neon Branch Reset

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Action on release (Recommended) | When Release Please creates a GitHub Release (production deploy), a workflow step calls Neon API to reset the staging branch. Fully automated. | ✓ |
| Manual via Neon console | Document the reset procedure. You run it manually after each production release. Simple, no API integration needed. | |
| Scheduled weekly reset | Cron-based GitHub Action resets the staging branch weekly regardless of releases. Less precise but low maintenance. | |

**User's choice:** GitHub Action on release
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Delete + recreate from main (Recommended) | Neon branches are cheap. Delete the staging branch and create a fresh one from the production branch. Clean slate every time. | ✓ |
| Reset data only, keep schema | Truncate tables but preserve the schema. Faster but could accumulate schema drift over time. | |

**User's choice:** Delete + recreate from main
**Notes:** None

---

## DB Safety (user-initiated)

User raised concern: "We need to make it extremely impossible for resetting the prod DB. We should have some backup ability on prod. Like there should be a way to test that upgrades from staging to main don't destroy anything."

| Option | Description | Selected |
|--------|-------------|----------|
| Branch name hardcoded + env guard (Recommended) | The GitHub Action hardcodes the staging branch name. Add an explicit check: if branch name matches production, abort with error. | ✓ |
| Separate Neon API keys per environment | Use a staging-only API key that physically cannot access the production branch. Strongest isolation but requires two API keys. | |
| Manual confirmation step | GitHub Action pauses and requires manual approval before any branch delete/recreate. Adds friction but guarantees human oversight. | |

**User's choice:** Branch name hardcoded + env guard
**Notes:** Production backup and promotion testing concerns deferred to Phase 29/30

---

## Claude's Discretion

- Exact Vercel project/domain configuration documentation structure
- Neon API call implementation details in the GitHub Action
- Staging-specific environment variable list
- Whether to add a staging health check endpoint

## Deferred Ideas

- Production database backup before promotions (Phase 29/30)
- Automated promotion testing to verify staging→main doesn't break things (Phase 29)
