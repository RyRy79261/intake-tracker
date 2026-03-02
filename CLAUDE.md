# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test:e2e         # Playwright E2E tests (auto-starts dev server with LOCAL_AGENT_MODE=true)
npx playwright test e2e/intake-logs.spec.ts  # Run a single test file
```

Package manager is **pnpm** (enforced via `preinstall` hook; npm/yarn will fail).

## Architecture

**Health tracking PWA** built with Next.js 14 App Router. Offline-first, mobile-focused (max-w-lg container), single-user app.

### Data Layer (Client-Side)

All data lives in **IndexedDB via Dexie.js** (`src/lib/db.ts`). There is no server-side database for user data. The schema is at version 9 with migration logic for each version in `db.ts`.

**Tables:** intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, dailyNotes, auditLogs.

When adding a new Dexie version, you must repeat all existing store definitions (Dexie requires the full schema each version).

### Service Layer

Each data domain has a service file in `src/lib/` (e.g., `intake-service.ts`, `medication-service.ts`, `health-service.ts`) that handles CRUD operations against Dexie. Corresponding React Query hooks in `src/hooks/` (e.g., `use-intake-queries.ts`, `use-medication-queries.ts`) wrap service calls with cache invalidation.

### State Management

- **Zustand** (`src/stores/settings-store.ts`) — persisted to localStorage for user preferences (increments, limits, theme, day-start-hour, UI animation timing, etc.)
- **React Query** — async data fetching/caching for all Dexie operations
- **React Context** — Privy auth + PIN gate (`src/hooks/use-pin-gate.tsx`)

### Provider Stack

`src/app/providers.tsx` wraps: ErrorBoundary → QueryClientProvider → ThemeProvider → PrivyProvider → PinGateProvider. If `NEXT_PUBLIC_PRIVY_APP_ID` is unset, Privy is skipped (app works without auth in dev).

### Routes

- `/` — Main intake dashboard (water/salt tracking, health metrics)
- `/medications` — Prescription management with multi-step wizard
- `/history` — Analytics/charts (Recharts)
- `/settings` — App configuration

### API Routes (`src/app/api/`)

- `POST /api/ai/parse` — Sends food/drink descriptions to Perplexity API for nutritional parsing
- `POST /api/ai/medicine-search` — AI-assisted medicine lookup
- `GET /api/ai/status` — Health check for AI service

API routes handle server-side Perplexity calls (key never exposed to client). PII is stripped before sending to external APIs.

### Auth

**Privy** for authentication (email/Google). Whitelist enforcement via `ALLOWED_EMAILS` env var. `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` bypasses auth for E2E testing.

### UI

- **shadcn/ui** components in `src/components/ui/`
- **Tailwind CSS** with custom color tokens (water/salt themes in `tailwind.config.ts`)
- **Outfit** font via next/font
- Path alias: `@/*` → `src/*`

### Medication Data Model

Prescriptions → MedicationPhases (maintenance/titration) → PhaseSchedules (time + dosage per day-of-week). Separate InventoryItems track pill stock per prescription. DoseLogs record individual dose events.
