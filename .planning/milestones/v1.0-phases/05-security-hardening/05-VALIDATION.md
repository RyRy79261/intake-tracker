---
phase: 5
slug: security-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + Playwright E2E |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm build && pnpm vitest run && pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds (unit), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm build && pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | SECU-01 | unit | `pnpm vitest run src/__tests__/security.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 0 | SECU-01, SECU-03 | unit | `pnpm vitest run src/__tests__/auth-middleware.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 0 | SECU-02 | unit | `pnpm vitest run src/__tests__/encrypted-field.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 0 | SECU-02 | unit | `pnpm vitest run src/__tests__/backup-encryption.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | SECU-01 | build+grep | `pnpm build && ! grep -r "pplx-" .next/static/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/security.test.ts` — stubs for SECU-01 (settings migration, no client keys)
- [ ] `src/__tests__/auth-middleware.test.ts` — stubs for SECU-01c, SECU-03a, SECU-03b
- [ ] `src/__tests__/encrypted-field.test.ts` — stubs for SECU-02a
- [ ] `src/__tests__/backup-encryption.test.ts` — stubs for SECU-02b
- [ ] Build scan test for SECU-01a (bundle grep for API key strings)

*Vitest is already configured — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSP headers block inline scripts | SECU-01 | Browser-specific behavior | Open DevTools Network tab, verify CSP headers on response |
| PIN gate renders before app content | SECU-02 | Visual/UX check | Load app, verify PIN prompt appears before any data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
