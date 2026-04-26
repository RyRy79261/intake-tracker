# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test:e2e         # Playwright E2E tests (auto-starts dev server; authenticates via Privy test account)
npx playwright test e2e/intake-logs.spec.ts  # Run a single test file
pnpm build:android    # Build sideloadable Android APK via Capacitor (see "Android build" below)
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
- **React Context** — Privy auth + PIN gate (`src/hooks/use-pin-gate.tsx`)

### Provider Stack

`src/app/providers.tsx` wraps: ErrorBoundary → QueryClientProvider → ThemeProvider → PrivyProvider → PinGateProvider. If `NEXT_PUBLIC_PRIVY_APP_ID` is unset, Privy is skipped (app works without auth in dev).

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

**Privy** for authentication (email/Google). Whitelist enforcement via `ALLOWED_EMAILS` env var. E2E tests authenticate via Privy test account credentials (PRIVY_TEST_EMAIL/PRIVY_TEST_OTP in .env.local).

### UI

- **shadcn/ui** components in `src/components/ui/`
- **Tailwind CSS** with custom color tokens (water/salt themes in `tailwind.config.ts`)
- **Outfit** font via next/font
- Path alias: `@/*` → `src/*`

### Medication Data Model

Prescriptions → MedicationPhases (maintenance/titration) → PhaseSchedules (time + dosage per day-of-week). Separate InventoryItems track pill stock per prescription. DoseLogs record individual dose events.

### Android build (Capacitor)

The app ships as a sideloadable Android APK alongside the web build, for offline use on a personal device. Capacitor wraps a Next.js static export in a WebView; IndexedDB data stays on-device, and `/api/*` calls reach a deployed backend (e.g. the Vercel deploy) when online via `NEXT_PUBLIC_API_BASE_URL`.

- `capacitor.config.ts` — appId `com.intaketracker.app`, `webDir: out`, `CapacitorHttp` plugin enabled so native HTTP bypasses CORS.
- `next.config.js` switches to `output: 'export'` and skips `next-pwa` + `headers()` when `BUILD_TARGET=android`.
- `scripts/build-android.sh` stashes `src/app/api` to a `mktemp` dir outside the repo (Next.js refuses route handlers under static export, and `tsconfig.json` includes `**/*.ts` so the stash must live outside the project), runs `next build`, runs `cap sync android`, then `gradlew assembleDebug`. A `trap` restores `src/app/api` on exit.
- Per-fetch site routing happens via `src/lib/api-url.ts` (`apiUrl()`); call sites under `src/lib`, `src/hooks`, `src/components` were updated. On the web build `NEXT_PUBLIC_API_BASE_URL` is empty so paths stay relative.
- Configure the APK build via `.env.android.local` at the repo root (gitignored). Leave `NEXT_PUBLIC_PRIVY_APP_ID` UNSET — Privy's auth iframe doesn't whitelist the `capacitor://` origin, and `providers.tsx` falls back to a no-auth path when the appId is missing.
- Requires Android Studio (or `cmdline-tools` + `platform-tools`) with `ANDROID_HOME` set. Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Install via `adb install -r <path>`.
- `pnpm build:android:web` runs everything except gradle (useful in CI / sandboxes without the Android SDK).
