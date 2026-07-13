# Implementation Plan — intake-tracker MCP/schema/UI fixes

Audit ref `f2bb91b`; verifiers re-read at HEAD. Ground truth = verified findings, which override the brief where noted below.

## Verification summary

All 8 Workstream-A items, both Workstream-B items, all 5 Workstream-C items, and all 8 D-dependencies were **confirmed** (`accurate` or `partly`). No claim was found inaccurate. Every A-item is fully additive with **zero migrations**; only B1 requires a migration.

**Line-ref / substance drifts to apply (do not code the brief verbatim):**
- **A1 / D3:** `substance_records` has **no `note` column**. Select `description` (notNull) + `originalInputText` as the note-equivalents. A literal `.note` select will fail to compile.
- **A2:** hydration key is the substance id embedded in `intake_records.source` as `substance:<id>`, resolved against `substanceRecords.id` — **not** `sourceRecordId` (that reverse link is unused on the live water-intake write path). Parse the id **in the query fn**, not client-side regex. Select add is at `queries.ts:169–176`.
- **A3:** the substance sub-query is `queries.ts:283–301` (268 is a comment; type decl 272–281), not `268–301`.
- **A4:** derived `archived` must use a `CASE` guard (see PR-A4) — a bare `deletedAt IS NOT NULL` is wrong for hard-gone rows (`NULL IS NOT NULL` = FALSE in SQL, so it would report a hard-deleted prescription as `false`/live).
- **A5 / D4:** `strength` and `unit` are **already** in the select — only `compounds` is missing. Sign convention corrected: amounts are already signed and `'consumed'` is **not always negative** (untake writes a positive `'consumed'` reversal at `dose-log-service.ts:375`). Correct stock = **type-agnostic `SUM(amount)`** (mirror `inventory-service.ts:268–276 getCurrentStock`), but **add `deletedAt IS NULL`** — the canonical helper omits it (latent bug; do not copy that omission). Fall back through `currentStock` to `0` for zero-transaction legacy items (see PR-A5). No `Math.max(0,…)` — negative stock is legal by design.
- **B1 / D1:** `actionTimestamp` stays **nullable** ("required for PRN" is app-level validation, not DB NOT NULL — scheduled `pending` rows legitimately null it). `status` CHECK is **unchanged** (PRN uses `status='taken'`). Brief step "extend sync payload union" is **unnecessary** — the union is drizzle-zod-derived (`createInsertSchema`), so column adds/nullability relax flow in automatically (D7). **The DB cross-field CHECK is *not* reflected into the drizzle-zod insert schema** — the client-side write path (C4) must construct CHECK-satisfying rows itself (see PR-B1 note + PR-C4).
- **Dexie version:** CLAUDE.md says "version 14" — **stale**. Live `DB_SCHEMA_VERSION = 21` (`db.ts:550`). New block is `version(22)`. **Footgun:** `db.ts` defines `version(21)` (line 490) *before* `version(20)` (line 520) in file order — copy the store list from the **numerically-highest** block, not the file-last one.
- **Migrations dir** is `packages/db/migrations/` (+ `meta/_journal.json`), **not** a repo-root `drizzle/`.
- **Journal cutoff:** wall-clock (≈2026-07-13) is past 2026-05-31; newest entry `0018` (`when=1781797699476`) already exceeds all hand-edited fakes. `pnpm db:generate` sorts correctly with **zero `_journal.json` hand-editing**.
- **Test landscape:** there are **no existing tests** for `queries.ts`/`tools.ts` (mcp/ tests cover only OAuth/tokens/scopes/whitelist). Standing up the first query-fn test harness against Neon/Drizzle is **greenfield infra**, not a routine per-PR line — it is broken out as **PR-A0** and blocks every Group-1 query-fn test. Service tests use Dexie and are **not** a drop-in template.

**Blocked:** C4 and the PRN portion of A8 are hard-gated on B1 (`dose_logs.phase_id`/`schedule_id` are `.notNull()`; `TakeDoseInput` requires both). Every Group-1 query-fn test is gated on PR-A0.

---

## Owner decisions (decide before the tail PRs)

**Decision 1 — C3 `irregularHeartbeat` semantics.**
- **Recommend: persist explicit `false`** on every manual BP save (drop the `&&` guard at `blood-pressure-card.tsx:116` and `:159` so the boolean state is always written). Column is already nullable — **no migration**.
- Tradeoff: historical rows stay `null`, so old data keeps the "normal vs. not-recorded" conflation (mixed semantics going forward). The alternative (leave writes as-is, document `null = not flagged` in schema comment + MCP tool description) is docs-only but preserves the ambiguity permanently. Persisting `false` is the honest, near-zero-cost fix.

**Decision 2 — B2 sodium naming scope.**
- **Recommend: do the model-facing/API rename now** (`salt_mg → sodium_mg` in `get_today_summary`, accept `'sodium'` as an input alias on `query_intake_history` alongside `'salt'`, schema comment documenting the stored `'salt'` enum as legacy-sodium, docs + tool descriptions). **No migration, no parity/sync change.**
- Tradeoff: the `salt_mg → sodium_mg` output key is a **breaking model-facing rename** — must land tool-description + `docs/mcp-connector.md` updates in the same PR. Explicit non-goal held: **do not rename the stored `'salt'` enum value** (would touch the CHECK constraint, Dexie stores, drizzle-zod union, parity tests, and deployed rows). The alias must map `'sodium' → 'salt'` with **no numeric conversion** (values are already sodium mg; the 2.5× hazard is exactly what this mitigates).

*(The test-harness strategy in PR-A0 is an infra decision, not an owner decision — it is decided in-plan below, but call it out at kickoff since all of Group 1 depends on it.)*

---

## PR units

### Group 0 — Test infrastructure (prerequisite for Group 1)

**PR-A0 — MCP query-fn test harness** · infra prerequisite · **M**
- No existing test exercises `queries.ts`/`tools.ts`; the mcp/ suite covers only OAuth/tokens/scopes/whitelist, and the Dexie-based service tests are not a template for these Neon/Drizzle query fns. This is the real cost the "new query-fn tests" line hid.
- **Infra decision — seed a real Postgres, not a db mock.** A4's `CASE`/`archived` logic and A5's `COALESCE(SUM(...))`/NULL-over-zero-rows semantics are precisely what a hand-rolled db mock would paper over; the harness must evaluate **real SQL**. **Implemented by reusing the repo's existing Testcontainers Postgres harness** (`apps/web/src/__tests__/helpers/test-db.ts` + `vitest.integration.config.ts`) — it already spins up real Postgres 16 with the committed migrations applied, so no pglite / new dependency was added (the pglite recommendation was superseded once the existing infra was found). Seeds per-test fixture rows and hands the drizzle `db` to each query fn via a top-level `vi.mock('@intake/db/client')`.
- Deliver a reusable `withSeededDb(fixtures, fn)` helper + one smoke test against an existing query fn (`queryWeightHistory`) to lock the pattern (range guard, `MAX_ROWS+1` truncation, `isNull(deletedAt)`, user scope, audit row). Every Group-1 query-fn test builds on this helper.
- No product code, no schema/parity change. Gate: helper green, smoke test green.

### Group 1 — Pure-additive MCP (no migration, no parity/sync change; **depends on PR-A0**)

Every PR here edits the same three files: `apps/web/src/lib/mcp/queries.ts` + `apps/web/src/lib/mcp/tools.ts` + `docs/mcp-connector.md`. **These are shared-file hotspots — the group is logically independent but physically serialized.** Concretely-conflicting spots: the `tools.ts` import block, the docs tool table (~L270–280), and the single **"claude.ai lists N tools" count line (~L347)**. Treat Group 1 as a **serial rebase train**, not parallel work (see Sequencing). Each PR still has an independent, reviewable diff; only integration is serial.

**Tool-count reconciliation (the ~L347 line):** start `8` → A1 adds `query_substance_history` (+1) → A7 adds `query_urination_history` + `list_titration_plans` (+2, or +3 if the optional `list_daily_notes` ships). A3 **removes a field, not a tool** (no decrement). **Final = 11** (12 if the optional daily-notes tool lands). Whichever PR merges last must leave the count line at the reconciled value; earlier PRs bump incrementally.

Replicate the range-tool boilerplate from `query_weight_history` (export `queryX(userId, [type], range)` → `and(eq(userId), gte/lte(timestamp,range), isNull(deletedAt), …)` → `.orderBy(asc(timestamp)).limit(MAX_ROWS+1)` → `capRows`; register via `runTool`; `validateRange` **inside** the closure; `argsForAudit` = safe primitives only). Use explicit `isNull(table.deletedAt)` (not the unused `notDeleted()` helper).

**PR-A1 — `query_substance_history`** · delivers A1 · **S** · *tests depend on PR-A0*
- New `querySubstanceHistory(userId, type, range)` in `queries.ts` (`substanceRecords` already imported at L21). `type: 'caffeine'|'alcohol'|'all'`; `'all'` omits the `type` eq filter (mirror `queryIntakeHistory` typeFilter L164–167,184). Select `id, type, amountMg, amountStandardDrinks, abvPercent, volumeMl, description, originalInputText, source, sourceRecordId, groupId, groupSource, timestamp` — **all substance amount fields nullable per row** (amountMg is caffeine-only). `idx_substance_type_ts` covers it.
- `registerTool('query_substance_history', …)` with `dateRangeShape` + `type` enum. Docs row + **bump tool count 8 → 9**.
- Tests (on the A0 harness): `querySubstanceHistory` query-fn test (range guard, `type` filter, truncation, tombstone filter, audit row).

**PR-A2 — `query_intake_history` linkage + substance hydration** · delivers A2 · **M** · *tests depend on PR-A0; **co-edits `query_intake_history` with PR-B2 — must not run concurrently (see Sequencing: A2 before B2)***
- Add `groupId, groupSource` to the select (`queries.ts:169–176`) — trivial additive.
- Second batched query: collect rows where `source` startsWith `'substance:'`, strip prefix → ids, `inArray(substanceRecords.id, ids)` + `eq(userId)` + `isNull(deletedAt)`; attach nullable `{substanceType, description, abvPercent, amountStandardDrinks, amountMg}` per row. Water totals unchanged (additive only).
- Tests: query-fn test asserting hydrated object on `substance:%` rows, `null` otherwise, tombstoned substance excluded, cross-user scoped.

**PR-A3 — fix `query_eating_history` substances join** · delivers A3 · **S** · **depends on PR-A1** (repoints to it)
- Option (b): delete the substance sub-query (`queries.ts:283–301` + surrounding decl/comment 268–306), return only capped eating rows. **Keep** the `substanceRecords` import (A1 uses it). Repoint tool description (`tools.ts:206–207`) at `query_substance_history`.
- Behavior removal on a model-facing tool → A1 must be merged first; update tool description + docs. **No tool-count change** (a field is removed, not a tool).
- Tests: assert eating result no longer carries `substances`; description mentions the new tool.

**PR-A4 — dose names through tombstones + authoritative schedule times** · delivers A4 + A6 · **S** · *tests depend on PR-A0*
- A4 (`listRecentDoses`, join `queries.ts:412–419`): remove **only** `isNull(prescriptions.deletedAt)` from the leftJoin; **keep** `eq(prescriptions.userId, userId)` (cross-user name leak otherwise). Add derived `archived` with a **null-preserving `CASE`**:
  ```ts
  archived: sql`CASE WHEN ${prescriptions.id} IS NULL THEN NULL
                    ELSE (${prescriptions.deletedAt} IS NOT NULL) END`
  ```
  This yields **`null` for a hard-gone (fully-unmatched) prescription**, `true` for soft-deleted, `false` for live — three distinct states. A bare `${prescriptions.deletedAt} IS NOT NULL` is **wrong**: for an unmatched left-join row `deletedAt` is NULL and `NULL IS NOT NULL` evaluates to **FALSE**, collapsing hard-gone into "live." (If the owner instead prefers `false` for hard-gone, that must be a deliberate call — the A4 finding wants null-for-unmatched, so the `CASE` is the default.)
- A6 (`queries.ts:361–368`): add `scheduleTimeUTC` (minutes-from-midnight UTC int) + `anchorTimezone` (IANA) to the schedules select; keep `time`; mark `time` deprecated in tool description (`tools.ts:224`). Document units in the description.
- Tests: dose with soft-deleted prescription resolves name + `archived:true`; **hard-gone (no matching prescription) → `archived:null`, name null**; medication list returns UTC fields.

**PR-A5 — `get_inventory_status` authoritative stock** · delivers A5 · **M** · *tests depend on PR-A0*
- Replace `currentStock: inventoryItems.currentStock` (`queries.ts:432`) with a grouped signed `SUM(inventory_transactions.amount)` per item — **type-agnostic**, `eq(userId)` + `isNull(inventoryTransactions.deletedAt)`. `idx_inventory_tx_item_ts` covers the aggregation. No `Math.max`.
- **Final fallback: `COALESCE(SUM(amount), currentStock, 0)`.** `currentStock` is nullable, so the two-arg `COALESCE(SUM, currentStock)` still returns NULL for a legacy item with null `currentStock` and zero transactions — pin the trailing `0`. **Intent to state in code comment + test:** SUM over **zero rows is NULL** (not 0), so an item with **no non-deleted transactions** falls through to `currentStock`/`0` (COUNT=0 case), whereas an item whose transactions **net to zero** yields SUM=0 and correctly **shows `0`** (real balance). COALESCE distinguishes these *only* because SUM-over-empty is NULL — do not "fix" it to `SUM(COALESCE(amount,0))`.
- Add `compounds` (jsonb) to select (`strength`/`unit` already present).
- Tests: signed-sum incl. positive `'consumed'` reversal; tombstoned transaction excluded; **net-zero transactions → `0`**; **zero-transaction legacy item with null `currentStock` → `0` (not null)**; negative stock preserved.

**PR-A7 — `query_urination_history` + `list_titration_plans`** · delivers A7 (+ optional `list_daily_notes`) · **S** · *tests depend on PR-A0*
- Import `urinationRecords`, `titrationPlans` into `queries.ts`.
- `query_urination_history`: range-validated pattern; select `id, timestamp, amountEstimate (text category, describe as such), note`. `idx_urination_user_updated`.
- `list_titration_plans`: plain user-scoped list (mirror `listMedications` shape) — **no `validateRange`, no `dateRangeShape`**. Select `id, title, conditionLabel, recommendedStartDate, status, notes, warnings`.
- Both: `isNull(deletedAt)` + user scope. **Bump tool count +2** (→ 11; +3 → 12 if the optional `list_daily_notes` also ships) + docs rows.
- Tests: urination range guard + truncation; titration list user-scoped, no range param.

### Group 2 — Sodium naming (API-only)

**PR-B2 — sodium rename + `get_today_summary` substances** · delivers B2 + A8 (non-PRN) · **M** · *tests depend on PR-A0; **co-edits `query_intake_history` with PR-A2 — sequence after A2, do not run concurrently***
- Schema comment on `schema.ts` `intakeRecords.type` documenting `'salt'` as legacy-sodium — **generates no migration** (comment only).
- `query_intake_history`: accept `'sodium'` as input alias mapping to stored `'salt'`, no numeric conversion; keep `'salt'`. Update `tools.ts` input enum description. *(This is the second edit to `query_intake_history`; A2's select/hydration change must already be in main — resolve the shared function once.)*
- `get_today_summary` (`queries.ts:62–153`): rename output key `salt_mg → sodium_mg` (map at 132–143,148); keep `row.type==='salt'` storage matcher **unchanged**. Add `substances_today: {caffeine_mg: SUM(amountMg WHERE type='caffeine'), alcohol_standard_drinks: SUM(amountStandardDrinks WHERE type='alcohol')}` over the `[startTs, nowTs]` day window, `eq(userId)` + `isNull(deletedAt)` (mirror intake groupBy 67–82).
- Update `tools.ts:127–128` description + `docs/mcp-connector.md`.
- Files: `queries.ts`, `tools.ts`, `packages/db/src/schema.ts` (comment), `docs/mcp-connector.md`.
- No Dexie/migration/parity/sync change. Tests: today-summary substances aggregate; `sodium_mg` key present; `'sodium'` alias returns salt rows.

### Group 3 — Schema migration (PRN)

**PR-B1 — PRN dose logging** · delivers B1 (+ D1/D6/D7/D8) · **L** · needs Dexie bump + Drizzle migration + parity match; sync union **auto-derived**
- `packages/db/src/schema.ts` `doseLogs`: drop `.notNull()` from `phaseId` (496–498) + `scheduleId` (499–501); add `kind text NOT NULL DEFAULT 'scheduled'` + `CHECK(kind IN ('scheduled','prn'))` + cross-field `CHECK(kind='prn' OR (phase_id IS NOT NULL AND schedule_id IS NOT NULL))`; add optional `doseMg real`. Leave `actionTimestamp` nullable, `status` CHECK unchanged. The `NOT NULL DEFAULT 'scheduled'` backfills existing **Postgres** rows at ALTER time, so server-side every row has `kind` (MCP queries can rely on it).
- **CHECK is not enforced client-side.** `createInsertSchema` (drizzle-zod) does **not** reflect CHECK constraints into the sync insert schema, so a malformed dose row (e.g. `kind='prn'` with a non-null phase, or `kind='scheduled'` missing an id) passes client zod validation and only fails at the server insert. The invariant must therefore be guaranteed by the **write path** (PR-C4's PRN service + the existing scheduled path), not relied upon from the payload schema. Called out again in PR-C4.
- `packages/types/src/records.ts` `DoseLog` (304–305): `phaseId?`/`scheduleId?` optional; add **`kind?: 'scheduled'|'prn'`** (optional client-side — matches the DB DEFAULT, which makes it optional in the derived insert schema) + optional `doseMg`. **Same-named fields both sides** or parity test (b)/(c) fails; nullability is invisible to parity.
- `apps/web/src/lib/db.ts`: new `version(22)` block **repeating all 18 app stores + 3 internal (`_syncQueue`/`_syncMeta`/`_errorLogs`)** — copy from the numerically-highest block (`version(21)`). Bump `DB_SCHEMA_VERSION → 22`. Verify `PREVIEW_STORES` (db.ts:557–564) still reflects the doseLogs shape.
- **Backfill sub-decision — default-at-read, not a Dexie `.upgrade()` rewrite.** A `.upgrade()` that stamps `kind:'scheduled'` onto every existing local `doseLog` would **dirty every row and enqueue a full dose-log re-sync push**. **Recommend instead: make `kind` optional client-side and default it to `'scheduled'` at read/query time** (any local row lacking `kind` reads as scheduled). This avoids the churn entirely; new/edited rows carry `kind` explicitly, and legacy Postgres rows already have it from the ALTER DEFAULT. The insert schema stays happy because `kind` is optional (DB DEFAULT). If the owner prefers a clean local column instead, the `.upgrade()` backfill is the alternative — **explicitly accept the one-time full re-sync of all dose logs** in that case. Plan proceeds with default-at-read.
- Migration: `pnpm db:generate` → numbered SQL + snapshot under `packages/db/migrations/` + real-`Date.now()` journal append. **Do not touch `_journal.json`.** Never `drizzle-kit push`.
- **No manual edit** to `sync-payload.ts`/`sync-topology.ts` (column-only change; `createInsertSchema` derives it; `NOT NULL DEFAULT kind` becomes optional in the insert schema). Keep the `zod/v4` import path if you touch that file.
- Tests: `schema-parity.test.ts` (kind/doseMg on both sides), `drizzle-journal.test.ts` (strictly-increasing, no future-date — passes with generated `when`), `sync-payload.property.test.ts` (table-name granularity — unaffected, doseLogs already listed). Add a **default-at-read** unit test (legacy doseLog with no `kind` reads as `'scheduled'`; no re-sync enqueued).

### Group 4 — UI

**PR-C1 — food/composable event-time input** · delivers C1 · **S** · independent, shippable now
- `apps/web/src/components/food-salt/food-section.tsx`: add `const [showTimeInput,setShowTimeInput]=useState(false)` + `const [customTime,setCustomTime]=useState(getCurrentDateTimeLocal())`; render `CollapsibleTimeInputControlled` (`apps/web/src/components/collapsible-time-input.tsx:74–123`); replace unconditional `timestamp` (L289) with `showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined` passed to `addComposableEntry(input, timestamp)` (L338) — default now preserved. Copy the exact BP/weight idiom (`blood-pressure-card.tsx:402`, `weight-card.tsx:231`).
- Tests: `food-section.dom.test.tsx` + `food-section.flow.test.tsx` (both exist) — add a backdated-timestamp case. No schema/migration.

**PR-C2 — voice-flow event-time** · delivers C2 · **M** · independent
- `apps/web/src/lib/voice-types.ts`: add optional `timestamp` to `VoiceParsedItem`.
- `apps/web/src/components/voice/voice-panel.tsx`: batch-level time control (default now) + thread `item.timestamp ?? batchTimestamp` into **every** branch of `commit()` (153–316): `addComposableEntry` (230–237, add 2nd arg), `addIntake` (181/189), `addSubstance` (241/251), BP/weight/urination/defecation.
- **Verify per-branch forwarding before threading — do not assume.** Only the intake/substance/BP/weight add-mutations are confirmed to forward a `timestamp`, and `useAddSubstance` was a **known drop** (fixed below). The **urination and defecation add hooks/services are unverified** and may be additional forwarding gaps. For each, confirm the add hook accepts a `timestamp` and the service reads `input.timestamp`; if it drops it like `useAddSubstance` did, **widen it the same way** (thread through hook → service). Treat urination/defecation as suspect until checked.
- **Widen `useAddSubstance`** (`apps/web/src/hooks/use-substance-queries.ts`) to forward `input.timestamp` on the caffeine/alcohol path (currently drops it — the one confirmed forwarding gap). `addSubstanceRecord` already reads `input.timestamp` at `substance-service.ts:26`.
- `apps/web/src/components/voice/parsed-item-row.tsx` ItemEditor (116–407): per-item time override field.
- Keep AI relative-phrase parsing (stretch) as **suggestion-only, never silently applied**; if done, touches `/api/ai/voice-parse` + prompt. **Env check:** this reuses the existing Anthropic key — **no new env var**, so the turbo `globalEnv` `strict`-mode rule is N/A. If `/api/ai/voice-parse` is a genuinely new route, confirm it references only already-declared secrets (`ANTHROPIC_API_KEY`) before merge.
- Tests: `parsed-item-row.dom.test.tsx` (exists) + a **new** `voice-panel.dom.test.tsx` (none today), covering at least one backdated urination/defecation commit if those branches were widened.

**PR-C3 — `irregularHeartbeat` honesty** · delivers C3 · **S** · **owner Decision 1 first**
- If persist-false (recommended): `blood-pressure-card.tsx` — replace the `...(irregularHeartbeat && {irregularHeartbeat: true as const})` spreads at L159 (add) and L116 (edit `buildUpdates`) with unconditional `irregularHeartbeat: <boolean state>`. Column already nullable — **no migration**.
- Tests: `blood-pressure-card.dom.test.tsx` + `edit-blood-pressure-dialog.dom.test.tsx` — assert `false` persisted on a normal save.

**PR-C4 — PRN "Log dose now" + PRN dose path + today/recent-doses PRN visibility** · delivers C4 + A8-PRN · **M** · **depends on PR-B1**
- New PRN service path (e.g. `dose-log-service.ts`): `kind:'prn'`, null `phaseId`/`scheduleId`, `scheduledDate`/`scheduledTime` = taken date/time, `status:'taken'`, `actionTimestamp` set, optional `doseMg`. Reuse the existing `type:'consumed'`, `amount:-pillsConsumed`, `doseLogId` inventory-decrement shape (`dose-log-service.ts:292–305`).
- **CHECK-satisfying construction is this PR's responsibility.** Because the DB cross-field CHECK is invisible to the drizzle-zod sync schema (see PR-B1), the service must guarantee the invariant so a bad row can never reach sync: PRN writes set `kind='prn'` with **both** `phaseId` and `scheduleId` null; the existing scheduled path must set `kind='scheduled'` with **both** ids non-null. Add a service-level assertion/guard and a test that a PRN row has null phase/schedule and a scheduled row has both.
- `apps/web/src/components/medications/prescription-card.tsx`: for `isAsNeeded` (L74) prescriptions, add a "Log dose now" button (currently only a text label 77–78) opening a time control — reuse `CollapsibleTimeInputControlled` (C1) or the existing `RetroactiveTimePicker`.
- A8-PRN: verify PRN `status:'taken'` doses surface in `get_today_summary` doses block and `list_recent_doses` (name resolution from PR-A4); add explicit inclusion if the today-summary dose query is date-scoped past PRN rows.
- Tests: `prescription-card.dom.test.tsx`; a dose-log-service PRN unit test (creates CHECK-valid row, decrements inventory). Inherits B1's migration/parity gates.

**PR-C5 — weight context (optional, P3)** · delivers C5 · **skip or lightweight**
- Recommend **reuse existing `note` field** (pure UI on `weight-card.tsx`, no schema change) or **skip**. A real `context` enum column pulls the full table tax (Dexie v-bump + migration + parity + sync) — not worth it this pass.

---

## Sequencing & parallelization

```text
Track 0 (infra — must land first for Group 1 tests):
  PR-A0  (query-fn harness)

Track 1 (MCP, no migration — logically independent but SERIALIZED on shared files;
         run as a rebase train, not concurrently):
  PR-A0 ─▶ PR-A1 ─▶ PR-A2 ─▶ PR-B2
                 ├▶ PR-A3            (after A1; repoints to it)
                 ├▶ PR-A4
                 ├▶ PR-A5
                 └▶ PR-A7
   (A2 → B2: both edit query_intake_history — never concurrent)
   (all Track-1 PRs touch queries.ts/tools.ts/docs incl. the tool-count line — serial merges)

Track 2 (schema/PRN — serial; genuinely parallel to Tracks 1 & 3):
  PR-B1 ─▶ PR-C4     (C4 hard-blocked on B1; A8-PRN folds into C4)

Track 3 (UI event-time — parallel, independent files):
  PR-C1   (now)
  PR-C2   (now)
  PR-C3   (after Owner Decision 1)
  PR-C5   (optional / skip)
```

- **Group 1 is not truly parallel.** A1/A2/A3/A4/A5/A7/B2 all edit `queries.ts`, `tools.ts`, and `docs/mcp-connector.md` — including the `tools.ts` import block and the single tool-count line (~L347). Land them as a **serial rebase train** in the order above; the diffs are independently reviewable but integration conflicts otherwise. Final tool count reconciles to **11** (12 with the optional `list_daily_notes`): A1 +1, A7 +2/+3, A3 ±0.
- **A0 before every Group-1 query-fn test** (the harness they all import).
- **A1 before A3** (A3 repoints to A1). **A2 before B2** (co-located `query_intake_history` edits; no *semantic* dependency but a physical conflict).
- **B1 before C4** and before the **PRN portion of A8** (folded into C4). A8's *substance* aggregate (in PR-B2) does **not** need B1.
- **B2 before/with A8** — both rename the same `get_today_summary` key; combined in PR-B2.
- Tracks 2 and 3 touch disjoint files from Track 1 and may proceed alongside it.
- **Recommended merge order:** PR-A0 → PR-A1 → PR-A2 → PR-B2 → PR-A3 → PR-A4 → PR-A5 → PR-A7 → PR-B1 → PR-C4; UI (C1/C2/C3) interleave anywhere on their own track.

---

## Per-PR verification checklist

**Every PR:** `pnpm lint`; `pnpm build`; colocated unit + `*.dom.test.tsx`; conventional-commit title; open ready-for-review (not draft) so CodeRabbit runs.

| PR | Extra gates |
|---|---|
| A0 | Testcontainers Postgres (reused `test-db.ts`) applies committed drizzle schema; fixture builders + `queryWeightHistory` smoke test green (range guard, `MAX_ROWS+1`/`truncated`, `isNull(deletedAt)`, user scope). No product/schema change. |
| A1, A2, A4, A5, A7 | New query-fn tests **on the A0 harness** (range guard, `MAX_ROWS+1`/`truncated`, `isNull(deletedAt)`, user scope, **audit row written**). Update `docs/mcp-connector.md` table + tool-count line to the reconciled value. schema-parity/journal **untouched** (assert no diff). |
| A3 | Confirm A1 merged first; description repointed; substance import retained; **tool count unchanged** (field removed, not tool). |
| A4 | Cross-user name cannot leak (userId scope retained in join). **`CASE` yields `null` for hard-gone, `true` soft-deleted, `false` live** — assert all three, and that a bare `IS NOT NULL` is not used. |
| A5 | `deletedAt IS NULL` on the sum; positive-`consumed` reversal handled; **`COALESCE(SUM, currentStock, 0)` — zero-tx null-currentStock item → `0`, net-zero txns → `0`**; negative allowed. |
| B2 | Sequenced after A2 (shared `query_intake_history`). `sodium_mg` output + tool desc + docs updated; `'sodium'` alias returns salt rows with **no** numeric conversion; **no** migration emitted (comment-only). |
| B1 | `schema-parity.test.ts` green (kind/doseMg both sides); `drizzle-journal.test.ts` green (**no `_journal.json` hand-edit**); `sync-payload.property.test.ts` green; generated SQL reviewed under `packages/db/migrations/`; Dexie `version(22)` repeats all stores; `DB_SCHEMA_VERSION=22`; **default-at-read** test (legacy row reads `'scheduled'`, no re-sync enqueued). Run `pnpm db:generate` (never `push`). |
| C1, C2, C3, C4 | Colocated dom tests (+ new `voice-panel.dom.test.tsx` for C2). Playwright `pnpm test:e2e` green for entry flows. |
| C2 | Urination/defecation add hooks verified to forward `timestamp` (widened if they drop it); `useAddSubstance` forwards `timestamp`; no new env var (or new `/api/ai/voice-parse` route uses only declared secrets). |
| C4 | Inherits B1 gates; PRN dose-log **constructs CHECK-valid rows at the service layer** (kind='prn' → null phase/schedule; scheduled → both non-null); inventory-decrement unit test. |

**Manual connector smoke (post-merge, from the brief):**
1. `query_substance_history` over 2026-07-06→13 returns the nine alcohol rows **with ABV** (PR-A1).
2. `query_intake_history` water rows for those drinks carry hydrated substance info (PR-A2).
3. `get_inventory_status` stock matches transaction sums (PR-A5).
4. A PRN furosemide dose logs, decrements Defulide stock, and appears in `list_recent_doses` + `get_today_summary` (PR-B1 + PR-C4).

---

## Out of scope (non-goals — confirmed respected)

- **No storage rename of the `'salt'` enum value** this pass (B2 is API/model-facing + schema comment only; stored enum, Dexie stores, drizzle-zod union, parity, deployed rows untouched).
- **MCP stays read-only** — every A-item and the PRN visibility work is `SELECT`-only; no write/update/delete tool added. The PRN *write* (C4) goes through the existing Dexie service + sync path, **not** the connector.
- **No consumable-catalog / analyte-registry / EAV redesign** — existing composable-entry + `substance_records` model retained.
- **No change to alcohol-volume-counts-as-fluid semantics** (intended: total ingested volume).
- **No `_journal.json` hand-editing** (past the 2026-05-31 cutoff).
- **No new env var** — nothing added to turbo `globalEnv` (C2's AI stretch reuses the existing Anthropic key; confirm at merge if the voice-parse route is new).
- Weight `context` as a real column (C5) — deferred; reuse `note` or skip.

---

*Scope note: the brief says "20 brief items," but A1–A8 + B1–B2 + C1–C5 = **15 items**, all covered (A6 folds into PR-A4; A8 splits across PR-B2 for the non-PRN substance aggregate and PR-C4 for the PRN portion). Nothing is missing.*