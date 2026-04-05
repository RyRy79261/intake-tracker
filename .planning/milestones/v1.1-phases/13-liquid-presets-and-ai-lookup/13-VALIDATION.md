---
phase: 13
slug: liquid-presets-and-ai-lookup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x + fake-indexeddb |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LIQD-02 | unit | `pnpm test -- src/stores/settings-store.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | LIQD-02 | build | `pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | LIQD-03 | unit | `pnpm test -- src/app/api/ai/*.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | LIQD-03 | build | `pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/stores/settings-store.test.ts` — preset CRUD test stubs for LIQD-02
- [ ] `src/app/api/ai/__tests__/` — AI route test stubs for Claude tool_use migration

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI lookup returns result for beverage name | LIQD-03 | Requires live Claude API key | Type "cortado" in AI lookup, verify per-100ml result appears |
| Presets persist across app restart | LIQD-02 | Requires browser localStorage | Add preset, refresh page, verify preset still shows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
