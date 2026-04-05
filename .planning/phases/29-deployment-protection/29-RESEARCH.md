# Phase 29: Deployment Protection — Research

**Researched:** 2026-04-04
**Confidence:** HIGH — All mechanisms are well-documented GitHub features and Neon API calls. Public repo on GitHub Free plan supports all required protection features.

## 1. Domain Overview

Phase 29 adds deployment protection gates: branch protection rules on `staging` and `main`, a GitHub Environment with required reviewer approval for production promotions, and a separate promotion workflow file. Pre-promotion safety includes a Neon database snapshot before merging to main.

The three core components:
1. **Branch protection rules** — Required status checks + required reviews on PRs to `staging` and `main`
2. **GitHub Environment protection** — `production` environment with the repo owner as required reviewer for promotion approval
3. **Promotion workflow** — Separate `.yml` file that creates a Neon snapshot before production merge, gated by environment approval

## 2. Technical Research

### 2.1 Branch Protection Rules (DEP-01, D-01, D-02)

**Current state:**
- `main` branch: No protection rules configured
- `staging` branch: Does not exist yet (created in Phase 28)
- Repo is public on GitHub Free plan — branch protection with required status checks and required reviewers is fully supported

**Configuration approach:** GitHub Settings UI or REST API. For reproducibility and documentation, use the GitHub CLI (`gh api`) to configure via REST API in the promotion workflow setup documentation.

**Required status check name:** The `ci-pass` job in `ci.yml` is the aggregation gate. Its job name `ci-pass` is the status check context that branch protection should require. This is critical — the CI already triggers on `pull_request` to both `[main, staging]` (line 4 of ci.yml), so no CI changes needed.

**Branch protection settings for both branches:**
```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci-pass"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": false
  },
  "restrictions": null
}
```

**Key settings:**
- `strict: true` — Branch must be up-to-date with the base before merging (prevents merge skew)
- `enforce_admins: true` — Even the repo owner (admin) must go through PRs with CI passing (D-02)
- `required_approving_review_count: 1` — At least 1 approval required (D-01)
- `restrictions: null` — No push restrictions beyond the above rules

**REST API endpoint:**
```
PUT /repos/{owner}/{repo}/branches/{branch}/protection
```

**Important note on solo projects:** With `enforce_admins: true` and required reviews, the solo developer cannot merge their own PRs without approval. This is the intended behavior per D-02, but the user acknowledged it can be temporarily disabled if needed. The GitHub Environment self-approval (D-04) handles this for promotion PRs specifically.

**GitHub CLI commands for setup:**
```bash
# Main branch protection
gh api repos/RyRy79261/intake-tracker/branches/main/protection \
  --method PUT \
  --input - <<EOF
{
  "required_status_checks": { "strict": true, "contexts": ["ci-pass"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
EOF

# Staging branch protection (identical)
gh api repos/RyRy79261/intake-tracker/branches/staging/protection \
  --method PUT \
  --input - <<EOF
{
  "required_status_checks": { "strict": true, "contexts": ["ci-pass"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
EOF
```

### 2.2 GitHub Environment Protection (DEP-02, D-04)

**Current state:**
- `Production` environment exists (created 2026-01-30) with no protection rules
- `Preview` environment exists with no protection rules
- `github-pages` environment exists with branch policy

**Configuration:** The `Production` environment needs a required reviewer added. On GitHub Free for public repos, environment protection rules including required reviewers are supported.

**Self-approval pattern (D-04):** The repo owner (RyRy79261) is added as the required reviewer on the `production` environment. For solo projects, the same person who triggers the workflow also approves it. GitHub's "prevent self-reviews" option must be LEFT DISABLED to allow self-approval.

**REST API to add required reviewer:**
```bash
gh api repos/RyRy79261/intake-tracker/environments/production \
  --method PUT \
  --input - <<EOF
{
  "reviewers": [
    { "type": "User", "id": USER_ID }
  ],
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
EOF
```

The `deployment_branch_policy.protected_branches: true` ensures only protected branches (main) can trigger production deployments.

**Workflow YAML syntax for referencing the environment:**
```yaml
jobs:
  promote:
    environment: production
    runs-on: ubuntu-latest
    steps:
      - ...
```

When a job references `environment: production`, GitHub Actions pauses the job and waits for the required reviewer to approve before running.

**Important:** The existing `Production` environment (capital P) was created by Vercel. We should use the existing one rather than creating a new `production` environment (lowercase). The environment name in the workflow YAML must match exactly: `Production`.

### 2.3 Promotion Workflow (DEP-03, D-03, D-05, D-06)

**Workflow design:** A separate `.github/workflows/promote-to-production.yml` file. This is NOT a deployment workflow that runs `vercel deploy` — Vercel handles deployment automatically on merge to main via git integration. Instead, this workflow:

1. Triggers on `pull_request` to `main` from `staging` branch
2. Creates a Neon production database snapshot (D-06)
3. Uses the `Production` environment for approval gate (D-04)

**Key insight:** The actual promotion is a standard PR from `staging` to `main`. The workflow adds pre-merge safety (Neon snapshot) and requires environment approval. After merge, Vercel's git integration auto-deploys to production.

**Workflow structure:**
```yaml
name: Promote to Production

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize]

jobs:
  pre-promote:
    if: github.head_ref == 'staging'
    environment: Production
    runs-on: ubuntu-latest
    steps:
      - name: Create Neon production snapshot
        run: |
          curl -s -X POST \
            "https://console.neon.tech/api/v2/projects/${{ secrets.NEON_PROJECT_ID }}/branches/${{ secrets.NEON_PROD_BRANCH_ID }}/snapshots" \
            -H "Authorization: Bearer ${{ secrets.NEON_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"name": "pre-promote-${{ github.sha }}"}'
```

**Alternative trigger consideration:** The workflow could use `workflow_dispatch` for manual triggering, but since the promotion is already a PR from staging to main (D-03), triggering on `pull_request` is more natural and automatic. The environment approval gate provides the manual checkpoint.

**Wait — important design consideration:** If the workflow triggers on `pull_request` to main, it will ALSO trigger for non-staging PRs (e.g., feature branches directly to main). The `if: github.head_ref == 'staging'` guard ensures the snapshot only runs for staging promotions. For non-staging PRs, the job is skipped (which is correct — regular PRs are gated by CI, not this promotion workflow).

**Revised approach:** Since `ci.yml` already runs on PRs to main, and branch protection requires `ci-pass` status check, we don't need another CI run. The promotion workflow adds the EXTRA gate of environment approval + Neon snapshot specifically for staging-to-main PRs. Non-staging PRs to main only need CI to pass.

### 2.4 Neon Snapshot API (D-06)

**API endpoint (Beta):**
```
POST https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/snapshots
```

**Required parameters:**
- `project_id` — Neon project ID (from secrets)
- `branch_id` — The production (main) Neon branch ID (from secrets)
- Request body: `{ "name": "descriptive-name" }` (optional but recommended)

**Authentication:** Bearer token via `NEON_API_KEY`

**Required secrets (not yet configured):**
- `NEON_API_KEY` — Already needed by `staging-db-reset.yml` (Phase 28)
- `NEON_PROJECT_ID` — Already needed by `staging-db-reset.yml` (Phase 28)
- `NEON_PROD_BRANCH_ID` — New: the branch ID for the production (main) Neon branch. Needed to target the snapshot at the correct branch.

**Snapshot naming convention:** `pre-promote-{short-sha}-{date}` to identify which promotion attempt created the snapshot.

**Restore process (if needed):** Neon's restore snapshot API:
```
POST https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/restore
```
With the snapshot ID. This is documented in the rollback procedure (Phase 30, OBS-02) but not automated in this phase.

**Risk: Beta API status.** The Neon snapshot API is currently in Beta. If it becomes unavailable or changes, the promotion workflow should fail gracefully (warning, not blocking) so promotions aren't permanently blocked by a snapshot failure. The workflow step should use `continue-on-error: true` with a warning output.

### 2.5 CI Status Check Naming

**Critical finding:** Branch protection requires the EXACT status check context name. The CI workflow has a `ci-pass` job that aggregates all other jobs. This is the correct check to require.

**Status check context format:** For GitHub Actions workflows, the context is `{job_name}` (not `{workflow_name} / {job_name}`). So the required status check is literally `ci-pass`.

**Verification:** After enabling branch protection, create a test PR and verify the `ci-pass` check appears as required in the PR checks section.

## 3. Validation Architecture

### Test Strategy

| What | How | Automated? |
|------|-----|------------|
| Branch protection on main | `gh api repos/.../branches/main/protection` returns 200 | Yes (API check) |
| Branch protection on staging | `gh api repos/.../branches/staging/protection` returns 200 | Yes (API check) |
| Required status check is `ci-pass` | Protection JSON includes `ci-pass` in contexts | Yes (API check) |
| Enforce admins enabled | Protection JSON has `enforce_admins.enabled: true` | Yes (API check) |
| Required reviews = 1 | Protection JSON has review count = 1 | Yes (API check) |
| Production environment has reviewer | Environment API shows reviewers list non-empty | Yes (API check) |
| Promotion workflow exists | `.github/workflows/promote-to-production.yml` exists | Yes (file check) |
| Promotion workflow is separate from ci.yml | Different filename, different triggers | Yes (file check) |
| Neon snapshot step present | Workflow YAML contains snapshot API call | Yes (grep) |
| Environment gate in workflow | Workflow YAML contains `environment: Production` | Yes (grep) |

### Verification Commands
```bash
# Branch protection on main
gh api repos/RyRy79261/intake-tracker/branches/main/protection --jq '.required_status_checks.contexts'

# Branch protection on staging
gh api repos/RyRy79261/intake-tracker/branches/staging/protection --jq '.required_status_checks.contexts'

# Enforce admins
gh api repos/RyRy79261/intake-tracker/branches/main/protection --jq '.enforce_admins.enabled'

# Required reviews
gh api repos/RyRy79261/intake-tracker/branches/main/protection --jq '.required_pull_request_reviews.required_approving_review_count'

# Production environment reviewers
gh api repos/RyRy79261/intake-tracker/environments/Production --jq '.protection_rules[] | select(.type == "required_reviewers")'

# Promotion workflow exists and is separate
test -f .github/workflows/promote-to-production.yml && echo "EXISTS"
grep -q "environment: Production" .github/workflows/promote-to-production.yml && echo "HAS_ENV_GATE"
grep -q "snapshots" .github/workflows/promote-to-production.yml && echo "HAS_SNAPSHOT"
```

## 4. Dependencies and Integration Points

- **Phase 28 (Staging Environment):** Must complete first — creates the `staging` branch and configures Neon secrets. Branch protection for `staging` can only be applied after the branch exists.
- **Existing CI (`ci.yml`):** Already triggers on PRs to both `main` and `staging`. No changes needed. The `ci-pass` aggregation job provides the required status check.
- **Release Please (`release-please.yml`):** Triggers on push to `main`, not PR. Release Please creates its own PR (the release PR) which will be subject to branch protection — this is correct and desired behavior.
- **Staging DB Reset (`staging-db-reset.yml`):** Already references `NEON_API_KEY` and `NEON_PROJECT_ID` secrets. The promotion workflow needs the same secrets plus `NEON_PROD_BRANCH_ID`.
- **Vercel:** Git integration auto-deploys on merge to main. The promotion workflow doesn't replace Vercel deployment — it adds pre-merge safety. No Vercel changes needed.
- **Neon secrets:** `NEON_API_KEY` and `NEON_PROJECT_ID` will be configured in Phase 28. This phase adds `NEON_PROD_BRANCH_ID`.

## 5. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Solo dev can't merge own PRs with required reviews | Certain | Medium | D-02 acknowledges this. Can temporarily disable for urgent fixes. Self-approval via environment gate handles promotion PRs. |
| Staging branch doesn't exist yet | Expected | None | Phase 28 creates it. Branch protection for staging is applied after Phase 28 completes. Document dependency. |
| Neon snapshot API is Beta | Medium | Low | Use `continue-on-error: true` on snapshot step. Promotion shouldn't be blocked by snapshot failure. |
| Status check name mismatch | Low | High | Verify `ci-pass` is the exact context name by checking a real PR's status checks before configuring protection. |
| Required reviews block GSD agent workflow | Medium | Medium | GSD agents create PRs but can't approve them. The user must approve. This is correct behavior — deployment protection is the whole point. |

## 6. Implementation Order

1. **Promotion workflow file** — Create `.github/workflows/promote-to-production.yml` with environment gate and Neon snapshot step
2. **Branch protection setup documentation** — Document the `gh api` commands to configure protection on both branches (manual step since protection rules are repo settings, not code)
3. **GitHub Environment configuration** — Add required reviewer to existing `Production` environment (manual step)
4. **Verification** — Validate all protection rules via API checks

This order creates the workflow file first (code change), then documents the manual configuration steps that the user must perform in GitHub Settings or via API calls. Branch protection and environment configuration are repository settings, not code files — they must be applied manually or via API after the workflow file exists.

**Important architectural note:** Branch protection rules and environment protection are **repository settings**, not code artifacts. They cannot be version-controlled in the repo. The plans should create the workflow file as code AND provide setup scripts/documentation for the settings configuration. The user must run the setup commands or configure through GitHub UI.

---

## RESEARCH COMPLETE
