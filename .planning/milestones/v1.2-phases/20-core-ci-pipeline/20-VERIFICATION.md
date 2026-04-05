---
phase: 20-core-ci-pipeline
verified: 2026-03-28T09:50:00Z
status: human_needed
score: 3/4 success criteria verified
re_verification: false
human_verification:
  - test: "Open a PR to main with a TypeScript error or failing test and confirm the PR cannot be merged"
    expected: "GitHub shows ci-pass as a failing required status check; the Merge button is blocked"
    why_human: "Branch protection must be manually configured in GitHub repo settings; cannot verify programmatically that ci-pass is enforced as required check"
---

# Phase 20: Core CI Pipeline Verification Report

**Phase Goal:** Every PR automatically validates code quality, type safety, build success, and test correctness across both deployment timezones
**Verified:** 2026-03-28T09:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening a PR triggers parallel CI jobs for linting, type checking, and unit tests — each reports pass/fail independently | VERIFIED | `.github/workflows/ci.yml` defines 5 independent jobs (lint, typecheck, test-tz-sa, test-tz-de, build) with no `needs:` between them; each reports its own GitHub status check |
| 2 | CI builds the production bundle and verifies no secrets (API keys, tokens) leak into the client-side JavaScript | VERIFIED | `build` job runs `pnpm build` then `pnpm exec vitest run src/__tests__/bundle-security.test.ts` sequentially; bundle-security.test.ts contains Anthropic key, Privy, Postgres connection string, NEON_DATABASE_URL, and NEON_API_KEY checks |
| 3 | Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin, and a timezone-sensitive test fails if either pass is skipped | VERIFIED | Separate `test-tz-sa` job runs `pnpm test:tz:sa` and `test-tz-de` job runs `pnpm test:tz:de`; both are listed in `ci-pass needs`; if either is skipped ci-pass fails (due to `if: always()` + explicit result checks) |
| 4 | A PR with a TypeScript error, lint violation, or failing test cannot be merged (branch protection enforced) | NEEDS HUMAN | ci-pass gate is correctly implemented in the workflow. However, branch protection in GitHub repo settings must be manually configured to require `ci-pass` as a status check — this cannot be verified programmatically |

**Score:** 3/4 success criteria verified (4th requires human verification of GitHub branch protection settings)

---

### Required Artifacts

| Artifact | Expected | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|----------|----------|-----------------|----------------------|----------------|--------|
| `.github/workflows/ci.yml` | Complete CI pipeline workflow | Yes (87 lines) | Yes — 6 jobs, 87 lines, no stubs | Yes — triggered on PR to main | VERIFIED |
| `package.json` | typecheck script | Yes | Yes — `"typecheck": "tsc --noEmit"` at line 16 | Yes — referenced in ci.yml `pnpm typecheck` | VERIFIED |
| `src/__tests__/bundle-security.test.ts` | Neon DB pattern scanning | Yes (67 lines) | Yes — contains `postgres(ql)?:\/\/`, `NEON_DATABASE_URL`, `NEON_API_KEY` | Yes — invoked in build job of ci.yml | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ci.yml lint job | `pnpm lint` | `run` step | WIRED | Line 18: `run: pnpm lint` |
| ci.yml typecheck job | `pnpm typecheck` | `run` step | WIRED | Line 30: `run: pnpm typecheck` |
| ci.yml test-tz-sa job | `pnpm test:tz:sa` | `run` step | WIRED | Line 43: `run: pnpm test:tz:sa` |
| ci.yml test-tz-de job | `pnpm test:tz:de` | `run` step | WIRED | Line 55: `run: pnpm test:tz:de` |
| ci.yml build job | `pnpm build` + bundle security | sequential `run` steps | WIRED | Lines 69–71: `pnpm build` then `pnpm exec vitest run src/__tests__/bundle-security.test.ts` |
| ci.yml ci-pass job | all 5 jobs | `needs` + explicit result checks | WIRED | Line 75: `needs: [lint, typecheck, test-tz-sa, test-tz-de, build]`; lines 80–84 check each `needs.X.result` individually |
| package.json typecheck | `tsc --noEmit` | script value | WIRED | `"typecheck": "tsc --noEmit"` |

---

### Data-Flow Trace (Level 4)

Not applicable — phase produces infrastructure/config artifacts (workflow YAML, test file, package.json scripts), not components that render dynamic data.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `tsc --noEmit` exits 0 (zero TS errors) | `npx tsc --noEmit; echo "EXIT:$?"` | `EXIT:0` (no output, no errors) | PASS |
| All 300 unit tests pass | `pnpm test` | `28 passed (28), Tests 300 passed (300)` | PASS |
| CI YAML is syntactically valid | `python3 -c "import yaml; yaml.safe_load(open('ci.yml'))"` | `PASS: valid YAML` | PASS |
| All 5 CI commands present in ci.yml | `grep -c "pnpm lint\|pnpm typecheck\|..."` | `5` | PASS |
| All required scripts in package.json | Node.js inspection of scripts object | lint, typecheck, test:tz:sa, test:tz:de all defined | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CIPL-01 | 20-01-PLAN, 20-02-PLAN | GitHub Actions workflow runs ESLint, TypeScript check, and Vitest unit tests as parallel jobs on every PR | SATISFIED | ci.yml has lint, typecheck, test-tz-sa, test-tz-de jobs; all parallel (no cross-job `needs:`); triggered on `pull_request` to `main` |
| CIPL-02 | 20-01-PLAN, 20-02-PLAN | CI runs `pnpm build` and verifies no secrets in the client bundle | SATISFIED | build job: `pnpm build` then `pnpm exec vitest run src/__tests__/bundle-security.test.ts`; security test checks Anthropic keys, Privy secrets, Postgres URLs, Neon env vars |
| CIPL-03 | 20-02-PLAN | Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin in CI | SATISFIED | test-tz-sa runs `pnpm test:tz:sa` (TZ=Africa/Johannesburg vitest run); test-tz-de runs `pnpm test:tz:de` (TZ=Europe/Berlin vitest run); both gated by ci-pass |

All 3 CIPL requirements verified. No orphaned requirements found — REQUIREMENTS.md shows CIPL-01, CIPL-02, CIPL-03 all mapped to Phase 20, all claimed by plans 20-01 and 20-02.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None detected | — | — | — |

Additional anti-pattern checks performed:

- No `TODO`, `FIXME`, or placeholder comments in any phase-modified file
- No wildcard `needs.*.result` in ci-pass gate (uses explicit per-job checks, avoiding GitHub Actions runner bug #1540)
- No `version:` input on `pnpm/action-setup@v5` (reads `packageManager` from `package.json` correctly)
- No dual-caching: only `cache: 'pnpm'` on `actions/setup-node@v4`, no `actions/cache` step
- No optional chaining on `result.data?.` in `round-trip.test.ts` (removed; ServiceResult narrowing applied)
- No `result.data?.success` checks remain (replaced by `expect(result.success).toBe(true)` + throw guard)

---

### Human Verification Required

#### 1. Branch Protection Enforcement

**Test:** In GitHub repo settings for `intake-tracker`, navigate to Settings > Branches > Branch protection rules for `main`. Verify:
- `ci-pass` is listed as a required status check
- "Require branches to be up to date before merging" is enabled
- "Do not allow bypassing required checks" is enabled
- Force pushes and branch deletion are disabled

Then open a test PR that has a deliberate TypeScript error or failing test and confirm the Merge button is blocked.

**Expected:** The Merge button is greyed out or disabled; GitHub shows `ci-pass` as a required failing check.

**Why human:** GitHub branch protection settings are repository-level admin configuration. They cannot be inspected or modified via the codebase or CLI without `gh api` calls requiring repo admin credentials. The workflow itself is correctly implemented — the enforcement layer depends on settings outside the codebase.

---

### Implementation Quality Notes

The ci-pass gate correctly uses `if: always()` to prevent the "skipped = passing" pitfall (GitHub treats a skipped job as not failing a required status check). The explicit per-job result checks (`needs.lint.result`, `needs.typecheck.result`, etc.) correctly avoid the wildcard `needs.*.result` bug documented in GitHub Actions runner issue #1540. These are non-obvious correctness properties that the implementation gets right.

Both SUMMARY commits are present in git history: `a0eba41` (TypeScript fixes), `10ce94e` (typecheck script + Neon patterns), `7a207a0` (CI workflow).

---

_Verified: 2026-03-28T09:50:00Z_
_Verifier: Claude (gsd-verifier)_
