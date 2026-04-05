# Phase 31: Rollback & Documentation Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 31-rollback-documentation-fixes
**Areas discussed:** Git revert workflow, Snapshot SHA naming, NEON_PROD_BRANCH_ID placement, Tech debt tracking

---

## Git Revert Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| PR-based revert | Revert on branch, open PR, CI runs, merge. Consistent with enforce_admins. | ✓ |
| Include disable-protection instructions | Document how to temporarily disable enforce_admins for direct push. | |
| Both paths documented | PR-based as primary, break-glass section for emergencies. | |

**User's choice:** PR-based revert
**Notes:** Consistent with Phase 29's branch protection model.

### Follow-up: When to use git revert vs Vercel rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add context | Note explaining when git revert is preferred over Vercel Instant Rollback | ✓ |
| No, keep minimal | Decision tree at top already routes operators | |

**User's choice:** Yes, add context

### Follow-up: CI on revert PRs

| Option | Description | Selected |
|--------|-------------|----------|
| Always require CI | Consistent with protection rules. Revert is still a code change. | ✓ |
| Note fast-track option | Mention CI can be skipped via admin override in emergencies. | |

**User's choice:** Always require CI

### Follow-up: Branch naming convention

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, suggest convention | e.g., revert/<sha7> — keeps runbook copy-pasteable | ✓ |
| Leave it flexible | Just say 'create a branch' without prescribing a name | |

**User's choice:** Yes, suggest convention

---

## Snapshot SHA Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Docs only | Fix naming inconsistency in ROLLBACK.md. github.sha issue is beyond doc-fix scope. | ✓ |
| Fix workflow + docs | Change promote-to-production.yml to use head SHA and fix docs. | |
| You decide | Claude picks best approach. | |

**User's choice:** Docs only

### Follow-up: Merge commit SHA clarification

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add clarification | Note that snapshot SHAs come from merge commit, not PR head SHA | ✓ |
| No, keep it simple | Operators list snapshots by date anyway | |

**User's choice:** Yes, add clarification

### Follow-up: Cross-reference secrets in ROLLBACK.md

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-reference | Add note in ROLLBACK.md pointing to staging-setup.md for secret setup | ✓ |
| No, staging-setup.md is enough | Runbook just shows API commands, operators already have secrets | |

**User's choice:** Cross-reference

---

## NEON_PROD_BRANCH_ID Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Add as third row | Simple: add as third bullet under existing two secrets. Same format. | ✓ |
| Restructure section header | Rename section, add with explanation of where to find branch ID. | |
| You decide | Claude picks cleanest approach. | |

**User's choice:** Add as third row

---

## Tech Debt Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Leave in audit doc | Already recorded in v1.3-MILESTONE-AUDIT.md tech_debt section. | ✓ |
| Add a TODO | Create GSD todo item so it surfaces in future milestones. | |
| Add a code comment | Add TODO comment in promote-to-production.yml near github.sha line. | |

**User's choice:** Leave in audit doc

---

## Claude's Discretion

- Exact wording and step numbering in rewritten git revert section
- Whether to reorder ROLLBACK.md sections
- Minor formatting and consistency improvements

## Deferred Ideas

- Fix github.sha to use PR head SHA in promote-to-production.yml — tech debt, future milestone
