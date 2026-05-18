# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test:e2e         # Playwright E2E tests (auto-starts dev server; seeds Neon Auth session via globalSetup)
npx playwright test e2e/intake-logs.spec.ts  # Run a single test file
```

Package manager is **pnpm** (enforced via `preinstall` hook; npm/yarn will fail).

## Architecture

**Health tracking PWA** built with Next.js 14 App Router. Offline-first, mobile-focused (max-w-lg container), single-user app.

### Data Layer (Client-Side)

All data lives in **IndexedDB via Dexie.js** (`src/lib/db.ts`). There is no server-side database for user data (push notification subscriptions use server-side Neon Postgres). The schema is at version 14 with migration logic for each version in `db.ts`.

**Tables:** intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs.

When adding a new Dexie version, you must repeat all existing store definitions (Dexie requires the full schema each version).

### Service Layer

Each data domain has a service file in `src/lib/` (e.g., `intake-service.ts`, `medication-service.ts`, `health-service.ts`) that handles CRUD operations against Dexie. Corresponding React Query hooks in `src/hooks/` (e.g., `use-intake-queries.ts`, `use-medication-queries.ts`) wrap service calls with cache invalidation.

### State Management

- **Zustand** (`src/stores/settings-store.ts`) — persisted to localStorage for user preferences (increments, limits, theme, day-start-hour, UI animation timing, etc.)
- **React Query** — async data fetching/caching for all Dexie operations
- **Neon Auth** — cookie session managed by Better Auth, no React Context required

### Provider Stack

`src/app/providers.tsx` wraps: ErrorBoundary → QueryClientProvider → ThemeProvider → TimezoneGuard → children. Auth state is read on demand by `useAuth()` (Neon Auth client) and the server-side `withAuth()` middleware.

### Routes

- `/` — Main intake dashboard (water/salt tracking, health metrics)
- `/medications` — Prescription management with multi-step wizard
- `/history` — Analytics/charts (Recharts)
- `/settings` — App configuration

### API Routes (`src/app/api/`)

- `POST /api/ai/parse` — Sends food/drink descriptions to Anthropic Claude API for nutritional parsing
- `POST /api/ai/medicine-search` — AI-assisted medicine lookup
- `POST /api/ai/substance-lookup` — AI-powered beverage substance per-100ml lookup
- `GET /api/ai/status` — Health check for AI service

API routes handle server-side Claude API calls (key never exposed to client). PII is stripped before sending to external APIs.

### Auth

**Neon Auth** (Better Auth on Neon Postgres) for authentication (email/password). Whitelist enforcement via `ALLOWED_EMAILS` env var checked in `src/lib/auth-middleware.ts`. E2E tests seed a session via `e2e/global-setup.ts` using `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` and persist `playwright/.auth/user.json`.

### UI

- **shadcn/ui** components in `src/components/ui/`
- **Tailwind CSS** with custom color tokens (water/salt themes in `tailwind.config.ts`)
- **Outfit** font via next/font
- Path alias: `@/*` → `src/*`

### Medication Data Model

Prescriptions → MedicationPhases (maintenance/titration) → PhaseSchedules (time + dosage per day-of-week). Separate InventoryItems track pill stock per prescription. DoseLogs record individual dose events.
