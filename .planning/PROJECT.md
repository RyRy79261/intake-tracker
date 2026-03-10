# Intake Tracker

## What This Is

A personal health tracking PWA for monitoring daily intake (water, salt), vital signs (blood pressure, weight), bodily functions (urination, defecation, eating), and medication management. Built for a single user who travels between South Africa and Germany, requiring medication tracking that handles different regional brands, pill presentations, and strengths for the same prescribed compounds. Offline-first, mobile-focused.

## Core Value

Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis (e.g., correlating fluid intake with urination and weight) is reliable and future AI querying is possible.

## Requirements

### Validated

<!-- Inferred from existing codebase -->

- ✓ Water and salt intake tracking with configurable increments and limits — existing
- ✓ Blood pressure recording — existing
- ✓ Weight recording — existing
- ✓ Urination and defecation logging — existing
- ✓ Eating/food logging with AI-powered nutritional parsing (Perplexity) — existing
- ✓ Daily notes — existing
- ✓ Settings persistence (day-start-hour, theme, limits) — existing
- ✓ History/analytics with charts (Recharts) — existing
- ✓ PWA installable, offline-capable — existing
- ✓ Auth via Privy (email/Google) with whitelist enforcement — existing
- ✓ PIN gate for local access control — existing

### Active

- [ ] Full engineering overhaul: clean data model, strong TypeScript types, separation of concerns, testability, security
- [ ] Medication data model: Prescription (compound, dosage, medical info) → Schedule (maintenance/titration plans) → Inventory (physical pills, brand, region, strength, stock levels)
- [ ] Medication UX: prescription-first views, clear stock disambiguation between SA/Germany brands, schedule visualization
- [ ] Retroactive dose logging: mark a dose taken at a specific past time, not just in response to a notification
- [ ] Dose logging with inventory depletion: logging a dose decrements stock, tracks adherence over time
- [ ] Inventory management: track pill stock per region/brand, know what to buy, what's running low
- [ ] Audit logging for data integrity and future sync preparation
- [ ] API key protection and secure handling of secrets
- [ ] Data-at-rest security patterns (PIN, encryption foundations)
- [ ] Indexing strategy designed for cross-domain querying and future AI analysis

### Out of Scope

- Cloud sync (NeonDB (Postgres)) — future milestone, but data model should be sync-friendly
- AI-powered data querying / natural language questions — future milestone, but schema should be queryable
- Doctor-ready report generation / PDF export — future milestone
- Self-tracking dashboards beyond current Recharts history — future milestone
- Capacitor Android wrapper — future milestone, PWA-first for now
- Pencil design workflow integration — tooling concern, not app feature
- Multi-user support — single-user app

## Context

- User travels between South Africa and Germany regularly. Same prescribed compounds exist under different brand names, pill sizes, and strengths in each country. Dosages often require cutting pills (halves, quarters), so tracking the physical pill vs the prescribed dose is essential.
- The medication model is inspired by Medisafe but addresses specific pain points: inability to retroactively log doses, confusing stock views where the same compound appears multiple times without clear differentiation, and lack of prescription-first medical views.
- Current codebase uses Next.js 14 App Router, IndexedDB via Dexie.js (schema version 9), Zustand for settings, React Query for data fetching, shadcn/ui + Tailwind for UI. The medication tracking feature exists on the current branch but implementation quality is a concern — needs to be rebuilt with proper engineering.
- The existing intake/health tracking features work but should also receive the engineering overhaul treatment (clean types, service boundaries, testability).
- Future AI querying will need to correlate data across domains (e.g., "Is my water intake aligned with urination data given a 500ml fluid limit above output?"). This means the data model must support efficient cross-domain queries from day one.

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
| Prescription → Schedule → Inventory model | Maps to user's mental model: medical info vs treatment plan vs physical stock. Handles multi-region brands and pill cutting math. | — Pending |
| Full app overhaul vs medication-only | Existing code quality concerns across the board; future cloud sync and AI features require solid foundations everywhere | — Pending |
| IndexedDB via Dexie.js for all data | Established pattern, offline-first requirement, sync-friendly with NeonDB (Postgres) later | — Pending |
| Security defense-in-depth | Data at rest protection, API key handling, auth patterns — build for cloud sync from start so it's not a retrofit | — Pending |

---
*Last updated: 2026-03-02 after initialization*
