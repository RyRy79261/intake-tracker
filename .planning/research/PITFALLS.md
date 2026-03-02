# Pitfalls Research

**Domain:** Offline-first health tracking PWA with medication management (Next.js 14 + Dexie.js/IndexedDB)
**Researched:** 2026-03-02
**Confidence:** HIGH (codebase inspection + verified sources for domain-specific risks)

---

## Critical Pitfalls

### Pitfall 1: Dexie Schema Version Rollback is Impossible

**What goes wrong:**
Once a Dexie version N is deployed and users open the app, their browsers store the DB at version N. If you must roll back to a previous deployment that declared a lower version, IndexedDB will refuse to open the database — causing a hard crash for all affected users. There is no rollback path.

**Why it happens:**
IndexedDB is forward-only by spec. Dexie multiplies version numbers by 10 internally (Dexie `version(9)` = IndexedDB version 90), which doesn't help — the same constraint applies. Developers assume "rolling back the deploy" restores the old state, but the schema version is stored in the browser, not in the deploy.

**How to avoid:**
- Never deploy a new Dexie version without full confidence it works. Use feature flags to gate new schema-dependent features.
- If a migration is found to be broken post-deploy, the fix is a new version (v10 → v11) that corrects the data, NOT a rollback.
- Write migration tests (Playwright or unit tests with fake IndexedDB) before deploying any new `db.version()`.
- Version N must carry ALL store definitions forward — never drop a store definition that existing installs may have. Drop stores only by omitting them in a new version with no data in them.

**Warning signs:**
- Upgrade functions that use `any` types and assume fields exist without checking (`p.dosageStrength` might be undefined in versions prior to v8 — exactly what version 9 in the current codebase does).
- Upgrade functions that call `trans.table(...).where(...)` without wrapping in error handlers. A single bad record can abort the entire upgrade and leave the database in a corrupted state.
- Migration code that calls `delete obj.field` then `put(obj)` — this mutates the object from the cursor without checking the field existed.

**Phase to address:** Schema & Data Model Phase (first milestone phase). Establish a migration testing harness before writing the next version bump.

---

### Pitfall 2: useLiveQuery + React Query Dual-Subscription Stale Data Conflict

**What goes wrong:**
The codebase uses React Query hooks wrapping Dexie service calls. Dexie also offers `useLiveQuery` (reactive live subscription). If both patterns coexist in the same component tree or query scope, data can appear in two inconsistent states — React Query's cache shows stale data while `useLiveQuery` has already updated, or vice versa. Mutations via React Query that bypass `useLiveQuery` observability cause silent UI desync.

**Why it happens:**
React Query's cache is keyed by query keys and invalidated explicitly. Dexie's `liveQuery()` tracks observability through its own change notification system. They are independent state layers. When a Dexie write happens outside a React Query mutation (e.g., in an event handler calling a service function directly), React Query's cache is not invalidated, so the next render shows stale data until manual invalidation or refetch.

The current codebase uses React Query hooks (`use-medication-queries.ts`, `use-intake-queries.ts`) that wrap service functions. If any code calls the service functions directly without triggering React Query invalidation, the UI silently shows outdated values.

**How to avoid:**
Pick one reactivity model and commit to it. The recommended pattern for this project:
- Use `useLiveQuery` for read-only data subscriptions (zero stale data, automatic reactivity).
- Use React Query **only** for mutations with `onSuccess` triggering React Query invalidation OR bypass React Query entirely and let `useLiveQuery` handle reactivity.
- Never mix: don't have a `useQuery` and a `useLiveQuery` watching the same underlying table in the same component.

**Warning signs:**
- A component that imports both a React Query hook AND a `useLiveQuery` hook for related data.
- Mutation handlers that call service functions directly (outside React Query `mutationFn`) without explicit `queryClient.invalidateQueries()` after.
- UI that shows correct data after a full page reload but stale data immediately after a write action.

**Phase to address:** Service Layer Refactor Phase. Establish the reactivity pattern as a project-wide convention before refactoring individual services.

---

### Pitfall 3: Timezone-Naive Dose Scheduling for a Traveling User

**What goes wrong:**
Schedules stored as `"HH:MM"` strings (e.g., `"08:00"`) with `daysOfWeek: number[]` have no timezone context. When the user travels between South Africa (UTC+2) and Germany (UTC+1 or UTC+2 DST), "08:00" means different absolute times. Dose logs keyed by `scheduledDate: string` (YYYY-MM-DD) use the device's local date at log creation time. A dose taken at 23:00 local on day N while in Germany becomes day N+1 when viewed from South Africa — creating phantom "missed" doses or duplicate entries on day boundaries.

The current `generatePendingDoseLogs` function does `new Date(dateStr + "T12:00:00Z")` to determine day-of-week — this hardcodes UTC noon, which is wrong for determining local day-of-week in both SA and Germany depending on season.

**Why it happens:**
Medication apps that don't consider travel treat `daysOfWeek` as a static concept. But Monday 08:00 in Cape Town is not the same moment as Monday 08:00 in Berlin. DST transitions (Germany observes DST; South Africa does not) change the offset by 1 hour twice a year, causing schedule mismatches.

Known real-world failure: Apple Health app corrupts medication schedules across timezone changes, requiring users to delete and recreate schedules. Medisafe has explicit timezone documentation acknowledging this as a solved-but-complex problem.

**How to avoid:**
- Store schedule times as local-intent strings (`"HH:MM"`) but generate dose logs relative to the device's current timezone at the time of generation, not UTC.
- In `generatePendingDoseLogs`, determine day-of-week from `new Date()` in local timezone (use `toLocaleDateString('en-CA', { weekday: 'narrow' })` or `getDay()` on a local Date), never from a UTC-noon anchor.
- Add a `timezone` field to `PhaseSchedule` or `MedicationPhase` so future AI analysis can reconstruct what time a scheduled dose actually represented in absolute terms.
- Dose logs should store `actionTimestamp` (already exists, is a unix ms timestamp — correct) AND the `timezone` the device was in at action time (e.g., `"Africa/Johannesburg"`).
- For cross-domain analytics (e.g., comparing dose adherence with blood pressure readings), both must be in the same timezone or explicit UTC before correlation.

**Warning signs:**
- `scheduledDate` computed via `new Date().toISOString().split('T')[0]` — this gives UTC date, not local date.
- Day-of-week filtering using `.getDay()` on a UTC Date constructed from a date string.
- Tests that only run in one timezone and pass, but fail when `TZ=Europe/Berlin` is set.

**Phase to address:** Medication Data Model Phase. The timezone strategy must be decided before building dose log generation and retroactive dose entry.

---

### Pitfall 4: Inventory Stock Drift from Non-Atomic Dose-Take Operations

**What goes wrong:**
`takeDose()` calls `adjustStock()` and `upsertDoseLog()` as separate operations — even though there is a transaction wrapper in `adjustStock`, the outer `takeDose` function is NOT wrapped in a single Dexie transaction. If the app crashes, loses connection (unlikely since it's local), or is backgrounded after `adjustStock` succeeds but before `upsertDoseLog` completes, stock is decremented but no dose log is created. The user's pill count is now wrong with no audit trail.

Similarly, `untakeDose` restores stock only if `prev.inventoryItemId` is set — if the previous `takeDose` crashed before persisting `inventoryItemId`, the undo cannot restore stock, creating permanent stock loss.

**Why it happens:**
The `adjustStock` and `upsertDoseLog` operations touch different tables (`inventoryItems`, `inventoryTransactions` for the first; `doseLogs` for the second). Developers assume these sequential awaits are "fast enough" to be atomic, but IndexedDB does not guarantee this — tab backgrounding or browser termination can interrupt between them.

**How to avoid:**
Wrap the entire `takeDose` operation (stock adjustment + dose log upsert) in a single Dexie transaction spanning all affected tables:
```typescript
await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db.doseLogs], async () => {
  // stock adjustment
  // dose log upsert
});
```
This is the fix the overhaul phase should apply universally to all multi-table writes in the medication domain.

**Warning signs:**
- Service functions that `await serviceA()` then `await serviceB()` touching different tables without a wrapping `db.transaction`.
- Stock count that decrements but dose log shows "pending" (observable by querying both tables).

**Phase to address:** Service Layer Refactor Phase. Audit every multi-table write and wrap in a transaction.

---

### Pitfall 5: Sync-Hostile Data Model Choices Made Now

**What goes wrong:**
The current `currentStock` field on `InventoryItem` is a mutable counter. When cloud sync (NanoDB) is added later, two devices both decrementing `currentStock` for taken doses will conflict with no resolution strategy — last-write-wins will silently lose dose events and produce incorrect stock counts.

Similarly, soft-delete fields (`isArchived: boolean`, `isActive: boolean`) without `deletedAt` timestamps mean the sync layer cannot determine which device's deletion is authoritative or when it happened.

**Why it happens:**
Local-only apps naturally use mutable counters and boolean flags — they're simpler and there's no conflict. The problem emerges only when a second writer (another device, or the cloud) is introduced. By that point, changing from a mutable counter to an append-only event log requires a data migration of existing records.

**How to avoid:**
Design the inventory model as append-only from day one:
- `currentStock` on `InventoryItem` should be a derived value, computed from `inventoryTransactions` sum, not a mutable field. (The `inventoryTransactions` table already exists — use it as the source of truth.)
- Soft deletes must carry a `deletedAt: number` timestamp so sync can apply LWW correctly.
- All records must have `createdAt` and `updatedAt` Unix ms timestamps (already present on most tables).
- Never use `boolean` flags as the canonical state for sync-sensitive concepts — use a versioned status field with a timestamp.

**Warning signs:**
- `db.inventoryItems.update(id, { currentStock: newStock })` — direct mutation of a derived value.
- `isArchived: boolean` without a corresponding `archivedAt: number`.
- Any table missing `updatedAt`.

**Phase to address:** Schema & Data Model Phase. Decide the event-sourcing vs. mutable-counter question before writing migration version 10.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `any` type in Dexie upgrade functions (current v8/v9) | Migration compiles without knowing old schema shape | Type errors silently become runtime failures; corrupted data on unexpected old schemas | Never — use explicit legacy type definitions |
| `getActivePrescriptions()` does `.toArray().filter()` instead of indexed query | Simpler code | Full table scan on every render; unacceptable at 1000+ records | Only if record count is provably <100 and no indexed alternative exists |
| `currentStock` as mutable field | Dead simple to read and update | Requires rewrite before cloud sync; no audit trail for individual dose deductions | Only in a pure local-only, never-synced app |
| React Query wrapping Dexie service calls | Familiar pattern | Dual reactivity layer — RQ cache can become stale vs. IndexedDB reality | Only if `useLiveQuery` is not available or causes renders in SSR contexts |
| `scheduledDate` as YYYY-MM-DD local string without timezone | Simple date grouping | Timezone-crossing dose events assigned to wrong day | Never for a traveling user |
| Backup service omitting prescription/medication tables | Simpler export | User restores from backup and loses all medication history — catastrophic | Never — medication history must be in backup |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Perplexity API (food parsing) | Sending full food descriptions including medication names or context | Strip all non-food content before API call — `sanitizeForAI` exists but must be enforced at all call sites |
| Privy auth | Assuming `usePrivy()` is available in SSR / middleware | Guard all Privy hooks with `typeof window !== 'undefined'`; the current pattern skips Privy when `NEXT_PUBLIC_PRIVY_APP_ID` is unset — this must remain consistent |
| Web Push Notifications | Registering SW push subscription before user grants permission, causing silent failure | Always request permission explicitly before subscribing; check `Notification.permission` before relying on push for medication reminders |
| Next.js App Router + Dexie | Calling `db.*` methods in RSC (React Server Components) | Dexie is client-only; all Dexie calls must be in `'use client'` components or client-side hooks. Current architecture does this correctly — must not regress during overhaul |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `.toArray().filter()` for indexed fields | Slow load times on medication and history views | Use `.where(indexedField).equals(value)` — Dexie indexes are defined in schema | Noticeable at ~500+ records; will break history analytics with years of data |
| Loading all tables to build `DoseLogWithDetails` (current pattern in `getDoseLogsWithDetailsForDate`) | Entire prescriptions, phases, schedules, and inventory tables loaded on every date navigation | Use indexed `.where()` lookups instead of `toArray()` + in-memory Map joins | Noticeable at 20+ active prescriptions; unacceptable at 50+ |
| `generatePendingDoseLogs` called on every date view (generates + inserts for every view) | Sluggish date navigation; duplicate pending logs if called concurrently | Call once per calendar day, not per component mount; use a date-keyed flag to skip re-generation | Breaks with rapid date navigation or concurrent renders |
| Full `db.prescriptions.toArray()` in `getActivePrescriptions()` | Unnecessary load of inactive prescriptions | Add `isActive` compound index or filter at the DB level | Minor now; noticeable when user accumulates historical prescriptions |
| Backup export loading all records into memory simultaneously | Memory spike / browser tab crash on large exports | Stream export using `db.table.each()` or chunk by date range | Breaks at ~10,000+ records across all tables |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Perplexity API key in `localStorage` as plain text (current: uses XOR obfuscation) | API key readable by any JavaScript on the page, any browser extension, any XSS payload | Move API key to server-side env var; the key should ONLY exist in `PERPLEXITY_API_KEY` server env — the `/api/ai/parse` route already proxies it. Remove client-side key storage entirely. |
| IndexedDB health records readable without decryption by default | Browser profile access (shared computers, device theft) exposes complete health history | The `crypto.ts` module exists but is NOT integrated into record storage — medication and health records are stored plaintext in IndexedDB. For this single-user PWA, PIN-gated access is the primary control; encryption-at-rest should be a documented decision, not an accident. |
| PIN stored hash in `localStorage` (verify via `pin-service.ts`) | Brute-forceable offline if localStorage is extracted; PBKDF2 with 100k iterations mitigates but short PINs (4 digits = 10k possibilities) are still vulnerable | Document the threat model. For health data, the PIN is a UX gate, not a cryptographic guarantee. If device-level encryption (iOS/Android) is active, this is acceptable. If not, advise longer PIN. |
| Audit log in IndexedDB with no integrity protection | Audit log can be silently modified or deleted by a compromised page context | For the planned audit trail, consider append-only semantics enforced at the service layer (no `update` or `delete` operations on `auditLogs` table). |
| `sanitizeForAI()` only applied at some call sites | PII leakage to Perplexity API | Enforce at the API route level, not just in the client service — the API route must sanitize incoming text even if the client forgot to. |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Take all" doses button with no confirmation for a traveler mid-timezone-change | Accidentally marks morning SA doses as taken in Germany time context | Show the detected timezone and scheduled local time before bulk-take; require explicit confirmation if device timezone differs from last known timezone |
| Inventory view showing multiple entries for "same" compound (SA brand + Germany brand) without clear grouping | Confusing — user cannot tell which pills to count | Group inventory items under their parent Prescription with region/brand sub-labels; the current model supports this but the UX must make the hierarchy visible |
| Retroactive dose logging defaulting to current time instead of schedule time | User logs a missed 8am dose at 2pm and the log says 2pm, corrupting adherence analytics | Retroactive dose UI should pre-fill with the `scheduledTime` and only allow override, not default to now |
| Backup/export that silently omits medication history | User believes they have a full backup; they do not | The current `backup-service.ts` exports intake/weight/BP/eating/urination/defecation but NOT prescriptions, phases, inventory, or dose logs. This is a critical gap for the overhaul. |
| Refill alert showing "X days of supply remaining" without specifying which inventory item | Ambiguous when SA and Germany brands both have separate stock | Alert must name the specific inventory item (brand name + strength + region) to be actionable |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Medication backup:** Backup service exports health records but NOT medication data (prescriptions, phases, inventory, dose logs). Verify `exportBackup()` includes all tables before shipping.
- [ ] **Dose log generation timezone:** `generatePendingDoseLogs` uses `"T12:00:00Z"` anchor — verify this produces correct day-of-week for both UTC+2 (SA) and UTC+1/+2 (Germany) in all DST scenarios.
- [ ] **Multi-table transaction atomicity:** `takeDose` and `skipDose` span multiple tables outside a single Dexie transaction — verify every dose state-change function is fully atomic before shipping.
- [ ] **Stock deduction unit alignment:** `adjustStock(inventoryItemId, -dosageAmount)` where `dosageAmount` is the scheduled dose in mg, but `currentStock` is in pills. If these units diverge (e.g., schedule says "250mg" but inventory tracks "half-pills"), stock math is silently wrong. Verify unit consistency throughout the dose-take flow.
- [ ] **Phase transition atomicity:** `activatePhase` and `startNewPhase` complete the old phase and activate the new one. Verify this is in a single transaction — it is NOT in the current implementation of `activatePhase` (the transaction wraps only `medicationPhases`, but completing the old phase and activating the new one are two separate `update` calls that could interleave).
- [ ] **Dexie upgrade function error handling:** Upgrade functions in v8 and v9 have no `try/catch`. If any single record fails migration (e.g., a null `prescriptionId`), the entire upgrade transaction aborts and the app is bricked. Verify upgrade functions are defensive.
- [ ] **Service worker update notification:** PWA users may run stale JS after a deploy. Verify the service worker shows an "update available" prompt — otherwise medication schedule changes in a new deploy are invisible to users running the old cached version.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Broken Dexie schema migration in production | HIGH | 1. Deploy a new version (N+1) with corrective upgrade function. 2. The upgrade must handle both clean installs and the broken state. 3. Notify users to open the app while online. 4. Document: there is NO rollback. |
| Corrupted `currentStock` due to non-atomic dose-take | MEDIUM | Re-derive stock by summing `inventoryTransactions` — the transactions table is the ground truth. Add a "recalculate stock" admin tool to settings. |
| Timezone-shifted dose logs in wrong `scheduledDate` | MEDIUM | Surgical migration: for each DoseLog, cross-check `actionTimestamp` (unix ms) against `scheduledDate` (string) to identify implausible gaps (e.g., action at 11pm local but scheduledDate = tomorrow). Flag for user review. |
| useLiveQuery not updating after bulk write | LOW | Known Dexie issue (#2067): bulk delete/put may not fire change events correctly. Mitigation: use `liveQuery` with a dependency that changes with each mutation, or wrap bulk ops in explicit notification. |
| Safari 7-day ITP data deletion | HIGH | Not recoverable after the fact. Prevention: prompt users to export backup regularly. Document this limitation in the app's settings screen. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Schema rollback impossibility | Schema & Data Model Phase | Migration test harness with fake-indexeddb; every version bump has a test |
| useLiveQuery + React Query conflict | Service Layer Refactor Phase | Codebase search for components using both patterns; lint rule if possible |
| Timezone-naive scheduling | Medication Data Model Phase | Tests run with `TZ=Europe/Berlin` and `TZ=Africa/Johannesburg`; dose log date assertions |
| Non-atomic dose-take operations | Service Layer Refactor Phase | Code review checklist: every multi-table write wrapped in `db.transaction` |
| Sync-hostile mutable currentStock | Schema & Data Model Phase | Architect decision: stock as derived value from transactions before v10 |
| Backup missing medication tables | Data Export/Backup Phase | Integration test: export → clear → import → verify all medication records present |
| Non-defensive upgrade functions | Schema & Data Model Phase | Upgrade functions tested with records missing expected fields |
| API key in client storage | Security Phase | Search codebase for `perplexityApiKey` in localStorage access; remove all |

---

## Sources

- Dexie.js GitHub Issue #1599: DB version downgrade is impossible — [dexie/Dexie.js#1599](https://github.com/dexie/Dexie.js/issues/1599)
- Dexie.js GitHub Issue #2067: useLiveQuery not updating on bulk delete — [dexie/Dexie.js#2067](https://github.com/dexie/Dexie.js/issues/2067)
- Known IndexedDB Bugs (pesterhazy gist): Safari 7-day ITP deletion, transaction auto-commit, WAL growth — https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a
- Medisafe timezone documentation: pro-tip page acknowledging timezone complexity — https://medisafeapp.com/timezone/
- Apple Community: medication schedule corruption on timezone change — https://discussions.apple.com/thread/254486433
- Pitfalls of React Query (nickb.dev): stale data from missing invalidation — https://nickb.dev/blog/pitfalls-of-react-query/
- Codebase inspection: `src/lib/db.ts`, `src/lib/dose-log-service.ts`, `src/lib/medication-service.ts`, `src/lib/backup-service.ts`, `src/lib/date-utils.ts`, `src/lib/security.ts` (March 2026)

---
*Pitfalls research for: Offline-first health tracking PWA + medication management (Intake Tracker)*
*Researched: 2026-03-02*
