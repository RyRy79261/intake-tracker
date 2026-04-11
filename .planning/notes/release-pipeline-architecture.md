---
title: Release pipeline architecture decisions
date: 2026-04-09
context: GSD milestones, release-please, and Vercel deploys are misaligned. This note captures the target model and the reasoning behind it, derived from an exploration session referencing FSM1/cipher-box's release flow.
---

# Release Pipeline Architecture

## Problem statement (2026-04-09)

Three systems are tracking "what version is this" in incompatible ways:

1. **GSD milestones** are at v1.4 (manually tagged on completion)
2. **release-please** is at v1.2.0 (frozen — `.release-please-manifest.json` hasn't advanced because GSD jumped past it manually, and `v1.2.0` was the collision point where both systems tagged the same name)
3. **Vercel** deploys whatever is on `main` HEAD — has no concept of "release"

Tags collide in the `v*` namespace. There is no separation between "milestone complete" (a development checkpoint) and "shipped to production" (an actual release event).

## Target model

```
                ┌─────────────────────────────────────────────────────┐
                │                                                     │
   feature ────►│ main (preview deploys, free Vercel PR previews)     │
   PRs          │                                                     │
                │                ▲                                    │
                │  release-please opens its PR ──┐                    │
                │                                │                    │
                │  Review + merge release-please PR                   │
                │                                │                    │
                │                                ▼                    │
                │  release-please.yml workflow fires:                 │
                │   1. release-please-action: tag + GH release        │
                │   2. Pre-promote: Neon DB snapshot                  │
                │   3. (future) Build Android APK / submit to Play    │
                │   4. Fast-forward `release` branch to main HEAD ────┼─────►  Vercel prod deploy
                │                                                     │       (production branch = release)
                └─────────────────────────────────────────────────────┘
```

### Key properties

- **Vercel production branch is `release`, not `main`.** Main only gets preview deploys (which replaces the staging branch — Vercel's free PR previews + commit-on-main previews give us "staging" with zero infrastructure).
- **release-please owns the entire promotion pipeline.** All prod-side work — DB snapshot, future Android build, fast-forward — lives in `release-please.yml`. No separate `promote-to-production.yml`.
- **The `release` branch is a deploy pointer, not a working branch.** Nothing is ever committed to it directly; only fast-forwarded by the workflow. Rollback = `git push --force-with-lease origin <previous-sha>:release` (or `vercel promote <previous-deployment-url>`).
- **Failure-safe ordering**: snapshot first, then build, then fast-forward last. If any step fails, prod stays on the previous release. The release-please tag and GitHub release exist (release-please-action created them at step 1) but Vercel hasn't moved yet.
- **Android-extensible**: when Android arrives, add another package entry in `release-please-config.json` with its own `intake-tracker-android-v*` tag namespace and a build step in pre-promote. Web and Android can release on independent cadences without entangling.

## Decisions and rationale

### Decision 1: Component-prefixed tags (cipher-box pattern)

Set `include-component-in-tag: true` and `component: "intake-tracker"` in `release-please-config.json`. Tags become `intake-tracker-v1.5.0` instead of `v1.5.0`.

**Why:** Tag namespace collision is solved by never letting two systems write into the same prefix. Borrowed directly from FSM1/cipher-box, which uses `cipher-box-v*`, `@cipherbox/web-v*`, `cipherbox-desktop-v*`, etc. Forward-compatible with the Android version (which would get its own component prefix).

### Decision 2: Production branch ≠ main (Vercel "Option A")

Three patterns were considered for stopping main from auto-deploying to prod:

- **A. Production Branch ≠ main** — change Vercel's production branch from `main` to `release`. Selected.
- **B. Ignored Build Step** — bash regex on commit message to skip non-release builds. Rejected: rule lives in Vercel UI not git, invisible to future readers, fragile to commit message format changes.
- **C. Disable git integration entirely, deploy via Vercel CLI** — Rejected: loses free PR previews, requires `VERCEL_TOKEN` secret, more moving parts.

**Why A:** Pure git-driven, no CLI auth, Vercel handles the deploy natively, prod state is a pointer in git you can read/diff/rollback without leaving the repo. The "extra branch" cost is essentially zero because nothing is ever committed directly to it.

### Decision 3: Keep the Neon snapshot

Initially considered deleting `promote-to-production.yml`'s Neon snapshot logic because intake-tracker's server-side DB is currently just push notification subscriptions (everything else is IndexedDB on device). But the user noted: "the database is going to contain everything fairly soon instead of only on local device data." The snapshot logic is forward-looking infrastructure for that migration. Move it into `release-please.yml`'s pre-promote job rather than delete.

### Decision 4: GSD doesn't tag — `Release-As:` footer instead (Option X)

When `/gsd-complete-milestone` runs, it does NOT create a tag. Instead, it writes `Release-As: 1.5.0` into the commit message footer. release-please respects this footer as a one-shot version override on its next run.

**Considered alternative (Option Y):** GSD tags in its own namespace (`milestone/v1.5.0`), independent of release-please's tags. Rejected because milestones, in this project, *are* the moment we cut a release — there's no value in a permanent "milestone marker" that's decoupled from the release event. Cipher-box works the same way (release-please is the only system that tags).

### Decision 5: Why Vercel snapshots aren't enough on their own

Vercel preserves every production deployment as an immutable build (Instant Rollback feature). `vercel promote <url>` rolls back in seconds. **But this only covers deployment artifacts — not external state.** Database, blob storage, anything outside the build artifact is not snapshotted by Vercel. This is why the Neon snapshot is still needed: it covers the database state that Vercel's rollback can't restore.

## Phase proposal: Release pipeline alignment

Scope of the phase that should implement this model:

### Files to change

| File | Action |
|---|---|
| `release-please-config.json` | Add `include-component-in-tag: true`, `component: "intake-tracker"`, and any `release-please-action` v4 fields needed for the new pattern |
| `.release-please-manifest.json` | Reset to current actual version (`1.5.0` or whatever the next milestone version is) |
| `package.json` | Sync `version` field with reality |
| `.github/workflows/release-please.yml` | Rewrite: add `pre-promote` job (Neon snapshot, future build steps placeholder, environment approval gate) + `promote` job (fast-forward `release` branch). `needs:` chain ensures failure-safe ordering. |
| `.github/workflows/promote-to-production.yml` | **Delete** — Neon snapshot logic absorbed into `release-please.yml` |
| `.github/workflows/ci.yml` | Remove `staging` from PR trigger branches |
| `staging` branch (remote) | **Delete** — only after first successful release through the new flow |
| GSD `/gsd-complete-milestone` hook/script | Update to write `Release-As: X.Y.Z` footer in the milestone-completion commit instead of (or in addition to ceasing to) creating a `v*` tag |

### One-time manual step (not in code)

- Vercel project Settings → Git → Production Branch → change `main` → `release`. Tracked as a separate todo so it isn't forgotten. Must happen *after* the `release` branch first exists, *before* merging the first release-please PR through the new workflow.

### Verification

- A test release-please cycle (with a trivial conventional commit) should: open a release PR with `intake-tracker-v1.5.x` versioning, on merge run pre-promote steps, fast-forward `release`, trigger Vercel prod deploy, leave a GitHub release tagged `intake-tracker-v1.5.x`.
- Push directly to main (or merge a non-release PR to main) should NOT trigger a Vercel prod deploy — only a preview.
- Failure injection: temporarily break the Neon snapshot step, confirm `release` branch does NOT advance and prod stays on previous version.

### Out of scope (intentionally deferred)

- Android build pipeline — placeholder step only; full Android wiring is its own future phase
- Migrating server-side data scope — separate concern, just protected by the snapshot infrastructure being in place
