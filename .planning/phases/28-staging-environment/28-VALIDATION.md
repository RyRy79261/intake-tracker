---
phase: 28
slug: staging-environment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + playwright |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm lint && pnpm typecheck` |
| **Full suite command** | `pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm typecheck`
- **After every plan wave:** Run `pnpm build`
- **Before `/gsd-verify-work`:** Full build must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | STG-04 | — | PWA not loaded when VERCEL_ENV !== 'production' | build | `pnpm build` | ✅ | ⬜ pending |
| 28-01-02 | 01 | 1 | STG-04 | — | SW not registered on non-production env | build | `pnpm typecheck` | ✅ | ⬜ pending |
| 28-02-01 | 02 | 1 | STG-05 | T-28-01 | Safety guard prevents production branch deletion | file-check | `grep 'ABORT' .github/workflows/staging-db-reset.yml` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 1 | STG-02 | — | Reset workflow uses correct Neon action | file-check | `grep 'reset-branch-action' .github/workflows/staging-db-reset.yml` | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 1 | STG-01 | — | CI covers staging branch PRs | file-check | `grep 'staging' .github/workflows/ci.yml` | ✅ | ⬜ pending |
| 28-04-01 | 04 | 2 | STG-01, STG-03, STG-06 | — | Setup documentation complete | file-check | `test -f docs/staging-setup.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. No new test framework setup needed.
- Phase 28 is primarily infrastructure/config work — validation is via build success, file presence checks, and manual verification of deployed environment.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staging URL loads at `staging.intake-tracker.ryanjnoble.dev` | STG-01 | Requires live Vercel deployment | Push to staging branch, navigate to URL, verify page loads |
| Privy login works on staging | STG-06 | Requires live Privy + staging deployment | Log in via staging URL, confirm auth succeeds |
| Push notifications use staging Neon DB | STG-02 | Requires live Neon staging branch | Check staging Neon console for push_subscriptions table data |
| Service worker not registered on staging | STG-04 | Requires live deployment | Open staging URL DevTools > Application > Service Workers — should show "No service workers" |
| Neon staging branch reset works | STG-05 | Requires live Neon + GitHub Actions | Trigger workflow_dispatch, verify staging DB data matches production schema |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
