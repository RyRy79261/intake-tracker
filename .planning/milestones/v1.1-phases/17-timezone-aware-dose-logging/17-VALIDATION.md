---
phase: 17
slug: timezone-aware-dose-logging
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via pnpm test) / Playwright (via pnpm test:e2e) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `pnpm vitest run src/lib/timezone.test.ts src/lib/timezone-recalculation-service.test.ts src/hooks/use-timezone-detection.test.ts` |
| **Full suite command** | `pnpm vitest run && pnpm test:e2e` |
| **Estimated runtime** | ~15 seconds (unit) / ~60 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/lib/timezone.test.ts src/lib/timezone-recalculation-service.test.ts src/hooks/use-timezone-detection.test.ts`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-T1 | 01 | 1 | TMZN-01 | unit | `pnpm vitest run src/lib/timezone.test.ts --reporter=verbose` | src/lib/timezone.test.ts | ⬜ pending |
| 17-01-T2 | 01 | 1 | TMZN-01 | unit + integration | `pnpm vitest run src/lib/timezone-recalculation-service.test.ts src/lib/dose-schedule-service.test.ts --reporter=verbose` | src/lib/timezone-recalculation-service.test.ts | ⬜ pending |
| 17-02-T1 | 02 | 2 | TMZN-01 | unit + build | `pnpm vitest run src/hooks/use-timezone-detection.test.ts --reporter=verbose && pnpm build` | src/hooks/use-timezone-detection.test.ts | ⬜ pending |
| 17-02-T2 | 02 | 2 | TMZN-01 | build | `pnpm build` | src/app/providers.tsx | ⬜ pending |
| 17-02-T3 | 02 | 2 | TMZN-01 | checkpoint | Manual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing `src/lib/dose-schedule-service.test.ts` covers base schedule generation
- Existing `src/lib/dose-log-service.test.ts` covers dose log mutations
- No existing `src/lib/timezone.test.ts` -- created by Plan 01 Task 1

*New test files are created as part of implementation tasks (Plan 01 Task 1 creates timezone.test.ts, Plan 01 Task 2 creates timezone-recalculation-service.test.ts, Plan 02 Task 1 creates use-timezone-detection.test.ts).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timezone change dialog appearance | TMZN-01 | Requires device timezone change simulation in browser | Change system timezone from Africa/Johannesburg to Europe/Berlin, reopen app, verify dialog appears |
| Push notification re-sync after TZ change | TMZN-01 | Requires push subscription and server interaction | Confirm timezone change, verify push schedule sync triggers via network tab |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
