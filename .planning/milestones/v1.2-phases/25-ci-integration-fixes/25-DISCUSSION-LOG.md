# Phase 25: CI Integration Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 25-ci-integration-fixes
**Areas discussed:** TypeScript target version, Benchmark path strategy

---

## TypeScript Target Version

| Option | Description | Selected |
|--------|-------------|----------|
| ES2020 (Recommended) | Audit recommendation. Covers regex 's' flag, Set spread, BigInt, optional chaining, nullish coalescing. Conservative choice that fixes all 4 errors. | ✓ |
| ES2022 | Adds top-level await, Object.hasOwn, Array.at(), error cause. More modern but still well-supported. | |
| ESNext | Always latest. Most permissive — no TS target errors possible. May mask issues outside Next.js build. | |

**User's choice:** ES2020 (Recommended)
**Notes:** Conservative approach — minimum needed to fix all errors. Next.js handles browser transpilation separately.

---

## Benchmark Path Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Regenerate only (Recommended) | Regenerate results.json from clean (non-worktree) env. Simple fix. | ✓ |
| Regenerate + CI guard | Regenerate AND add CI check that greps for absolute paths. Prevents recurrence. | |
| Strip paths in bench script | Post-bench script that normalizes paths to relative. Fixes at source. | |

**User's choice:** Regenerate only (Recommended)
**Notes:** No extra guardrails needed. Simple regeneration is sufficient for a single-user project.

---

## Claude's Discretion

- Exact vitest bench regeneration command and working directory
- Whether to verify fixes locally before committing
- DEFECT-03 (drift check auditLevel) was not discussed — completely clear-cut single-token fix

## Deferred Ideas

None — discussion stayed within phase scope.
