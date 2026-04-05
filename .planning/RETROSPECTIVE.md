# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — CI & Data Integrity

**Shipped:** 2026-04-04
**Phases:** 7 | **Plans:** 16 | **Tasks:** 30

### What Was Built
- 12-job GitHub Actions CI pipeline with parallel jobs, path-based gating, build caching, and skip-aware merge gate
- Data integrity protection: static schema parser, backup round-trip verification across all 16 tables, three-way table sync enforcement
- 22 Playwright E2E tests across 5 route-mirrored spec files covering auth, dashboard, medications, analytics, and settings
- Supply chain hardening: pnpm security config (24h package age, trust policy, exotic subdep blocking), automated audit in CI
- Performance benchmarking: migration chain + backup round-trip baselines with committed JSON and CI comparison
- Delta coverage reports per PR via vitest-coverage-report-action

### What Worked
- Wave-based parallel execution kept phase completion fast (~3-13 min per plan)
- Research-first planning (RESEARCH.md → CONTEXT.md → PLAN.md) prevented architectural rework
- Gap closure pattern (VERIFICATION.md → gap plans → `--gaps-only` execution) is an effective feedback loop
- Static analysis approaches (schema parser, config drift checks) are more reliable than runtime-dependent tests
- Route-mirrored E2E spec naming makes test ownership obvious

### What Was Inefficient
- Phase 26 gap closure (Plan 04) was created from UAT that tested uncommitted working-directory state — the committed code was never broken, wasting a full plan cycle
- Verification sometimes identified "gaps" based on research recommendations that didn't apply (e.g., `__privyE2E` bridge that never existed in committed code)
- pnpm audit `--ignore` flags required manual workarounds due to pnpm 10.30 not reading auditConfig.ignoreCves from config
- Phase 25 was entirely gap closure for Phase 24 defects — tighter integration testing within phases would reduce post-hoc fix phases

### Patterns Established
- `#section-{name}` ID scoping pattern for card-specific E2E interactions
- Route-mirrored spec file naming: spec files match app routes (dashboard.spec.ts for /, medications.spec.ts for /medications)
- Non-null assertion pattern for array index accesses in tests (concise + type-safe)
- Unconditional CI jobs for critical paths (data integrity runs on every PR regardless of changed files)
- Navigate to /analytics not /history in E2E tests (redirect pitfall)

### Key Lessons
1. Always verify against committed code, not working-directory state — UAT and verification must use `git show HEAD:file` for source of truth
2. pnpm security features are powerful but have CLI/config inconsistencies — always verify that config settings are actually read at runtime
3. Path-filter gating is sufficient at current scale; dynamic test selection adds complexity for marginal gain
4. Privy iframe OTP is the only reliable E2E auth approach — server-side token methods fail due to Dashboard origin restrictions
5. Gap closure phases should be avoided by running verification inline during execution rather than as a separate post-execution step

### Cost Observations
- Model mix: ~70% opus (execution), ~25% sonnet (verification, research), ~5% haiku (quick checks)
- Timeline: 8 days (2026-03-27 → 2026-04-04)
- Notable: Plans averaged ~5 min execution time; gap closure plans often needed 0 code changes

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 11 | 44 | Established GSD workflow, parallel execution |
| v1.1 | 8 | 16 | Refined discuss→plan→execute cycle, composable architecture |
| v1.2 | 7 | 16 | Gap closure pattern, milestone audits, verification feedback loops |

### Cumulative Quality

| Milestone | Unit Tests | E2E Tests | CI Jobs |
|-----------|-----------|-----------|---------|
| v1.0 | 203 + 6 migration | 0 | 0 |
| v1.1 | 203 + 6 migration | 0 | 0 |
| v1.2 | 203 + 6 migration | 22 | 12 |

### Top Lessons (Verified Across Milestones)

1. Research-first planning consistently prevents rework — every milestone where research was skipped had gap closure phases
2. Static analysis (schema parsing, config drift) is more reliable than runtime testing for infrastructure concerns
3. Single-plan gap closure phases are often unnecessary — inline fixes during execution are more efficient
