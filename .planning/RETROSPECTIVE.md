# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.4 — Post-Release Fixes

**Shipped:** 2026-04-06
**Phases:** 8 | **Plans:** 17

### What Was Built
- Decimal precision pipeline fix (parseFloat, 0.05 rounding, configurable weight increments)
- Inline-edit tap-to-type for weight with roundOnBlur precision
- Food/Sodium card restructure (sodium top-right, description as title, merged history)
- AI-gated preset creation with substance auto-populate and long-press delete
- Neon DB + Vercel integration architecture documentation
- Water entry label resolution (preset:/substance: prefix handling)
- Weight default value fix (last recorded instead of hardcoded 70)
- Preset save-and-log UUID linkage (gap closure from milestone audit)

### What Worked
- **Rapid milestone execution**: 8 phases and 17 plans completed in a single day — the fastest milestone yet
- **Milestone audit caught real gaps**: The PRES-01 label linkage bug was caught by the audit and closed via Phase 39 before shipping
- **Quick-mode execution for small fixes**: Phases 37-38 were single-plan bug fixes that didn't need full plan/research ceremony
- **Phase insertion for emergent work**: Phases 36-39 were added dynamically as bugs were discovered during UAT — the process handled scope growth cleanly

### What Was Inefficient
- **Worktree executor incident** (Phase 33-03): A worktree executor accidentally deleted the Phase 32 directory, losing VERIFICATION.md and SUMMARY.md artifacts. Required git recovery (commit a883a82)
- **Missing verification artifacts**: Phases 34, 37 shipped without formal VERIFICATION.md — quick-mode execution skipped the step
- **Phase directory cleanup inconsistency**: Some phases have full on-disk artifacts, others only in git history — makes milestone completion stats gathering harder
- **REL-01 left partial**: The release-please fix required manual GitHub settings changes that couldn't be automated — should have been flagged as "manual action required" from the start rather than tracked as a code requirement

### Patterns Established
- **InlineEdit pattern**: Tap-to-type with roundOnBlur and type=text for decimal intermediate states — reusable for other numeric inputs
- **Discriminated union for merged lists**: `kind` field routing edits/deletes to correct mutations in multi-source history views
- **Long-press gesture pattern**: Pointer events + setTimeout + ref-based click prevention for destructive actions on touch
- **AI gate pattern**: Require AI lookup completion before enabling save buttons for data quality

### Key Lessons
1. **Milestone audits are worth the time**: The v1.4 audit caught a real integration gap (PRES-01 label linkage) that would have shipped broken without it
2. **Worktree executors need safeguards against directory deletion**: The Phase 32 directory loss was avoidable — need guardrails preventing worktree cleanup from touching shared directories
3. **parseInt vs parseFloat is a silent data destroyer**: The settings-helpers bug silently truncated all decimal values to 0 — validate numeric parsing functions with decimal inputs

### Cost Observations
- Model mix: ~80% opus, ~15% sonnet, ~5% haiku
- Sessions: ~5
- Notable: Entire milestone (8 phases, 17 plans) completed in one day — highest throughput milestone

---

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
| v1.3 | 5 | 12 | Deployment lifecycle, release automation |
| v1.4 | 8 | 17 | Bug fixes in one day, milestone audit gap closure, emergent phase insertion |

### Cumulative Quality

| Milestone | Unit Tests | E2E Tests | CI Jobs |
|-----------|-----------|-----------|---------|
| v1.0 | 203 + 6 migration | 0 | 0 |
| v1.1 | 203 + 6 migration | 0 | 0 |
| v1.2 | 203 + 6 migration | 22 | 12 |
| v1.3 | 393 | 22 | 12 |
| v1.4 | 393 | 22 | 12 |

### Top Lessons (Verified Across Milestones)

1. Research-first planning consistently prevents rework — every milestone where research was skipped had gap closure phases
2. Static analysis (schema parsing, config drift) is more reliable than runtime testing for infrastructure concerns
3. Single-plan gap closure phases are often unnecessary — inline fixes during execution are more efficient
4. Milestone audits catch cross-phase integration gaps that individual phase verification misses — verified in v1.2 and v1.4
