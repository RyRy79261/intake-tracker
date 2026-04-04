# Phase 30: Observability & Rollback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 30-Observability & Rollback
**Areas discussed:** Version visibility, Rollback runbook, Version display extras

---

## Version Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog is enough (Recommended) | AboutDialog already meets OBS-01. Version is accessible from Settings. No changes needed. | ✓ |
| Inline version text | Add a small 'v1.3.0' text directly at the bottom of the Settings page. | |
| You decide | Claude picks the approach based on existing code. | |

**User's choice:** Dialog is enough
**Notes:** The existing AboutDialog component already displays version, environment badge, and git SHA. No UI modifications needed.

---

## Rollback Runbook

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| Quick-reference in docs/ (Recommended) | Concise docs/ROLLBACK.md with numbered steps. Links from README. | ✓ |
| Section in README | Add a 'Recovery' section directly in the project README. | |
| Detailed runbook with scenarios | Thorough docs/ROLLBACK.md covering multiple failure scenarios. | |

**User's choice:** Quick-reference in docs/
**Notes:** Matches the solo-project scale. Not overly detailed.

### Scope

| Option | Description | Selected |
|--------|-------------|----------|
| App + DB recovery (Recommended) | Cover Vercel Instant Rollback AND Neon snapshot restore from Phase 29 pre-promotion snapshots. | ✓ |
| App only | Only cover Vercel rollback and git revert. | |

**User's choice:** App + DB recovery
**Notes:** Phase 29 adds pre-promotion Neon snapshots — the runbook should document how to use them.

---

## Version Display Extras

| Option | Description | Selected |
|--------|-------------|----------|
| Current dialog is sufficient (Recommended) | Version + environment badge + git SHA covers what a single user needs. | ✓ |
| Add changelog link | Add a 'What's New' link in the dialog. | |
| Add staging indicator globally | Show a persistent banner on staging environments. | |

**User's choice:** Current dialog is sufficient
**Notes:** No additions needed beyond what AboutDialog already provides.

---

## Claude's Discretion

- Runbook structure and step ordering
- Whether to include a decision tree at the top of the runbook
- Neon API detail level in DB recovery section
- Post-recovery verification checklists

## Deferred Ideas

None — discussion stayed within phase scope.
