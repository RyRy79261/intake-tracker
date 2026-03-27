---
phase: 19
slug: ai-substance-lookup-enhancement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm lint && pnpm build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test && pnpm lint`
- **After every plan wave:** Run `pnpm test && pnpm lint && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | LIQD-03-gap | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts` | No -- Wave 0 | pending |
| 19-01-02 | 01 | 1 | LIQD-04-gap | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts` | No -- Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/ai/substance-lookup/route.test.ts` — unit tests for Zod schema validation (waterContentPercent accepted, rejected on out-of-range, rejected when missing)
- [ ] Export Zod schema and tool definition for testability (currently module-scoped const)

*Note: Testing the actual Claude API call is not feasible in unit tests (requires API key, non-deterministic). Schema validation tests are the appropriate unit test boundary.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Beer lookup returns waterContentPercent ~93 | SC-3 | Requires live Claude API call with non-deterministic output | Call `/api/ai/substance-lookup` with `{query: "beer", type: "alcohol"}`, verify response `waterContentPercent` is between 88-97 |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
