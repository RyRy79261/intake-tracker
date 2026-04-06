---
phase: 33
slug: weight-direct-input
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-06
updated: 2026-04-06
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + playwright (e2e) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:e2e` |
| **Estimated runtime** | ~5 seconds (unit) + ~30 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|------|--------|
| 33-01-01 | 01 | 1 | WGT-01 | T-33-01 | parseFloat+isNaN+clamp in handleBlur reverts invalid input | unit | `pnpm test -- src/components/ui/__tests__/inline-edit.test.ts` | `src/components/ui/__tests__/inline-edit.test.ts` | green |
| 33-01-02 | 01 | 1 | WGT-01 | — | handleFocus seeds editValue using formatDisplay(value) | unit | `pnpm test -- src/components/ui/__tests__/inline-edit.test.ts` | `src/components/ui/__tests__/inline-edit.test.ts` | green |
| 33-02-01 | 02 | 1 | WGT-01 | T-33-03 | E2E: tap weight input, type 71.35, blur, submit, toast | e2e | `pnpm test:e2e` | `e2e/dashboard.spec.ts` | green |
| 33-03-01 | 03 | 1 | WGT-01 | — | Editing indicator: isEditing adds border-b-2 border-current class | unit | `pnpm test -- src/components/ui/__tests__/inline-edit.test.ts` | `src/components/ui/__tests__/inline-edit.test.ts` | green |
| 33-03-02 | 03 | 1 | WGT-01 | — | Format preservation: focusing 69.00 shows "69.00" not "69" | unit | `pnpm test -- src/components/ui/__tests__/inline-edit.test.ts` | `src/components/ui/__tests__/inline-edit.test.ts` | green |
| 33-03-03 | 03 | 1 | WGT-01 | — | Intermediate decimal: "69." shows "69." not "--" during editing | unit | `pnpm test -- src/components/ui/__tests__/inline-edit.test.ts` | `src/components/ui/__tests__/inline-edit.test.ts` | green |
| 33-04-01 | 04 | 1 | WGT-01 | — | E2E test restored for weight direct keyboard entry | e2e | `pnpm test:e2e` | `e2e/dashboard.spec.ts` | green |

*Status: green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or configuration needed.

- Vitest already configured for unit tests (node environment, `src/**/*.test.ts` glob)
- Playwright already configured for E2E tests with dev server auto-start
- Existing `e2e/dashboard.spec.ts` has weight card test pattern extended in Plan 02/04

---

## Unit Test Coverage Notes

The vitest config uses `environment: "node"` with no jsdom/DOM environment.
InlineEdit unit tests (`src/components/ui/__tests__/inline-edit.test.ts`) are written as
pure logic tests that model the component's state-machine handlers directly, without
requiring React mounting. This is valid because all testable behaviors (handleFocus,
handleBlur, display ternary, editing indicator condition) are expressible as pure
function logic.

**Tests not covered by unit tests (require E2E / manual):**
- DOM focus actually moves to sr-only input on label click (E2E)
- Enter key triggers blur and value commit (E2E / manual)
- Numeric keyboard appears on mobile (manual — cannot verify keyboard type in Playwright)
- No visual transition on tap (manual — visual regression needs human eye)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Numeric keyboard appears on mobile | WGT-01 | Cannot verify keyboard type in Playwright | Test on physical mobile device: tap weight value, verify decimal numeric keyboard |
| No visual transition on tap | WGT-01 | Visual regression needs human eye | Compare screenshots: before tap vs during input — must look identical except cursor |

---

## Validation Sign-Off

- [x] All tasks have automated verify command
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 35s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-06 (gsd-nyquist-auditor)

---

## Validation Audit 2026-04-06

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |
