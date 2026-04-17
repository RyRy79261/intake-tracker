# Phase 43: Sync Engine Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 43-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 43-sync-engine-core
**Areas discussed:** Queue + ordering, API surface, Triggers & conflict edges, Scope + observability

---

## Queue + Ordering

### Q1 — How should dirty records be tracked for push?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated op-log table | New Dexie `_syncQueue` table appended on every write. Explicit FIFO, crash-safe, decoupled from data rows. | ✓ |
| Dirty flag on rows | Add `_dirty` / `_syncedAt` columns to every data table. Simpler schema but awkward for deletes and requires v16 migration touching all 16 tables. | |
| Hybrid | Dirty flag for upserts, op-log entries only for deletes. Two mechanisms to reason about. | |

**User's choice:** Dedicated op-log table

### Q2 — How should push enforce parent-before-child ordering for inner FKs?

| Option | Description | Selected |
|--------|-------------|----------|
| Static topo sort in code | Hardcoded table priority list derived from the Phase 42 FK graph. Simple, auditable. | ✓ |
| Dynamic dependency tracking | Each op declares parent IDs; pusher holds ops until parents confirm. Runtime complexity. | |
| Server-side reorder | Client pushes unordered; server sorts and applies in one transaction. Splits schema knowledge across two places. | |

**User's choice:** Static topo sort in code

### Q3 — How are successful pushes removed from the op-log?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete on ack | Server confirms; client deletes those rows. Clean, matches FIFO op-log. | ✓ |
| Soft-mark with status | `status: pending\|sent\|acked\|failed` column. History preserved; needs cleanup. | |
| Delete + audit log | Delete on ack, append to a separate `_syncAudit` table. Extra table. | |

**User's choice:** Delete on ack

### Q4 — How are coalesced writes handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Coalesce on enqueue | Existing queued upsert for same record gets `enqueuedAt` bumped. Push reads current Dexie row at flush. | ✓ |
| Keep every op | Append a row per write. Preserves history; wastes bandwidth. | |
| Claude's discretion | Let planner decide based on benchmark patterns. | |

**User's choice:** Coalesce on enqueue

---

## API Surface

### Q5 — How should sync API routes be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Two generic endpoints | `POST /api/sync/push` + `POST /api/sync/pull`. Single round-trip per sync cycle. | ✓ |
| Per-table endpoints | 16+ routes, N round-trips per sync cycle. | |
| RPC-style with action discriminator | One route, all logic in a discriminator. Muddier for monitoring. | |

**User's choice:** Two generic endpoints

### Q6 — What payload does push send per op?

| Option | Description | Selected |
|--------|-------------|----------|
| Full row + op tag | `{table, op, row}`. Idempotent, easy to debug. | ✓ |
| Diff / changed-fields only | Tighter bandwidth but record-level LWW makes diffs mostly pointless. | |
| Full row upserts / id-only deletes | Delete ops skip the row body. Minor bandwidth win. | |

**User's choice:** Full row + op tag

### Q7 — How does pull discover changes?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-table `updatedAt` cursor | `{tableName: lastPulledUpdatedAt}` map in Dexie `_syncMeta`. Scales with change rate. | ✓ |
| Single global cursor | One timestamp across all tables. Scans every table; skew-sensitive. | |
| Server-issued opaque cursor | Server returns a token the client echoes back. Over-engineered for single-user. | |

**User's choice:** Per-table `updatedAt` cursor

### Q8 — How should the pull response be paginated?

| Option | Description | Selected |
|--------|-------------|----------|
| Soft cap per table | Up to N rows per table; `hasMore: {tableName: bool}`. Bounded memory. | ✓ |
| No pagination | One giant response. Breaks on bulk first-login pulls. | |
| Claude's discretion | Planner picks cap and strategy. | |

**User's choice:** Soft cap per table

---

## Triggers & Conflict Edges

### Q9 — When should push fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced after-write + `online` event | ~2–5s debounce, immediate on reconnect, plus `visibilitychange → visible`. | ✓ |
| Periodic timer | Every N seconds regardless of activity. Battery cost. | |
| After-write only (no debounce) | Noisy; rapid edits become rapid network calls. | |
| Debounced + periodic safety net | Above plus a low-frequency periodic. Belt-and-suspenders. | |

**User's choice:** Debounced after-write + online event

### Q10 — When should pull fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Startup + after each successful push + `online` event | No periodic; push→pull catches other-device changes on next use. | ✓ |
| Startup + periodic | Pull every N minutes. Wastes requests for single-user. | |
| Startup + after push + periodic safety net | Above plus low-frequency safety net. | |

**User's choice:** Startup + after each successful push + online event

### Q11 — How should push retries / backoff behave on failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff with cap + jitter | 2s → 4s → 8s → 16s… capped at 60s, ±20% jitter. No max-retries. | ✓ |
| Exponential with max retries then dead-letter | Move failed ops to a `_syncDeadLetter` table after N attempts. | |
| Fixed interval retry | Every 30s forever. Thundering-herd on reconnect. | |

**User's choice:** Exponential backoff with cap + jitter

### Q12 — What are the conflict-resolution edge rules?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-authoritative + `deletedAt` wins ties | (a) Record LWW by `updatedAt`; (b) exact tie → server wins; (c) non-null `deletedAt` either side → deleted wins; (d) client trusts server's returned `updatedAt` on ack. | ✓ |
| Pure `updatedAt` LWW | Newer `updatedAt` wins on every field including deletes. Resurrection-from-delete bug is easy to trigger. | |
| Client-authoritative | Client always wins on push. User can't recover bad data from server. | |

**User's choice:** Server-authoritative + deletedAt wins ties

---

## Scope + Observability

### Q13 — What service coverage should Phase 43 include?

| Option | Description | Selected |
|--------|-------------|----------|
| Pilot with 1 service (intakeRecords) | End-to-end proof against simplest service. Phase 44 wires the other 14 + UI. | ✓ |
| Pilot with 2 services (intake + prescription→phase pair) | Exercises FK ordering in real code. Splits prescription domain across phases. | |
| All 15 services wired, sync off by default | P44 becomes "flip flag + UI". Biggest phase; largest redesign cost. (User initially selected this, then revisited.) | |

**User's choice:** Pilot with 1 service (intakeRecords)

**Notes:** User originally selected "All 15 wired, sync off by default" out of concern about backup coverage during the P43→P44 gap. On discussion, the tradeoff was reframed:
- `src/lib/backup-service.ts` already provides full manual JSON export covering all 16 tables.
- Historical data only reaches Neon in Phase 45 regardless of P43 scope — the "automatic backup sooner" value of Option C is limited to the short P43→P44 window.
- User volunteered a real data export for dev/test use; this lives at `.private-fixtures/intake-tracker-backup-2026-04-17.json` (git-ignored) and doubles as the interim backup and as a dev-seed fixture.
- With that in hand, Option A (pilot with 1 service) minimizes engine-redesign cost and keeps P43 focused on engine correctness.

### Q14 — Where does the engine expose status for Phase 44's UI & debugging?

| Option | Description | Selected |
|--------|-------------|----------|
| Zustand store (`sync-status-store.ts`) | New store with `persist` middleware. Ephemeral in memory, persisted fields to localStorage. Matches `settings-store.ts` pattern. | ✓ |
| Dexie `_syncStatus` singleton table | `useLiveQuery` reactivity, transactional with data writes. Overkill for ephemeral UI chrome. | |
| In-memory event emitter only | Simplest; loses `lastPushedAt` on reload. | |

**User's choice:** Zustand store

---

## Claude's Discretion

- Exact debounce value for after-write push trigger (2–5s range).
- Exact soft-cap for pull response per table (~500 rows).
- Whether `_syncQueue` gets a compound index on `(tableName, recordId)` for fast coalesce lookup.
- Test strategy for FK topo-sort coverage (since pilot service has no inner FKs, dedicated unit test).
- Exact shape of the server-authoritative ack payload.
- Whether the pilot enqueue goes through a helper or inlines per method.

## Deferred Ideas

- Wiring sync into the remaining 14 services (Phase 44).
- Sync status UI in Storage & Security settings (Phase 44).
- User-facing "clear failed op" debug affordance (Phase 44).
- Migration wizard + row-count verification (Phase 45).
- Per-field timestamp merge (future milestone).
- Cross-tab sync-status broadcasting (future milestone).
- Dead-letter queue + recovery UI (future milestone).
