# Phase 23: Supply Chain Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 23-supply-chain-hardening
**Areas discussed:** Audit severity threshold, Existing vulnerability handling, Override mechanism, CI job structure, Audit scope, Config drift protection

---

## Audit Severity Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Critical + High only | Fail on critical and high severity vulns. Low/moderate in transitive deps are often noise with no actionable fix. | ✓ |
| All severities | Fail on any known vulnerability regardless of severity. Strictest posture, but may require frequent allowlisting. | |
| Critical only | Only fail on critical severity. Most permissive — catches the worst attacks but lets high-severity vulns through. | |

**User's choice:** Critical + High only
**Notes:** Keeps CI actionable without noise from low/moderate transitive dep issues.

---

## Existing Vulnerability Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Fix before merging | Run `pnpm audit` now, resolve any critical/high vulns as part of Phase 23. Gate is meaningful from day one. | ✓ |
| Allowlist existing, fix later | Add known existing vulns to an allowlist so the PR can merge. Create a backlog item to fix them. | |
| Audit in warn-only mode initially | Start with `pnpm audit` as a non-blocking warning in CI. Switch to blocking after existing vulns are addressed. | |

**User's choice:** Fix before merging
**Notes:** No allowlist drift. Audit gate is meaningful from day one.

---

## Override Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| No override — 24h is absolute | The 24h rule has no exceptions. A malicious takeover published as an "urgent patch" is exactly what you're guarding against. | ✓ |
| Document a manual override process | Keep the 24h rule in .npmrc but document how to temporarily bypass it for emergencies. | |
| Env var escape hatch | Add `SKIP_RELEASE_AGE=true` env var that CI can use to bypass the check. | |

**User's choice:** No override — 24h is absolute
**Notes:** Correct security posture. Manual pinning/patching sufficient for true emergencies.

---

## CI Job Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated job | New `supply-chain` job in ci.yml, added to ci-pass gate. Matches existing pattern. Clear failure attribution. | ✓ |
| Add to build job | Run `pnpm audit` after existing build + bundle security scan. Fewer jobs but mixes concerns. | |

**User's choice:** Dedicated job
**Notes:** Follows established Phase 20 pattern — each concern gets its own job.

---

## Audit Scope (prod vs all)

| Option | Description | Selected |
|--------|-------------|----------|
| All dependencies | Check prod + dev deps. Compromised devDeps can inject code into production bundle during build. | ✓ |
| Production only | Only check dependencies that ship to users. Fewer false positives but misses build-time attacks. | |

**User's choice:** All dependencies
**Notes:** Supply chain attacks often target build tooling (eslint plugins, bundlers, etc.).

---

## Config Drift Protection

| Option | Description | Selected |
|--------|-------------|----------|
| Simple grep check | CI step greps .npmrc for the 3 required settings. Fails with actionable error if any missing. | ✓ |
| Trust code review | Rely on PR review to catch .npmrc changes. Simpler CI but risk of silent removal. | |
| Vitest test | Add test in src/__tests__/integrity/ that reads .npmrc and asserts required keys. Follows Phase 21 pattern. | |

**User's choice:** Simple grep check
**Notes:** Cheap insurance against accidental removal. Inline CI step, not a separate test file.

---

## Claude's Discretion

- Exact `pnpm audit` CLI flags for severity filtering
- Order of steps within the supply-chain CI job
- Whether config drift check is shell script step or separate test file
- Exact `.npmrc` syntax for pnpm 10.x security settings

## Deferred Ideas

None — discussion stayed within phase scope.
