# Phase 25: CI Integration Fixes - Research

**Researched:** 2026-03-28
**Domain:** CI pipeline defect resolution (TypeScript, Vitest benchmarks, GitHub Actions)
**Confidence:** HIGH

## Summary

Phase 25 fixes three specific integration defects identified in the v1.2 milestone audit. All three are well-scoped, mechanically simple changes with clear verification criteria.

**DEFECT-01 (critical):** `pnpm typecheck` fails with 4 errors because `tsconfig.json` has no `target` field (defaults to ES3). Two integrity test files use ES2018+ regex `s` flag and ES2015+ Set spread. Adding `"target": "ES2020"` resolves all 4 errors. Next.js handles its own transpilation via SWC, so this change only affects `tsc --noEmit` type checking.

**DEFECT-02 (warning):** `benchmarks/results.json` contains worktree-absolute filepaths. Source code analysis of vitest 4.0.18 reveals that `--compare` uses a `flattenFormattedBenchmarkReport` function that keys on benchmark `id`, NOT `filepath`. The `id` is generated from a hash of the relative path (via `generateFileHash(relative(root, filepath), projectName)`), so comparison works correctly despite absolute path mismatch. However, the file should still be regenerated for cleanliness and to prevent confusion in future audits.

**DEFECT-03 (minor):** The supply-chain drift check loop in `ci.yml` verifies 3 of 4 security settings (missing `auditLevel`). Single token addition to the `for setting in` list.

**Primary recommendation:** All three fixes are independent single-file changes that can be executed in one plan with per-fix verification.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Add `"target": "ES2020"` to `tsconfig.json` `compilerOptions`
- D-02: ES2020 chosen over ES2022/ESNext as minimum needed; Next.js handles browser transpilation separately
- D-03: Regenerate `benchmarks/results.json` from clean (non-worktree) environment
- D-04: No CI guard or path-stripping script needed for benchmarks -- simple regeneration sufficient
- D-05: Add `auditLevel` to the `for setting in` loop in supply-chain CI job (line 164 of ci.yml)

### Claude's Discretion
- Exact approach to regenerating benchmark baselines (vitest bench command, working directory)
- Whether to verify all 3 fixes with a local `pnpm typecheck` / `pnpm bench:ci` run before committing

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CIPL-01 | GitHub Actions workflow runs ESLint, TypeScript check, and Vitest unit tests as parallel jobs on every PR | DEFECT-01 fix (tsconfig target) restores typecheck CI job to passing state |
| CIPL-03 | Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin in CI | DEFECT-01 fix unblocks the ci-pass gate that validates all jobs including TZ test jobs |
| BNCH-01 | Vitest bench establishes performance baselines for critical paths | DEFECT-02 fix (regenerate results.json) ensures clean baselines with correct paths |
| SCHN-04 | pnpm audit runs in CI and fails on known vulnerabilities | DEFECT-03 fix (add auditLevel to drift check) completes supply chain setting verification |
</phase_requirements>

## Standard Stack

No new packages needed. All fixes modify existing configuration and data files.

### Core (Already Installed)
| Library | Version | Purpose | Relevant To |
|---------|---------|---------|-------------|
| typescript | 5.9.3 | Type checking via `tsc --noEmit` | DEFECT-01 |
| vitest | 4.0.18 | Benchmark runner with `--compare` and `--outputJson` | DEFECT-02 |
| fake-indexeddb | 6.2.5 | IDB polyfill for bench files | DEFECT-02 (bench regeneration) |

## Architecture Patterns

### Files to Modify

```
tsconfig.json              # Add "target": "ES2020" (DEFECT-01)
.github/workflows/ci.yml   # Add auditLevel to drift check loop (DEFECT-03)
benchmarks/results.json    # Regenerate with pnpm bench:ci (DEFECT-02)
```

### Pattern: tsconfig.json target field

The `target` field in `tsconfig.json` controls what JavaScript syntax `tsc` accepts during type checking. When omitted, it defaults to `"ES3"`, which rejects modern syntax like:
- ES2018 regex flags (`/pattern/s` - dotAll)
- ES2015 Set/Map iteration spread (`[...mySet]`)

**Key insight:** In a Next.js project, `target` in `tsconfig.json` does NOT affect the compiled output. Next.js uses SWC for transpilation, which has its own target configuration. The `tsconfig.json` target only affects `tsc --noEmit` type checking.

Current `tsconfig.json` has `"lib": ["dom", "dom.iterable", "esnext"]` which defines available type definitions, but `target` controls what emit-level syntax `tsc` considers valid. These are independent settings.

### Pattern: Vitest Benchmark ID Generation (verified from source)

Vitest 4.0.18 benchmark comparison mechanics (traced through source code):

1. `generateFileHash(relative(root, filepath), projectName)` creates a numeric hash from the **relative** path
2. `calculateSuiteHash` creates child IDs as `${parent.id}_${suite_idx}`
3. Individual bench IDs: `${suite_id}_${bench_idx}`
4. `flattenFormattedBenchmarkReport()` creates a flat map keyed by `id`
5. `renderTable()` looks up baseline via `options.compare?.[task.id]`

Result: The `filepath` field in `results.json` is cosmetic. Comparison matches on `id` which is derived from relative paths. The worktree-absolute paths do NOT break comparison, but regeneration is still warranted for cleanliness.

### Pattern: Supply Chain Drift Check

The CI drift check uses a bash `for` loop to grep `pnpm-workspace.yaml` for required settings:

```yaml
for setting in minimumReleaseAge trustPolicy blockExoticSubdeps; do
```

`pnpm-workspace.yaml` has 4 security settings: `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`, and `auditLevel`. The loop currently checks only 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path stripping for benchmark JSON | Custom script to rewrite filepaths | Regenerate via `pnpm bench:ci` | Regeneration is simpler, produces correct data, and is the canonical approach |
| TypeScript flag fixes per-file | `// @ts-ignore` or `@ts-expect-error` on each line | Set `target: ES2020` globally | Global fix is cleaner and prevents same issue with future files |

## Common Pitfalls

### Pitfall 1: Benchmark Regeneration Takes Time
**What goes wrong:** `pnpm bench:ci` runs actual benchmarks (2+ seconds per bench with warmup), so execution takes 30-60 seconds.
**Why it happens:** Vitest bench runs real performance measurements with configured `time: 2000` and warmup iterations.
**How to avoid:** Run `pnpm bench:ci` with `--run` flag already included in the script definition. Expect 30-60 seconds for completion.
**Warning signs:** If benchmarks hang, check that `fake-indexeddb/auto` import is present (bench files skip vitest `setupFiles`).

### Pitfall 2: Benchmark Regeneration in Wrong Directory
**What goes wrong:** If `pnpm bench:ci` is run from a worktree or symlinked directory, `filepath` in output will contain that path.
**Why it happens:** Vitest records `filepath` as the absolute path to each bench file.
**How to avoid:** Run from the main repo checkout at `/home/ryan/repos/Personal/intake-tracker`, NOT from any worktree under `.claude/worktrees/`.
**Warning signs:** Check `filepath` values in generated `benchmarks/results.json` -- they should start with the main repo root.

### Pitfall 3: TypeScript target vs lib Confusion
**What goes wrong:** Developers confuse `target` (what syntax tsc accepts) with `lib` (what type definitions are available).
**Why it happens:** Both control "what JavaScript features can I use" but in different ways.
**How to avoid:** `target` = emit syntax level (affects syntax validation), `lib` = available type declarations (affects what APIs exist in types). Both are needed: `lib: ["esnext"]` gives you Set/Map types, but `target: "ES2020"` lets you use spread/iteration syntax on them.

### Pitfall 4: auditLevel Placement in ci.yml Loop
**What goes wrong:** Adding `auditLevel` after the semicolon closing the loop instead of inside the `for ... in` list.
**Why it happens:** Bash `for ... in` syntax requires all items before the semicolon.
**How to avoid:** Add `auditLevel` as the 4th space-separated item: `for setting in minimumReleaseAge trustPolicy blockExoticSubdeps auditLevel; do`

## Code Examples

### DEFECT-01: tsconfig.json Fix

```jsonc
// tsconfig.json - add "target" to compilerOptions
{
  "compilerOptions": {
    "target": "ES2020",  // ADD THIS LINE
    "lib": ["dom", "dom.iterable", "esnext"],
    // ... rest unchanged
  }
}
```

**Verification:**
```bash
pnpm typecheck  # Should exit 0 with zero errors
```

### DEFECT-02: Benchmark Baseline Regeneration

```bash
# Run from main repo root (NOT a worktree)
cd /home/ryan/repos/Personal/intake-tracker
pnpm bench:ci
# This runs: vitest bench --outputJson benchmarks/results.json
```

**Verification:**
```bash
# Check filepaths are clean (not worktree paths)
grep '"filepath"' benchmarks/results.json
# Should show: /home/ryan/repos/Personal/intake-tracker/src/__tests__/bench/...
# (or ideally a CI-compatible relative path, but absolute from main repo is acceptable)
```

### DEFECT-03: ci.yml Supply Chain Fix

```yaml
# .github/workflows/ci.yml line 164 - add auditLevel
for setting in minimumReleaseAge trustPolicy blockExoticSubdeps auditLevel; do
```

**Verification:**
```bash
# Check that all 4 settings are in the loop
grep "for setting in" .github/workflows/ci.yml
# Should show: for setting in minimumReleaseAge trustPolicy blockExoticSubdeps auditLevel; do

# Verify all 4 settings exist in pnpm-workspace.yaml
for s in minimumReleaseAge trustPolicy blockExoticSubdeps auditLevel; do
  grep -q "^${s}:" pnpm-workspace.yaml && echo "OK: $s" || echo "MISSING: $s"
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsconfig default target (ES3) | Explicit `target: ES2020` | Phase 25 | Enables modern syntax in type checking |
| 3-setting drift check | 4-setting drift check | Phase 25 | Complete supply chain verification |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 + TypeScript 5.9.3 |
| Config file | `vitest.config.ts` (unit tests), `tsconfig.json` (type checking) |
| Quick run command | `pnpm typecheck` |
| Full suite command | `pnpm typecheck && pnpm bench --run --compare benchmarks/results.json` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CIPL-01 | TypeScript check passes | smoke | `pnpm typecheck` | N/A (uses tsc directly) |
| CIPL-03 | TZ tests pass (blocked by ci-pass gate) | smoke | `pnpm test:tz:sa && pnpm test:tz:de` | N/A (existing tests) |
| BNCH-01 | Benchmark comparison works with clean paths | smoke | `pnpm bench --run --compare benchmarks/results.json` | N/A (uses vitest bench directly) |
| SCHN-04 | Drift check covers all 4 settings | manual-only | Visual inspection of ci.yml grep loop | N/A (CI config, not testable locally) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck` (fast, confirms no regressions)
- **Per wave merge:** `pnpm typecheck && pnpm bench --run --compare benchmarks/results.json`
- **Phase gate:** All of the above + visual inspection of ci.yml drift check loop

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. No new test files needed.

## Environment Availability

Step 2.6: No new external dependencies. All tools already installed:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Package management | Yes | 10.30.2 | -- |
| tsc (typescript) | DEFECT-01 verification | Yes | 5.9.3 | -- |
| vitest | DEFECT-02 bench regeneration | Yes | 4.0.18 | -- |
| Node.js | Runtime | Yes | 20.x (CI) | -- |

## Open Questions

1. **Benchmark filepath format in regenerated JSON**
   - What we know: Vitest records absolute filepath in output JSON. IDs (used for comparison) are based on relative paths and will be stable.
   - What's unclear: Whether the absolute filepath in the regenerated JSON from the main repo root is "clean enough" or if we should pursue making it relative.
   - Recommendation: Accept absolute paths from main repo root. The IDs are relative-path-based, so comparison works. The audit's concern was worktree paths specifically. Planner has discretion per D-03/D-04.

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced; npm/yarn will fail)
- TypeScript check command: `pnpm typecheck` (runs `tsc --noEmit`)
- Bench command: `pnpm bench` / `pnpm bench:ci` (runs `vitest bench` with optional `--outputJson`)
- Never start the dev server -- let user run `pnpm dev` themselves
- No new npm packages needed for this phase

## Sources

### Primary (HIGH confidence)
- `tsconfig.json` -- current config verified (no `target` field, defaults to ES3)
- `tsc --noEmit` output -- 4 errors confirmed matching DEFECT-01 specification exactly
- `vitest` 4.0.18 source code (`node_modules/.pnpm/@vitest+runner@4.0.18/.../chunk-tasks.js`) -- traced ID generation through `generateHash`, `generateFileHash`, `calculateSuiteHash`
- `vitest` 4.0.18 source code (`node_modules/vitest/dist/chunks/index.C5r1PdPD.js`) -- traced `flattenFormattedBenchmarkReport` and `renderTable` to confirm comparison is ID-based, not filepath-based
- `benchmarks/results.json` -- confirmed worktree paths and benchmark IDs
- `.github/workflows/ci.yml` -- confirmed 3-setting loop at line 164
- `pnpm-workspace.yaml` -- confirmed all 4 settings present including `auditLevel: high`

### Secondary (MEDIUM confidence)
- Next.js documentation (training data) -- SWC handles transpilation independent of tsconfig target

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all verified installed
- Architecture: HIGH -- all three fixes traced to exact lines in source code
- Pitfalls: HIGH -- verified through actual command execution and source code reading
- Benchmark comparison mechanics: HIGH -- traced through vitest source code, not assumed

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable; all fixes are config/data changes, not library-dependent)
