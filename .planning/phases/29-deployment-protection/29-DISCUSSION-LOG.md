# Phase 29: Deployment Protection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 29-Deployment Protection
**Areas discussed:** Branch protection rules, Promotion workflow, Pre-promotion safety

---

## Branch Protection Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Same rules, both branches (Recommended) | CI must pass + at least 1 approval on PRs to both staging and main. Consistent, prevents broken code in either environment. | ✓ |
| Lighter on staging, strict on main | Staging: CI must pass, no approval required. Main: CI + approval. Faster staging pushes. | |
| Strict on main only | No branch protection on staging. Only main gets CI gates and approval. Maximum staging flexibility. | |

**User's choice:** Same rules, both branches
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include admins (Recommended) | Even you must go through PRs with CI passing. Prevents accidental direct pushes. Can temporarily disable if needed. | ✓ |
| Admins can bypass | You can push directly or merge without CI. Protection only for bots/agents. | |

**User's choice:** Include admins
**Notes:** None

---

## Promotion Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Manual PR from staging to main (Recommended) | You create a PR when ready. CI runs, reviewer approval required. Merging triggers production deploy. Simple and auditable. | ✓ |
| GitHub Action dispatch workflow | Manually triggered workflow merges staging into main after checks pass. No PR involved. | |
| Automated on staging CI pass | Auto-create PR to main when staging CI passes. You still approve. Less manual overhead. | |

**User's choice:** Manual PR from staging to main
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Self-approval via GitHub Environment (Recommended) | Configure 'production' GitHub Environment with you as required reviewer. Self-approve promotion PRs. Standard for solo projects. | ✓ |
| GitHub Actions bot auto-approves after checks | Auto-approve once CI passes. Removes manual approval step — CI is the gate. | |

**User's choice:** Self-approval via GitHub Environment
**Notes:** None

---

## Pre-Promotion Safety

| Option | Description | Selected |
|--------|-------------|----------|
| CI smoke tests + Neon snapshot (Recommended) | Full test suite on promotion PR. GitHub Action creates Neon branch snapshot of production DB before merge. Restore from snapshot if things go wrong. | ✓ |
| CI checks only, no DB backup | Trust CI. Neon's built-in 7-day point-in-time recovery is fallback. No extra workflow step. | |
| Manual pre-promotion checklist | Document a checklist. Manual Neon snapshot + smoke test on staging URL. Maximum human oversight. | |

**User's choice:** CI smoke tests + Neon snapshot
**Notes:** Addresses user concern from Phase 28 discussion about ensuring staging→main promotions don't destroy production data

---

## Claude's Discretion

- Exact branch protection rule configuration details
- Promotion workflow file naming and structure
- Neon snapshot implementation details
- Whether to add deployment status badge to README

## Deferred Ideas

- Automated E2E tests against live staging URL (ADV-02 in future requirements)
- Deployment notifications via Slack/Discord (ADV-03 in future requirements)
