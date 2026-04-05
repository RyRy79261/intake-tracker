# Phase 23: Supply Chain Hardening - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The project is protected against supply chain attacks through pnpm security configuration and automated vulnerability scanning in CI. Covers SCHN-01 (minimumReleaseAge), SCHN-02 (trustPolicy), SCHN-03 (blockExoticSubdeps), SCHN-04 (pnpm audit in CI).

</domain>

<decisions>
## Implementation Decisions

### Audit Severity Threshold (SCHN-04)
- **D-01:** `pnpm audit` fails CI on **critical and high** severity vulnerabilities only. Low/moderate in transitive deps are noise with no actionable fix — avoids CI being blocked by things the developer can't control.

### Existing Vulnerability Handling
- **D-02:** Any existing critical/high vulnerabilities must be **fixed before the Phase 23 PR merges**. The audit gate is meaningful from day one — no allowlists, no warn-only mode. Run `pnpm audit` during implementation and resolve any findings as part of the phase work.

### Override Mechanism
- **D-03:** The 24h `minimumReleaseAge` rule has **no override or escape hatch**. If a security patch drops, you wait 24h. A malicious takeover published as an "urgent patch" is exactly what this guards against. Manual pinning/patching is sufficient for true emergencies.

### CI Job Structure
- **D-04:** New dedicated `supply-chain` job in `ci.yml`, added to the `ci-pass` gate's `needs` list. Follows the established pattern from Phase 20 (lint, typecheck, test-tz-*, build, data-integrity, e2e each get their own job). Clear failure attribution.

### Audit Scope
- **D-05:** `pnpm audit` checks **all dependencies** (prod + dev). A compromised devDep (e.g., a malicious eslint plugin or build tool) can inject code into the production bundle during `pnpm build`. Supply chain attacks often target build tooling.

### Config Drift Protection
- **D-06:** A CI step in the `supply-chain` job greps `.npmrc` for the 3 required security settings (`minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`). Fails with an actionable error if any are missing. Cheap insurance against accidental removal.

### Claude's Discretion
- Exact `pnpm audit` CLI flags for severity filtering (e.g., `--audit-level`)
- Order of steps within the supply-chain CI job
- Whether config drift check is a shell script step or a separate test file
- Exact `.npmrc` setting values for `minimumReleaseAge` (1440 from requirements, but verify pnpm 10.x syntax)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### pnpm Configuration
- `.npmrc` — Current pnpm config (engine-strict, auto-install-peers). Security settings to be added here
- `package.json` — `packageManager: pnpm@10.30.2`, `preinstall` hook enforces pnpm

### CI Infrastructure
- `.github/workflows/ci.yml` — Current CI workflow with 7 parallel jobs + ci-pass gate. Add `supply-chain` job here
- `.planning/phases/20-core-ci-pipeline/20-CONTEXT.md` — Phase 20 decisions (job structure, ci-pass gate pattern)

### Requirements
- `.planning/REQUIREMENTS.md` — SCHN-01, SCHN-02, SCHN-03, SCHN-04 map to this phase

### Existing Security
- `src/__tests__/bundle-security.test.ts` — Existing bundle security scanner (separate concern, not modified by this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ci.yml`: Established job pattern (checkout → pnpm/action-setup → setup-node → install → run). New job follows identical setup steps
- `.npmrc`: Already committed with 3 settings — adding security settings is a natural extension
- `ci-pass` gate: Already checks all 7 jobs with explicit result checks. Adding `supply-chain` to needs + result check is mechanical

### Established Patterns
- All CI jobs use: `actions/checkout@v4`, `pnpm/action-setup@v5`, `actions/setup-node@v4` with Node 20 and pnpm cache
- `--frozen-lockfile` on all installs (already prevents lockfile tampering)
- Unconditional jobs (no path-filter gating) — Phase 21 established this for security-critical checks

### Integration Points
- `.npmrc` — add `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps` settings
- `ci.yml` — add `supply-chain` job + update `ci-pass` needs/result checks
- `pnpm-lock.yaml` — may be regenerated if `pnpm audit fix` resolves existing vulnerabilities

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-supply-chain-hardening*
*Context gathered: 2026-03-28*
