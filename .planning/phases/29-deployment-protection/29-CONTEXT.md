# Phase 29: Deployment Protection - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Production deployments are gated by CI checks and human approval, with promotion managed through dedicated workflows separate from ci.yml. Branch protection rules enforce PR-based merging to both staging and main.

</domain>

<decisions>
## Implementation Decisions

### Branch Protection Rules
- **D-01:** Same branch protection rules on both `staging` and `main` — CI must pass + at least 1 approval on PRs to either branch. Consistent protection, prevents broken code in both environments.
- **D-02:** Branch protection includes admins — even the repo owner must go through PRs with CI passing. No direct pushes to protected branches. Can be temporarily disabled if needed.

### Promotion Workflow
- **D-03:** Staging-to-main promotion via manual PR from `staging` to `main` — you create the PR when ready, CI runs, reviewer approval required, merge triggers production deploy. Simple and auditable.
- **D-04:** Self-approval via GitHub Environment — a `production` GitHub Environment with you as required reviewer. You approve your own promotion PRs. Standard for solo projects.
- **D-05:** Promotion workflow is a separate `.yml` file from `ci.yml` (per DEP-03)

### Pre-Promotion Safety
- **D-06:** CI smoke tests run on the promotion PR (full test suite). Before merge, a GitHub Action creates a Neon branch snapshot of the production DB (point-in-time backup). If something goes wrong after promotion, restore from the snapshot.

### Claude's Discretion
- Exact branch protection rule configuration details (required status checks list, dismissal rules)
- Promotion workflow file naming and structure
- Neon snapshot implementation details (API call, naming convention, retention)
- Whether to add a deployment status badge to the README

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CI infrastructure
- `.github/workflows/ci.yml` — Existing CI pipeline; promotion workflow must be a separate file (DEP-03)
- `.github/workflows/version-bump.yml` — Being replaced by Release Please in Phase 27; referenced for workflow patterns

### Neon Database
- `src/lib/push-db.ts` — All Neon DB usage; push notification tables that need snapshot protection

### Prior Phases
- `.planning/phases/27-release-automation/27-CONTEXT.md` — Release Please setup (releases trigger Neon staging reset)
- `.planning/phases/28-staging-environment/28-CONTEXT.md` — Staging branch workflow, Neon branch management, safety guards

### Requirements
- `.planning/REQUIREMENTS.md` — DEP-01 through DEP-03 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CI workflow patterns from `ci.yml` — job structure, pnpm setup, Node 22, caching patterns
- Neon API integration pattern from Phase 28's branch reset workflow (to be built)

### Established Patterns
- GitHub Actions workflow structure (ubuntu-latest, pnpm/action-setup@v5, actions/setup-node@v4)
- CI triggers on `pull_request` to `main` — needs to also trigger on PRs to `staging`
- Path-based filtering via dorny/paths-filter for conditional job execution

### Integration Points
- Branch protection relies on CI status checks — CI job names must be stable and referenced in protection rules
- GitHub Environment `production` gates the promotion merge
- Neon API for pre-promotion snapshot creation
- Phase 28 establishes the staging branch; this phase adds protection on top

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- **Automated E2E tests against live staging URL** — Run Playwright against staging.intake-tracker.ryanjnoble.dev before promotion. Listed as ADV-02 in future requirements. Would strengthen pre-promotion testing but requires staging to be deployed and accessible from CI.
- **Deployment notifications** — Slack/Discord notifications on deploy. Listed as ADV-03 in future requirements.

</deferred>

---

*Phase: 29-deployment-protection*
*Context gathered: 2026-04-04*
