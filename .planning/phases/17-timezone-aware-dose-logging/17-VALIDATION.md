---
phase: 17
slug: timezone-aware-dose-logging
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Quick run command** | `pnpm test -- --run src/lib/dose-schedule-service.test.ts src/lib/timezone.test.ts` |
| **Full suite command** | `pnpm test -- --run && pnpm test:e2e` |
| **Estimated runtime** | ~15 seconds (unit) / ~60 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run src/lib/dose-schedule-service.test.ts src/lib/timezone.test.ts`
- **After every plan wave:** Run `pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated during planning* | | | TMZN-01 | unit + integration | `pnpm test -- --run` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing `src/lib/dose-schedule-service.test.ts` covers base schedule generation
- Existing `src/lib/dose-log-service.test.ts` covers dose log mutations
- Existing `src/lib/timezone.test.ts` covers UTC<->local conversion

*Existing infrastructure covers base requirements. New timezone-specific test cases will be added as part of implementation tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timezone change dialog appearance | TMZN-01 | Requires device timezone change simulation in browser | Change system timezone from Africa/Johannesburg to Europe/Berlin, reopen app, verify dialog appears |
| Push notification re-sync after TZ change | TMZN-01 | Requires push subscription and server interaction | Confirm timezone change, verify push schedule sync triggers via network tab |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
