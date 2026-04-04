# Phase 27: Release Automation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 27-Release Automation
**Areas discussed:** Version bootstrap, Commit hook behavior, Changelog content

---

## Version Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| 1.2.0 (Recommended) | Matches last shipped milestone (v1.2 CI & Data Integrity). Next feat commit triggers 1.3.0. Clean history alignment. | ✓ |
| 1.3.0 | Jump to current milestone version. Next feat commit triggers 1.4.0. Skips the v1.2 tag retroactively. | |
| 0.1.0 (keep as-is) | Let Release Please start from current. First release becomes 0.2.0 or 1.0.0 depending on commit type. Doesn't reflect shipped history. | |

**User's choice:** 1.2.0
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, tag a3a0b2d as v1.2.0 | Creates historical anchor. Release Please sees it and starts from there. GitHub will show a v1.2.0 release. | ✓ |
| No, just set package.json | Simpler. Release Please uses package.json version alone. No retroactive tag in git history. | |

**User's choice:** Yes, tag a3a0b2d as v1.2.0
**Notes:** None

---

## Commit Hook Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Enforce all, ignore merges (Recommended) | Strict on regular commits. Merge commits (from git merge/PR) auto-ignored. Bot commits (github-actions) don't run local hooks anyway. | ✓ |
| Enforce everything | All commits must pass, including merges. Merge commits would need conventional format or explicit allow rule. | |
| Warn only, don't block | commitlint runs but exits 0 on failure. Catches mistakes without blocking anyone. | |

**User's choice:** Enforce all, ignore merges
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Apply everywhere (Recommended) | Agents already use conventional format (docs:, feat:, test:). Hook validates consistency. If an agent produces a bad message, it gets caught. | ✓ |
| Skip in worktrees | Add a worktree detection check to the hook. Avoids any risk of breaking agent workflows. | |

**User's choice:** Apply everywhere
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Standard set (Recommended) | feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert — the @commitlint/config-conventional defaults | ✓ |
| Minimal set | feat, fix, docs, chore, test, ci only. Rejects refactor/perf/style/build as too granular. | |
| You decide | Claude picks appropriate types during planning | |

**User's choice:** Standard set
**Notes:** None

---

## Changelog Content

| Option | Description | Selected |
|--------|-------------|----------|
| feat + fix only (Recommended) | Clean, user-focused changelog. Features and bug fixes. Keeps noise low. This is the Release Please default. | ✓ |
| feat + fix + perf | Also surfaces performance improvements. Useful if perf changes are user-visible. | |
| All types | Everything shows up — docs, refactor, chore, ci. Verbose but complete audit trail. | |

**User's choice:** feat + fix only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Same as CHANGELOG (Recommended) | Release Please auto-generates both from the same source. Zero manual effort. Consistent. | ✓ |
| Curated summary | Manually edit release notes before publishing. More polished but adds friction to every release. | |

**User's choice:** Same as CHANGELOG
**Notes:** None

---

## Claude's Discretion

- Release Please configuration details (release-type, token permissions, workflow triggers)
- Exact husky + commitlint installation approach (pnpm compatibility)
- Whether to seed CHANGELOG.md with a v1.2.0 retroactive section or start fresh
- CI workflow file naming and organization

## Deferred Ideas

None — discussion stayed within phase scope
