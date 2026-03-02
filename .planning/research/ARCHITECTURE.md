# Architecture Research

**Domain:** Offline-first health tracking PWA with medication management
**Researched:** 2026-03-02
**Confidence:** HIGH (based on existing codebase analysis + verified patterns)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UI LAYER (Next.js App Router)               │
│                                                                     │
│  ┌───────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  /         │  │ /medications │  │ /history  │  │ /settings    │  │
│  │ (intake    │  │ (rx + dose   │  │ (charts + │  │ (prefs +     │  │
│  │  + vitals) │  │  + inventory)│  │  analytics│  │  PIN + keys) │  │
│  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘  │
│        │                │                │               │          │
├────────┴────────────────┴────────────────┴───────────────┴──────────┤
│                    REACT QUERY CACHE LAYER                          │
│  (queryKey namespaces: intake, health, meds, doseLogs, inventory)   │
│  Mutations invalidate their domain + any cross-domain dependents    │
├─────────────────────────────────────────────────────────────────────┤
│                       HOOKS LAYER  (src/hooks/)                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐   │
│  │ use-intake-    │  │ use-medication-│  │ use-health-queries   │   │
│  │ queries.ts     │  │ queries.ts     │  │ use-urination-queries│   │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬───────────┘   │
│          │                   │                      │               │
├──────────┴───────────────────┴──────────────────────┴───────────────┤
│                      SERVICE LAYER  (src/lib/)                      │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
│  │ intake-     │  │ medication-    │  │ health-service.ts        │  │
│  │ service.ts  │  │ service.ts     │  │ eating-service.ts        │  │
│  │             │  │ medication-    │  │ urination-service.ts     │  │
│  │             │  │ schedule-      │  │ defecation-service.ts    │  │
│  │             │  │ service.ts     │  │                          │  │
│  │             │  │ dose-log-      │  │                          │  │
│  │             │  │ service.ts     │  │                          │  │
│  └──────┬──────┘  └───────┬────────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│  ┌──────┴─────────────────┴────────────────────────┴─────────────┐  │
│  │                    CROSS-DOMAIN SERVICE                        │  │
│  │                 analytics-service.ts (NEW)                     │  │
│  │   Joins data across tables for correlation queries             │  │
│  └───────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│              INFRASTRUCTURE LAYER  (src/lib/db.ts + audit.ts)       │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐  │
│  │  Dexie.js (IndexedDB)        │  │  audit.ts (security log)    │  │
│  │  db.ts: schema + migrations  │  │  Buffered async writes       │  │
│  └──────────────────────────────┘  └──────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                   SETTINGS / PREFERENCES                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Zustand (settings-store.ts) → localStorage                  │   │
│  │  UI prefs, limits, API keys (obfuscated), region config      │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                  SERVER LAYER (src/app/api/)                        │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  /api/ai/parse       │  │  /api/ai/medicine-search            │  │
│  │  /api/ai/status      │  │  Perplexity API calls, key hidden   │  │
│  └──────────────────────┘  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Owns |
|-----------|---------------|-------------------|------|
| **Route pages** (`/`, `/medications`, `/history`, `/settings`) | UI rendering, user interaction, layout | Hooks only — never services or db directly | Nothing — pure presentational consumers |
| **Feature components** (`src/components/`) | Domain-specific UI elements (cards, dialogs, wizards) | Hooks only | Local state for UI (open/closed dialogs, form state) |
| **Hooks layer** (`src/hooks/`) | Bridges React Query ↔ service layer; exposes typed mutations and queries | Service layer (call), React Query (cache management) | Query keys, invalidation logic |
| **Service layer** (`src/lib/*-service.ts`) | Business logic, validation, multi-table transactions | Dexie db singleton only | Domain invariants (e.g., only one active phase per prescription) |
| **Cross-domain service** (`src/lib/analytics-service.ts`) | Multi-table joins for correlation queries (fluid in vs. urination vs. weight) | Multiple service modules or db directly | Query result shapes for analytics |
| **db.ts** | Schema definition and Dexie migration chain | IndexedDB (browser) | Table definitions, migration logic |
| **audit.ts** | Fire-and-forget security logging | db.auditLogs via buffered writes | Audit trail, retention |
| **settings-store.ts** | User preferences, API key obfuscation | localStorage (via Zustand persist) | UI config, rate limits, region |
| **API routes** (`src/app/api/`) | Server-side secrets; Perplexity proxy | Perplexity API, environment secrets | API keys (never exposed to client) |

---

## Recommended Project Structure

The current structure is largely correct. The overhaul should enforce these boundaries more strictly:

```
src/
├── app/                         # Next.js App Router routes
│   ├── api/                     # Server-only: AI proxy routes
│   │   ├── ai/parse/
│   │   ├── ai/medicine-search/
│   │   └── ai/status/
│   ├── medications/             # Medication management UI
│   ├── history/                 # Analytics and chart UI
│   ├── settings/                # Settings UI
│   ├── layout.tsx
│   ├── page.tsx                 # Main dashboard
│   └── providers.tsx            # React provider tree
│
├── components/                  # UI components
│   ├── ui/                      # shadcn/ui primitives (untouched)
│   ├── medications/             # Medication-specific components
│   ├── history/                 # History/chart components
│   └── [feature].tsx            # Domain cards, dialogs
│
├── hooks/                       # React Query hooks
│   ├── use-intake-queries.ts    # Intake CRUD + cache
│   ├── use-medication-queries.ts# Prescriptions, phases, inventory, doseLogs
│   ├── use-health-queries.ts    # Weight, BP
│   ├── use-urination-queries.ts
│   ├── use-eating-queries.ts
│   ├── use-defecation-queries.ts
│   └── use-analytics-queries.ts # NEW: cross-domain correlation hooks
│
├── lib/                         # Service layer + infrastructure
│   ├── db.ts                    # Dexie schema (single source of truth)
│   ├── types.ts                 # NEW: re-exports all db types; shared domain types
│   │
│   ├── intake-service.ts        # Intake CRUD + import/export
│   ├── health-service.ts        # Weight + blood pressure CRUD
│   ├── eating-service.ts        # Eating CRUD
│   ├── urination-service.ts     # Urination CRUD
│   ├── defecation-service.ts    # Defecation CRUD
│   │
│   ├── medication-service.ts    # Prescription + Phase + Inventory CRUD
│   ├── medication-schedule-service.ts  # PhaseSchedule queries + daily view
│   ├── dose-log-service.ts      # DoseLog state machine + stock depletion
│   │
│   ├── analytics-service.ts     # NEW: cross-domain correlation queries
│   │
│   ├── audit.ts                 # Buffered audit log writes
│   ├── security.ts              # PIN, obfuscation utilities
│   ├── pin-service.ts           # PIN verify/set logic
│   └── utils.ts                 # generateId, date helpers, etc.
│
├── stores/                      # Zustand stores
│   └── settings-store.ts        # Persisted user preferences
│
└── [config files, styles, etc.]
```

### Structure Rationale

- **`lib/` is the only layer that touches `db.ts`** — routes and components MUST NOT import from db.ts directly. This enforces the service boundary and makes services unit-testable with `fake-indexeddb`.
- **`hooks/` is the only layer that calls `lib/`** from React component context — this concentrates all cache management (queryKey, invalidation) in one place and keeps services pure async functions.
- **`analytics-service.ts` is a dedicated cross-domain service** — it does not own any data, only queries across domains. This is the pre-built seam for future AI querying (this service becomes the backend for natural-language analysis).
- **`types.ts` re-exports all db interfaces** — prevents circular imports between services and avoids components importing directly from `db.ts` for type purposes.

---

## Architectural Patterns

### Pattern 1: Service Layer as the Business Logic Boundary

**What:** Each domain (`intake`, `health`, `medication`, `dose-log`) has a dedicated service file containing all business logic. Services are pure async functions that accept plain inputs, operate on Dexie, and return typed results. No React, no hooks, no QueryClient.

**When to use:** Always. This is the core pattern for the entire app.

**Trade-offs:** Slightly more boilerplate than calling Dexie directly from hooks. Worth it: services become unit-testable with `fake-indexeddb`, and business rules have one home.

**Example:**
```typescript
// src/lib/dose-log-service.ts
// Services know about business rules.
// They do NOT know about React Query, components, or UI state.

export async function takeDose(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  dosageAmount: number
): Promise<DoseLog> {
  const prev = await getDoseLog(prescriptionId, phaseId, scheduleId, date, time);
  const wasTaken = prev?.status === "taken";

  let inventoryItemId = prev?.inventoryItemId;
  if (!wasTaken) {
    const activeInventory = await getActiveInventoryForPrescription(prescriptionId);
    if (activeInventory) {
      inventoryItemId = activeInventory.id;
      // Business rule: dose taken = stock decremented
      await adjustStock(inventoryItemId, -dosageAmount);
    }
  }

  return upsertDoseLog(prescriptionId, phaseId, scheduleId, date, time, "taken", { inventoryItemId });
}
```

### Pattern 2: Hooks as Thin Query/Mutation Wrappers

**What:** Hooks wrap service functions in `useQuery` / `useMutation`, define the queryKey, and handle cache invalidation. They contain no business logic.

**When to use:** Every React component that needs data or mutations.

**Trade-offs:** Hooks are boilerplate-heavy but explicit. The benefit is that all invalidation logic is in one file per domain, not scattered across components.

**Example:**
```typescript
// src/hooks/use-medication-queries.ts

function useInvalidateMeds() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
    qc.invalidateQueries({ queryKey: ["doseLogs"] });
    qc.invalidateQueries({ queryKey: ["inventoryItems"] });
  };
}

export function useTakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: TakeDoseArgs) =>
      takeDose(args.prescriptionId, args.phaseId, args.scheduleId, args.date, args.time, args.dosageAmount),
    onSuccess: invalidate,
  });
}
```

### Pattern 3: Dexie Transactions for Multi-Table Atomicity

**What:** Any operation that spans multiple tables (e.g., creating a Prescription + Phase + InventoryItem + initial InventoryTransaction) must be wrapped in a single `db.transaction("rw", [...tables], async () => { ... })` call.

**When to use:** Any service function that writes to more than one table.

**Trade-offs:** Slightly more verbose but essential for data integrity. Without transactions, a failure halfway through a multi-step operation leaves the database in an inconsistent state that is very hard to recover from offline.

**Example:**
```typescript
// src/lib/medication-service.ts
await db.transaction("rw", [
  db.prescriptions,
  db.medicationPhases,
  db.inventoryItems,
  db.phaseSchedules,
  db.inventoryTransactions
], async () => {
  await db.prescriptions.add(prescription);
  await db.medicationPhases.add(phase);
  await db.inventoryItems.add(inventory);
  await db.phaseSchedules.bulkAdd(schedules);
  // If any step throws, the entire transaction rolls back
});
```

### Pattern 4: Cross-Domain Analytics Service

**What:** A dedicated `analytics-service.ts` handles queries that span multiple domain tables. It does not own data — it reads from multiple services and assembles correlation results.

**When to use:** Any query that needs data from two or more domains simultaneously (e.g., "fluid intake vs. urination output for a date range").

**Trade-offs:** Adds a file but avoids polluting domain services with foreign-domain queries. More importantly, this is the architectural seam for future AI querying — the AI layer will call this service, not individual domain services.

**Example:**
```typescript
// src/lib/analytics-service.ts

export interface FluidBalanceForRange {
  date: string;
  waterInMl: number;
  urinationCount: number;
  weightKg?: number;
}

export async function getFluidBalanceByDay(
  startTime: number,
  endTime: number
): Promise<FluidBalanceForRange[]> {
  const [intake, urination, weight] = await Promise.all([
    getRecordsByDateRange(startTime, endTime, "water"),
    getUrinationByDateRange(startTime, endTime),
    getWeightRecordsByDateRange(startTime, endTime),
  ]);
  // join by calendar day, return correlated structure
}
```

### Pattern 5: Sync-Friendly Schema Design

**What:** All records use string UUIDs (`crypto.randomUUID()`) as primary keys. All records include `createdAt: number` (Unix ms). Records that can be "deactivated" use `isActive: boolean` rather than hard deletion. This mirrors what Dexie Cloud requires for sync.

**When to use:** All new table definitions and overhaul of existing ones.

**Trade-offs:** Soft deletes increase storage. For a single-user health app storing years of personal data, this is acceptable. Hard deletes on audit-relevant records (doseLogs, inventoryTransactions) would break the integrity of historical views.

**Schema conventions for sync-readiness:**
```typescript
// Every record MUST have:
interface SyncReadyRecord {
  id: string;            // crypto.randomUUID() — globally unique
  createdAt: number;     // Unix timestamp ms — immutable after creation
  updatedAt?: number;    // Unix timestamp ms — update on every write
}

// Soft-deletable records use isActive/isArchived:
interface SoftDeletable extends SyncReadyRecord {
  isActive: boolean;     // false = hidden from UI but preserved for audit
  isArchived?: boolean;  // true = permanently archived (inventory items)
}
```

---

## Data Flow

### Write Flow (User Takes a Dose)

```
User taps "Take" button in MedicationCard
    ↓
useTakeDose() mutation fires
    ↓
takeDose(prescriptionId, phaseId, scheduleId, date, time, dosageAmount)
    ↓
dose-log-service: getDoseLog() → check if already taken
    ↓
medication-service: getActiveInventoryForPrescription() → find stock record
    ↓
medication-service: adjustStock(inventoryItemId, -dosageAmount)
    ↓ [Dexie transaction: inventoryItems + inventoryTransactions written atomically]
    ↓
dose-log-service: upsertDoseLog() → write DoseLog with status="taken"
    ↓
useTakeDose.onSuccess() → invalidateQueries([prescriptions, doseLogs, inventoryItems])
    ↓
React Query refetches affected queries
    ↓
Components re-render with updated dose status + new stock count
```

### Read Flow (Cross-Domain Analytics Query)

```
HistoryPage renders, requests fluid balance data
    ↓
useFluidBalanceQuery(startTime, endTime)
    ↓
getFluidBalanceByDay(startTime, endTime) in analytics-service.ts
    ↓
Promise.all([
  getRecordsByDateRange() from intake-service,
  getUrinationByDateRange() from urination-service,
  getWeightRecordsByDateRange() from health-service
])
    ↓
Dexie: parallel timestamp-ranged queries across 3 tables
    ↓
analytics-service joins by calendar day
    ↓
Returns FluidBalanceForRange[] to hook
    ↓
React Query caches result under ["fluidBalance", startTime, endTime]
    ↓
Chart component renders correlated data
```

### Medication Data Model: Relationship Flow

```
Prescription (compound, medical identity)
    │
    ├── MedicationPhase[] (treatment plan; one "active" at a time)
    │       │
    │       └── PhaseSchedule[] (time + dosage + days-of-week)
    │               │
    │               └── DoseLog[] (historical record of each scheduled dose)
    │                       │
    │                       └── inventoryItemId (which physical pills were used)
    │
    └── InventoryItem[] (physical pills; brand + region + strength)
            │
            └── InventoryTransaction[] (refill/consumed/adjusted history)
```

**Key invariant enforced by service layer:** Only one MedicationPhase per Prescription may have `status === "active"` at any time. `startNewPhase()` and `activatePhase()` both complete the current active phase before activating the new one.

### State Management Topology

```
IndexedDB (Dexie)
    ↕ read/write via service functions
React Query Cache
    ↕ query/invalidate via hooks
React Components
    ↕ local state (useState) for UI-only concerns

localStorage (Zustand persist)
    ↕ sync via Zustand middleware
Settings Store (in-memory)
    ↕ subscribe via useSettingsStore()
React Components
```

---

## Build Order (Dependencies Drive This)

The architecture has clear dependency layers. Build from the bottom up:

### Layer 0: Foundation (build first, everything depends on this)
1. **`db.ts` schema overhaul** — Clean types, proper indexes, all tables at current version. No orphaned indexes. All schema decisions made here propagate up. Must be done before any service can be written.
2. **`types.ts`** — Consolidated re-export of all db interfaces + any shared domain types. Prevents circular imports.

### Layer 1: Services (build second, hooks depend on these)
3. **Domain services** (`intake-service`, `health-service`, `eating-service`, `urination-service`, `defecation-service`) — Existing, overhaul for clean types + Zod validation.
4. **Medication services** (`medication-service`, `medication-schedule-service`, `dose-log-service`) — Rebuild; most complex, highest business logic density.
5. **`analytics-service`** — New; depends on all domain services being stable.

### Layer 2: Hooks (build third, components depend on these)
6. **Domain query hooks** — Wrap services in React Query. Overhaul invalidation strategy.
7. **`use-analytics-queries`** — New; wraps analytics-service.

### Layer 3: UI (build last)
8. **Medication UI** — Prescription list, dose logging, inventory views. Depends on stable hooks.
9. **History/analytics UI** — Chart components. Depends on analytics hooks.
10. **Settings UI** — Depends on settings-store shape being stable.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Direct Dexie Access from Components or Hooks

**What people do:** Import `db` from `db.ts` in a hook or component and write `db.prescriptions.toArray()` directly.

**Why it's wrong:** Business logic leaks into the wrong layer. Services cannot be unit-tested without mocking an entire React component tree. Cross-table invariants (e.g., "only one active phase") get duplicated or forgotten.

**Do this instead:** All `db.*` calls live in `src/lib/*-service.ts` files. Hooks call services. Components call hooks.

### Anti-Pattern 2: Broad Query Invalidation

**What people do:** On any mutation, invalidate every query key to be "safe":
```typescript
qc.invalidateQueries(); // invalidates everything
```

**Why it's wrong:** Forces re-fetching of all cached data on every user action. For an app with 14 tables and complex dose-log views, this causes visible UI jank and unnecessary IndexedDB reads.

**Do this instead:** Invalidate only the domains the mutation actually affects. The `useInvalidateMeds()` pattern (shared within one hook file) is the correct approach — it is explicit and auditable.

### Anti-Pattern 3: Implicit Phase Activation Side Effects

**What people do:** Set a phase to "active" by direct update: `db.medicationPhases.update(id, { status: "active" })`.

**Why it's wrong:** The invariant (only one active phase per prescription) is violated silently. The database ends up with two "active" phases and dose-log generation becomes undefined.

**Do this instead:** Use `activatePhase(id)` or `startNewPhase(input)` from `medication-service.ts` — these functions handle completing the current active phase inside a Dexie transaction before activating the new one.

### Anti-Pattern 4: Storing Calculated State in the Database

**What people do:** Store "currentAdherenceRate" or "daysOfSupplyRemaining" as columns in Dexie tables.

**Why it's wrong:** These are derived values. Caching them in the database creates sync problems (value can get stale if underlying records change without the calculation being re-run), and they do not map cleanly to cloud sync (which value "wins" on conflict?).

**Do this instead:** Calculate derived values in the service layer at query time, or in React Query selectors. `daysOfSupplyRemaining` = `currentStock / dailyDosage` — compute this in the analytics service or a selector function, never persist it.

### Anti-Pattern 5: Putting Analytics Queries in Domain Services

**What people do:** Add a function `getIntakeWithUrinationCorrelation()` to `intake-service.ts`.

**Why it's wrong:** Intake service now imports from urination service, creating cross-domain coupling. Adding more domains to the correlation requires modifying both services. This pattern scales badly.

**Do this instead:** All multi-domain queries go in `analytics-service.ts`. Domain services stay focused on their own table.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Perplexity AI | Server-side proxy via `/api/ai/parse` and `/api/ai/medicine-search`. Key stored in env var, never client-exposed. Client authenticates via `AI_AUTH_SECRET` shared secret. | Pattern is correct. Overhaul should verify auth middleware is applied consistently to all AI routes. |
| Privy Auth | Client-side provider in `providers.tsx`. Auth state flows via `usePrivy()` hook. `LOCAL_AGENT_MODE=true` bypasses for E2E. | Whitelist enforcement is critical — validate at the API route level too, not just UI guards. |
| Future NanoDB/Dexie Cloud | Will wrap Dexie instance. Requires string UUIDs as PKs (already in use), `createdAt`/`updatedAt` on all records, soft deletes via `isActive`. Sync will add `owner` and `realmId` fields automatically. | The current schema is already mostly sync-ready. Gaps: some tables missing `updatedAt`, some audit actions missing from `AuditAction` union type. |

### Internal Boundaries

| Boundary | Communication | Rule |
|----------|---------------|------|
| Components → Hooks | React hook calls, mutation callbacks | Components MUST NOT import from `src/lib/` |
| Hooks → Services | Direct async function import | Hooks MUST NOT import from `src/lib/db.ts` |
| Services → DB | Dexie `db` singleton | Services MUST NOT import from other services' internal helpers; import public API only |
| dose-log-service → medication-service | `adjustStock()`, `getActiveInventoryForPrescription()` | Allowed cross-service call because dose logging owns the stock depletion side effect. Document this dependency explicitly. |
| analytics-service → domain services | Public service functions | analytics-service reads, never writes. |
| API routes → Services | None — API routes are server-only and have no access to Dexie (IndexedDB is browser-only) | API routes handle AI proxy only; they do not read/write health data |

---

## Scaling Considerations

This is a single-user, offline-first app. "Scaling" here means data volume over years of daily use, not multi-tenancy.

| Scale | Architecture Adjustment |
|-------|--------------------------|
| 1-2 years of data (~10K-50K records) | Current architecture handles this. Dexie with proper indexes (timestamp, type, prescriptionId) is fast enough for all current queries. No changes needed. |
| 5+ years of data (~100K+ records) | Cursor-based pagination (already implemented in `intake-service`) should be used consistently across all domains. Add compound indexes for common filter patterns (e.g., `[timestamp+type]` for intake). |
| Cloud sync enabled | Add `dexie-cloud-addon` wrapper around db instance. All existing UUIDs and `createdAt` fields are already compatible. Schema migration to add `realmId` scoping needed but non-breaking. |
| AI analysis feature | `analytics-service.ts` becomes the AI data access layer. AI queries call service functions, get typed results. No raw Dexie access from AI layer. |

### First Performance Bottleneck

The most likely performance issue is `getDoseLogsWithDetailsForDate()` in `dose-log-service.ts` — it currently loads ALL prescriptions, ALL phases, ALL schedules, and ALL inventory items into memory on each render to build a lookup map. This is fine at 5-10 prescriptions but degrades at scale. Mitigation: add specific index queries (`where("prescriptionId").anyOf(activePrescriptionIds)`) instead of loading all records and filtering in JS.

---

## Sources

- Existing codebase: `/home/ryan/repos/Personal/intake-tracker/src/lib/` and `/home/ryan/repos/Personal/intake-tracker/src/hooks/` — direct analysis (HIGH confidence)
- [Dexie.js official docs — offline-first architecture](https://dexie.org/) (HIGH confidence)
- [Dexie Cloud sync requirements — ID format, schema conventions](https://dexie.org/docs/cloud/index) (HIGH confidence)
- [LogRocket: Offline-first frontend apps in 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) (MEDIUM confidence)
- [React Query + IndexedDB patterns](https://tanstack.com/query/v4/docs/framework/react/plugins/persistQueryClient) (HIGH confidence)
- [fake-indexeddb for Dexie unit testing](https://github.com/dumbmatter/fakeIndexedDB) (MEDIUM confidence — Vitest integration has known rough edges)
- [Next.js Vitest testing guide](https://nextjs.org/docs/app/guides/testing/vitest) (HIGH confidence)
- PROJECT.md: `/home/ryan/repos/Personal/intake-tracker/.planning/PROJECT.md` (authoritative project constraints)

---

*Architecture research for: Offline-first health tracking PWA with medication management*
*Researched: 2026-03-02*
