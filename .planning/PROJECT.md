# Intake Tracker

## What This Is

A personal health tracking PWA for monitoring daily intake (water, salt), vital signs (blood pressure, weight), bodily functions (urination, defecation, eating), and medication management. Built for a single user who travels between South Africa and Germany, requiring medication tracking that handles different regional brands, pill presentations, and strengths for the same prescribed compounds. Offline-first, mobile-focused.

## Core Value

Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis (e.g., correlating fluid intake with urination and weight) is reliable and future AI querying is possible.

## Current Milestone: v1.1 UI Overhaul

**Goal:** Redesign the intake tracking UI with composable data entries, unified input cards, and AI-powered substance lookup

**Target features:**
- Composable data entries — single input creates linked records across domains (food + liquid + salt), atomic CRUD with cascading delete
- Unified Liquids card — water/coffee/alcohol as tabs; AI FAB for caffeine-per-100ml and alcohol-per-100ml lookup with saved presets
- Unified Food+Salt card — eating and salt merged; AI food input auto-creates salt/liquid entries; manual salt input retained
- BP heart rate always visible without expanding "more options"
- Replace intake page graphs with text metrics (today's limits, caffeine/alcohol totals, weekly summary Monday-start)
- Remove food calculator (unused)
- Coffee settings become liquid tab defaults
- Carry-over: timezone-aware dose logging (SRVC-02)

## Requirements

### Validated

- ✓ Water and salt intake tracking with configurable increments and limits — v1.0
- ✓ Blood pressure recording — v1.0
- ✓ Weight recording — v1.0
- ✓ Urination and defecation logging — v1.0
- ✓ Eating/food logging with AI-powered nutritional parsing (Perplexity) — v1.0
- ✓ Daily notes — v1.0
- ✓ Settings persistence (day-start-hour, theme, limits) — v1.0
- ✓ History/analytics with charts (Recharts) — v1.0
- ✓ PWA installable, offline-capable — v1.0
- ✓ Auth via Privy (email/Google) with whitelist enforcement — v1.0
- ✓ PIN gate for local access control — v1.0
- ✓ Full engineering overhaul: clean data model, strict TypeScript, service boundaries, testability, security — v1.0
- ✓ Medication data model: Prescription → MedicationPhase → PhaseSchedule → Inventory → DoseLogs — v1.0
- ✓ Medication UX: compound-first views, dose logging, retroactive doses, multi-region inventory, schedule visualization — v1.0
- ✓ Drug interaction checks (AI-powered, per-prescription, ad-hoc lookup) — v1.0
- ✓ Push notifications for scheduled doses — v1.0
- ✓ Backup/restore all 16 tables with conflict detection — v1.0
- ✓ Unit tests, migration tests, timezone dual-pass — v1.0

### Active

- ✓ Composable data entries: Dexie v15 groupId schema, atomic cross-table writes, cascading soft-delete, undo toasts — Phase 12
- ✓ Unified Liquids card with water/beverage/coffee/alcohol tabs, preset grid, AI lookup, substance auto-calc — Phase 14
- ✓ Liquid preset system (Zustand CRUD, 8 defaults, per-100ml primary unit) + AI substance lookup route — Phase 13
- ✓ All AI routes migrated from Perplexity to Anthropic Claude with tool_use — Phase 13
- [ ] Volume-based caffeine/alcohol calculation from presets
- ✓ Unified Food+Salt card with stacked sections, AI food parse → composable preview → atomic linked entries — Phase 15
- ✓ Manual salt input within food card (salt tablets, seasoning) — salt UX preserved exactly — Phase 15
- [ ] BP heart rate field always visible (no expand required)
- [ ] Text-based intake metrics replacing graphs (today's limits, substance totals, weekly summary)
- [ ] Food calculator removal
- [ ] Coffee settings migrated to liquid tab defaults
- [ ] Card reordering: Liquids → Food+Salt → health cards
- [ ] Timezone-aware dose log generation for SA/Germany travel (carry-over from v1.0)

### Out of Scope

- Cloud sync (NeonDB/Dexie Cloud) — future milestone
- AI-powered data querying / natural language questions — future milestone
- Doctor-ready report generation / PDF export — future milestone
- Intake page graph improvements — separate milestone (move to insights page)
- Capacitor Android wrapper — future milestone, PWA-first for now
- Pencil design workflow integration — tooling concern, not app feature
- Multi-user support — single-user app

## Context

- User travels between South Africa and Germany regularly. Same prescribed compounds exist under different brand names, pill sizes, and strengths in each country. Dosages often require cutting pills (halves, quarters), so tracking the physical pill vs the prescribed dose is essential.
- The medication model is inspired by Medisafe but addresses specific pain points: inability to retroactively log doses, confusing stock views where the same compound appears multiple times without clear differentiation, and lack of prescription-first medical views.
- Codebase uses Next.js 14 App Router, IndexedDB via Dexie.js (schema version 14), Zustand for settings, useLiveQuery for reads, shadcn/ui + Tailwind for UI. Engineering overhaul complete in v1.0 — strict TypeScript, clean service boundaries, atomic transactions, full test suite.
- The intake tracking UI needs modernization: alcohol and caffeine cards are underused, food/salt are separate when they should be unified, and AI food parsing should automatically create linked entries across metric domains.
- Future AI querying will need to correlate data across domains (e.g., "Is my water intake aligned with urination data given a 500ml fluid limit above output?"). Composable entries strengthen this by explicitly linking related records.

## Constraints

- **Tech stack**: Next.js 14 App Router, Dexie.js (IndexedDB), Zustand, React Query, shadcn/ui, Tailwind — established, not changing
- **Single user**: No multi-tenancy concerns, but auth/PIN still required
- **Offline-first**: All data in IndexedDB, no server-side database for user data
- **Package manager**: pnpm (enforced)
- **Mobile-focused**: max-w-lg container, touch-friendly UI
- **Sync-friendly schema**: Data model decisions must not block future NeonDB (Postgres) cloud sync
- **Queryable schema**: Indexing and relationships must support future cross-domain AI analysis

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prescription → Schedule → Inventory model | Maps to user's mental model: medical info vs treatment plan vs physical stock. Handles multi-region brands and pill cutting math. | ✓ Good |
| Full app overhaul vs medication-only | Existing code quality concerns across the board; future cloud sync and AI features require solid foundations everywhere | ✓ Good |
| IndexedDB via Dexie.js for all data | Established pattern, offline-first requirement, sync-friendly with NeonDB (Postgres) later | ✓ Good |
| Security defense-in-depth | Data at rest protection, API key handling, auth patterns — build for cloud sync from start so it's not a retrofit | ✓ Good |
| Composable data entries via groupId | Single input creates linked records across domains; groupId on child records (no parent table), atomic transactions, cascading soft-delete | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after Phase 15 completion*
