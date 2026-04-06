# Milestones

## v1.4 Post-Release Fixes (Shipped: 2026-04-06)

**Phases completed:** 8 phases (32–39), 17 plans, 106 commits
**Timeline:** 1 day (2026-04-06)
**Scope:** 21 files changed, +1,213 / -718 lines

**Key accomplishments:**

- Fixed decimal precision pipeline — parseFloat replacing parseInt in settings-helpers, 0.05 weight rounding, configurable increments in Settings
- Inline-edit tap-to-type for weight values with configurable precision rounding on blur
- Restructured Food/Sodium card — sodium top-right, description as entry title, single merged history section
- AI-powered substance lookup on preset creation with reliable preset deletion from grid
- Documented Neon DB + Vercel integration architecture (branch lifecycle, env var audit, migration path)
- Fixed water entry label formatting (preset:/substance: prefix resolution) and preset save-and-log UUID linkage

### Known Gaps

- **REL-01** (partial): Release-please code/docs shipped, but GitHub repo settings change still needed (enable write permissions + allow Actions to create PRs)

---

## v1.3 Deployment Lifecycle (Shipped: 2026-04-05)

**Phases completed:** 5 phases, 12 plans, 13 tasks

**Key accomplishments:**

- Reconciled package.json from 0.1.0 to 1.2.0 and established Release Please version anchor with annotated git tag
- Installed commitlint + husky and enforced conventional commit format via commit-msg hook — bad messages are rejected before commit creation
- Created Release Please pipeline and removed deprecated version-bump.yml — merges to main now trigger automated release PRs with changelogs
- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- PR-based git revert workflow replacing blocked direct-push path, SHA naming consistency, and NEON_PROD_BRANCH_ID documented for operator setup

---

## v1.2 CI & Data Integrity (Shipped: 2026-04-04)

**Phases completed:** 7 phases, 16 plans, 30 tasks

**Key accomplishments:**

- Fixed 57 TypeScript strict-mode errors across 9 test files, added pnpm typecheck script, and extended bundle security with Neon DB leak detection
- GitHub Actions CI pipeline with 5 parallel jobs (lint, typecheck, dual-TZ tests, build+security) gated by ci-pass status check
- Static schema parser and two integrity test suites verifying Dexie version block consistency (DATA-04) and three-way db.ts/BackupData/fixtures sync (DATA-07)
- Deep equality backup round-trip test verifying all 16 tables field-by-field plus unconditional data-integrity CI job blocking merge on failure
- Playwright CI dual-mode config with service worker blocking, GitHub Actions e2e job wired into merge gate, and settings persistence E2E test
- Composable food/liquid entry tests and medication dose logging lifecycle with AI mock, substance calculation, and inventory verification
- pnpm supply chain hardening with 4 security settings, 26 transitive vulnerability overrides, and clean audit baseline at high severity
- Supply-chain CI job with pnpm-workspace.yaml config drift verification and pnpm audit gate wired into ci-pass merge blocker
- CI supply-chain audit gate fixed with 6 --ignore flags for documented false-positive and override-resistant GHSAs, making the gate functional (exits 0 on clean PRs)
- Vitest bench files for Dexie migration chain and backup round-trip with committed JSON baselines and v8 coverage config for CI
- CI workflow with path-based job gating, delta coverage PR comments, .next/cache caching, and benchmark execution across 12 jobs
- ES2020 tsconfig target fixing 4 typecheck errors, complete 4-setting supply chain drift check, and clean benchmark baselines without worktree paths
- Renamed 3 spec files to mirror app routes and added 4 new dashboard card tests for BP, weight, urination, and defecation
- Analytics page E2E tests covering tab navigation, data pipeline verification (D-12), and chart SVG rendering (D-11); settings tests expanded with backup export download and account section coverage
- Auth logout/re-login lifecycle test via Privy iframe, API-level whitelist rejection test, and medication schedule tab navigation with empty state verification
- Verified committed auth.setup.ts and auth.spec.ts already use iframe-based Privy OTP flow -- no code changes required

---

## v1.1 UI Overhaul (Shipped: 2026-03-27)

**Phases completed:** 8 phases (12–19), 16 plans, 134 commits
**Timeline:** 4 days (2026-03-23 → 2026-03-27)
**Scope:** 200 files changed, ~21.9K insertions, 3.7K deletions

**Key accomplishments:**

- Composable data foundation: Dexie v15 schema with groupId, atomic cross-table entry service, cascading soft-delete, undo toasts
- Unified Liquids card: tabbed water/coffee/alcohol with preset grid, AI substance lookup (caffeine/alcohol per-100ml), and auto-calculated substance records
- Unified Food+Salt card: AI food parsing → composable preview → atomic linked entries (eating + water + salt), manual salt input preserved
- Liquid preset system: Zustand CRUD with 8 defaults, multi-substance model (caffeine/alcohol/salt per-100ml + waterContentPercent)
- All 5 AI routes migrated from Perplexity to Anthropic Claude with tool_use — Perplexity fully removed
- Dashboard modernization: text metrics replacing graphs, BP heart rate promoted, card reordering, 13 dead code files deleted (2,541 lines)
- Timezone-aware dose logging: correct SA/Germany schedule generation, timezone change detection with confirmation dialog, 21 new tests
- Build stability: dead code cleanup, missing Settings store fields restored, waterContentPercent added to substance-lookup API

---

## v1.0 Engineering Overhaul (Shipped: 2026-03-23)

**Phases completed:** 13 phases (1–11, 5.1 abandoned, 6.1 inserted), 44 plans, ~322 commits
**Timeline:** 53 days (2026-01-30 → 2026-03-23)
**Scope:** 551 files changed, ~114K insertions

**Key accomplishments:**

- Dexie v10→v13 schema migrations with compound indexes, event-sourced inventory, sync-ready timestamps, and 15-test migration verification suite
- Strict TypeScript (noUncheckedIndexedAccess + exactOptionalPropertyTypes), ESLint import boundaries enforcing clean service layer, Zod validation at all external boundaries
- Atomic medication transactions with fractional pill math, timezone-aware scheduling, and audit logging on every mutation
- Cross-domain analytics service with substance tracking, correlation analysis, insights tab, and PDF/CSV export
- Security hardening: API keys server-side only, PIN-derived AES-GCM encryption foundations, PII sanitization, CSP headers, bundle security scan
- Full medication UX: compound-first views, dose logging with stock depletion, retroactive doses, multi-region inventory (SA/Germany), prescriptions tab, titration phase management
- Dashboard input redesign: popup modals replaced with inline input flows for all health metric cards
- Schedule visualization with vertical phase timeline, drug interaction checks (AI-powered per-prescription + ad-hoc lookup)
- Backup/restore covering all 16 tables with conflict-aware merge and round-trip test suite
- 203 unit tests passing under both Africa/Johannesburg and Europe/Berlin timezones
- PWA push notifications for scheduled medication doses via web-push + Neon Postgres

**Phase 5.1 (Pencil Design System Onboarding):** Abandoned 2026-03-11 — too much context overhead, components didn't match codebase, MCP tools unavailable to subagents. 5/7 plans executed before removal.

---
