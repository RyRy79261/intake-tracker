---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Cloud Sync & Settings Overhaul
status: executing
stopped_at: Phase 41 plan 05 complete (commit c4ef51d — Playwright globalSetup + Neon branch CI); 41-06 (Human UAT) is the only remaining plan and requires human execution
last_updated: "2026-04-12T12:00:00.000Z"
last_activity: 2026-04-12
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 12
  completed_plans: 10
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Accurate, queryable health data across intake, vitals, and medication adherence -- structured for cross-domain analysis and future AI querying
**Current focus:** Phase 41 — neon-auth-privy-removal

## Current Position

Phase: 41 (neon-auth-privy-removal) — EXECUTING
Plan: 5 of 6 complete (41-06 is human UAT — cannot be completed autonomously)
Status: 41-05 landed cleanly (commit c4ef51d). Playwright E2E is now rewired to Neon Auth via globalSetup + storageState, and the CI e2e job provisions/deletes a per-run Neon branch around the suite. Human UAT is blocked on repo secrets (NEON_API_KEY, NEON_PROJECT_ID, NEON_AUTH_TEST_EMAIL, NEON_AUTH_TEST_PASSWORD, BETTER_AUTH_SECRET, NEON_AUTH_COOKIE_SECRET) and on a local `pnpm test:e2e` run against a real Neon branch.
Last activity: 2026-04-12

Progress: [████████░░] 83%

## Performance Metrics

**Velocity:**

- Total plans completed: 134 (44 v1.0 + 16 v1.1 + 16 v1.2 + 12 v1.3 + 12 v1.3-extra + 17 v1.4 + 3 v2.0)
- Average duration: ~5 min
- Total execution time: ~11 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 Roadmap]: Record-level LWW for v2.0, per-field LWW deferred to v2.x (SYNC-F01)
- [v2.0 Roadmap]: Custom sync engine over managed solutions (Dexie Cloud, PowerSync) -- full control, no vendor lock-in
- [v2.0 Roadmap]: Neon Auth over Auth.js -- colocated with DB, cookie-based sessions, no separate auth infra

### Pending Todos

- **Phase 41 plan 06 (Human UAT)** — blocking checkpoint. Requires the user to walk through 10 UAT scenarios in a live dev environment (email sign-in, Google OAuth, sign-up rejection, sign-out, PIN absence, push re-subscription, AI API, full `pnpm test:e2e`, and `pnpm build`/`lint`/`vitest`). Cannot be executed autonomously. See `.planning/phases/41-neon-auth-privy-removal/41-06-PLAN.md`.
- Before the UAT: run `pnpm db:truncate-push` against the dev Neon branch once (Phase 41 rollout step D-10).
- Before CI-triggered E2E works: add repo secrets `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_AUTH_TEST_EMAIL`, `NEON_AUTH_TEST_PASSWORD`, `BETTER_AUTH_SECRET`, `NEON_AUTH_COOKIE_SECRET`.

### Blockers/Concerns

- Neon Auth is beta (v0.1.0-beta.20) -- validate capabilities in Phase 41 branch spike before committing
- Vercel Pro plan ($20/mo) required for per-minute cron -- confirm before Phase 46
- Phase 41 cannot close until human UAT (plan 41-06) is executed against a live Neon dev branch with real credentials.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260327-rpe | Migrate AI endpoints from Perplexity to Anthropic Claude | 2026-03-27 | 570411d | [260327-rpe-migrate-ai-endpoints-from-perplexity-to-](./quick/260327-rpe-migrate-ai-endpoints-from-perplexity-to-/) |
| 260330-131 | Replace LOCAL_AGENT_MODE bypass with Privy test credentials | 2026-03-30 | fe605aa | [260330-131-replace-local-agent-mode-bypass-with-pri](./quick/260330-131-replace-local-agent-mode-bypass-with-pri/) |
| 260406-ku9 | Fix Food & Sodium UI layout - restructure inputs, add sodium source selector, add water content field | 2026-04-06 | ecd9912 | [260406-ku9-fix-food-sodium-ui-layout-restructure-in](./quick/260406-ku9-fix-food-sodium-ui-layout-restructure-in/) |
| 260406-mpb | Fix water entry name display and food entry sodium column | 2026-04-06 | cbdfd41 | [260406-mpb-fix-water-entry-name-display-and-food-en](./quick/260406-mpb-fix-water-entry-name-display-and-food-en/) |
| 260406-thr | Replace hardcoded bg-red-500 with progressOverLimit theme token in progress bars | 2026-04-06 | ab03cc7 | [260406-thr-replace-hardcoded-bg-red-500-with-progre](./quick/260406-thr-replace-hardcoded-bg-red-500-with-progre/) |
| 260409-0l6 | Minor bugs and UI tweaks in liquid tracker | 2026-04-08 | e950009 | [260409-0l6-minor-bugs-and-ui-tweaks-in-liquid-track](./quick/260409-0l6-minor-bugs-and-ui-tweaks-in-liquid-track/) |
| 260409-hqu | Fix intake navigation footer with configurable disable/reorder | 2026-04-09 | 7b95395 | [260409-hqu-fix-intake-navigation-footer-configurabl](./quick/260409-hqu-fix-intake-navigation-footer-configurabl/) |
| 260410-ho9 | Fix GitHub issues #31-#35: BP quick view, insights, AI salt/sodium, inline editing, weekly caffeine/alcohol | 2026-04-10 | c3386d5 | [260410-ho9-fix-github-issues-31-35-bp-quick-view-he](./quick/260410-ho9-fix-github-issues-31-35-bp-quick-view-he/) |

### Roadmap Evolution

- v1.0 shipped 2026-03-23 (Phases 1-11) -- archived 2026-03-27
- v1.1 shipped 2026-03-27 (Phases 12-19) -- archived 2026-03-27
- v1.2 shipped 2026-04-04 (Phases 20-26) -- archived 2026-04-04
- v1.3 shipped 2026-04-05 (Phases 27-31) -- archived 2026-04-05
- v1.4 shipped 2026-04-06 (Phases 32-39) -- archived 2026-04-06
- v2.0 roadmap created 2026-04-11 (Phases 40-46) -- 7 phases, 27 requirements

## Session Continuity

Last session: 2026-04-12T08:30:49.173Z
Stopped at: Phase 42 context gathered; Phase 41 planned (6 plans, 4 waves, commit b566148)
Resume: /gsd-plan-phase 41
