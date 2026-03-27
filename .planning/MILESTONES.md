# Milestones

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
