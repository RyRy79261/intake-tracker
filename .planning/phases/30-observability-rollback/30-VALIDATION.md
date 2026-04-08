---
phase: 30
slug: observability-rollback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright E2E + manual file verification |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds (build), ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build` + verify file existence
- **Before `/gsd-verify-work`:** Full build must succeed, docs must exist
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | OBS-01 | — | N/A | validation | `grep "NEXT_PUBLIC_APP_VERSION" next.config.js` | ✅ | ⬜ pending |
| 30-01-02 | 01 | 1 | OBS-01 | — | N/A | validation | `grep "appVersion" src/components/about-dialog.tsx` | ✅ | ⬜ pending |
| 30-02-01 | 02 | 1 | OBS-02 | — | N/A | file-check | `test -f docs/ROLLBACK.md` | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 1 | OBS-02 | — | N/A | content-check | `grep -i "rollback" README.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework or stubs needed.*

- OBS-01 validation uses grep/file-read checks against existing source files
- OBS-02 validation uses file existence and content checks against new docs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Version in dialog matches package.json | OBS-01 | Requires running app + visual inspection | Open app → Settings → About App → verify version matches `package.json` |
| Rollback steps are accurate | OBS-02 | Requires Vercel dashboard access | Review each step against actual Vercel/Neon dashboard UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
