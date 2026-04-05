# Phase 31: Rollback & Documentation Fixes - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix rollback documentation that contradicts branch protection and document missing secrets for operator setup. No code changes to workflows — documentation fixes only. Closes gaps identified in v1.3 milestone audit (OBS-02).

</domain>

<decisions>
## Implementation Decisions

### Git Revert Workflow
- **D-01:** Rewrite ROLLBACK.md git revert path to use PR-based workflow instead of direct push to main. Create a branch, revert on the branch, open PR, CI runs, self-approve, merge. Consistent with Phase 29's enforce_admins branch protection.
- **D-02:** Add context explaining when git revert is preferred over Vercel Instant Rollback — git revert is for permanently removing a bad commit from the codebase, while Vercel rollback is the fastest recovery for any production issue.
- **D-03:** Always require CI to pass on revert PRs — no fast-track bypass. A revert commit is still a code change.
- **D-04:** Include a suggested branch naming convention for revert PRs (e.g., `revert/<sha7>`) to keep the runbook copy-pasteable.

### Snapshot SHA Naming
- **D-05:** Fix ROLLBACK.md naming inconsistency — line 60 says `{sha7}` but line 67 says `{sha}`. Standardize to `{sha7}` throughout to match the actual workflow convention (`cut -c1-7`).
- **D-06:** Docs-only fix — do NOT change `promote-to-production.yml` to use `github.event.pull_request.head.sha`. The `github.sha` tech debt stays as-is (recorded in milestone audit).
- **D-07:** Add a clarifying note in ROLLBACK.md that snapshot SHAs come from the merge commit (`github.sha`), so operators know to look for the merge commit SHA rather than the PR head SHA when finding snapshots.
- **D-08:** Add a cross-reference in ROLLBACK.md Neon API section pointing to `docs/staging-setup.md` section 7 for the required secrets (`NEON_PROJECT_ID`, `NEON_API_KEY`, `NEON_PROD_BRANCH_ID`).

### NEON_PROD_BRANCH_ID Documentation
- **D-09:** Add `NEON_PROD_BRANCH_ID` as a third row in `docs/staging-setup.md` section 7, alongside existing `NEON_PROJECT_ID` and `NEON_API_KEY`. Same format, minimal disruption. Include where to find the branch ID (Neon Console > Branches > main branch > Branch ID).

### Tech Debt Tracking
- **D-10:** The `github.sha` vs head SHA tech debt stays in `v1.3-MILESTONE-AUDIT.md` tech_debt section. No additional tracking needed — it's already recorded.

### Claude's Discretion
- Exact wording and step numbering in the rewritten git revert section
- Whether to reorder ROLLBACK.md sections for better flow
- Minor formatting and consistency improvements across both docs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Documentation to fix
- `docs/ROLLBACK.md` — Primary target: git revert section (lines 35-52), Neon section naming (lines 60, 67), API section secrets reference
- `docs/staging-setup.md` §7 — Add NEON_PROD_BRANCH_ID to GitHub secrets section

### Workflow reference (read-only, do not modify)
- `.github/workflows/promote-to-production.yml` — Source of truth for snapshot naming convention (`pre-promote-{sha7}-{date}`) and secrets used (`NEON_PROD_BRANCH_ID`)

### Gap source
- `.planning/v1.3-MILESTONE-AUDIT.md` — Gaps section defines exactly what needs fixing (OBS-02 unsatisfied, integration gaps, flow breaks)

### Prior phase context
- `.planning/phases/29-deployment-protection/29-CONTEXT.md` — D-02: enforce_admins branch protection (the rule that breaks the current git revert path)
- `.planning/phases/30-observability-rollback/30-CONTEXT.md` — D-04/D-05: Rollback runbook format and scope decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this phase is documentation-only, no code changes

### Established Patterns
- `docs/staging-setup.md` uses numbered sections with verification steps after each section
- `docs/ROLLBACK.md` uses a quick decision tree at the top, numbered recovery paths, and a post-recovery checklist
- Both docs use consistent markdown formatting with code blocks for commands

### Integration Points
- `ROLLBACK.md` references `promote-to-production.yml` snapshot naming — must stay consistent
- `staging-setup.md` section 7 secrets list must match what `promote-to-production.yml` and `staging-db-reset.yml` actually use
- `scripts/setup-branch-protection.sh` already mentions `NEON_PROD_BRANCH_ID` in prerequisites — staging-setup.md is catching up

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The fixes are well-defined by the milestone audit.

</specifics>

<deferred>
## Deferred Ideas

- **Fix github.sha to use PR head SHA in promote-to-production.yml** — Tech debt recorded in v1.3-MILESTONE-AUDIT.md. Would make snapshot SHAs match git log, but is a workflow code change beyond this doc-fix phase's scope.

</deferred>

---

*Phase: 31-rollback-documentation-fixes*
*Context gathered: 2026-04-05*
