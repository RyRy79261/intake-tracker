# Phase 25: CI Integration Fixes - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix 3 specific defects identified in the v1.2 milestone audit so all CI jobs pass on a clean PR. Covers: typecheck target fix (DEFECT-01), benchmark baseline regeneration (DEFECT-02), and supply chain drift check completion (DEFECT-03).

</domain>

<decisions>
## Implementation Decisions

### TypeScript Target (DEFECT-01)
- **D-01:** Add `"target": "ES2020"` to `tsconfig.json` `compilerOptions`. Fixes TS1501 (regex `s` flag) and TS2802 (Set iteration) errors in Phase 21 integrity tests
- **D-02:** ES2020 chosen over ES2022/ESNext as the minimum needed to resolve all 4 errors while remaining conservative. Next.js handles browser transpilation separately

### Benchmark Baselines (DEFECT-02)
- **D-03:** Regenerate `benchmarks/results.json` from a clean (non-worktree) environment to produce relative or repo-root-relative paths
- **D-04:** No CI guard or path-stripping script needed — simple regeneration is sufficient. If worktree paths recur, address then

### Supply Chain Drift Check (DEFECT-03)
- **D-05:** Add `auditLevel` to the `for setting in` loop in the supply-chain CI job (line 164 of ci.yml). Completes the 4-setting verification

### Claude's Discretion
- Exact approach to regenerating benchmark baselines (vitest bench command, working directory)
- Whether to verify all 3 fixes with a local `pnpm typecheck` / `pnpm bench:ci` run before committing

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Defect Specifications
- `.planning/v1.2-MILESTONE-AUDIT.md` — Defines DEFECT-01, DEFECT-02, DEFECT-03 with exact files, errors, and recommended fixes

### Files to Modify
- `tsconfig.json` — Add `"target": "ES2020"` to compilerOptions (DEFECT-01)
- `.github/workflows/ci.yml` §line 164 — Add `auditLevel` to drift check loop (DEFECT-03)
- `benchmarks/results.json` — Regenerate with clean paths (DEFECT-02)

### Files Causing Errors
- `src/__tests__/integrity/parse-schema.ts` — Uses ES2018+ regex `s` flag (line 30)
- `src/__tests__/integrity/table-sync.test.ts` — Uses regex `s` flag (line 26) and Set spread (lines 162, 170)

### Prior Phase Decisions
- `.planning/phases/24-ci-optimization-benchmarking/24-CONTEXT.md` — D-15: baseline JSON committed to `benchmarks/`; D-16: bench results in CI logs only

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tsconfig.json`: Existing config with no `target` field (defaults to ES3) — single field addition needed
- `ci.yml` supply-chain job: Existing `for setting in` loop at line 164 — single token addition
- `benchmarks/results.json`: Existing baseline with worktree-absolute paths — regeneration replaces file

### Established Patterns
- CI jobs are one-concern-per-job with explicit `ci-pass` gate checks
- Benchmark baselines use `vitest bench` with `--outputJson` to `benchmarks/results.json`
- Supply chain drift check reads `pnpm-workspace.yaml` and greps for required settings

### Integration Points
- `pnpm typecheck` (`tsc --noEmit`) is the unconditional typecheck CI job — must exit 0 after fix
- `vitest bench --compare benchmarks/results.json` runs in benchmark CI job — paths must match
- `ci-pass` gate already checks all jobs — no gate changes needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow the audit's recommended fixes directly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 25-ci-integration-fixes*
*Context gathered: 2026-03-28*
