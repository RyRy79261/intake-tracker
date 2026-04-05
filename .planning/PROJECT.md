# Intake Tracker

## What This Is

A personal health tracking PWA for monitoring daily intake (water, salt, caffeine, alcohol), vital signs (blood pressure, weight), bodily functions (urination, defecation, eating), and medication management. Built for a single user who travels between South Africa and Germany, requiring medication tracking that handles different regional brands, pill presentations, and strengths for the same prescribed compounds. Offline-first, mobile-focused, with AI-powered food parsing and substance lookup.

## Core Value

Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis (e.g., correlating fluid intake with urination and weight) is reliable and future AI querying is possible.

## Current Milestone: None (planning next)

**Last shipped:** v1.3 Deployment Lifecycle — automated release pipeline, staging environment, deployment protection, rollback runbook

## Current State

**Shipped:** v1.0 Engineering Overhaul + v1.1 UI Overhaul + v1.2 CI & Data Integrity + v1.3 Deployment Lifecycle
**Codebase:** ~47K LOC TypeScript, Next.js 14 App Router, Dexie.js v15 (IndexedDB)
**CI:** 12-job GitHub Actions pipeline — lint, typecheck, dual-TZ tests, build+security, data integrity, E2E (Playwright), supply chain audit, coverage, benchmarks
**Deployment:** Release Please automation, stable staging environment, promotion workflow with Neon snapshots, version display, rollback runbook
**E2E:** 22 Playwright tests across 5 route-mirrored spec files with Privy test account integration

## Requirements

### Validated

- ✓ Water and salt intake tracking with configurable increments and limits — v1.0
- ✓ Blood pressure recording — v1.0
- ✓ Weight recording — v1.0
- ✓ Urination and defecation logging — v1.0
- ✓ Eating/food logging with AI-powered nutritional parsing — v1.0
- ✓ Daily notes — v1.0
- ✓ Settings persistence (day-start-hour, theme, limits) — v1.0
- ✓ History/analytics with charts (Recharts) — v1.0
- ✓ PWA installable, offline-capable — v1.0
- ✓ Auth via Privy (email/Google) with whitelist enforcement — v1.0
- ✓ PIN gate for local access control — v1.0
- ✓ Full engineering overhaul: strict TypeScript, service boundaries, testability, security — v1.0
- ✓ Medication data model: Prescription → MedicationPhase → PhaseSchedule → Inventory → DoseLogs — v1.0
- ✓ Medication UX: compound-first views, dose logging, retroactive doses, multi-region inventory, schedule visualization — v1.0
- ✓ Drug interaction checks (AI-powered, per-prescription, ad-hoc lookup) — v1.0
- ✓ Push notifications for scheduled doses — v1.0
- ✓ Backup/restore all 16 tables with conflict detection — v1.0
- ✓ Unit tests, migration tests, timezone dual-pass — v1.0
- ✓ Composable data entries: Dexie v15 groupId, atomic cross-table writes, cascading soft-delete — v1.1
- ✓ Unified Liquids card with water/coffee/alcohol tabs, preset grid, AI lookup, substance auto-calc — v1.1
- ✓ Liquid preset system (Zustand CRUD, 8 defaults, multi-substance model) + AI substance lookup — v1.1
- ✓ All AI routes migrated from Perplexity to Anthropic Claude with tool_use — v1.1
- ✓ Unified Food+Salt card with AI parse → composable preview → atomic linked entries — v1.1
- ✓ Text metrics replacing graphs, BP heart rate promoted, dashboard card reordering — v1.1
- ✓ Food calculator removed, 13 dead code files deleted — v1.1
- ✓ Timezone-aware dose log generation for SA/Germany travel — v1.1
- ✓ Build stability and waterContentPercent for AI-sourced presets — v1.1
- ✓ Data integrity gates in CI — schema consistency, backup round-trip, three-way table sync — v1.2
- ✓ E2E scenario testing — Playwright tests exercising real user workflows — v1.2
- ✓ Comprehensive E2E coverage — 22 tests across 5 route-mirrored spec files, auth lifecycle, analytics pipeline — v1.2
- ✓ Coverage tracking — delta coverage reports per PR via vitest-coverage-report-action — v1.2
- ✓ Benchmarking — migration chain + backup round-trip baselines with CI comparison — v1.2
- ✓ Supply chain hardening — pnpm security config, 24h package age, automated audit in CI — v1.2
- ✓ CI orchestration — 12-job GitHub Actions with path-based gating, build caching, skip-aware gate — v1.2
- ✓ Automated release pipeline with changelogs, semver, and GitHub Releases — v1.3
- ✓ Stable staging environment with isolated Neon DB backend — v1.3
- ✓ Tagged promotion flow (staging → production) with approval gates — v1.3
- ✓ Version display and rollback runbook — v1.3
- ✓ Rollback documentation fixes (PR-based revert, missing secrets) — v1.3

### Active

<!-- Next milestone scope goes here -->

### Out of Scope

- Cloud sync (NeonDB/Dexie Cloud) — future milestone
- AI-powered data querying / natural language questions — future milestone
- Doctor-ready report generation / PDF export — future milestone
- Intake page graph improvements — separate milestone (move to insights page)
- Native/Android app (Capacitor, Tauri, or similar) — future milestone, PWA-first for now
- Multi-user support — single-user app
- Dynamic test selection — descoped to path-filter gating in v1.2, sufficient for current scale
- Visual regression testing (screenshots) — functional E2E covers regressions adequately for single-user app
- Flame graph profiling — no server-side hot path; Chrome DevTools sufficient

## Context

- User travels between South Africa and Germany regularly. Same prescribed compounds exist under different brand names, pill sizes, and strengths in each country. Dosages often require cutting pills (halves, quarters).
- The medication model is inspired by Medisafe but addresses specific pain points: inability to retroactively log doses, confusing stock views, and lack of prescription-first medical views.
- Codebase uses Next.js 14 App Router, IndexedDB via Dexie.js (schema v15), Zustand for settings, useLiveQuery for reads, shadcn/ui + Tailwind for UI.
- All AI routes use Anthropic Claude with tool_use (migrated from Perplexity in v1.1).
- Composable entries explicitly link related records across domains via groupId, strengthening future cross-domain AI analysis.

## Constraints

- **Tech stack**: Next.js 14 App Router, Dexie.js (IndexedDB), Zustand, React Query, shadcn/ui, Tailwind — established, not changing
- **Single user**: No multi-tenancy concerns, but auth/PIN still required
- **Offline-first**: All data in IndexedDB, no server-side database for user data
- **Package manager**: pnpm (enforced)
- **Mobile-focused**: max-w-lg container, touch-friendly UI
- **Sync-friendly schema**: Data model decisions must not block future cloud sync
- **Queryable schema**: Indexing and relationships must support future cross-domain AI analysis

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prescription → Schedule → Inventory model | Maps to user's mental model: medical info vs treatment plan vs physical stock | ✓ Good |
| Full app overhaul vs medication-only | Future cloud sync and AI features require solid foundations everywhere | ✓ Good |
| IndexedDB via Dexie.js for all data | Offline-first, sync-friendly with NeonDB later | ✓ Good |
| Security defense-in-depth | Build for cloud sync from start so it's not a retrofit | ✓ Good |
| Composable data entries via groupId | groupId on child records (no parent table), atomic transactions, cascading soft-delete | ✓ Good |
| Perplexity → Anthropic Claude migration | Better medical query handling, tool_use for structured output | ✓ Good |
| Multi-substance preset model | Per-100ml fields for caffeine/alcohol/salt + waterContentPercent enables accurate hydration tracking | ✓ Good |
| Path-filter gating over dynamic test selection | dorny/paths-filter is simpler and sufficient at current scale; dynamic selection adds complexity for marginal gain | ✓ Good |
| Dual-TZ CI testing (SA/Germany) | Catches timezone-sensitive bugs in dose logging and day-start-hour logic | ✓ Good |
| pnpm security config over external audit tools | minimumReleaseAge + trustPolicy + blockExoticSubdeps built into pnpm, no extra deps | ✓ Good |
| Privy iframe OTP for E2E auth | Works reliably in headless Chromium; server-side token approaches failed due to Privy Dashboard origin restrictions | ✓ Good |
| Route-mirrored E2E spec files | One spec per app route makes test ownership clear and scales naturally | ✓ Good |
| Release Please over custom version-bump.yml | PR-based version bumps are more visible and reliable than bot commits on main; conventional commits provide clean changelogs | ✓ Good |
| Commitlint + husky for commit enforcement | Formalizes existing conventional commit practice; hook validates locally, Release Please validates server-side | ✓ Good |
| Separate promotion workflow + setup script for protection | Branch protection and environment rules are repo settings (not code); setup script documents and automates configuration via gh CLI | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

*Last updated: 2026-04-05 after v1.3 Deployment Lifecycle milestone*

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 after v1.3 Deployment Lifecycle milestone*
