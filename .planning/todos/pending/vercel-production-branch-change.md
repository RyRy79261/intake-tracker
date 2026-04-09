---
title: Change Vercel Production Branch from main → release
date: 2026-04-09
priority: high
related_note: ../../notes/release-pipeline-architecture.md
---

# Change Vercel Production Branch from `main` → `release`

## What

In the Vercel dashboard for the intake-tracker project:
**Settings → Git → Production Branch** → change from `main` to `release`.

## Why

This is the linchpin of the release pipeline alignment work (see [release-pipeline-architecture.md](../../notes/release-pipeline-architecture.md)). Once changed:

- Pushes to `main` → Vercel makes **Preview** deploys only (replaces the staging branch)
- Pushes to `release` (managed by `release-please.yml` workflow) → Vercel makes **Production** deploys
- PR previews keep working unchanged

This step is captured as a separate todo because it is the only part of the new pipeline that does **not** appear in a code diff — it's a UI change in Vercel's dashboard. Easy to forget; impossible to PR-review.

## Sequencing — when to do this

Must happen **after**:
- The `release` branch exists in the repo (created by the new `release-please.yml` workflow on first run, or manually as `git branch release main && git push origin release`)
- All workflow file changes from the "Release pipeline alignment" phase are merged to main

Must happen **before**:
- The first release-please PR is merged through the new workflow

If you do this too early (before `release` branch exists), Vercel will show an error about a missing production branch and stop deploying anything to prod, including emergency hotfixes through the old path. Create the branch first.

## Verification

After the change:
1. Push a trivial conventional commit to main (e.g. `chore: trigger preview test`)
2. Confirm in Vercel dashboard that the resulting deployment is marked as **Preview**, not Production
3. Manually fast-forward `release` to main: `git push origin main:release`
4. Confirm Vercel creates a **Production** deployment for that push
5. Roll the release branch back if needed: `git push --force-with-lease origin <previous-sha>:release`

## Rollback

If something goes wrong, this is fully reversible: change Production Branch back to `main` in the same setting. No code or data is affected by toggling this.
