# Phase 20: Core CI Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 20-core-ci-pipeline
**Areas discussed:** Workflow structure, Secret scanning, Failure reporting, Branch protection

---

## Workflow Structure

### Q1: How should the CI workflow files be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Single workflow | One ci.yml with parallel jobs (lint, typecheck, test, build). Simpler to manage, one status check per PR. | :heavy_check_mark: |
| Multiple workflows | Separate files per concern (ci-lint.yml, ci-test.yml, ci-build.yml). More granular control but more files. | |
| You decide | Claude picks the best approach. | |

**User's choice:** Single workflow
**Notes:** None

### Q2: What events should trigger the CI workflow?

| Option | Description | Selected |
|--------|-------------|----------|
| PR only | Runs on pull_request targeting main. Version-bump.yml already handles post-merge. | :heavy_check_mark: |
| PR + push to main | Also runs on push to main to catch post-merge issues. | |
| You decide | Claude picks. | |

**User's choice:** PR only
**Notes:** None

### Q3: Should the two timezone test runs be separate parallel jobs, or sequential in one job?

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel jobs | test-tz-sa and test-tz-de as separate jobs. Runs faster, clear failure attribution. | :heavy_check_mark: |
| Single job, sequential | One test job runs both. Simpler but slower. | |
| You decide | Claude picks. | |

**User's choice:** Parallel jobs
**Notes:** None

### Q4: Should pnpm dependencies be cached between CI runs?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pnpm store cache | Cache ~/.pnpm-store across runs. Saves ~30-60s per run. | :heavy_check_mark: |
| No caching yet | Keep simple for Phase 20, add in Phase 24. | |
| You decide | Claude picks. | |

**User's choice:** Yes, pnpm store cache
**Notes:** None

---

## Secret Scanning

### Q5: How should bundle-security.test.ts run in CI?

| Option | Description | Selected |
|--------|-------------|----------|
| Part of build job | Run after pnpm build in the build job. Already depends on .next/static existing. | :heavy_check_mark: |
| Dedicated security job | Separate job that depends on build artifacts. More visible but more complex. | |
| You decide | Claude picks. | |

**User's choice:** Part of build job
**Notes:** None

### Q6: Should CI add additional secret patterns beyond the existing 6?

| Option | Description | Selected |
|--------|-------------|----------|
| Current patterns sufficient | Existing 6 patterns cover all known secrets. | |
| Add Neon DB patterns | Also check for postgres:// connection strings and NEON_* env vars. | :heavy_check_mark: |
| You decide | Claude picks. | |

**User's choice:** Add Neon DB patterns
**Notes:** Neon Postgres is used for push notification subscriptions

---

## Failure Reporting

### Q7: How should CI failures be reported on PRs?

| Option | Description | Selected |
|--------|-------------|----------|
| Status checks only | Each job reports as a separate GitHub status check. Click to see logs. | :heavy_check_mark: |
| Status checks + PR annotations | Use problem matchers to annotate specific lines in PR diff. | |
| Status checks + PR comment summary | Post a comment summarizing all failures. | |
| You decide | Claude picks. | |

**User's choice:** Status checks only
**Notes:** None

### Q8: Should there be a verification step to guard against TZ job removal?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add a guard job | A ci-pass job that depends on both TZ jobs. Branch protection requires only this one job. | :heavy_check_mark: |
| No guard needed | Trust that both jobs exist. Branch protection lists each individually. | |
| You decide | Claude picks. | |

**User's choice:** Yes, add a guard job
**Notes:** None

---

## Branch Protection

### Q9: How should branch protection be configured?

| Option | Description | Selected |
|--------|-------------|----------|
| Require ci-pass job | Single required check covering everything. No admin bypass. | |
| Require each job individually | List all jobs as separate required checks. | |
| Manual setup later | Don't automate -- set up manually in GitHub settings after workflow works. | :heavy_check_mark: |
| You decide | Claude picks. | |

**User's choice:** Manual setup later
**Notes:** None

### Q10: Should CONTEXT.md document recommended branch protection settings?

| Option | Description | Selected |
|--------|-------------|----------|
| Document recommendations | Include recommended settings as reference for manual setup. | :heavy_check_mark: |
| Skip -- I know what to do | No documentation needed. | |
| You decide | Claude picks. | |

**User's choice:** Document recommendations
**Notes:** None

---

## Claude's Discretion

- Node.js version for CI runners
- pnpm/action-setup version and cache configuration details
- Whether to add `tsc --noEmit` as a new script or inline in workflow
- Ubuntu runner version

## Deferred Ideas

None -- discussion stayed within phase scope.
