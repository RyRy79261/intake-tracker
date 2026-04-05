# Phase 3: Service Layer Rebuild - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild all medication services with transactional atomicity, timezone-aware scheduling, and fractional dose math. Additionally, migrate ALL services (not just medication) to useLiveQuery for reads. Includes a Dexie v11 schema migration for timezone fields and schedule time format changes. Includes audit logging inside medication mutations and a rebuilt debug panel.

</domain>

<decisions>
## Implementation Decisions

### Reactivity Model
- **useLiveQuery for all reads, all services** — not just medication. Every domain (intake, health, eating, urination, defecation, daily notes) switches from React Query reads to useLiveQuery
- **useMutation kept for writes** — loading/error/retry states from React Query remain for mutations. No manual queryClient.invalidateQueries needed since useLiveQuery auto-reacts to DB changes
- **No invalidation calls** — useLiveQuery handles read freshness. Remove all invalidation logic from mutation hooks
- **Future sync concern noted:** NeonDB/cloud sync will eventually write to IndexedDB, which useLiveQuery will pick up automatically. The pattern is sync-compatible

### Timezone Strategy
- **Schedule times stored in UTC** — user sets "08:00" in Berlin (UTC+1), stored as 420 (minutes from midnight UTC = 07:00 UTC). Display layer converts to local timezone
- **Storage format: `scheduleTimeUTC` (integer, minutes from midnight UTC) + `anchorDate` (unix ms timestamp of when schedule was created/set)** — integer for clean recurrence math, anchorDate for historical context
- **IANA timezone stored on every record** — dose logs, intake records, health records, ALL record types get a `timezone` field (e.g., "Africa/Johannesburg", "Europe/Berlin") for cross-domain analysis
- **Dexie v11 migration** for timezone fields and schedule time format conversion
- **Migration backfill rules:** records before 2026-02-12 get "Africa/Johannesburg", records from 2026-02-12 onward get "Europe/Berlin". New records use detected device timezone
- **Schedule time migration:** existing "HH:MM" strings converted to UTC minutes using device timezone at migration time

### Stock Unit Model
- **Schedule dosage in mg, stock in fractional pills** — schedule says "2.5mg", inventory item has strength "10mg/pill", pills consumed per dose = 2.5/10 = 0.25 pills. Always derived, never stored
- **Stock can be fractional** — e.g., 14.75 pills (half a pill left in the bottle)
- **Event-sourced with cached field** — `currentStock` on InventoryItem is a cache, updated atomically inside the same transaction as each inventoryTransaction write. inventoryTransactions remain the source of truth
- **Automatic stock recalculation** — on app launch, re-derive currentStock from transactions to catch any drift. No manual button needed
- **Warn on odd fractions** — if dose_mg / pill_strength gives a non-clean fraction (not 1/2, 1/4, 1/3), warn the user about possible misconfiguration
- **Active inventory item per prescription** — dose depletes the currently active inventory item. Only one active at a time per prescription
- **Leftover stock preserved** — when switching active inventory (e.g., SA to Germany brand), old item keeps its fractional stock. Can switch back later
- **Negative stock allowed with warning** — don't block dose logging over inventory bookkeeping. Show toast warning when stock depleted
- **Doses without inventory supported** — dose logs can have no inventoryItemId. Service layer supports retroactive inventory assignment for when stock is added later

### Transaction Boundaries
- **Every dose state change is atomic** — take, skip, untake, reschedule each wrap stock adjustment + dose log + audit log in a single db.transaction()
- **takeAllDoses: individual transactions per dose** — each dose in a bulk operation is its own atomic transaction. One failure doesn't block others
- **Phase activation invariant transactional** — activatePhase wraps deactivate-old + activate-new in one transaction. Only one active phase per prescription enforced atomically

### Dose Log Generation
- **Pattern is Claude's discretion** — whether to pre-create pending records or derive from schedule at read time, Claude picks the most performant and logical approach
- **UX goal: Medisafe-style daily dashboard** — open app, see today's doses with states (pending/taken/skipped), mark all, edit individual
- **Past dates show missed doses** — viewing a historical date shows the full expected schedule including doses where no action was taken
- **No time limit on missed doses** — all missed doses visible since schedule was active, no rolling window

### Service API Shape
- **Read functions return T directly (throw on error)** — all services, all domains. useLiveQuery expects direct return values
- **Mutation functions keep ServiceResult<T>** — consistent with Phase 2 work. useMutation callbacks check .success
- **All read functions across all services updated** — not just medication

### Non-Medication Service Scope
- **Full cleanup pass** — while touching hooks for useLiveQuery migration, also fix .toArray().filter() anti-patterns, add timezone fields, tighten types
- **All service read functions drop ServiceResult** — return T directly across intake, health, eating, urination, defecation, daily notes, backup services

### Audit Logging
- **Added in Phase 3** (not deferred to Phase 9) — natural time to add since every medication service function is being rebuilt with proper transactions
- **All medication mutations logged** — take dose, skip, untake, reschedule, add prescription, update phase, adjust stock, activate phase, delete operations. Complete trail
- **Append-only at service layer** — production code only adds to auditLogs, never updates or deletes
- **Debug panel CRUD** — audit log update/delete only available in debug panel during development

### Error Recovery
- **Toast notifications for failures** — matches existing toast pattern. Clear messages like "Couldn't take dose -- no active inventory for Dapagliflozin"
- **Never block adherence over inventory** — allow dose logging even with zero/negative stock

### Debug Panel
- **Included in Phase 3** — rebuild the existing debug panel with: view/clear audit logs, recalculate stock, view raw records
- **Existing debug panel will be replaced** during the rebuild

### Claude's Discretion
- Dose log generation pattern (pre-create pending vs derive from schedule)
- Debug panel access pattern (dev flag, long-press, settings sub-page)
- useLiveQuery hook structure and naming conventions
- Stock recalculation timing and implementation details
- Audit log entry schema (what fields to include per entry)

</decisions>

<specifics>
## Specific Ideas

- Medisafe daily dashboard as the UX reference: open app, see day's doses with states, mark all, edit individual
- Real-world pill scenario: Daglif 5mg (take half = 2.5mg), then only 10mg generic available (take quarter = 2.5mg), then up-titrate to 5mg 2x/day (take half of 10mg). Burn rate must adapt automatically as prescription phase changes OR inventory brand changes
- When new inventory is added after doses were taken without stock, offer to retroactively assign those un-inventoried doses to the new stock (reconciliation flow — UX belongs in Phase 6, service layer support in Phase 3)
- Travel date: moved from SA to Berlin on 2026-02-12 — used for migration backfill timezone split

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ServiceResult<T>` type (`src/lib/service-result.ts`): Keep for mutations, drop for reads
- `syncFields()` utility (`src/lib/utils.ts`): Generates createdAt, updatedAt, deletedAt, deviceId — needs timezone field added
- `date-utils.ts`: Basic local/timestamp helpers — needs UTC schedule time conversion functions
- Existing `db.transaction()` calls in `medication-service.ts`: Good patterns for addPrescription, deletePrescription — extend to dose operations
- `buildTransaction()` helper: Already creates inventoryTransaction records — extend with timezone
- Toast hook (`src/hooks/use-toast.ts`): Existing pattern for error communication

### Established Patterns
- Services in `src/lib/*-service.ts`, hooks in `src/hooks/use-*-queries.ts` — hooks layer is the migration target for useLiveQuery
- React Query hooks currently handle all reads + mutations with cache invalidation — reads switch to useLiveQuery, mutations stay as useMutation
- Compound index patterns established in Dexie v10 schema — extend for v11

### Integration Points
- All 10 hook files need useLiveQuery migration
- All 12 service files need read functions updated (drop ServiceResult)
- `src/lib/db.ts` needs v11 schema with timezone fields + schedule time format
- `src/hooks/use-medication-queries.ts` is the most complex — handles dose logs with details, prescriptions, inventory
- Audit log writes integrate into every medication service transaction
- Debug panel replaces existing implementation

</code_context>

<deferred>
## Deferred Ideas

- Retroactive inventory assignment UX (reconciliation flow when adding stock after un-inventoried doses) — Phase 6 (Medication UX Core). Phase 3 provides the service layer support
- Push notification scheduling based on dose schedule data — Phase 11
- Android app packaging for proper background scheduling — future milestone

</deferred>

---

*Phase: 03-service-layer-rebuild*
*Context gathered: 2026-03-05*
