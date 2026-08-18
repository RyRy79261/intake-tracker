# V2 Intake Schema Proposal — Spec Prep

**Status:** architect's proposal, pre-spec. Final. Schema/data-model only.
**Date:** 2026-08-10.
**Baseline:** Dexie v22 (`apps/web/src/lib/db.ts:657`), 18 synced tables, Drizzle journal head `0019_uneven_ben_urich`.
**Scope:** the record model, its migration, its sync/server mirror, and the AI contract that fills it. UI implementation and the service/hook rewrite are acknowledged in §8 but not specified.

## Executive summary

The app stores one physical consumption event as several rows across three tables (`intakeRecords`, `substanceRecords`, `eatingRecords`), linked by a `groupId` that owns nothing and is enforced by nothing, and it computes every daily metric as a `SUM` over rows selected by a type predicate that no writer is obliged to respect. That is the whole of the double-counting problem behind issue #322 and commit `3070320`: a 500 ml drink can be booked as hydration by two different writers and the day reads 1 000 ml.

This document proposes replacing the three tables with a single `intakeEntries` row per consumed thing — a named root line item that exclusively owns **one canonical nutrient map**, carries its ingredients as a nested `components` array, represents repeats as a set of timestamped occurrences rather than a quantity multiplier, and stamps per-field provenance so re-enrichment cannot clobber a user's correction.

Nutrients are a single `jsonb` map whose keys are defined in one **nutrient registry module** (§2.3), so every measurable nutrient is first-class — same provenance, same three-state distinction, same participation in totals, same analytics — and adding vitamin D is a registry entry plus a deploy, not a Drizzle migration, a Dexie version block, a parity-test edit and a payload-schema edit. Historical water content is corrected by a **deterministic classifier plus a pure re-derivation** (§4.2a) with no AI anywhere in the migration path, and misfiled rows are corrected rather than carried across (§4.2b). Alcohol keeps grams of ethanol as canonical storage and gains a **persisted display-unit preference** (metric / UK / grams) that every presentation surface — dashboard, history, analytics, CSV, MCP — reads instead of hardcoding std drinks (§2.11). A prescription can be flagged **nutritionally significant**, and taking a dose emits an `IntakeEntry` whose id is the dose log's id and which carries exactly one occurrence per dose log, so no dose edit, undo or concurrent emission can double-count (§2.10).

It also specifies the derived-totals contract that replaces every current daily sum, a migration split into two server passes (mark, then tombstone) plus a client reconciler so that no shipped client ever reads an empty corpus, the sync and Postgres changes the occurrence set forces — including one server-owned cursor column and one deliberately non-LWW table — the MCP transition contract, and the AI tool schema that fills the model. The change touches roughly **92 files, about 25 of them major**, sequenced across R0-R6, and deletes well over 1 500 lines. Rejected alternatives are in §9, the questions that remain open in §10, and the review objections that remain unresolved in the Residual Concerns section.

## Decisions taken

Four questions were put to the user and answered. The answers are settled and are woven into the sections below; this list is the record.

- **Q1 — retroactive hydration: re-derive, deterministically.** Historical rows whose water content is wrong are corrected rather than preserved with a known falsehood. A pure classifier decides which rows are wrong or suspect; a pure function corrects them from data already on the row (`abvPercent`, `volumeMl`, preset id, category vocabulary) plus a fixed table shipped in `packages/core`. No AI, no clock, no localStorage, no network — identical on every device and on the server. Rows the classifier cannot decide are marked **unknown**, never guessed. Misfiled rows are corrected by the migration. §4.2a, §4.2b, §4.3.
- **Q2 — alcohol unit: metric standard drinks by default, with a user setting.** Storage stays grams of ethanol. `alcoholDisplayUnit ∈ {metric_standard, uk_unit, grams}` is persisted in the settings store *and* mirrored to the synced `userProfile` so MCP can read it. CSV and MCP contracts are defined in terms of the setting; MCP additionally always returns the canonical grams. §2.11, §3, §5.6.
- **Q3 — every measurable nutrient is first-class.** One `nutrients` jsonb map, one registry module, no second-class tier, open key set, uniform treatment: same provenance, the same known / unknown / not-applicable distinction, participation in totals, and availability to analytics. Adding a nutrient must not cost a Drizzle migration plus a Dexie version block plus a parity-test update plus a payload-schema edit. §2.3, §2.2, §5.1, §9 R-14…R-17.
- **Q4 — supplements via prescription, with an explicit flag.** `Prescription.isSupplement` + `Prescription.supplementProfile`; taking a dose emits an entry with `id === doseLog.id` and one occurrence keyed `${doseLog.id}:dose`; untaken / skipped / rescheduled / deleted retract it by occurrence removal. §2.10.

---

## 1. PROBLEM STATEMENT

### 1.1 The bug class, stated structurally

The system stores **one physical consumption event as N rows across 3 tables**, and computes **every daily metric as a `SUM` over rows selected by a type predicate**. Those two facts together define the bug class:

> **A daily metric is a sum over a row set whose membership is decided by a predicate that no writer is obliged to respect, and whose extent is decided by a link (`groupId`) that owns nothing and is enforced by nothing.**

Concretely, hydration for a day is:

```ts
// apps/web/src/lib/intake-service.ts:104-112
const records = await db.intakeRecords
  .where("timestamp").aboveOrEqual(cutoffTime)
  .filter((r) => r.type === type && r.deletedAt === null)
  .toArray();
return records.reduce((sum, r) => sum + r.amount, 0);
```

There is **no `groupId` dedup, no `source` exclusion, no ownership check**. Every row of `type: "water"` counts, unconditionally. Therefore the correctness of "how much did I drink today" reduces to a global, unenforceable claim: *no two rows anywhere in the database describe the same millilitre*. That claim is a **convention held in prose**, not a constraint.

The three collision generators that follow from it:

**(a) Multiple writers can each mint a row for the same fluid.** Five distinct code paths can create a `type:"water"` row: `addIntakeRecord` (`intake-service.ts:11-39`), `logDrink` (`drink-service.ts:83-225`), a caller-assembled `intakes[]` entry in `addComposableEntry` (`composable-entry-service.ts:56-174`), `syncEatingGroup`'s repair branch (`composable-entry-service.ts:506-517`), and backup restore / sync pull (`backup-service.ts:522-547`, `sync-engine.ts:540`). Three of these can be invoked for the same drink. The fix in commit `3070320` did not remove the other writers — it made `logDrink` the *conventional* owner. `addComposableEntry` is still exported and still called with hand-built water intakes from `beverage-tab.tsx:71-79` (verified), `food-section.tsx:365`, `voice-panel.tsx:245` and `:307`. The invariant is a docstring (`drink-service.ts:69-78`), enforced by nothing in Dexie or Postgres.

**(b) The same physical quantity is stored twice, in two tables, with two owners.** A drink's volume lives as `intakeRecords.amount` on the derived water row (`drink-service.ts:105-121`, verified: `amount: volumeMl`) *and* as `substanceRecords.volumeMl` (`:182`/`:202`). Consistency is maintained by reconcilers that push one onto the other in opposite directions (`substance-service.ts:230-250` pushes `volumeMl → amount`; `composable-entry-service.ts:709-711` pushes `amount → volumeMl`) — and the latter only fires *if the substance already had a `volumeMl`*, so a substance created without one stays permanently desynced. Two owners of one fact is not a bug that gets fixed; it is a bug that gets *rediscovered*.

**(c) The unit of user intent and the unit of storage are different, so every edit is a partial edit.** The user's unit is "the Aperol Spritz". The storage unit is a row. There is no row that *is* the Aperol Spritz. Consequently:

- Editing a drink's amount from History (`updateIntakeRecord`, `intake-service.ts:69-85`) does not touch the substance's `volumeMl` or `amountStandardDrinks`; editing it from the Liquids card (`updateSubstanceRecord`, `substance-service.ts:213-258`) does not touch the solute rows or the water row's `note`. Same record, two blast radii.
- Deleting a drink from History (`history-drawer.tsx:112`, `records-tab.tsx:193`) orphans its substance; deleting it from the Liquids card (`classifyLiquidDelete`, `composable-entry-service.ts:226-244`) removes the group. Same record, two blast radii.
- A drink group with a solute but **no** substance — a salt- or sugar-only preset (the `hasSubstance` gate at `preset-tab.tsx:117-126` admits them, verified), or a beverage-tab water+sugar entry (`beverage-tab.tsx:71-79`) — falls through `classifyLiquidDelete`'s predicate to `scope: "record"`, leaving an orphan solute row that still counts toward the day.

### 1.2 Why the three-table + `groupId` design cannot hold the invariant

Five independent reasons, each sufficient on its own.

**(i) `groupId` has no owner row and no referential integrity.** It is a bare nullable `text` column with a plain index on all three tables (`packages/db/src/schema.ts:76`, `:165`, `:250`), no FK, no unique constraint, no root. Group membership is *discovered* by three separate `where("groupId").equals(...)` scans (`composable-entry-service.ts:288-292`). Nothing prevents an empty group, a group spanning two days, two groups with the same id, or a group with two live water rows. A link that cannot be violated is a constraint; `groupId` can be violated by an ordinary `.add()`.

**(ii) Group *kind* is inferred, never stored.** "Is this a drink or a meal?" is answered by two independently-written predicates — `substance-service.ts:150-158` (`!hasLiveEating`) and `classifyLiquidDelete` (`composable-entry-service.ts:237-243`, `!hasLiveEating && hasLiveSubstance`) — which **disagree** for a substance-less group. `groupSource` already carries the answer and is read by no branch anywhere in the app; it is a write-only tag.

**(iii) Nutrient slot identity is a magic string prefix.** Which intake row is "the meal's water" versus "the drink's water" is decided solely by `source === "manual:food_water_content"` versus anything else (`composable-entry-service.ts:346`, `:442-449`). `source` is free text with no CHECK. Nine distinct prefix formats are parsed by `getLiquidTypeLabel` (`apps/web/src/lib/utils.ts:61-124`), and `source` simultaneously encodes provenance, row identity, *and* measurement basis — `manual:salt` means "the user typed grams of table salt, so back-divide by 0.39 on edit" (`parseSodiumKindFromSource`, `composable-entry-service.ts:620`, consumed at `food-section.tsx:186-191`). A typo or a new writer using a different string silently creates a duplicate slot that `syncEatingGroup` then tombstones on the next edit.

**(iv) The sync engine has no group semantics and cannot acquire any.** Conflict resolution is **row-level last-write-wins on `updatedAt`** (`apps/web/src/app/api/sync/push/route.ts:205-279`), whole-row `onConflictDoUpdate` with no field merge. The push route has **no transaction** — it loops table-by-table, op-by-op, and a 50-op batch can half-apply and still return `200`. Pull is unconditional `db.table(tn).bulkPut(rows)` per table (`sync-engine.ts:540`). The batch window is FIFO-sliced *before* topological sort (`sync-engine.ts:137-160`, `PUSH_BATCH_CAP = 50` at `:50`), and coalescing rewrites `enqueuedAt` on every re-write (`sync-queue.ts:62-74`), so re-editing a parent moves it behind its own child. A "group" therefore has no atomicity anywhere: not on the wire, not on the server, not in the pull. It is 1-6 independent LWW cells that happen to share a string.

**(v) There is no representation for the user's actual operations.** No `quantity` field exists on any record (verified: `packages/types/src/records.ts:24-39`, `:114-127`, `:329-349`). No per-unit nutrient basis is stored anywhere in the database — the only one in the system is `LiquidPreset.*Per100ml` in **unsynced localStorage** (`apps/web/src/lib/constants.ts:111-137`). Every amount is pre-multiplied at write time and then `Math.round`ed into a Postgres `integer` column (`packages/db/src/schema.ts:73`, verified `amount: integer("amount").notNull()`; rounding at `drink-service.ts:97`, `:148`, `:181`). So "+1 another ice lolly" cannot be expressed *and cannot be derived*: `n × round(x) ≠ round(n × x)`, and the per-unit `x` was never kept.

### 1.3 The conclusion this forces

The invariant that matters — *one physical event, one owner of its quantities* — cannot be expressed as a rule about rows, because rows are not events. It can only be expressed by **making the row the event**. Commit `3070320`'s own message says the collapse "does not fix this bug — two callers can still each book the volume — and the invariant is the entire fix." That is correct *for a three-table model*: collapsing tables while keeping N-rows-per-event changes nothing. What fixes it is not fewer tables but **one row per event with exclusive ownership of every quantity that event contributes**, so that the daily sum is a projection of a set of events rather than a sum over a bag of fragments.

**And — stated up front, because it is easy to overclaim — that collapse makes the invariant *structural* on the root/child axis only.** Two entries can still each describe the same physical drink, because `writeEntry` mints one row per *call* and nothing stops two calls for one event. §2.4 R1 states exactly what is structural and §2.4 R6 states the mechanism that holds the rest.

---

## 2. TARGET MODEL

### 2.1 The shape, and the four structural calls

**Call 1 — root + children: ONE table, children EMBEDDED as a JSON column.**

Not two tables, not a self-referencing `parentEntryId`. The decisive argument is the sync engine, not aesthetics.

- **A second table** (`entryComponents`) costs a full table registration (~20 files, §8) *and* creates an orphan class with no good branch: a hard FK (`.notNull().references(...)`, the `medicationPhases.prescriptionId` pattern at `schema.ts:364-366`) turns a parent-behind-child batch into a rejection with **no `code`**, which the client retries 8 times and then **acks out of the queue and abandons** (`sync-engine.ts:331-337`, `MAX_PUSH_ATTEMPTS = 8` at `:73`) — silent, permanent data loss. A nullable soft link reproduces exactly today's `groupId` failure: a half-synced tree with no error and a wrong total.
- **A self-referencing `parentEntryId` in one table** is strictly worse than two tables: `TABLE_PUSH_ORDER` orders *between* tables only (`apps/web/src/lib/sync-topology.ts:28-55`), so within one table a child can be pushed before its parent whenever coalescing has moved the parent to the back of the FIFO window.
- **Pull makes both worse.** Each table is applied in its own transaction (`sync-engine.ts:539-546`) with `PULL_SOFT_CAP = 500` per table per request (`packages/db/src/sync-payload.ts:284`) and an early return on any network failure — so a partial tree can persist on disk indefinitely, and Dexie enforces no FKs to complain about it.

Embedding children in a `jsonb`/plain-object column makes the whole tree **one row**. One entry = one row = one push op = one pull row. The orphan class does not exist because there is nothing to orphan. Precedent for a structured JSON column that passes the parity gate as a single field name already exists: `prescriptions.compounds: jsonb("compounds").$type<{name:string;strength:number}[]>()` (`packages/db/src/schema.ts:307`, verified) against `compounds?: CompoundStrength[]` (`packages/types/src/records.ts:185`).

The cost we accept: children are not independently addressable by the sync engine, so a concurrent edit to a child on device A and to the root on device B resolves whole-entry, last-writer-wins. For a **single-user app** (stated in `CLAUDE.md`) whose devices sync on a cadence of minutes, that is acceptable, and it keeps the entry internally consistent instead of producing a Frankenstein entry whose children no longer explain its root. **It is not acceptable for the occurrence count — see Call 4.**

**Call 2 — nutrients are ONE CANONICAL MAP on the root, defined by a registry, stored PER UNIT.**

The obvious alternative — a fixed set of flat `doublePrecision` columns plus an `extraNutrients` bag excluded from every total — is rejected by the Q3 decision and by §9 R-14. Its three stated benefits were Postgres CHECK constraints, index-assisted SQL sums in MCP, and `createInsertSchema`-derived push validation; §2.3.5 audits all three against the repository.

The design is: **`nutrients: jsonb` holding `{ <registryKey>: number }`, known values only**, with `provenance: jsonb` keyed by the same registry keys, and a single **nutrient registry module** (`packages/core/src/nutrient-registry.ts`) that is the one place a nutrient is defined. §2.3 specifies the registry, the canonical form, and exactly which of the three properties survive (two of them do, and one of them turns out never to have existed).

Per unit, because occurrence count must be a real multiplier (§2.5).

**Call 3 — every stored number is a finite JS double; no `integer`, no `real`, no rounding at write time.**

`intake_records.amount integer` (`schema.ts:73`) is why `drink-service.ts:93-96` must round at mint time and why 0.4 g of sugar became a row recording zero. With per-unit × count arithmetic, integer storage is not a rounding annoyance, it is a correctness bug.

`real` (Postgres `float4`, ~7 significant digits) is wrong too: rollup sums and per-unit divisions produce values that do not round-trip through float4, which would make the cloud-migration wizard's verification (`migration-service.ts:200-217` vs `api/sync/verify-hash`) report MISMATCH on `intakeEntries` for essentially every user, after which the next pull silently rewrites the local value.

Under Call 2 the nutrient numbers live inside `jsonb`, which stores them as arbitrary-precision `numeric` — strictly better than `float8` for round-trip fidelity, and the two remaining scalar quantities (`servingVolumeMl`, `servingMassG`) stay `doublePrecision`. §2.3 states the canonical-form rules that make the jsonb round trip byte-stable under `verify-hash`.

**Call 4 — occurrences, not a `quantity` scalar.**

A `quantity: number` multiplier is the obvious design and it is wrong twice over, both times silently:

- **It corrupts every window-bounded metric that is not the entry's own day.** Three 500 ml beverages at 09:00, 17:00 and 23:00 collapse to one entry timestamped 09:00 with quantity 3. `liquids-card.tsx:279` renders `24h: {rollingTotal} ml` from `getTotalInLast24Hours` (`intake-service.ts:99-102`). At 10:00 the next morning the single timestamp falls out of the 24 h window and **all three units leave at once**: the chip reads 0 ml when the user drank 1 500 ml inside the window. The weekly grid has the same defect across midnight.
- **`quantity += 1` is strictly lossy under whole-row LWW.** Tap `+1` on the phone (q=2) and `+1` on the tablet (q=2) before either syncs; both push 2, LWW keeps 2, the user ate three. V1's repeated-row shape did **not** lose this. Since `+1` is the headline V2 interaction, that is the feature's primary failure mode.

So the entry stores an **occurrence set**, and count is derived from it:

```ts
occurrences: EntryOccurrence[];   // length >= 1
// EntryOccurrence = { id: string; at: number; removedAt: number | null }
```

This is an **LWW-element-set**: union by `id`, per-`id` last-write-wins on `removedAt` (resolved by the containing row's `updatedAt`), and `at := min(a.at, b.at)` on an id collision (so the union stays commutative and associative even when two devices minted the same synthetic id with different times — §4.2 step 5). `quantity` is **derived** (`occurrences.filter(o => o.removedAt === null).length`) and is **not a stored column** — there is exactly one owner of "how many", and it is the array.

**One normative exception to the `at := min` rule, for dose-emitted entries.** For an entry with `sourceDoseLogId != null`, an occurrence id collision resolves `at` as **last-writer-wins by the containing row's `updatedAt`** (ties broken by `min`, so the merge stays total and deterministic). The reason is §2.10: an emitted entry has exactly one occurrence per dose log by construction, and `editDoseTime` moving a dose *later* must not be discarded by a `min` rule. `unionOccurrences` therefore takes an explicit `atRule: "min" | "rowLww"` argument, chosen by `sourceDoseLogId != null` on both sides of the wire (§5.2). It is still commutative and associative: `rowLww` is a max over a totally-ordered `(updatedAt, deviceId)` pair with `min(at)` as the tie-break.

Three scalar projections are materialised alongside the array because IndexedDB and Postgres cannot index into a JSON array. **All three are computed by one fold, `projectOccurrences()`, which is the only writer of any of them, on the client and on the server:**

- `timestamp` = `min(at)` over live occurrences — the entry's "first consumed at". Used for cursor paging and for the `[nameKey+timestamp]` suggestion lookup. **It is NOT the sort key of the day list** (§3, read contract R-L).
- `lastOccurrenceAt` = `max(at)` over live occurrences — lets a window query prune to entries whose occurrence span overlaps the window.
- `deletedAt` — **derived, not an independently-LWW'd scalar.** `deletedAt != null ⟺ zero live occurrences`. See §2.5 and §5.2; this is what stops the LWW-element-set converging on the two divergent states an independently-LWW'd scalar cannot resolve.

`projectOccurrences()` is total: on an **empty live set** it returns `{timestamp: <unchanged>, lastOccurrenceAt: <unchanged>, deletedAt: now}` — it never evaluates `min`/`max` over an empty array, so `±Infinity` can never reach a `notNull` bigint column. `Number.isFinite` is asserted on both projections inside the fold, on both sides of the wire.

The cost, stated plainly: **`intakeEntries` is the one table whose pull and push cannot be whole-row LWW.** Both sides gain a per-table merge branch that unions `occurrences`, then re-projects, before applying LWW to every other column (§5.2, §5.3). That is ~60 lines in two files plus one server-owned cursor column, and it is the price of `+1` being correct across devices.

### 2.2 The interfaces, exactly as they would appear in `packages/types/src/records.ts`

Constraints these declarations must satisfy, all verified:

- Declared as `interface`, in **this file**, with **no `extends`** — `dexie-schema-extractor.ts:105-116` walks `ts.isInterfaceDeclaration` and collects only own `ts.isPropertySignature` members with identifier names (verified). A `type X = {…}` alias or an inherited field is invisible and would fail parity (`:128-133` throws).
- `records.ts` is pure types, **zero imports** — so `EntryComponent`, `EntryOccurrence`, `FieldProvenance`, `MeasurementBasisRef` and `SupplementProfile` are declared here too, and **`NutrientKey` cannot be**: it is derived from the registry, which lives in `packages/core`. The record interfaces therefore type the nutrient map as a plain `Record<string, number>`; the typed view (`Partial<Record<NutrientKey, number>>`) is a `packages/core` type used by every writer and reader. §2.3 N-6 states where key validity is enforced instead.
- Optionality is not compared by the parity test (`schema-parity.test.ts:11-13`, verified), but the push path **is** sensitive: `sanitizeRow` rewrites `undefined` **and empty string `""`** to `null` *after* Zod validation, iterating **the parsed row's own top-level keys only** (`push/route.ts:66-72` — verified: `for (const key of Object.keys(obj))`). It does **not** descend into a jsonb value, which is why a known zero inside `nutrients` survives the wire unchanged. Every user-blankable text field below is nullable in Postgres; the two that are `notNull` (`name`, `nameKey`) carry a **writer-side non-empty guarantee** (§2.8).

```ts
// ─────────────────────────────────────────────────────────────────────────
// V2 unified consumption entry
//
// ONE ROW = ONE CONSUMED ITEM, consumed one or more times. This row is the
// sole owner of every quantity that item contributes to any daily total.
// Nothing else in the database — not `components`, not a legacy table — is
// ever summed into a metric. See §2.4 and §3.
//
// All nutrient values are PER SINGLE UNIT. Totals multiply by the number of
// live occurrences inside the window. Never store a pre-multiplied value.
// ─────────────────────────────────────────────────────────────────────────

/**
 * One consumption of one unit of the entry. The array of these is the SOLE
 * owner of "how many" and "when". Merged across devices by union on `id`,
 * per-id LWW on `removedAt`, and `at := min` on id collision — except on a
 * dose-emitted entry, where `at` is row-LWW (§2.1 Call 4, §2.10, §5.2).
 * `id` is addressable: removeOccurrence(entryId, occurrenceId).
 */
export interface EntryOccurrence {
  id: string;                 // uuid, stable forever, the merge key
  at: number;                 // Unix ms this unit was consumed
  removedAt: number | null;   // null = live; number = this unit was removed
}

/** A measurement basis SNAPSHOT: what the user typed, and the exact factor
 *  used to convert it. The factor is stored, not looked up, so the inverse
 *  display is exact forever even if the constant table later changes and
 *  even for values written by V1 with a different constant (§2.3). */
export interface MeasurementBasisRef {
  id: string;          // "sodium" | "salt" | "msg" — key into MEASUREMENT_BASES
  inputUnit: string;   // the unit the user typed, e.g. "mg" | "g"
  factor: number;      // stored value = inputValue × factor (input in `inputUnit`)
}

/** Where a single field's current value came from. Per FIELD, not per record. */
export interface FieldProvenance {
  origin: "user" | "ai" | "preset" | "rollup" | "import" | "migration" | "dose";
  at: number;              // Unix ms when this origin was stamped
  model?: string;          // e.g. "claude-sonnet-4-6" — only when origin === "ai"
  promptVersion?: string;  // AI tool-schema version, e.g. "entry-parse/2"
  confidence?: number;     // 0..1, model self-report; only when origin === "ai"
  /** The id of the DETERMINISTIC RULE that produced this value, when one did:
   *  "water:ethanol-complement", "water:preset-table", "water:undecidable-alcohol",
   *  "v12:keyword-default", "supplement:scaled", … The rule id set is closed
   *  and enumerated in packages/core; §4.2a and §2.10 depend on it, and it is
   *  what makes a migrated or emitted value auditable after the fact. */
  rule?: string;
  /** The version of the deterministic module that produced this value.
   *  Set by every rule-stamped write. WATER_DERIVATION_VERSION for a
   *  `water:*` rule (§4.2a); it is what makes "which build computed this"
   *  answerable and what orders two folds of the same row (§4.2 step 5). */
  derivationVersion?: number;
  /** The provenance of the INPUT this rule consumed, when the input was
   *  itself derived rather than measured — e.g. a water figure computed from
   *  a v12 keyword-guessed substance carries "v12:keyword-default" here, so
   *  an audit surface can say "estimated from the word 'latte'" rather than
   *  presenting a guess as arithmetic (§4.2b M5). */
  derivedFrom?: string;
  /** The value this field held before the current one, whatever produced it.
   *  Provenance-NEUTRAL: it may hold an AI value a user overrode, or a user
   *  value a rollup replaced. `priorOrigin` says which. */
  priorValue?: number;
  priorOrigin?: FieldProvenance["origin"];
  basis?: MeasurementBasisRef;
  /** True when rollupComponents could only sum SOME depth-1 components for
   *  this key. The key stays ABSENT from `nutrients`; `partialValue` is the
   *  incomplete sum, for display only. KNOWN() never counts a partial. (R4) */
  partial?: boolean;
  partialValue?: number;
  /** True when writeEntry adjusted the value to satisfy a relational
   *  invariant (§2.8). Only ever set on a field whose prior origin was NOT
   *  "user" — a user-authored violation is a validation error, not a repair. */
  adjusted?: boolean;
  /** Set on a user-origin field when the entry's IDENTITY changed materially
   *  after the correction (name / servingMassG / servingVolumeMl). (§2.6) */
  staleAfterIdentityChange?: boolean;
}

/**
 * One ingredient / component of a root entry. Embedded in IntakeEntry.components.
 * Children are an EXPLANATION of the root, never a source of totals (§2.4 R3).
 * `id` is stable across AI re-runs so a re-enrichment merges instead of clobbers
 * — the AI is required to echo prior ids verbatim (§7.3 AI-6).
 *
 * ENCODING RULE (one, and only one): `amount` is the magnitude of this
 * component present in ONE UNIT OF THE ROOT, expressed in `unit`. There is no
 * separate multiplier. `nutrients` is this component's contribution to one
 * unit of the root — i.e. it is ALREADY the figure for `amount` of it.
 * Nothing anywhere multiplies a component's nutrients by anything.
 */
export interface EntryComponent {
  id: string;                 // stable within the entry; uuid at first mint
  name: string;               // "Aperol", "beef patty", "brioche bun"
  /** Enumerated — see COMPONENT_UNITS in packages/core/src/component-units.ts.
   *  Each unit carries a class: "mass" | "volume" | "count". */
  unit: string;
  amount: number | null;      // magnitude in `unit` per ONE unit of the root; null = unknown
  /** Per-one-unit-of-root nutrient contribution, same canonical map form as
   *  the root: registry keys, KNOWN VALUES ONLY, never null (§2.3 N-2). */
  nutrients: Record<string, number>;
  provenance?: Record<string, FieldProvenance>;   // nutrient keys + "_name" | "_amount" (N-8)
  /** Nested sub-components. Server-side zod caps depth at 2 and breadth at 30.
   *  Sub-components EXPLAIN this component; they are never a term in any sum
   *  at any level (§2.4 R4). */
  components?: EntryComponent[];
}

export interface IntakeEntry {
  // ── Identity & lifecycle (sync scaffold) ──
  id: string;
  createdAt: number;
  updatedAt: number;          // LWW key for every scalar column
  /** DERIVED from `occurrences`: non-null iff zero live occurrences.
   *  NOT independently LWW'd — recomputed by projectOccurrences() on both
   *  sides of every merge (§2.1 Call 4, §5.2). */
  deletedAt: number | null;
  deviceId: string;
  timezone: string;           // IANA timezone at write time

  // ── Occurrences (§2.1 Call 4, §2.5) ──
  /** Sole owner of how many units were consumed and when. Length >= 1.
   *  CANONICAL ORDER: ascending by `at`, ties broken by `id`. Both the client
   *  fold and the server union must emit this order, or verify-hash reports a
   *  MISMATCH for every entry with a +1 (deterministicJsonRow sorts object
   *  keys but leaves array order alone — verify-hash/route.ts:13-26). */
  occurrences: EntryOccurrence[];
  /** DERIVED PROJECTION: min(at) over live occurrences. Never read for a value. */
  timestamp: number;
  /** DERIVED PROJECTION: max(at) over live occurrences. Window-span pruning. */
  lastOccurrenceAt: number;

  // ── Identity of the thing consumed ──
  name: string;               // "Aperol Spritz". NOT NULL, non-blank (§2.8)
  /** Lowercased, whitespace-collapsed, punctuation-stripped `name`, with a
   *  fallback to the entry id when normalisation empties it (§2.8). */
  nameKey: string;
  /** Coarse discriminator, INDEXED with timestamp. Drives icon/colour and
   *  list grouping ONLY. It does NOT drive which nutrients are summed and it
   *  does NOT drive §3's applicability denominator — that is `provenance`
   *  alone. */
  kind: "drink" | "food" | "supplement" | "other";
  note: string | null;
  /** Verbatim user text that produced this entry (post-PII-sanitise).
   *  MANDATORY on every AI-authored write — this is what a re-run replays. */
  originalInputText: string | null;

  // ── Physical serving (§2.4) ──
  /** Physical liquid volume of ONE unit, in ml. NULL for solids — including
   *  every migrated meal (§4.2 step 5). This is the glass, NOT the hydration. */
  servingVolumeMl: number | null;
  servingMassG: number | null;

  // ── NUTRIENTS: ONE CANONICAL MAP, PER ONE UNIT (§2.3) ──
  /** Keys are NUTRIENT REGISTRY keys (packages/core/src/nutrient-registry.ts).
   *  Values are finite JS doubles >= 0. KNOWN VALUES ONLY:
   *    key present            ⇒ known (0 means known to be zero)
   *    key absent + provenance ⇒ determined to be UNKNOWN
   *    key absent, no provenance ⇒ never determined (not applicable)
   *  NEVER stores null. NEVER stores a pre-multiplied value. The typed view
   *  is Partial<Record<NutrientKey, number>> in packages/core; this interface
   *  cannot import it (records.ts has zero imports — §2.2). */
  nutrients: Record<string, number>;

  // ── Structure ──
  components: EntryComponent[] | null;

  // ── Provenance, PER FIELD (§2.6) ──
  /** Keys: every nutrient registry key, plus the reserved non-nutrient slots
   *  "_name" | "_servingVolumeMl" | "_servingMassG" | "_entry". The leading
   *  underscore is what keeps the reserved set disjoint from any legal
   *  nutrient key (§2.3 N-8). */
  provenance: Record<string, FieldProvenance> | null;

  entrySource:
    | "quick_add" | "manual" | "preset" | "voice" | "ai_text"
    | "import" | "migration" | "dose";

  /** Non-null iff this entry was EMITTED by a supplement-flagged prescription
   *  dose (§2.10). Equal to the emitting doseLog's id, which is also this
   *  entry's `id`. Its lifecycle belongs to the dose, not to the user's taps. */
  sourceDoseLogId: string | null;

  /** Non-null only on rows produced by the V1→V2 conversion. Carries the group
   *  ANCHOR ID (§4.2 step 2). Equal to `id` by construction. NOT indexed. */
  legacySourceId: string | null;
  /** The ids of every legacy row this entry subsumes, across all three legacy
   *  tables. Written by the fold; the SOLE load-bearing exclusion key for the
   *  MCP transition union (§5.8) — it makes the union exact against a
   *  half-drained push batch, because the entry carries its own membership
   *  rather than depending on a marker that lands in a later batch.
   *  Also what makes revertRepair() exact, and what tells a re-fold whether
   *  it is looking at a COMPLETE closure (§4.2 step 5). Null on V2-native
   *  entries. */
  legacyMemberIds: string[] | null;
}
```

**23 fields.** The nutrient set is one of them, whatever its size.

**Two fields added to `Prescription`** (§2.10), and one new interface, all in the same file:

```ts
/** Per-dose nutrient profile for a nutritionally-significant prescription. */
export interface SupplementProfile {
  displayName: string;   // the emitted entry's `name`, e.g. "Magnesium citrate"
  basisAmount: number;   // e.g. 200
  basisUnit: string;     // MUST equal the dose's unit (schedule.unit ?? phase.unit)
  /** Nutrients delivered by `basisAmount` `basisUnit` of this medication.
   *  Same canonical map form as IntakeEntry.nutrients (§2.3). */
  nutrients: Record<string, number>;
  /** Where each nutrient figure came from. Same keys as `nutrients`. */
  provenance?: Record<string, FieldProvenance>;
}

// on Prescription:
  /** True ⇒ taking a dose contributes to the day's nutrient totals by emitting
   *  an IntakeEntry (§2.10). Absent / false ⇒ adherence tracking only. */
  isSupplement?: boolean;
  supplementProfile?: SupplementProfile;
```

**Three fields added to the legacy record interfaces** (`IntakeRecord`, `EatingRecord`, `SubstanceRecord`), retained for as long as the legacy stores exist, which under §4.6 is indefinitely:

```ts
  /** Non-null iff the V1→V2 conversion folded this row into an IntakeEntry.
   *  Stamped in PASS A, which does NOT tombstone (§4.1). Distinguishes a
   *  migration tombstone from a genuine user delete, which is what makes
   *  revertRepair() possible. */
  repairedIntoEntryId?: string | null;
  /** The row's `deletedAt` immediately BEFORE pass B tombstoned it. */
  repairedFromDeletedAt?: number | null;
  /** Set when pass B tombstoned this row, so revert can distinguish
   *  "marked but still live" (pass A only) from "marked and tombstoned". */
  repairTombstonedAt?: number | null;
```

**Dexie store string (v23):**

```
intakeEntries: "id, timestamp, lastOccurrenceAt, [kind+timestamp], [nameKey+timestamp], updatedAt, sourceDoseLogId"
```

Justification per index: `timestamp` for cursor paging and range pruning; `lastOccurrenceAt` so a window query can prune on occurrence-span overlap without opening the JSON; `[kind+timestamp]` for "today's drinks" style filters — the only compound shape the app exercises today (`substance-service.ts:108-110`); `[nameKey+timestamp]` for the "+1 suggestion" lookup, compound rather than bare so a five-year history of rows named "Water" is not materialised on every keystroke; `updatedAt` for the debug panel; `sourceDoseLogId` for the emit/retract path of §2.10 — and here the fact that **IndexedDB omits null-keyed rows from an index is exactly what is wanted**: only emitted entries are in it. **No nutrient is indexed, on either side.** No daily total is index-served today either (see §2.3, property (b)).

**On nullable indexes generally.** IndexedDB omits `null`- and `undefined`-keyed rows from an index; it does not error. That is why `deletedAt: number | null` is *useless* as a bare index (the rows you want are exactly the ones with the null key). Soft-delete filtering stays a JS `.filter()` as it is today (`intake-service.ts:96`, `:109`, `:189`). **Stated consequence, accepted:** every daily total materialises the window's tombstones and filters them in JS. At the estimated 11 k-22 k rows/year and a day- or week-bounded window that is tens of rows; it is only a problem for unbounded `"all"`-scope analytics, which already has that shape today.

**The pull cursor for this one table is NOT `updatedAt`** — see `syncSeq` in §5.2.

### 2.3 The nutrient registry — one definition site, an open first-class set

This section is the answer to Q3.

#### 2.3.1 The registry module

`packages/core/src/nutrient-registry.ts` is **the only place a nutrient is defined**. Everything else derives from it.

```ts
export type AggregationRule = "sum";          // extensible: "max" | "latest" | "mean"
export type LimitDirection  = "ceiling" | "floor" | "none";
export type AiTier          = "core" | "extended";

export interface NutrientDef {
  /** STABLE FOREVER. The storage key, the provenance key, the pinning key,
   *  the AI schema key (snake_cased), the CSV domain, the MCP enum member.
   *  Never renamed — see `deprecated`/`supersededBy`. */
  key: string;
  unit: string;                 // "ml" | "g" | "mg" | "kcal" | "µg" …
  label: string;                // "Water", "Sodium", "Vitamin D"
  /** The COMPOSITIONAL BASIS, pinned. Restated verbatim in the AI tool
   *  schema (§7.2) and in the settings UI. A convention is what §2.3 exists
   *  to abolish, so this string is mandatory and non-empty. */
  basis: string;
  aggregation: AggregationRule; // every nutrient today: "sum"
  direction: LimitDirection;    // drives progress-bar semantics (§8)
  aiTier: AiTier;               // "core" = required in every AI response
  defaultPinned: boolean;       // seeds settings.pinnedNutrients (§2.3.6)
  /** Which `kind`s the nutrient can meaningfully apply to. DISPLAY HINT ONLY —
   *  it never gates a sum and never enters §3's APPLIC denominator, which is
   *  provenance alone. */
  appliesTo?: Array<IntakeEntry["kind"]>;
  min: number;                  // 0 for every nutrient today
  /** Relational invariants this nutrient participates in (§2.4 R5). */
  relations?: Array<{ op: "<="; other: string }>;
  deprecated?: true;
  supersededBy?: string;
}

export const NUTRIENTS = { waterMl: {...}, sodiumMg: {...}, … } as const;
export type NutrientKey = keyof typeof NUTRIENTS;
export type NutrientMap = Partial<Record<NutrientKey, number>>;
```

**Everything derived from it, with nothing hand-maintained in parallel:**

| Consumer | Derivation |
|---|---|
| `NutrientKey` type | `keyof typeof NUTRIENTS` |
| Push/pull zod for `nutrients` | `nutrientMapSchema` (§5.2) — shape-checked, open key set on both sides |
| AI tool schema `$defs/nutrients` | `buildNutrientToolSchema(NUTRIENTS, tier)` — properties, `required`, and every `description` string is the `basis` field (§7.2) |
| Relational `superRefine`s + Postgres CHECKs | `relations` (§2.4 R5, §5.1) |
| Units and labels at every render site | `unit` / `label` — the 60+ hardcoded unit literals inventoried in the UI survey collapse to one lookup |
| Limits / progress-bar semantics | `direction` + the settings limits registry (§8) |
| Pinning | `defaultPinned` seeds and tops up `settings.pinnedNutrients`; the pin list is validated against the registry on read (§2.3.6) |
| CSV `domain` + `unit` columns | registry iteration (§3) |
| MCP tool input enums | registry iteration (§5.8) |
| Analytics `DOMAINS` | registry iteration + the non-nutrient domains |

**Adding vitamin D is: one `NutrientDef` entry.** No Drizzle migration. No Dexie version block. No parity-test edit. No payload-schema edit. No backup-schema edit. It is a code deploy and nothing else. That is precisely the cost the Q3 decision rejects, removed.

**Renaming is a registry operation, not a migration.** Mark the old key `deprecated` + `supersededBy`; the read path resolves deprecated keys forward; the *next write* to a row normalises its map. No bulk rewrite is ever issued, so no migration exists to fail halfway. N-7 states what a reader does when a row carries both halves of a rename, which is a reachable state and not a hypothetical one.

**What a registry change is, operationally.** A registry addition or deprecation lives in `packages/core`, which one `next build` compiles into **both** the client bundle and the `/api/sync/push` route. There is no PR to split and no server-first ordering to arrange: a deploy is one artifact serving both sides. The invariant that actually holds is **deploy atomicity** — for a given deployment, the server's registry and the registry of the bundle that deployment serves are the same object. What it does *not* give is agreement between the server and an **already-installed** client running an older bundle (§10 Q-F), and a **rollback** inverts the relationship outright: after rolling back a deploy that added a key, the server's registry is *behind* a client still holding the newer bundle. §2.3 N-6 is written so that neither case can lose data, and the one operational rule that follows is stated normatively there.

#### 2.3.2 The canonical form — normative

**N-1. Keys.** Every key in a `nutrients` map matches `^[a-z][A-Za-z0-9]{0,63}$`. A map holds at most 128 keys.

**N-2. Values.** Every value is a **finite JS number `>= 0`**. `null` is never stored. `NaN`/`±Infinity` are rejected at three boundaries (§2.8), and the loud gate on the wire is `nutrientMapSchema`'s `z.number().finite().nonnegative()` (§5.2): a violation returns `code: "invalid"` and surfaces on attempt 1. The Postgres CHECKs of §5.1 are the **quiet backstop** behind it, not the primary gate — a bare CHECK violation returns from `push/route.ts:262-271` with **no `code`**, which §2.8 names as this engine's worst failure mode (8 silent retries, then the op is abandoned). The ordering matters: Zod must reject first, because the constraint that fires second is the one that loses the row silently.

**N-3. The three-state distinction:**

| State | Representation | Survives because |
|---|---|---|
| **Known value** | key present in `nutrients`, with a `provenance[key]` entry | jsonb numeric; `sanitizeRow` does not descend into jsonb (`push/route.ts:66-72`, verified) |
| **Known to be ZERO** | value `0`, with a `provenance[key]` entry | same — a zero inside jsonb is untouched by the wire sanitiser, whereas a top-level `0` column would depend on `sanitizeRow` happening to leave `0` alone |
| **Determined to be UNKNOWN** | key **absent** from `nutrients`, `provenance[key]` **present** | the pair is the state; there is no third value to confuse |
| **Never determined** (not applicable) | absent from both | — |

**N-4. Serialisation stability.** `verify-hash` hashes `JSON.stringify` of the row with a replacer that **recursively key-sorts every object** and leaves arrays alone (`verify-hash/route.ts:13-26`, verified). A map is therefore hash-stable regardless of insertion order — a property an array-of-pairs representation would not have. Two required consequences, both testable:
- the writer never stores `-0` (normalised to `0`) and never stores a key with an absent value;
- a **round-trip property test** (`fc.double` corpus → Dexie → push → jsonb → pull → Dexie) asserts byte-identical `deterministicJsonRow` output on both sides. If this test fails for some double, the fallback is to quantise stored values to 12 significant digits at the writer; it is not needed if the test passes, and shipping without the test is not an option (Residual #7).

**N-5. Unknown keys are preserved, never dropped.** A client whose registry predates `vitaminDUg` will pull, hold and re-push a row containing it. Rule: **any key already on a row that the local registry does not know is carried through untouched**, and is never summed by that client (no surface asks for it). Without this, an old device silently deletes a new nutrient on its next edit.

**N-6. Where key validity is enforced** (since the record interface types the map as `Record<string, number>`):

- `writeEntry` / `updateEntry` / `enrichEntry` may **set** only keys in the local registry. N-5 governs keys they merely carry.
- The **AI response schema is closed** and registry-derived (§7.2) — a hallucinated `vitamin_d_ug` is rejected at the API boundary, dropped and counted (§7.3 AI-7).
- The **push route validates SHAPE, not registry membership.** A well-formed key that the server's registry does not know is **accepted and stored**. `nutrientMapSchema` already bounds key format (N-1), finiteness, non-negativity and the 128-key cap, and §5.1's three open-set CHECKs already bound the stored shape; registry membership adds nothing the storage layer needs, and N-5 already requires every other layer to tolerate a key it does not know. Rejecting instead would put a version-skew condition onto `code: "invalid"`, which `sync-engine.ts:330-344` drops from the queue on the **first** cycle (`if (r.code === "invalid" || nextAttempts >= MAX_PUSH_ATTEMPTS) dropIds.push(q.id)`, then `await ack(dropIds)`) — the local row stays, nothing retries, and what is lost is not the unknown key but **that row's entire write**, silently. The concrete path is a rollback: deploy `D_n` adds `vitaminB12Ug`, an installed PWA writes an entry carrying it, `D_n` is rolled back for an unrelated reason, the user renames that entry, N-5 carries the unknown key through untouched, and a membership check on the now-older server registry would drop the rename permanently.
- **Unknown keys are reported out of band, never by rejection.** The push route increments a per-user counter of unknown nutrient keys seen and logs the key names; the client's debug panel renders the same report over its local corpus (Residual #8). Detection without loss.
- The **pull path accepts anything** the server sends (N-5).
- **Normative operational rule:** a deploy that **removes or deprecates** a registry key must not be rolled back while a bundle containing that key can still be live on any device. Removing a key is an additive-only operation in practice — mark it `deprecated`, never delete the entry — which is what makes this rule cheap to honour.

The net: a typo'd key cannot reach storage through any writer or through the AI boundary, a *newer* key always can, and no version skew in either direction can lose a row.

**N-7. Deprecated / superseded key collisions — normative.** N-5 guarantees a row can carry both a deprecated key and its successor: device A on the new bundle normalises `{sugarG: 12}` to `{sugarsG: 12}`; device B on the old bundle pulls the row, does not know `sugarsG`, sees no sugar, re-types 12 g, and writes `{sugarG: 12, sugarsG: 12}` — both keys legal on their respective sides, both accepted at push under N-6. The collision rule is therefore stated with the same precision as §2.1 Call 4's `at := min`:

1. **The successor is authoritative and the deprecated key is ignored, by every reader.** `TOTAL`, `KNOWN`, `APPLIC`, the expanded line item, CSV, MCP and analytics all resolve deprecated keys forward and then **drop** the deprecated key if its successor is present in the same map. One 12 g flat white contributes 12 g, never 24.
2. **`TOTAL(k, W)` never sums a key together with anything that resolves forward to it.** Resolution happens before summation, on a per-entry basis: `resolve(e.nutrients)` yields a map with no deprecated key that has a live successor.
3. **`writeEntry` / `updateEntry` must DELETE a deprecated key they know about whenever they write that key's successor**, and must delete it from `provenance` in the same operation. A client whose registry knows the rename can therefore never mint the pair; only a client that has never heard of the successor can, and rule 1 makes that harmless.
4. **Tested**, in `packages/core/src/__tests__/nutrient-registry.test.ts` alongside the existing "no deprecated key lacks `supersededBy`" assertion (§5.9): an explicit case for a row seeded with both keys asserting a single contribution, and a property test over randomly-seeded both-key rows asserting `TOTAL` equals the successor's value and `KNOWN` counts the entry once.

Deprecation chains are legal but bounded: the registry test asserts `supersededBy` is acyclic and resolves in at most 4 hops.

**N-8. Reserved provenance keys are namespaced.** `provenance` is keyed by nutrient keys *and* by the non-nutrient slots for the entry's own fields. Those slots are `_name`, `_servingVolumeMl`, `_servingMassG` and `_entry` — leading underscore, which N-1's key regex forbids for a nutrient. Without the prefix, registering a nutrient keyed `servingMassG` would make §3's `APPLIC("servingMassG", W)` count every AI-authored entry (all of which stamp that provenance slot) and render "≥ 0 g (0 of 47 known)" on the dashboard. A registry test asserts no nutrient key begins with `_` and no registry key equals a reserved slot name.

#### 2.3.3 The seed registry

Every entry below is first-class: same map, same provenance, same totals, same analytics, same availability to pinning. `aiTier` and `defaultPinned` are **attention** economics, not data tiers.

| key | unit | basis (pinned) | dir | aiTier | pinned |
|---|---|---|---|---|---|
| `waterMl` | ml | Water **content** of one unit, not the glass volume. Dissolved solutes do not reduce it. | ceiling | core | ✔ |
| `energyKcal` | kcal | **Includes** alcohol (7 kcal/g) and fibre (2 kcal/g, EU convention). Never kJ. | none | core | |
| `carbohydrateG` | g | Total carbohydrate **inclusive of fibre** (US labelling). An EU-labelled source reporting carbohydrate excluding fibre must have fibre added back. | none | core | |
| `sugarG` | g | Total mono- and disaccharides, natural + added. **Excludes polyols.** No added-vs-natural split. | ceiling | core | ✔ |
| `fibreG` | g | AOAC total dietary fibre. Included in `carbohydrateG`. | floor | core | |
| `proteinG` | g | Total protein, nitrogen × 6.25. | none | core | |
| `fatG` | g | Total fat as on a nutrition label (total lipid by acid hydrolysis). | none | core | |
| `saturatedFatG` | g | Saturated fatty acids. Trans fat **not** included. | ceiling | core | |
| `cholesterolMg` | mg | Total cholesterol. | none | extended | |
| `sodiumMg` | mg | **Elemental sodium**, never NaCl. NaCl and MSG are *input bases* (§2.3.4). | ceiling | core | ✔ |
| `potassiumMg` | mg | Elemental K⁺, total (not "available"). | floor | core | ✔ |
| `calciumMg` | mg | Elemental, total content — no bioavailability adjustment. | none | extended | |
| `magnesiumMg` | mg | Elemental, total content. | none | extended | |
| `ironMg` | mg | Elemental, total content — no haem/non-haem split. | none | extended | |
| `zincMg` | mg | Elemental, total content. | none | extended | |
| `phosphorusMg` | mg | **Total** phosphorus including phytate-bound; no "absorbable P" adjustment. CKD-relevant. | ceiling | extended | |
| `alcoholG` | g | Grams of pure ethanol in one unit. Display unit is a user setting (§2.11); storage is always grams. | ceiling | core | ✔ |
| `caffeineMg` | mg | Total caffeine in one unit. | ceiling | core | ✔ |
| `transFatG` | g | Trans fatty acids. **Excluded** from `saturatedFatG`. | ceiling | extended | |
| `addedSugarG` | g | Sugars added in processing. `addedSugarG <= sugarG`. | ceiling | extended | |
| `polyolsG` | g | Sugar alcohols. **Excluded** from `sugarG`. | none | extended | |
| `vitaminDUg` | µg | Cholecalciferol + ergocalciferol, µg (1 µg = 40 IU). | floor | extended | |

**Twenty-two nutrients: 12 core, 10 extended.** The last four are ordinary registry entries with provenance, totals and analytics, exactly like `waterMl` — which is the concrete demonstration that no second-class tier exists. Adding the rest of the vitamins is more rows in this table and nothing else.

**Derived, never stored** (V1 proved that storing a derivation creates a second owner that drifts): `quantity` (= count of live occurrences), standard drinks / UK units (= `alcoholG / unitSystem.gramsPerUnit`, §2.11), `abvPercent` (= `alcoholG / (0.789 × servingVolumeMl) × 100`, defined only when `servingVolumeMl > 0`), `saltEquivalentG` (= `sodiumMg / 1000 / NACL_SODIUM_MASS_FRACTION`, **the same constant as the forward conversion**), `waterContentPercent` (= `waterMl / servingVolumeMl × 100`, **undefined for every solid**, because `servingVolumeMl` is null there).

#### 2.3.4 Measurement basis is data, with an explicit input unit

`packages/core/src/measurement-basis.ts`:

```ts
/** Sodium mass fraction of NaCl: 22.9898 / 58.4428. ONE constant, used by the
 *  forward conversion and by the saltEquivalent inverse. Nothing else may
 *  introduce a second NaCl figure — 0.39 forward with 1/2.5 backward loses
 *  2.5% on every round trip. */
export const NACL_SODIUM_MASS_FRACTION = 0.3934;
export const MSG_SODIUM_MASS_FRACTION  = 0.1223;

export const MEASUREMENT_BASES = {
  sodiumMg: {
    // CONTRACT: storedValue(mg elemental) = inputValue(in `inputUnit`) × factor
    sodium: { inputUnit: "mg", factor: 1 },
    salt:   { inputUnit: "g",  factor: NACL_SODIUM_MASS_FRACTION * 1000 },  // 393.4
    msg:    { inputUnit: "g",  factor: MSG_SODIUM_MASS_FRACTION  * 1000 },  // 122.3
  },
} as const;
```

The `inputUnit` is what prevents a 1000× error: `{salt: 0.39}` against a *gram* input turns 2 g of salt into 0.78 mg of sodium. V1's own code applies `0.39` to an input already in **milligrams** (`food-section.tsx:55-59` `SODIUM_MULTIPLIERS = {sodium:1.0, salt:0.39, msg:0.12}`, applied at `:92`), matching `DEFAULT_SODIUM_PRESETS`' `sodiumPercent: 39` (`constants.ts:103-107`, verified). Either input unit is legal; what is illegal is leaving it undeclared. **Round-trip is a property test**, reading the *snapshotted* `provenance.sodiumMg.basis.factor`, not a lookup — which is what keeps a V1-migrated row (`factor: 390`) displaying the user's original 2 g.

#### 2.3.5 What a fixed-column design would have bought, and what actually survives

The three properties the open set is traded against:

**(a) Postgres CHECK constraints — SURVIVE, and get better.** Relational invariants become jsonb expressions over the map (§5.1), and the "every nutrient `>= 0`" rule becomes a **single set-quantified constraint** rather than one CHECK per column:

```sql
CHECK (jsonb_typeof(nutrients) = 'object')
CHECK (NOT jsonb_path_exists(nutrients, '$.* ? (@.type() <> "number")'))
CHECK (NOT jsonb_path_exists(nutrients, '$.* ? (@ < 0)'))
```

A nutrient added next year is covered by these three constraints on the day it is added, with no migration — the opposite of the per-column design, where a new column arrives unconstrained until someone remembers to write its CHECK. *Implementation note:* `jsonb_typeof`, `jsonb_path_exists` (non-`_tz` form), `jsonb_object_field_text` and the text→`float8` cast are all immutable, which is what a CHECK (and a generated column) requires; confirm with `SELECT provolatile FROM pg_proc` during R1. If any turns out otherwise, the constraint drops to the Zod layer, which §2.8/R-10 already makes the *primary* enforcement point — Postgres is a mirror here, never the sole gate.

**(b) "Index-assisted SQL sums in MCP" — DOES NOT EXIST TODAY, and is not lost.** Verified: `intake_records` has no index on `amount` (`schema.ts:85-93` declares `idx_intake_user_updated`, `idx_intake_type_ts`, `idx_intake_group` and nothing else), and `getTodaySummary`'s `sum(amount) GROUP BY type` (`mcp/queries.ts:70-85`) is served by *row selection* on user + timestamp, then a heap read. An index never assists a `SUM`; it assists the *predicate*. Under V2 the predicate is `user_id` plus `last_occurrence_at` — real indexed columns (§5.1) — and the aggregate becomes `sum((e.nutrients ->> 'waterMl')::double precision * occ.n)`. Same access path, same index, one extra jsonb field extraction per row over a day-bounded set of tens of rows. **What is traded here is a property the codebase never had.**

**(c) `createInsertSchema`-derived per-column push validation — TRADED, deliberately, for something stronger.** drizzle-zod would have typed a fixed nutrient column set for free; it types a `jsonb` column as opaque. The `occurrences`, `components` and `provenance` columns need explicit zod shapes regardless, so the machinery is being built anyway. In its place: **one registry-derived `nutrientMapSchema`** that validates key format, key count, finiteness, non-negativity and every relational invariant in one place — and that is automatically correct for a nutrient added tomorrow, which a hand-extended per-column schema is not.

**What is genuinely given up:**
1. **Per-nutrient column typing in Postgres.** A nutrient is `numeric` inside jsonb, not a declared `double precision` column. Mitigated by (a) and by the Zod layer; observable failure mode is a rejected push, not a silent coercion.
2. **A tiny read cost**: `nutrients ->> 'k'` per row per nutrient instead of a column read. Bounded by the same window that already bounds every query.
3. **A weakening of R1's *phrasing*** (not its substance) — see §2.4 R1-map.
4. **Compile-time key checking on the raw interface** — see N-6 for where it moved, and Residual #8 for what that costs.

**The escape hatch, if profiling ever demands it.** A hot nutrient may be projected server-side as `GENERATED ALWAYS AS ((nutrients ->> 'waterMl')::double precision) STORED` plus an index. Such a column is **derived and unwritable**, so it cannot become a second owner; it is invisible to the client, added to `DRIZZLE_ONLY_EXEMPTIONS` and to the `verify-hash` strip list exactly as `userId` and `syncSeq` already are (§5.9). **No such column is proposed for R1.** Keeping the hot set empty is what keeps "adding a nutrient is not a migration" true; the hatch exists so that a future performance problem has a one-column answer rather than a redesign.

#### 2.3.6 Pinning

`settings.pinnedNutrients: string[]` holds registry keys (persist version 16 → 17, §8), mirrored to `userProfile.nutrientPrefs` (§5.6) so it is the same on every device and reachable by any server-side surface. Read-time rules, mirroring the `quickNavItems` precedent whose absence caused the `CardThemeKey` hazard (`quick-nav-defaults.ts:1-8`):

- keys not in the registry are **dropped, not rendered**;
- a deprecated key resolves through `supersededBy`, and a pin list holding both the deprecated key and its successor collapses to the successor (N-7);
- an empty list falls back to the registry's `defaultPinned` set;
- **`defaultPinned` tops up an existing list, once per key.** The settings store also persists `pinDefaultsApplied: string[]`. On read, any registry key with `defaultPinned: true` that is **not** in `pinDefaultsApplied` is added to both lists. Without this, `defaultPinned` on a nutrient added after first run is inert for the entire installed base — the fallback-when-empty rule alone never fires for a user who has ever pinned anything. A key the user then unpins stays unpinned, because it is already in `pinDefaultsApplied`.

Because registry keys are stable forever (N-1), a pin survives every future change except an explicit deprecation, which it follows.

The expandable line item shows **every** nutrient the entry has a value or a provenance entry for, ordered by registry order; the dashboard shows the pinned subset. That is a display rule over one uniform data set, not a storage tier.

### 2.4 Liquid volume single ownership — what is structural and what is not

**Invariant L (formal):**

> Let `E` be the set of `intakeEntries` rows with `deletedAt === null`. For any window `W` and nutrient key `k`,
> `TOTAL(k, W) = Σ_{e ∈ E, k ∈ dom(resolve(e.nutrients))} resolve(e.nutrients)[k] × |{o ∈ e.occurrences : o.removedAt === null ∧ o.at ∈ W}|`,
> where `resolve` is N-7's forward resolution of deprecated keys.
> No other table, column, or nested structure contributes a term.

**R1 — Structural on the ROOT/CHILD axis, and only there.** One table holds nutrients; the root's contribution is `nutrients ->> k` at the **top level of the entry row**, while children live under a **different column** (`components`) that no index, no `GROUP BY` and no §3 read path reaches into. A root/child double-count — issue #322 reproduced one level down — is therefore unreachable.

**R1-map — the honest amendment the jsonb map forces.** A fixed-column design could say "exactly one *column* named `waterMl` exists, so a second owner is impossible to introduce without the parity test noticing". That sentence does not hold verbatim here: `components[*].nutrients.waterMl` is a jsonb path in the same table, and a careless aggregate *could* be written to descend into it. The compensating mechanism, and it is a deliverable, not a hope:
- exactly one accessor, `entryNutrient(entry, key)` in `packages/core`, is the only sanctioned read of a root nutrient on the client; and one SQL fragment builder, `nutrientExpr(key)`, on the server;
- a **static test asserts that no expression in `mcp/queries.ts`, the analytics service or the export service references `components` inside an aggregate** (grep-level assertion over the aggregate call sites, in the same spirit as the existing hardcoded-list drift tests);
- §4.3 P12 asserts a golden entry with a full component tree totals exactly its root values.

That is weaker than "the column does not exist" and stronger than a convention. It is stated rather than glossed.

**R1′ — NOT structural on the ENTRY/ENTRY axis. Say it plainly.** `writeEntry` mints one row per **call**. Two calls for one physical event produce two entries, each with a `waterMl` in its map, and `TOTAL("waterMl", W)` adds them. The live example: `voice-reconcile.ts:3-27` documents that "a latte" came back as a `caffeine` item **and** a `food` item and both volumes landed as water, and that "the prompt now forbids that shape … but a prompt rule is a request, not a guarantee". Commit `3070320`'s own sentence — "two callers can still each book the volume" — applies verbatim to V2 on this axis.

**R6 — the mechanism that holds the entry/entry axis, since structure cannot.** Three parts, all deliverables:

1. **Keep `reconcileLiquidItems` (or its V2 equivalent) as a deterministic pre-review backstop** over the AI's multi-item envelope. It runs on the parse result *before* the review list renders, merges only on an unambiguous pairing (same identifying words AND comparable volume, `VOLUME_TOLERANCE = 0.25`), and reports merely-suspicious pairings as warnings with both rows intact. Wrongly dropping a companion loses real hydration silently, which is worse than a visible duplicate. **A test seeded on the latte case is a V2 acceptance test, not a legacy one.**
2. **A write-time duplicate-detection predicate.** `writeEntry` warns — never silently merges — when a candidate matches an existing live entry on `nameKey` AND `kind` AND an occurrence within ±10 min AND comparable `servingVolumeMl` (±25%). The UI offers "+1 the existing one" or "save as separate". **Q4 extends the candidate set**: a hand-logged entry whose `nameKey` matches a supplement-flagged prescription's `supplementProfile.displayName` within ±2 h of an emitted entry warns explicitly — *"this dose is already counted from your medication log"* (§2.10).
3. **`voice-reconcile.ts` does not shrink.** The merge case is two *items*, not two rows per item. Its V2 change is mechanical.

**R2 — Volume and hydration are different fields, so they cannot be confused.** `servingVolumeMl` is the glass (a column); `waterMl` is the hydration (a registry key). The relation `waterMl <= servingVolumeMl` (when both known) is enforced at mint time by `writeEntry` (§2.8) and mirrored — not solely held — in Postgres. It finally gives `waterContentPercent` an owner: a field the AI has been returning and the write path silently discarding since it was introduced (`preset-tab.tsx:225` sets it; `buildDrink` at `:250-277` never passes it; `logDrink` books the full volume, `drink-service.ts:105-121`, verified). **Q1's re-derivation (§4.2a) is what makes this true for history as well as for new writes.**

**R3 — Children are physically un-summable by any aggregation.** As R1/R1-map.

**R4 — The rollup sums EXACTLY the depth-1 components, and nothing deeper.**

- `rollupComponents()` may set root nutrient `k` **only if** `k ∉ dom(root.nutrients)` **and** every **depth-1** component has `k` present. The sum ranges over the depth-1 set only.
- **Sub-components are never a term in any sum, at any level.** A composite child's own `nutrients[k]` is authoritative for that child; its sub-components explain it.
- **Reconciliation when a composite child's own value differs from Σ of its sub-components: the child's own value wins, and the discrepancy is NOT repaired.** It may be surfaced in the expanded view as an advisory ("components explain 780 of 800 mg"), never as a correction. Matches AI-2 exactly.
- Otherwise the key stays **absent** and the partial sum is recorded as `provenance[k] = {origin:"rollup", partial:true, partialValue: Σ}`. A manufactured value that looks known is worse than an absent one: a cheeseburger whose bun lacks `waterMl` would otherwise get root `waterMl = 53`, `KNOWN` would count it, §3 would render an exact total, and R4's "never overwrite a known value" would forbid correction.
- **Re-derivation:** a value whose `provenance[k].origin === "rollup"` **may** be re-derived when the depth-1 component set changes. "Never overwrite a known value" applies to `user` / `ai` / `preset` / `import` / `dose` origins; `rollup` and `migration` have their own re-derivation rules (§4.2 step 5).
- **Property test (the cheeseburger):** root has no `sodiumMg`; components `[patty {sodiumMg 400, components:[beef {300}, salt {100}]}, bun {sodiumMg 380}]` rolls up to **780**, not 1180.

**R5 — Relational invariants**, enforced at mint time and mirrored in the database, and **declared in the registry** (`NutrientDef.relations`) rather than hand-listed in five files: `sugarG <= carbohydrateG`; `fibreG <= carbohydrateG`; `addedSugarG <= sugarG`; `saturatedFatG <= fatG`; `waterMl <= servingVolumeMl`; **`alcoholG <= 0.789 × servingVolumeMl`** (an entry cannot contain more ethanol than its own volume — it catches a model returning grams-per-100 ml or standard drinks in the `alcohol_g` slot, exactly what `substance-lookup.ts`' "CRITICAL UNIT RULE" block exists to prevent today); every nutrient `>= registry.min`; at least one live occurrence unless `deletedAt != null`. A new relation ships with the registry entry that declares it. The enforcement point is `writeEntry`, not the CHECK — §2.8.

### 2.5 Occurrences — representation, totals, and edit semantics

**Representation: an occurrence array on the root.** *Repeated rows* is rejected because three rows is three line items and "edit the sodium" becomes "edit three rows atomically", which the sync engine cannot do (§1.2 iv). *A `quantity` scalar* is rejected for the two reasons in §2.1 Call 4.

**Totals derive as `perUnitValue × (count of live occurrences inside the window)`, computed at read time, never at write time.** This is why no value is rounded at write: with integer storage, `3 × round(0.4) = 0` while `round(3 × 0.4) = 1`.

**Edit semantics.** Three occurrences, user edits sodium 400 → 500 mg: **the day's contribution goes 1 200 → 1 500 mg.** All three units are retroactively 500 mg. The rule: **an `IntakeEntry` is a claim that every one of its occurrences was one identical unit.** Non-identical units are separate entries.

**The primitive is `removeOccurrence(entryId, occurrenceId)`, and `-1` is sugar over it.** Defining `-1` as "removes the most recent live occurrence" picks the wrong occurrence for the correction the user is actually making. Lollies at 23:30 Mon, 00:30 Tue, 08:00 Tue; on Tuesday morning the user realises the 23:30 Monday one was never eaten and taps `-1`. Under the naive rule the 08:00 Tue occurrence dies: Monday still counts a lolly that was never eaten and Tuesday drops from 2 to 1 — both days wrong, in opposite directions, and the correct correction is unreachable from the API.

- **`removeOccurrence(entryId, occurrenceId)`** sets that occurrence's `removedAt = now`, re-runs `projectOccurrences()`, sets `updatedAt = now`. It is the only removal primitive.
- **`-1` is `removeOccurrence(entryId, mostRecentLiveOccurrenceId)`**, legal **only** where no occurrence is addressed.
- **The expanded line item MUST list its live occurrences with their times**, each with its own remove control. Normative UI requirement flowing from the data model.
- **Property test:** the three-lolly cross-midnight case — remove the 23:30 Mon occurrence by id; assert Monday's bucket goes 1 → 0 and Tuesday's stays 2.

**`+1`** is `occurrences.push({id: uuid(), at: now, removedAt: null})`, re-project, `updatedAt = now`. Under the union merge it commutes with a concurrent `+1` on another device: the user gets 3, not 2.

**Zero live occurrences ⇒ soft-deleted, by projection, not by a separate write.** This closes the two divergent states an independently-LWW'd `deletedAt` scalar cannot:
- *Live entry with zero live occurrences.* A removes o2 (o1 still live, so `deletedAt` stays null); B, offline, removes o1; the merge unions to `{o1 removed, o2 removed}` and the re-projection soft-deletes. Under an independent scalar it would stay live at quantity 0, and `min`/`max` over an empty set would write `±Infinity` into `notNull` bigint columns.
- *Soft-deleted entry with a live occurrence.* A removes the last occurrence; B taps `+1`. The union has one live occurrence, so re-projection yields `deletedAt: null` regardless of which side won LWW. B's `+1` survives.

**Fractional servings are not a count.** "Half a burger" is an entry whose *per-unit* map is half a burger's. Count is a cardinality, so `-0.5` cannot arise and a day's water cannot go negative.

**Partial consumption gets an operation.** `scaleEntry(entryId, factor)` multiplies **every value in `nutrients`**, plus `servingVolumeMl` and `servingMassG`, by `factor`, stamps `{origin:"user", at:now, priorValue, priorOrigin}` on every touched key, and leaves the occurrence set alone. Note this is *strictly simpler under the map* than under fixed columns: it is one `Object.entries` pass that is automatically correct for nutrients added later.

**`+1` is reachable only from a rendered row**, i.e. it takes an entry `id`. A `nameKey`-based *suggestion* is permitted only when the candidate matches on **`nameKey` AND `kind` AND `servingVolumeMl` AND `servingMassG` AND a deep-equal `nutrients` map** (deep equality over a key-sorted map, after N-7 resolution). Without that predicate the identity rule is a convention: `Coffee` (black, 250 ml, 0 g sugar) and `coffee with two sugars` both normalise to `coffee`.

**An entry with `sourceDoseLogId != null` accepts none of these operations** — its occurrence set is owned by the dose log (§2.10).

**Multi-day entries are permitted, and §3's read contract R-L is what makes them safe.**

### 2.6 Provenance — per FIELD, so re-enrichment cannot clobber corrections

**The V1 gap:** the AI writes into the same `useState` strings the user types into (`food-section.tsx:264-277`); `aiPopulated` is one boolean set at `:278` and never cleared on user edit; it collapses at save into one group-level free-text `groupSource`. `SubstanceRecord.aiEnriched` (`records.ts:339`) is not a provenance flag despite its name — it is `false` at every normal creation site including AI-authored ones (`drink-service.ts:185`, `:205`) and means "the backfill job has visited this row". `LiquidPreset.aiConfidence` has exactly one occurrence in the monorepo: its own declaration.

**The V2 rule, at both levels of the tree:**

```ts
function mayAiWrite(entry: IntakeEntry, key: NutrientKey): boolean {
  return entry.provenance?.[key]?.origin !== "user";
}
function mayAiWriteComponent(c: EntryComponent, key: NutrientKey): boolean {
  return c.provenance?.[key]?.origin !== "user";
}
```

with the companion rule that a user edit of an `ai`-origin field stamps `{origin:"user", at:now, priorValue:<the AI value>, priorOrigin:"ai"}`. `priorValue` is retained so the UI can show "AI said 1 100 mg, you said 900 mg" and a later re-run can diff rather than replace.

**`priorValue`, not `aiValue`.** Naming the field for one of the several things it holds breaks as soon as §2.8 stashes a *user* value in it. `priorValue` + `priorOrigin` is provenance-neutral and self-describing.

**Component-level merge on re-enrichment:** a returned component is matched to a stored component **by `id` only**. Components the model does not echo are deleted **unless** they carry any `provenance[*].origin === "user"`.

**The writer of component provenance is named:** `updateComponent(entryId, componentId, patch)` stamps `{origin:"user", at:now, priorValue, priorOrigin}` on every key in `patch`, and `addComponent(entryId, component)` stamps `{origin:"user"}` on `_name`, `_amount` and every nutrient key it carries. Without a named writer, AI-6's "retained if user-authored" clause is unreachable.

**User provenance can go stale, and the model says so.** When `name`, `servingMassG` or `servingVolumeMl` changes materially (name normalisation changes, or either serving field changes by >20%), every `user`-origin nutrient provenance entry is stamped `staleAfterIdentityChange: true`. The value is **kept** and still protected from the AI — but the UI must surface a per-field "re-confirm or accept the new estimate" affordance, and the re-enrichment response carries the AI's value in `priorValue` so the comparison is one tap.

Why `jsonb` rather than columns: provenance is ~14 fields per nutrient and is never queried, only read alongside its row. Under the open registry this is not merely convenient, it is required — a per-nutrient provenance column set could not exist for an open key set at all.

Additional facts this closes: `model`, `promptVersion`, `confidence`, `rule` + `derivationVersion` + `derivedFrom` (§4.2a, §2.10), `basis` (§2.3.4), and `originalInputText` on the root **mandatory on every AI-authored write** (today `food-section.tsx`, `voice-panel.tsx` and `preset-tab.tsx` all fail to pass it).

### 2.7 Default nutrient state per write path

The `≥` presentation in §3 is only meaningful if the denominator excludes entries that could never carry the nutrient. **A writer stamps `provenance[k]` if and only if it has determined something about `k` — including determining that it is unknown.**

| `entrySource` | Values written into `nutrients` | `provenance` keys stamped |
|---|---|---|
| `quick_add` | `waterMl` **or** `sodiumMg` only | **only** that one key, `origin:"user"`. A quick-add water entry is *not applicable* for sodium and never enters that denominator. |
| `manual` | every field the form exposes and the user filled | one per filled field, `origin:"user"`. Blank optional fields stamp nothing. |
| `preset` | every nutrient the template defines, scaled | one per defined nutrient, `origin:"preset"` |
| `ai_text` / `voice` | every **core**-tier key the model returned non-null; extended keys only when returned | **every core key** (`origin:"ai"`), including keys returned `null` — precisely "determined to be unknown" — plus every extended key the model actually returned. An extended key the model omitted stamps nothing and is therefore *not applicable*, which is the correct and honest denominator. |
| `import` | whatever the backup carried | one per present key, `origin:"import"` |
| `migration` | only what the V1 corpus could express, after §4.2a's derivation | one per determined key, `origin:"migration"`, each with a `rule` id and a `derivationVersion`. A key the classifier could not decide is stamped **without a value** — determined-unknown. |
| `dose` | the scaled `supplementProfile.nutrients` (§2.10) | one per key, `origin:"dose"`, `rule:"supplement:scaled"` |

**Nothing ever stamps a speculative `0`.** "0 mg cholesterol" on a glass of water is a claim the app has no basis for; the correct state is not-applicable — no provenance key, no map key.

**This table is where the core/extended tier lives, and it is the only place it lives.** The tier changes what the model is *asked* for and therefore what is *determined*; it changes nothing about how a determined value is stored, summed, analysed, exported or pinned. That is the difference between an attention budget and a second-class data tier.

### 2.8 `writeEntry` is the enforcement point, not the database

**Normative rule: no constraint may exist in Postgres that the client is not obliged to satisfy before enqueueing.**

A CHECK violation is this engine's worst failure mode: `push/route.ts:262-271` pushes it into `rejected` with **no `code`**, `sync-engine.ts:330-344` bumps attempts and backs off, and at attempt 8 the op is acked out of the queue and abandoned with a `console.error` — the comment at `sync-engine.ts:59-73` names "a CHECK violation" as exactly the permanent case it drops.

Every invariant is enforced three times, in this order:

1. **AI-response zod** (`api/ai/entry-parse/schema.ts`) — §7.3 AI-7.
2. **`writeEntry` / `updateEntry` / `addOccurrence` / `removeOccurrence` / `scaleEntry` / `updateComponent` / `upsertSupplementEntry`** — the sole writers. A violating row **cannot be persisted locally**.

   **The repair table is split by the provenance of the field being adjusted**, because an unconditional table silently overwrites user-authored values:

   | Violation | Field to be adjusted has `origin === "user"` | Otherwise |
   |---|---|---|
   | `sugarG > carbohydrateG` | **Reject with a user-visible validation error** naming both fields. `carbohydrateG` is the authoritative member of the pair (sugar ⊆ carbohydrate is a definition, so the carb figure is the one more likely taken from a label). | raise `carbohydrateG := sugarG`, stamp `adjusted`, keep the old value in `priorValue`/`priorOrigin` |
   | `fibreG > carbohydrateG`, `addedSugarG > sugarG`, `saturatedFatG > fatG` | same — validation error; the containing nutrient is authoritative | raise the container |
   | `waterMl > servingVolumeMl` | validation error naming both | **clamp `waterMl := servingVolumeMl`, stamp `adjusted`.** Nulling `servingVolumeMl` instead would destroy the denominator of two documented derivations, remove one of the equality terms in §2.5's `+1` predicate, and contradict R2. |
   | `alcoholG > 0.789 × servingVolumeMl` | validation error | clamp, stamp `adjusted`, `rule:"alcohol:clamped-to-serving"` — and log, because this almost always means a unit error upstream |
   | any nutrient `< registry.min` | **reject with a user-visible validation error** | same |
   | a key not in the local registry, being **set** | reject (N-6) | reject |
   | a deprecated key written alongside its successor | delete the deprecated key and its provenance (N-7) | same |
   | zero live occurrences | soft-delete via `projectOccurrences()` | same |
   | blank `name` | substitute `"Untitled entry"` | same |
   | `normalise(name) === ""` (emoji-only, `"+1"`, `"!!!"`) | `nameKey := entry.id` | same |

   Plus a blanket guard: **`Number.isFinite` is asserted on every number written anywhere in the row — every map value, every occurrence `at`, both projections** — before the row is written. (`push/route.ts:106-107` calls out the NaN→null-in-a-notNull-column hazard by name.)

3. **Postgres CHECK / NOT NULL** — a mirror and the last line of defence against a stale or buggy client. Because (2) exists, a rejection here means a client bug and should be loud in logs rather than silently dropped after 8 retries.

**Audit of every `notNull()` text column on `intake_entries`:** `id` (uuid), `kind` (enum), `entrySource` (enum), `timezone` (`Intl` output, never blank), `deviceId` (generated), `name` (guarded above), `nameKey` (guarded above, plus `CHECK (name_key <> '')`).

### 2.9 What stays separate, and why

| Domain | Verdict | Reason |
|---|---|---|
| `urinationRecords` | **Unchanged.** | Fluid *out*. Opposite sign, no nutrients, bucketed estimate. Folding it in would put a negative term in the sum R1 declares additive-only. |
| `defecationRecords` | **Unchanged.** | Event marker, no quantities. |
| `weightRecords`, `bloodPressureRecords` | **Unchanged.** | Measurements of the body, not intakes. |
| medication domain (8 tables) | **`prescriptions` gains two nullable fields; `doseLogs` unchanged; the rest unchanged.** | Already normalised with real FKs and a working topology. Adherence and nutrition stay different questions — §2.10 does not merge them, it makes one *emit* into the other through a single deterministic function. |
| `auditLogs`, `_syncQueue`, `_syncMeta`, `_errorLogs`, `insightReports` | **Unchanged.** | Infrastructure. |
| `userProfile` | **Four fields added** (§5.6) **plus a one-time backfill.** | The only already-synced, already-backed-up singleton; §3's day-boundary unification needs a synced `dayStartHour` + IANA zone, §2.11's display unit must reach MCP (which has no localStorage), and §2.3.6's pin list must be the same on every device. |
| `intakeRecords`, `eatingRecords`, `substanceRecords` | **Three fields added; frozen at v23; read only by the conversion, `revertRepair()`, backup import and the MCP transition predicate; EMPTIED but never dropped** (§4.6). | Dropping them breaks every existing backup file. |

### 2.10 Supplement-emitting prescriptions (Q4)

**The decision.** A prescription may be flagged nutritionally significant. Taking a dose then contributes to that day's nutrient totals.

**The flag and the payload live on `Prescription`, both nullable** (§2.2): `isSupplement?: boolean` and `supplementProfile?: SupplementProfile`.

*Why nullable rather than `notNull().default(false)`.* The default only applies when the column is **omitted** from the INSERT. A client that stores `isSupplement: undefined` and pushes it would have that key rewritten to an explicit `null` by `sanitizeRow` (`push/route.ts:66-72`, verified — it iterates the parsed row's own keys), and an explicit null violates NOT NULL regardless of the default. The codebase's conditional-spread convention (`...(x !== undefined && {x})`, e.g. `drink-service.ts:113-118`) does omit the key, so a `notNull().default(false)` column *would* work — but only for as long as every writer remembers the convention, which is exactly the class of invariant this document exists to remove. Nullable removes the interaction entirely; `null`, `undefined` and `false` are all read as "not a supplement". Precedent: `prescriptions.compounds` is a nullable jsonb mirroring an optional interface field (`schema.ts:307` ↔ `records.ts:185`, verified).

**Timezone: nothing is added to `Prescription` that needs one.** `prescriptions` deliberately has **no** `timezone` column — the schema says so at `schema.ts:309` (verified: *"NOTE: no timezone column — Prescription interface in @intake/types/records omits it"*), and the parity test would fail the build if one side gained it alone (`schema-parity.test.ts:150-171`, the "no extra Drizzle columns" arm). The emitted entry's `timezone` — a `notNull` column on `intake_entries` — comes from **`doseLog.timezone`**, which exists on both sides (`records.ts:322`; `schema.ts:517-518`, verified) and is the right value anyway: it records where the dose was actually taken. **Parity impact of Q4 is therefore exactly two fields on two sides, and no timezone anywhere.**

**The emitted entry.**

```
id                := doseLog.id            // DETERMINISTIC. See below.
sourceDoseLogId   := doseLog.id
entrySource       := "dose"
kind              := "supplement"
name              := prescription.supplementProfile.displayName
nameKey           := normalise(name) || id
occurrences       := [{ id: `${doseLog.id}:dose`, at, removedAt: null }]
                     where at = doseLog.actionTimestamp ?? now
nutrients         := scale(profile.nutrients, doseAmount / profile.basisAmount)
provenance[k]     := { origin:"dose", at:now, rule:"supplement:scaled",
                       basis:{ id:"dose", inputUnit: profile.basisUnit,
                               factor: doseAmount / profile.basisAmount } }
servingVolumeMl   := doseAmount when COMPONENT_UNITS[profile.basisUnit].cls === "volume", else null
servingMassG      := doseAmount when the class is "mass", else null
timezone          := doseLog.timezone
note, components, originalInputText, legacy* := null
```

**Why `id === doseLog.id`, verbatim.** A non-deterministic id double-counts on every dose edit or undo (§9 R-22). Deriving the id *is* the fix, and the strongest form is equality: the emit becomes an idempotent primary-key upsert on both client and server, exactly like §4.2 step 3's anchor rule. Collision cannot occur because **every id in play is a v4 uuid from `crypto.randomUUID()`** — `buildDoseLog` mints one at `dose-log-service.ts:141` (verified), the same generator V2-native entries and legacy rows use — so uniqueness rests on uuid uniqueness, not on any structural separation of keyspaces. (There is none: the generators are identical, and a reader must not be led to believe otherwise.) The equality is load-bearing and is asserted by a test. Recognition never depends on the id: `sourceDoseLogId` is a real field with a real index, because encoding semantics in a string is the disease §1.2(iii) describes.

**Why the occurrence id is a pure function of dose-log identity: `${doseLog.id}:dose`.** An emitted entry has **exactly one occurrence, by construction**, and its id never changes. This is what makes concurrent emission safe. The failing alternative is an id that embeds the occurrence time (`${doseLog.id}:${at}`): the phone re-takes a dose at 09:00 and the tablet — which has not pulled since 08:15 — re-takes the same slot at 09:05. `getDoseLogRaw` (`dose-log-service.ts:110-129`) finds the same log row on both devices and `upsertDoseLog` updates it (`:157-185`), so both emit into entry `L`; but the two occurrence ids differ, the union keeps **two** live occurrences, and §2.5's total reports 800 mg of magnesium for a single 400 mg dose — uncorrectable, because this section disables `+1`/`-1`/delete on emitted entries. With a time-free id the union collapses to one occurrence and the day is right.

**The time edit is then fixed at the merge, not at the id.** `editDoseTime` moving a dose *later* (`dose-log-service.ts:749-790`, verified — it updates `actionTimestamp` on the existing row) must not be discarded by the union's `at := min` rule. So §2.1 Call 4's normative exception applies: **for an entry with `sourceDoseLogId != null`, an occurrence id collision resolves `at` by the containing row's `updatedAt` (last writer wins), ties broken by `min`.** `unionOccurrences` takes the rule as an argument and both sides of the wire select it from `sourceDoseLogId` (§5.2).

**The scaling rule is deterministic and total.** `doseAmount` is the schedule's `dosage` (`records.ts:236`) with unit `schedule.unit ?? phase.unit` (`records.ts:239`, `:199`), or `doseLog.doseMg` for a PRN dose (`records.ts:317`). If that unit is not identical to `profile.basisUnit`, **no conversion is guessed**: the entry is still emitted (so the day list shows the supplement) but with an **empty `nutrients` map and provenance stamped `{origin:"dose", rule:"supplement:unit-mismatch"}`** for every profile key — i.e. determined-unknown, exactly the three-state semantics of §2.3 N-3 — and the prescription surfaces a persistent "supplement profile unit does not match the dose unit" warning. The supplement editor validates unit equality at save time, so this state is reachable only by a later phase changing the unit.

**Retraction is keyed on the ENTRY, never on the flag — normative.** Retraction means: **find the entry with `sourceDoseLogId === doseLog.id`; if it exists, mark every LIVE occurrence `removedAt = now`; re-project; enqueue.** Three consequences, each of which is a bug avoided:

- It is **never** conditioned on the prescription's current `isSupplement`. Gating the retract on the flag strands data: take a dose with the flag on, clear the flag, then untake the dose — the entry stays live and the day keeps counting a supplement the user has marked as not taken, with delete disabled on the entry so there is no way out. **Every dose transition retracts unconditionally; only emission is flag-gated.**
- It is **not** a lookup by a recomputed occurrence id. `untakeDose` calls `upsertDoseLog` *before* anything else could run, and `upsertDoseLog` overwrites `actionTimestamp` with `now` (`dose-log-service.ts:175-181`, verified), so any id recomputed from the dose log after the transition names an occurrence that does not exist. "Mark every live occurrence" is implementable; "remove the occurrence whose id is `${doseLog.id}:${actionTimestamp}`" is not.
- Retraction is **never a hard delete**, so a re-take revives the entry through §2.5's second convergence sequence: the re-emit writes the same occurrence id with `removedAt: null` and a newer `updatedAt`, per-id LWW clears the removal, and the projection clears `deletedAt`. Exactly one occurrence, exactly one contribution, however many times the user toggles.

**Lifecycle — the only thing that ever writes an emitted entry is the dose path.**

| Dose transition | Where | Effect on the entry |
|---|---|---|
| `takeDose`, `logPrnDose` | `dose-log-service.ts:258`, `:359` | `upsertSupplementEntry` — set the single occurrence live at the dose time, re-project, enqueue `("intakeEntries", id, "upsert")` **inside the existing `rw` transaction** (add `db.intakeEntries` to its table list) |
| `untakeDose` (status → `pending`) | `:465` | `retractSupplementEntry` — mark every live occurrence removed, re-project (entry becomes soft-deleted by §2.5), enqueue |
| `skipDose` | `:534` | as untake |
| `rescheduleDose` | `:605` | the old slot's log becomes `rescheduled` → retract its entry. The new slot is **usually** a different `doseLog` row and emits its own entry when taken — but not always: `upsertDoseLog` reuses any existing non-deleted log for `(prescription, phase, schedule, date, newTime)` (`:157-185` via `getDoseLogRaw` `:110-129`), so rescheduling twice onto a slot that was already taken **resets that log to `pending` while its emitted entry is still live**. The retract arm therefore runs for the *target* log as well as the source whenever the target's status leaves `taken`. |
| `editDoseTime` | `:749` | the occurrence's `at` moves; the id is unchanged; the merge exception above delivers it to every device |
| dose log soft-deleted | any | retract |
| prescription soft-deleted | prescription service | retract every entry whose `sourceDoseLogId` belongs to it; **history is not rewritten beyond that** — the doses did not happen any less, but the prescription is gone, so future doses cannot emit |
| `isSupplement` cleared | prescription service | **history is not rewritten.** Existing emitted entries stand — they record what was consumed. Only future doses stop **emitting**; retraction continues to run for every existing entry (see the normative rule above). |
| `isSupplement` turned **on** | prescription service | **no backfill.** The profile is a present-tense claim with no basis at past dates. Forward-only. (Raised as Q-C in §10.) |

**Re-take idempotence rests on a verified property:** `upsertDoseLog` reuses the existing row for the same `(prescriptionId, phaseId, scheduleId, date, time)` tuple and only mints a new uuid when none exists (`dose-log-service.ts:157-185`, `getDoseLogRaw` at `:110-129`). So take → untake → take keeps one dose log id, therefore one entry id, therefore one line item and one occurrence. The one case that mints a fresh id is a dose log that was **soft-deleted** and then re-created (`getDoseLogRaw` filters `deletedAt === null`); that produces a new entry and leaves the old one retracted — correct, and counted once.

**How it is distinguished, in the UI and in totals.**
- **In totals: not distinguished at all.** It is a real intake and enters `TOTAL` like any other entry. That is the point of the decision.
- **In the UI:** `sourceDoseLogId != null` renders a medication badge and a link to the dose; **`+1`, `-1`, `scaleEntry`, `updateEntry` and delete are disabled** on it. Its occurrence set has one owner — the dose log — and giving the user a second lever would recreate the two-owners problem one domain over. Correcting the numbers means editing the prescription's `supplementProfile` (forward-only) or logging a separate entry.
- **In MCP:** the dose appears in `list_recent_doses` **and** its nutrients in `get_today_summary` / `query_intake_history`. The tool descriptions must say so explicitly (§5.8), or a model asked "how much magnesium today" may add the two.
- **In the duplicate warning:** §2.4 R6.2's extra clause.

**Deliberately not done: a read-time join from `doseLogs` into the totals.** It would make `TOTAL` a sum over two tables with different lifecycles — verbatim the §1 bug class — and the supplement would be invisible in the day list, uneditable, un-exportable and absent from CSV. See §9 R-21.

### 2.11 The alcohol display unit (Q2)

**Canonical storage is unchanged: `alcoholG`, grams of pure ethanol, per unit.** Nothing else is stored. Standard drinks, UK units and grams are all presentations of it.

**The unit systems are data, in the file that already owns the constants** (`packages/core/src/alcohol-units.ts`, which today exports `GRAMS_PER_STANDARD_DRINK = 10` at `:7` and `ETHANOL_DENSITY_G_PER_ML = 0.789` at `:11`, verified):

```ts
export type AlcoholDisplayUnit = "metric_standard" | "uk_unit" | "grams";

export const ALCOHOL_UNIT_SYSTEMS = {
  metric_standard: { gramsPerUnit: GRAMS_PER_STANDARD_DRINK,          // 10
                     suffix: "std drinks", csvUnit: "std_drinks", dp: 1 },
  uk_unit:         { gramsPerUnit: 10 * ETHANOL_DENSITY_G_PER_ML,     // 7.89 — 10 ml of ethanol
                     suffix: "units",      csvUnit: "uk_units",  dp: 1 },
  grams:           { gramsPerUnit: 1,
                     suffix: "g",          csvUnit: "g_ethanol", dp: 1 },
} as const;

export function formatAlcohol(grams: number, unit: AlcoholDisplayUnit): string;
export function alcoholInUnits(grams: number, unit: AlcoholDisplayUnit): number;
```

The UK unit is **derived from the existing density constant** (10 ml of ethanol), not hardcoded as 8 — the same one-constant discipline as `NACL_SODIUM_MASS_FRACTION` in §2.3.4. Nothing anywhere else may introduce a second gram-per-unit figure; `formatAlcohol` is the only formatter.

**Where the setting lives.** Two places, deliberately, with one authority:

1. **`settings.alcoholDisplayUnit: AlcoholDisplayUnit`** — `apps/web/src/stores/settings-store.ts`, alongside the other presentation preferences (`timeFormat` at `:103` is the closest analogue), default `"metric_standard"`, persisted to localStorage. `SETTINGS_PERSIST_VERSION` 16 → 17 (`:255`) with a `version < 17` arm in `migrateSettings` (`:263-339`) seeding the default — the same one-line shape as the `version < 13`/`< 14` arms. A setter `setAlcoholDisplayUnit` joins the actions block, and the "Tracking" accordion (`app/settings/page.tsx:94-104`) gains one row.
2. **`userProfile.alcoholDisplayUnit: string | null`** — the synced mirror, for the same reason `dayStartHour` needs one (§5.6): **MCP runs on the server and has no localStorage.** Same three deliverables as §5.6 — a one-time backfill, a mirror writer, and **one read-side fallback order used identically on both sides: `profile.alcoholDisplayUnit` → localStorage → `"metric_standard"`.**

**Every presentation surface reads it. No surface hardcodes a unit.** The sites, verified:

| Site | Today | V2 |
|---|---|---|
| `text-metrics.tsx:450` | `` `${alcoholTotal.toFixed(1)} std drinks` `` | `formatAlcohol(TOTAL("alcoholG", W_today), unit)` |
| `text-metrics.tsx:480` weekly grid row | `fmt: (v) => v.toFixed(1)` with `limit: 0, buffer: 0` | `fmt` from `formatAlcohol`; the limit comes from the nutrient limits registry |
| `history/record-row.tsx:87-88` | `` `${amountStandardDrinks} drink${n !== 1 ? "s" : ""}` `` | `formatAlcohol(...)`; pluralisation moves into the formatter |
| `voice/parsed-item-row.tsx:371` | `` `≈ ${stdDrinks.toFixed(1)} standard drink…` `` | `formatAlcohol(...)` |
| `analytics/records-tab.tsx:378-384` | recomputes `standardDrinksFromAbv(...).toFixed(2)` on save — a third copy of the ABV rule | deleted; the entry stores `alcoholG` |
| `analytics/summary-tab.tsx` KPI | own reduce | `formatAlcohol(TOTAL(...))` |
| `preset-tab.tsx:102` | `std` label on the preset chip | `formatAlcohol(...)` |

**§3's port table follows suit**: the dashboard alcohol row is **not** `TOTAL("alcoholG", W) / 10`. It is `formatAlcohol(TOTAL("alcoholG", W), displayUnit)`, and the numeric form used by charts and thresholds is `alcoholInUnits(...)`.

**CSV contract.** `export-service.ts`'s `domainUnit` returns the literal `"std_drinks"` for the `alcohol` domain today (`:125-154`, verified). Under V2:
- the `unit` column for alcohol rows emits `ALCOHOL_UNIT_SYSTEMS[displayUnit].csvUnit` and the `value` column is converted to match — the file is already self-describing, since `unit` is a column and not a header assumption;
- the export gains an explicit **format version** (it has none today) and the export dialog states the unit in use;
- every other nutrient's unit comes from the registry (`NutrientDef.unit`), so `domainUnit`'s hand-written switch is deleted rather than extended.

**MCP contract — canonical *and* display, never display alone.** An OAuth tool whose numbers silently change unit when a user flips a setting is a footgun for claude.ai. So `get_today_summary` and `query_intake_history` return, for alcohol:

```jsonc
"alcohol": { "grams": 23.4, "display": { "value": 2.3, "unit": "std_drinks" } }
```

`grams` is stable forever and is what a model should compute with; `display` is what it should quote back to the user. `query_substance_history`'s tool description — today *"the authoritative source for alcohol and caffeine intake"* (`tools.ts:228`, verified) — is updated to say the same, and the transition-window rules of §5.8 apply unchanged.

---

## 3. DERIVED-TOTALS CONTRACT

Notation. `A` = `{ e ∈ intakeEntries : e.deletedAt === null }`. `resolve(m)` is N-7's forward resolution of deprecated keys over a nutrient map. For entry `e`, nutrient key `k` and window `W`:

```
LIVE(e, W)   = { o ∈ e.occurrences : o.removedAt === null ∧ o.at ∈ W }
N(e, W)      = |LIVE(e, W)|
n(e)         = resolve(e.nutrients)
TOTAL(k, W)  = Σ_{e ∈ A, k ∈ dom(n(e))}  n(e)[k] × N(e, W)
KNOWN(k, W)  = |{ e ∈ A : N(e,W) > 0 ∧ k ∈ dom(n(e)) }|
APPLIC(k, W) = |{ e ∈ A : N(e,W) > 0 ∧ resolve(e.provenance)?.[k] !== undefined }|
```

`dom(n(e))` is "the keys present in the resolved map". `TOTAL` is a lower bound when `KNOWN < APPLIC`. **Every surface that renders a total must also have access to `KNOWN`/`APPLIC`** so it can render "≥ 1 240 mg (3 of 4 known)". V1 could not express this — an unknown nutrient was indistinguishable from an absent row.

**The denominator is `APPLIC`, and it is defined by `provenance` alone — never by `kind`, never by the registry's `appliesTo`.** With a raw entry count, a typical day of 12 water quick-adds plus 3 food entries renders sodium as "≥ 1 240 mg (3 of 15 known)" forever, the `≥` presentation gets switched off within a week, and the three-state distinction goes with it. `APPLIC` counts only entries where someone determined something about `k` (§2.7), so the same day reads "1 240 mg (3 of 3 known)" — an exact number, correctly. N-8's underscore-prefixed reserved slots are what keep `APPLIC` from counting the entry's own `_name`/`_servingMassG` provenance as a nutrient determination.

**Aggregation is per-registry-entry.** Today every nutrient is `aggregation: "sum"`, so `TOTAL` above is the whole contract. The registry field exists so that a future nutrient whose daily figure is not a sum cannot be added without confronting the question.

**Range-bound rule.** All windows are half-open `[start, end)`, **one convention, everywhere**. V1 mixed exclusive (`intake-service.ts:187`, `record-crud.ts:55`) and inclusive (`substance-service.ts:109`, `:114`) upper bounds, so an entry landing exactly on `range.end` was counted by one reader and dropped by another. Codify `[start, end)` in one shared helper and delete the per-service variants.

**Day-boundary rule.** `W_today = [dayStart(profile), dayStart(profile) + 24h)`. **One notion of a day, derived from a SYNCED `dayStartHour` + `homeTimezone` on `userProfile` (§5.6), used by every surface** — dashboard, analytics bucketing, history grouping, export, and MCP.

V1 has five mutually inconsistent notions (dashboard uses the localStorage `dayStartHour`, `settings-store.ts:66`; analytics `dayKey` uses local midnight, `analytics-service.ts:61-63`; correlations use the `Intl` device zone; range presets use `startOfDay`; MCP uses a server-process-timezone `setHours` reading `push_settings.day_start_hour`, whose only writer hardcodes `2`, `api/push/settings/route.ts:23-28`). Verified today: `mcp/queries.ts:45-52` reads `pushSettings.dayStartHour` with `?? DEFAULT_DAY_START_HOUR`, and `todayStartTimestamp` (`:54-59`) calls `d.setHours(...)` in the Vercel process zone. A Europe/Berlin user with `dayStartHour = 4` logging 750 ml at 03:00 local gets it counted toward the previous day by the dashboard and toward today by `get_today_summary`.

**Unifying them requires a schema change AND a backfill, both in scope** — see §5.6.

### R-L — the read contract for "the ordered list of line items in window W"

This is the primary V2 surface. It cannot be an entry-ordered scan, because §2.5 permits (and the `+1` suggestion encourages) an entry whose occurrences span days:

> User logs "Coffee" Monday 08:00; Friday 16:00 they tap `+1` on the suggested row. `TOTAL("caffeineMg", W_friday)` correctly rises by 95 mg. But a `timestamp`-ordered list groups the coffee under **Monday** (`timestamp = min(live at)`), so Friday's list shows nothing for it — two surfaces on the same screen disagreeing about whether the user drank coffee on Friday.

**Normative contract:**

- **The unit of the list is the OCCURRENCE, not the entry.** A day list over `W` is `{ (e, o) : e ∈ A, o ∈ LIVE(e, W) }`, projected as `{entry: e, at: o.at, occurrenceId: o.id}` and **sorted by `o.at`** (ties by `e.id`, then `o.id`).
- An entry with two live occurrences in `W` appears **twice**. An entry with occurrences in two days appears **once in each day**, at the right time in each.
- The renderer may collapse adjacent same-entry rows into one line item showing a count, but the **expansion must list the individual occurrence times** (§2.5), and each row's `+1` / remove control addresses a specific `occurrenceId`.
- **Index that supports it:** the predicate is `e.lastOccurrenceAt >= W.start AND e.timestamp < W.end`. In Dexie that is two range scans intersected. **In Postgres the selective term is `idx_entries_user_last_occ` alone** — `timestamp < W.end` is non-selective for any window ending at now, so the planner will use `idx_entries_user_last_occ` and apply the other term as a filter, and the sizing argument rests on that one index. `idx_entries_user_ts` earns its place for cursor paging, not for this prune.
- **The corollary, stated because the `+1` suggestion actively encourages the shape:** a long-lived entry ("Coffee", created in January, tapped daily) has a year-wide occurrence span, so it is read by *every* single-day query for a year. The `LATERAL` occurrence count keeps the number right — only occurrences inside `W` are counted — but the pruned row set grows with the number of long-lived entries rather than purely with the window. At single-user scale that is tens of rows; it is called out so that a future performance question has a known cause.
- **What `timestamp` is then for:** cursor paging (`getEntriesByCursor`), the `[nameKey+timestamp]` suggestion lookup, and span pruning on the client. It is **not** a display sort key and no list may order by it.
- `groupRecordsByDate` (`history-types.ts:27-46`) buckets on the record's own timestamp and must be replaced by an occurrence-bucketer keyed on `o.at` and on the §5.6 day boundary (it currently uses `toLocaleDateString` with hardcoded `"en-US"`, which is also its Map key).

### The expanded line item

Normative, because §2.3's uniformity is only observable if the UI honours it: the expansion lists **every registry key for which the entry has either a value or a provenance entry**, in registry order, each rendered as `label + value + unit` from the registry, with the three states visually distinct (value / "unknown" / absent-and-omitted). The dashboard renders the **pinned** subset (§2.3.6). No nutrient is unreachable from the UI, which is what "first-class" means at the presentation layer.

### Metric-by-metric port table

| V1 metric | V1 computation | V2 computation |
|---|---|---|
| Dashboard water (ml) | `getDailyTotal("water", h)` — `intake-service.ts:104-112` | `TOTAL("waterMl", W_today)` |
| Dashboard sodium (mg) | `getDailyTotal("salt", h)` | `TOTAL("sodiumMg", W_today)` |
| Dashboard sugar (g) | `getDailyTotal("sugar", h)` | `TOTAL("sugarG", W_today)` |
| Dashboard potassium (mg) | `getDailyTotal("potassium", h)` | `TOTAL("potassiumMg", W_today)` |
| Dashboard caffeine (mg) | `Σ substance.amountMg` — `text-metrics.tsx:104-122` | `TOTAL("caffeineMg", W_today)` |
| **Dashboard alcohol** | `Σ substance.amountStandardDrinks`, rendered `` `${n.toFixed(1)} std drinks` `` (`text-metrics.tsx:450`) | **`formatAlcohol(TOTAL("alcoholG", W_today), displayUnit)`** (§2.11). Replaces three copies of the ABV rule (`drink-service.ts:196-201`, `composable-entry-service.ts:753-756`, `records-tab.tsx:378-384`) **and** the hardcoded unit. |
| Any other nutrient | did not exist | `TOTAL(k, W_today)`, rendered with `registry[k].unit`. **New nutrients need no port-table row** — this line is the whole contract for all of them. |
| Rolling 24 h (`liquids-card.tsx:279`) | `getTotalInLast24Hours` | `TOTAL(k, [now-24h, now))`. **Correct only because `N(e,W)` counts occurrences.** |
| Weekly grid buckets | fixed 86 400 000 ms arithmetic — `text-metrics.tsx:62-71` (DST-unsafe) | 7 calls to `TOTAL(k, [dayStart(d), dayStart(d+1)))`, `dayStart` computed per calendar day. Fixes the DST shift and puts three lollies spanning midnight in the two days they happened in. |
| **Day / recent line-item list** | `orderBy("timestamp").reverse().toArray()` over 6-7 tables, fanned in by `useHistoryData` / `useRecordsTabData` | **R-L above.** New reads: `getEntryOccurrencesInWindow(W)`, `getEntriesByCursor(cursor, n)` (ordered by `timestamp` descending), `getRecentEntries(n)` (ordered by `lastOccurrenceAt` descending, because "recent" means most recently consumed). |
| `getRecordsByDomain(domain, range)` | 11-arm switch over 4 services — `analytics-service.ts:72-163` | One query + one projection: for each live occurrence in range, `DataPoint{timestamp: o.at, value: n(e)[k]}`. Non-nutrient domains unchanged. `eating` — valued at a constant `1` (`analytics-service.ts:132`) — becomes the live-occurrence count over `kind === "food"`, which finally counts a 3× snack as 3. |
| `fluidBalance.intakeMl` | Σ of water points | `TOTAL("waterMl", day)` per day. Urination side unchanged. **Changes historical numbers** — deliberately, per Q1 (§4.2a). |
| Summary tab KPIs | own 9-arm reduce — `summary-tab.tsx:128-165` | Delete the reduce; call the same `TOTAL` the dashboard calls. |
| AI snapshot `metrics.intake` | `sum(points)/days` — `analytics-snapshot.ts:222-239` | `TOTAL(k, W_30d) / 30`, same divisor as the summary tab, from the same function. |
| Correlations | `avgByDay` = **mean** of raw points — `packages/core/src/analytics-stats.ts:118-131` | **Change to daily `TOTAL`.** V1 correlates "the average size of one salt entry that day" against weight, which is not a nutritional quantity. |
| MCP `get_today_summary` | `SELECT type, sum(amount) GROUP BY type` — `mcp/queries.ts:70-85` | `sum((e.nutrients ->> $k)::double precision * occ.n)` with `occ` a `LATERAL` count of live occurrences inside the window; pruned by `e.last_occurrence_at >= $start` on `idx_entries_user_last_occ`, with `e.timestamp < $end` as a filter. Caffeine and alcohol become available here for the first time; alcohol returns `{grams, display}` (§2.11). **Not cut over in the same release as the client — §5.8.** |
| CSV `exportAllRecordsCSV` | 11 domains, `timestamp,domain,value,unit,note` — `export-service.ts:76-123` | Same columns, **one row per occurrence**; `domain` iterates the **registry** rather than a hand-written array; `unit` from `registry[k].unit`, and for alcohol from the display-unit setting (§2.11); `note` finally populates from `entry.name` (V1 always emitted empty because `getRecordsByDomain` never set `DataPoint.label`). Add an explicit format version — the file has none. Fix the PDF "Recent Records" sort in the same pass: it sorts `"MMM d, HH:mm"` strings lexicographically (`export-service.ts:~268`). |
| Nutrient analysis input | descriptions only, never the stored numbers — `nutrient-analysis-card.tsx:225-233` | Send `{name, occurrenceCount, servingMassG, ...n(entry)}` per entry. The single largest capability unlock. |

**Deleted read helpers** (they exist only to reassemble what should have been one row): `getIntakeTotalsByGroupIds` and its three wrappers (`intake-service.ts:205-240`), the three hooks at `use-intake-queries.ts:168-201`, `getEntryGroup` (`composable-entry-service.ts:288-303`), `useEntryGroup` (`use-composable-entry.ts:41-47`). Each becomes a property access.

**`data-deletion-service.ts` semantics must be restated for this table.** `DELETABLE_TABLES` is derived from `TABLE_PUSH_ORDER` (`data-deletion-service.ts:21`) so it picks up `intakeEntries` for free — but it filters on `createdAt` (`:24-26`, `:38-40`, `:66`). A long-lived entry (Coffee, created in January, `+1`'d yesterday) would be wiped by "delete records older than 90 days". **For `intakeEntries` the filter is `lastOccurrenceAt`**, and an entry is only deletable when *every* live occurrence falls in the range; otherwise the in-range occurrences are removed individually and the entry survives.

---

## 4. MIGRATION PLAN

### 4.1 Two conversion mechanisms, one fold, and a conversion split into TWO PASSES

**The primary mechanism is a SERVER-SIDE conversion. The client pass is a reconciler, not the migration.**

A client-only migration is wrong by three to four orders of magnitude: corpus estimate 55 k-110 k legacy rows ⇒ ~30 k-55 k entries plus 55 k-110 k member updates ⇒ **85 k-165 k queue ops** against `PUSH_BATCH_CAP = 50` (`sync-engine.ts:50`), with a chained pull per cycle (`:368`) — **~1 700-3 300 foreground-online round trips**. See R-9.

**(A) Server-side conversion — the migration. TWO PASSES, and the split is load-bearing.**

Running the server job (R2) strictly before the v23 client (R3), with the job tombstoning every converted member, is catastrophic: at the moment R2 runs, 100 % of devices are on the v22 bundle. `pull/route.ts` returns tombstones verbatim, `sync-engine.ts:540` applies them with `bulkPut`, and every V1 read path filters `deletedAt === null` (`intake-service.ts:96`, `:109`, `:189`; `record-crud.ts:41`, `:56`), while the v22 bundle's `TABLE_PUSH_ORDER` has no `intakeEntries` so the entries slice is silently ignored. For the whole R2→R3 gap the user's only working client shows **water 0 ml, empty History, empty weekly grid, empty fluid balance, empty CSV export**. Worse, edits made in that window are destroyed silently (§4.4).

So the conversion is split:

- **PASS A — mark, do not tombstone.** For each legacy group: write the `intake_entries` row (carrying `legacyMemberIds`), and stamp `repaired_into_entry_id = <entryId>` on every member. **`deleted_at` is left exactly as it was.** V1 clients keep reading their whole corpus normally. The MCP union predicate (§5.8) already excludes marked rows, so nothing double-counts. Pass A is idempotent and re-invocable and runs **before** the client ships.
- **PASS B — tombstone.** For each member still live and carrying `repaired_into_entry_id`: record `repaired_from_deleted_at := deleted_at`, set `deleted_at := now`, `repair_tombstoned_at := now`, `updated_at := now`. **Members already tombstoned are stamped by pass A but never touched by pass B** — see step 6. Pass B is gated on **the v23 client confirmed live on every registered device**, evidenced by a per-device `clientSchemaVersion` heartbeat written on each push (§5.2), not by elapsed time.

**Pass A has a real precondition of its own.** Before its first write for an account, the pass-A job takes a server-side snapshot of the three legacy tables (`CREATE TABLE intake_records_pre_v2 AS SELECT * FROM intake_records WHERE user_id = $1`, likewise for the other two, in a dedicated `migration_snapshots` schema), computes and stores a row count + `deterministicJson` hash per table, and re-verifies the hash before starting. **Documented restore procedure:** `DELETE FROM <table> WHERE user_id = $1; INSERT INTO <table> SELECT * FROM <table>_pre_v2 WHERE user_id = $1; DELETE FROM intake_entries WHERE user_id = $1 AND entry_source = 'migration';` followed by a forced full re-pull on every device (`_syncMeta` cursors reset). Snapshots are retained until R6.

**(B) Client-side reconciler — `repairLegacyEntries()`.** Same fold, same anchor ids, for the rows the server job cannot see: rows a stale V1 device pushes *after* pass A ran, rows imported from an old backup, rows the device itself writes through the still-live V1 write paths during R3a, and (for a device that upgrades before pass A runs) its own local corpus. **The client reconciler stamps `repairedIntoEntryId` but NEVER writes `deletedAt` on a legacy row until pass B has run for the account** (a flag delivered on the entries pull).

**The fold is implemented ONCE**, as a pure function in `packages/core/src/legacy-fold.ts`:

```ts
export function foldLegacyGroup(members: LegacyMembers): FoldedEntry
```

Both (A) and (B) call it, and so does §4.2a's derivation, which is a pure function it calls. A second implementation in SQL is refused precisely because two implementations of one rule is the disease this document is about. §5.8's union predicate does not need one — it keys on `legacy_member_ids`, which is *data the fold already emitted*.

**Dexie v23 adds the `intakeEntries` store and carries NO `.upgrade()` conversion.** Four reasons, each from a confirmed constraint:

1. **A throwing upgrade hook bricks the database permanently** — the v22 hook wraps its per-pair body in `try/catch` precisely because "one malformed row must not abort the version change — Dexie then refuses to open the database at all" (`db.ts:616-618`).
2. **A fresh install never runs a hook, and the v22 comment says so** (`db.ts:586-591`).
3. **Legacy rows keep arriving after the upgrade** — pull is `bulkPut` with no merge (`sync-engine.ts:540`).
4. **A runtime pass can be batched, resumed, observed, re-run, and reverted.** An upgrade hook can do none of those.

State lives in a **local-only** Dexie table `_repairState` (never synced, never backed up — same category as `_syncQueue` / `_syncMeta` / `_errorLogs`, which `table-sync.test.ts:94` already excludes via `NON_BACKUP_TABLES`).

### 4.2 The conversion algorithm

#### Step 0 — GROUP-ID PRE-PASS (v23 client, runs and pushes BEFORE any fold)

> For every live-or-tombstoned legacy row with `groupId == null` that the closure rules can reach a partner through, compute the closure (step 2's link rules), derive `anchorId(members)`, and write `groupId := anchorId` on **every** member — **enqueuing each one**, exactly as the v22 hook does (`db.ts:593-606`). Then push, and wait for the push to drain before the fold starts.

After the pre-pass, **anchor rule 1 (`min groupId`) applies to every group the client can see**, and the value it yields is on the server too. The pre-pass writes only `groupId`, so it is safe for a V1 client to receive.

#### Step 1 — SEED SET. Three exact seeds. **No timestamp cursor.**

A monotonically-advancing `timestamp` cursor contradicts "the post-pull pass converts whatever arrived". **The cursor is removed.**

- **(i) Initial backfill sweep** — one pass over the three legacy tables in **primary-key (`id`) order**, resumable by a `lastScannedId` cursor per table in `_repairState`, batched. Completion recorded as `backfillComplete: true`.
- **(ii) Post-pull reconciliation** — seeded by **the exact set of record ids the pull just wrote**. `sync-engine.ts:539-546` already has `rows` in hand.
- **(iii) Post-import reconciliation** — seeded by the ids `importBackup` wrote (§5.7).

**Why ordering seed (i) by `id` rather than `timestamp` is safe, in full**, because the reasoning is load-bearing and should not be left for an implementer to rediscover. A row that arrives *mid-sweep* with an id below the cursor is not missed:

- **Rows that arrive by pull** are covered by seed (ii), which is seeded from the exact ids the pull wrote.
- **Rows the device itself writes during R3a** — which is continuous, because the V1 write paths are still live until R3b — are also covered, and by the same seed. `pull/route.ts` scopes its SELECT by `eq(table.userId, auth.userId!)` only (`:95`) and applies **no device filter**, so a row this device just pushed is re-fetched by its own next pull; and the pull cursor is clamped back to `serverTime - SKEW_MARGIN_MS` whenever a table drains with rows inside the skew window (`sync-engine.ts:526-532`, `SKEW_MARGIN_MS = 30_000` at `:58`), which guarantees that window is re-scanned. So a locally-written row lands in seed (ii) on the following cycle.

Streaming uses `.each()`, never `.toArray()`. **Re-entrancy:** an in-flight flag mirroring `pullInFlight`/`pushInFlight` guards it; P1 is stated as *idempotent AND safe under concurrent invocation*.

**The backup gate applies to seed (i) ONLY.** A blanket rule would block the post-pull reconciler in every session where the user has not manually exported a backup. Corrected: seed (i) requires `_repairState.backupConfirmedAt` from a backup that completed and validated in this session; **seeds (ii) and (iii) run unconditionally**. The multi-year corpus is protected by the server-side snapshot in §4.1.

#### Step 2 — MEMBERSHIP, then a single NORMALISED ANCHOR ID

**Membership discovery** — transitive closure over three indexed relations, all present in Dexie today (`db.ts:557`, `db.ts:571`):

```
Start from seed row r. Repeat until the member set stops growing:
  G-link  if any member has a non-null groupId g:
            add every row in the three tables with groupId === g        [index: groupId]
  S-link  for every member substance s:
            add every intakeRecord with source === `substance:${s.id}`  [index: source]
          for every member intakeRecord i with source starting `substance:`:
            add substanceRecords.get(i.source.slice(10))
  R-link  for every member substance s with s.sourceRecordId === I:
            add intakeRecords.get(I)                                    [primary key]
          for every member intakeRecord i:
            add every substanceRecord with sourceRecordId === i.id      [index: sourceRecordId]
```

R-link is the **v12 linkage the v22 hook never covered** (`db.ts:302-352`, verified) — those pairs are finally repaired.

**Anchor id** — a pure function of the *closed member set*:

```
anchorId(members) =
  0. if ANY member (live or tombstoned) already carries repairedIntoEntryId:
       adopt THAT entry id and merge into it.   ← normative, checked FIRST
       (if two members carry different ids, adopt the lexicographic min and
        record the collision in _errorLogs + _repairState.anchorCollisions)
  1. else min over { m.groupId : m ∈ members, m.groupId != null }        (lexicographic)
  2. else min over { m.id : m ∈ members, m is a SubstanceRecord }        (lexicographic)
  3. else min over { m.id : m ∈ members }                                (lexicographic)
```

**Why rule 0 and step 0 are both required.** An anchor that is a pure function of the *locally visible* member set is not stable, and the two sources of local-only legacy rows are verified: `db.ts:302-352` (the v12 upgrade mints `substanceRecords` with `crypto.randomUUID()` and `sourceRecordId: record.id` inside a hook that predates the sync queue and **never enqueues**) and `backup-service.ts:420`, `:607` (`importBackup` calls `bulkPut` with **zero `_syncQueue` writes**). Scenario: intake `I` is on the server; substance `S` exists only in the phone's IndexedDB. The server's closure is `{I}` → rule 3; the phone's is `{I, S}` → rule 2. Two live entries, both booking the same water. Step 0 makes the anchor derivable from a single row; rule 0 adopts a published anchor regardless of member set. Both ship. Proof obligations: P2, P2a, P2b.

#### Step 3 — ENTRY ID

`entryId := anchorId`, verbatim. Not a hash, not a uuid. Same anchor everywhere ⇒ same primary key ⇒ LWW converges instead of duplicating. (The same principle produces `id := doseLog.id` in §2.10.)

#### Step 4 — IDEMPOTENCY, and the mandatory re-mark

```ts
const existing = await db.intakeEntries.get(anchorId);   // primary key, no index needed
```

If an entry exists for the anchor, the pass **must not** skip. It **MUST** apply step 5's merge rules, union `legacyMemberIds`, and **re-stamp `repairedIntoEntryId` on every member of that anchor that lacks it**. Without it, a group whose entry was written but whose marks did not commit is permanently un-excluded from the MCP union.

#### Step 5 — FOLD the member set into ONE `IntakeEntry` (`foldLegacyGroup`)

```
  hasEating         := members contain a live EatingRecord
  hasFluid          := a live water IntakeRecord exists, OR a live substance has volumeMl > 0
  kind              := hasEating           ? "food"
                     : hasFluid            ? "drink"
                     : hasSubstance        ? "supplement"      // see §4.2b M2
                     : "other"

  name              := eating.note ?? substance.description ?? intake.note
                    ?? getLiquidTypeLabel(intake.source)
                    ?? TYPE_NAME[soleNutrientType]   // "Water" | "Sodium" | "Sugar"
                                                     // | "Potassium" | "Caffeine" | "Alcohol"
                    ?? "Untitled entry"
  nameKey           := normalise(name) || entryId

  occurrences       := [{ id: `${anchorId}:0`, at: min(LIVE member.timestamp), removedAt: null }]
  timestamp/lastOccurrenceAt/deletedAt := projectOccurrences(occurrences)

  servingVolumeMl   := hasEating ? null : (drinkWaterAmount ?? substance.volumeMl ?? null)
  servingMassG      := eating.grams ?? null

  nutrients         := {}   // built by SETTING keys only where a value is DETERMINED
    sodiumMg        ← intake{type:"salt"}.amount
    sugarG          ← intake{type:"sugar"}.amount
    potassiumMg     ← intake{type:"potassium"}.amount
    caffeineMg      ← substance{type:"caffeine"}.amountMg
    alcoholG        ← foldAlcohol(substances)
    waterMl         ← deriveWaterMl(...)          // §4.2a — CLASSIFIER + CORRECTION
    every other key := ABSENT (never determined), NOT zero. Critical.

  basis             := sodium row source "manual:salt" -> provenance.sodiumMg.basis =
                         { id:"salt", inputUnit:"mg", factor:0.39 }   // V1's factor, snapshotted
                       "manual:msg"  -> { id:"msg",  inputUnit:"mg", factor:0.12 }
                       anything else -> { id:"sodium", inputUnit:"mg", factor:1 }
  components        := null                          // V1 had no ingredient data
  provenance        := { <every determined key>: {origin:"migration", at:now, rule,
                                                  derivationVersion, derivedFrom?, basis?},
                         <every UNDECIDABLE key>: {origin:"migration", at:now, rule,
                                                  derivationVersion} }
  entrySource       := "migration"
  sourceDoseLogId   := null
  originalInputText := member.originalInputText ?? null
  legacySourceId    := anchorId
  legacyMemberIds   := sorted ids of EVERY member in the closure (live and tombstoned)
  timezone/deviceId := from the seed row
  createdAt         := min(member.createdAt);  updatedAt := now
```

**The occurrence's `at` is `min(timestamp)` over the LOCALLY VISIBLE LIVE members, and the id is synthetic and shared (`${anchorId}:0`)** — so two devices with unequal member sets mint the same id with different `at`. That is exactly why `unionOccurrences` is specified as `at := min(a.at, b.at)` on id collision for non-dose entries: the union stays commutative and associative, and the projections converge. Property-tested alongside the union laws.

**A meal's water row supplies `waterMl` only, never `servingVolumeMl`.** Setting `servingVolumeMl := waterIntake.amount` unconditionally stamps a false liquid serving volume on every migrated meal, contradicting §2.2 ("null for solids") and making `waterContentPercent` read 100 % for every solid food ever logged.

```
  foodWaterIntake  := the water IntakeRecord whose source === "manual:food_water_content"
                      (FOOD_WATER_SOURCE, composable-entry-service.ts:346)
  drinkWaterIntake := any other live water IntakeRecord in the member set
  drinkWaterAmount := drinkWaterIntake?.amount
```

**Alcohol — a guarded derivation over the substance SET, never a `??` chain:**

```ts
function foldAlcohol(subs: LegacySubstance[]): number | undefined {
  const s = subs.find((x) => x.type === "alcohol");
  if (!s) return undefined;
  const abv = s.abvPercent, vol = s.volumeMl;
  if (Number.isFinite(abv) && abv! > 0 && Number.isFinite(vol) && vol! > 0) {
    const g = ethanolGrams(abv!, vol!);            // packages/core/src/alcohol-units.ts:13
    if (Number.isFinite(g)) return g;
  }
  const sd = s.amountStandardDrinks;
  if (Number.isFinite(sd) && sd! >= 0) return sd! * GRAMS_PER_STANDARD_DRINK;   // :7
  return undefined;                                 // key ABSENT, determined-unknown
}
```

Both inputs are optional on `SubstanceRecord` (`records.ts:334-335`, verified). Two legacy cohorts have one or both missing: the pre-#323 preset path wrote alcohol substances **with no volume at all** (`preset-tab.tsx:238-249`), and the **v12 migration's alcohol branch writes `amountStandardDrinks` and no `volumeMl` at all** (`db.ts:333-349`, verified). For either, `ethanolGrams(...)` returns `NaN`, and `NaN ?? (sd * 10)` evaluates to **`NaN`** — `??` does not catch `NaN`. **Every number the fold emits is asserted `Number.isFinite` before the entry is written.**

**MULTI-MEMBER COLLISIONS.** Two live water rows in one member set — possible for pre-v22 or hand-built groups, and exactly the #322 residue — are resolved by taking the **first by `(timestamp, id)`** and recording the rest. **Do NOT sum them.** The dropped volumes go to `_errorLogs` *and* increment durable `deduplicatedMl` / `deduplicatedCount` counters in `_repairState`, surfaced in the debug panel and in a one-time user-visible reconciliation notice.

**MERGE RULES when an entry already exists for the anchor.** These rules have to do two different jobs, and conflating them is what makes a fold either lose information across devices or freeze stale numbers across time. They are therefore split by **closure completeness**.

1. **The pass does not run against a partially-drained pull.** Gated on `_repairState.lastCompletePullAt`, written by `runPullCycle` when it exits the loop with `anyHasMore === false`. **This gate has to be built** — `anyHasMore` is a function-local today (`sync-engine.ts:498`, `:504`, `:550`) and the only global flag is set after a full drain (`:553-560`).
2. **Closure completeness is a computed predicate.** The re-fold's closure is **complete** iff every id in the existing entry's `legacyMemberIds` is present in the locally visible closure. Incomplete means this device is missing members another device can see.
3. **COMPLETE closure ⇒ RE-DERIVE, including downward.** Every key whose `provenance[k].origin === "migration"` is recomputed from the current member set and **overwritten, in either direction**, and the entry's `occurrences`/`legacyMemberIds` are unioned. This is what makes a legacy edit or delete performed through the still-live V1 UI during R3a reach the entry: the echoed row comes back on the next pull, seed (ii) re-folds the group, and the derived value follows the data. Keys whose provenance origin is anything else — a user edit, an AI enrichment, a `rollup` — are never touched by the fold.
4. **COMPLETE closure with ZERO live members ⇒ RETRACT.** Every live occurrence of the existing entry is marked `removedAt = now` and the entry soft-deletes by projection (§2.5). This is the arm that stops a drink the user deleted in the V1 History screen after pass A from reappearing at the R3b cut-over. It never hard-deletes, so a legacy undelete revives the entry on the next fold.
5. **INCOMPLETE closure ⇒ ADD-ONLY.** The fold may add a key that is absent; it may **never** remove a key, lower a known value to unknown, or retract an occurrence. This is the rule's actual purpose: not losing information across **devices with unequal member sets**. It is explicitly not a rule about time.
6. **Derivation version orders two folds of the same row.** A fold may overwrite an existing `migration`-origin value only when its own `derivationVersion` is **greater than or equal to** the value's stored `derivationVersion`; a fold running an *older* module leaves the value alone. Equal versions are safe to re-derive because the module is pure — same inputs, same output — so no oscillation is possible; unequal versions cannot oscillate because the ordering is strict. §4.2a states the version constant and the operational rule that goes with a bump.
7. **`updatedAt := now`** on any change. Under rules 3-6 a newer `updatedAt` carries a value that is either strictly better-informed or identically derived.

#### Step 6 — MARK (pass A) and TOMBSTONE (pass B), reversibly

**Membership discovery has no live filter**, so a member set routinely contains rows the user deleted years ago. Stamping `{deletedAt: now}` on **every** member would overwrite a 2026-03-03 deletion with `now`, and `revertRepair()` would then restore it to live — verbatim the hazard used to reject `undoDeleteEntryGroup` (`composable-entry-service.ts:248-279`).

- **Pass A stamps `repairedIntoEntryId` on EVERY member, live or tombstoned.** Marking changes no read anywhere (every V1 predicate keys on `deletedAt`).
- **Pass B tombstones ONLY rows that were live at fold time**, recording the pre-repair value first:
  ```
  for each member m with m.repairedIntoEntryId != null && m.repairTombstonedAt == null:
      if (m.deletedAt !== null) { /* user-deleted long ago — LEAVE ALONE */ continue; }
      m.repairedFromDeletedAt = null      // it was live
      m.deletedAt = now; m.repairTombstonedAt = now; m.updatedAt = now; enqueue
  ```
- **`revertRepair()`** is exact and is a deliverable of the same release as the reconciler:
  ```
  revertRepair():
    for every legacy row with repairTombstonedAt != null:
        { deletedAt: repairedFromDeletedAt, repairedFromDeletedAt: null,
          repairTombstonedAt: null, repairedIntoEntryId: null, updatedAt: now }, enqueue
    for every legacy row with repairedIntoEntryId != null && repairTombstonedAt == null:
        { repairedIntoEntryId: null, updatedAt: now }, enqueue      // pass-A-only: unmark
    for every intakeEntries row with entrySource === "migration":
        { deletedAt: now, updatedAt: now }, enqueue
  ```
  It runs client-side **and** server-side, and it is **reachable from the Debug panel**, which renders from `db.table(...).orderBy(...)` directly (`debug-panel.tsx:421`) and depends on no entry read path.

#### Step 7 — ENQUEUE, by hand, inside the same transaction

The v22 lesson (`db.ts:583-606`): the repair must reach the server or a later pull overwrites it. Enqueue `("intakeEntries", entryId, "upsert")` and `("intakeRecords" | "eatingRecords" | "substanceRecords", memberId, "upsert")` — **`"upsert"` not `"delete"`**, because `op = "delete"` synthesises a `{id, deletedAt, updatedAt}` stub when the local row is gone (`sync-engine.ts:170-187`), which would fail `createInsertSchema` for `intakeEntries`' `notNull` columns. Coalesce exactly as the v22 hook does (`db.ts:591-592`).

#### Step 8 — TRANSACTION BOUNDARY: exactly one group

**One Dexie `rw` transaction per GROUP** over `[intakeEntries, intakeRecords, eatingRecords, substanceRecords, _syncQueue, _repairState]`. Batching means "N transactions per invocation", **never** "one transaction per N groups": Dexie does not abort a transaction whose operation error you catch, so a group that throws between step 5 and step 6 would leave the transaction committing a partial result.

#### Step 9 — Per-group `try`/`catch` INSIDE the loop, never around it

One malformed group is logged to `_errorLogs` and skipped. `_repairState` carries durable `converted` / `skipped` / `remaining` / `deduplicatedCount` / `deduplicatedMl` / `anchorCollisions` / `volumeDisagreements` / `waterCorrectedMl` / `waterUnknownCount` / `waterUnknownMl` / `waterClampedCount` / `presetCorrectedCount` / `retractedEntries` counters.

### 4.2a `deriveWaterMl` — the deterministic classifier and correction (Q1)

**The decision.** Historical rows whose water content is wrong are corrected, not preserved with a known falsehood. The correction is a **pure function of data already on the row plus a fixed table compiled into `packages/core`**. No AI. No clock. No `localStorage`. No network. No device state. Identical on every device and on the server, byte for byte.

`packages/core/src/water-derivation.ts`:

```ts
/** Bumped on ANY behavioural change to the rules, the tables or the
 *  vocabularies below. Stamped into provenance.waterMl.derivationVersion and
 *  used to order two folds of the same row (§4.2 step 5 rule 6). */
export const WATER_DERIVATION_VERSION = 1;

export type WaterVerdict = "unchanged" | "corrected" | "unknown";
export interface WaterResult {
  waterMl?: number;
  verdict: WaterVerdict;
  rule: string;
  derivationVersion: number;      // always WATER_DERIVATION_VERSION
  derivedFrom?: string;           // e.g. "v12:keyword-default" (§4.2b M5)
  clamped?: boolean;              // ethanol volume exceeded the water figure
}
export function deriveWaterMl(input: WaterInput): WaterResult;   // pure, total
```

**`WaterInput` carries the substance SET, not one substance.** A single legacy group can hold both a caffeine and an alcohol substance — `preset-tab.tsx`' `buildDrink` (`:262-271`) spreads `caffeineMg` and `abvPercent` into one `logDrink` call, so an Irish coffee or an espresso martini produces two substance rows in one group. A singular `substance?:` field would make the function's own input lossy: pass the caffeine row and a 200 ml espresso martini keeps 200 ml; pass the alcohol row and it gets 160 ml. Two implementations of a function this document calls pure and byte-identical would return different numbers for the same row, and P11's totality claim would be unverifiable because the input, not the rules, decided the outcome.

```ts
export interface WaterInput {
  hasEating: boolean;
  grams?: number;
  /** The live NON-food water IntakeRecord's `amount`. M6-authoritative. */
  drinkWaterAmount?: number;
  /** The `manual:food_water_content` row's `amount`, when present. */
  foodWaterAmount?: number;
  /** EVERY live substance in the closure. */
  substances: Array<{
    type: string;                    // "alcohol" | "caffeine" | …
    abvPercent?: number;
    volumeMl?: number;
    amountStandardDrinks?: number;
    description?: string;
    /** true iff this row was minted by the v12 keyword scan (§4.2b M5). */
    keywordDefaulted?: boolean;
  }>;
  sourceStrings: string[];
  notes: string[];
}
```

**Substance selection is normative: alcohol dominates caffeine.** `deriveWaterMl` reads `substances.find(s => s.type === "alcohol")` first and only considers a caffeine substance if there is none. The reason is arithmetic, not preference: ethanol is the only non-aqueous term any legacy substance contributes, so the alcohol row is the only one that can change the answer. If two alcohol substances exist in one closure — not observed, but not forbidden by anything — the first by `(timestamp, id)` wins and the collision is counted, matching the multi-water-row rule of step 5.

**Volume bindings are normative, and every rule names the field it reads.** The two volumes in a legacy group can disagree (§4.2b M6), so "a usable volume" is not a specification.

```
V_water   := input.drinkWaterAmount                       // what V1 actually counted as hydration
V_ethanol := alcohol.volumeMl ?? input.drinkWaterAmount   // the ABV's own denominator
```

`V_water` is the water figure every rule corrects **from**, which is what makes P3a monotone and P3b exact by construction; `V_ethanol` is the volume the ABV percentage was taken against, which is what makes the ethanol term physically meaningful. `servingVolumeMl` on the folded entry is `V_water` when it exists (step 5), so the two are consistent with M6's "the live water row's amount is authoritative for the serving volume".

#### The classifier — which rows are wrong or suspect

The defect is structural and therefore exactly identifiable: **V1's `logDrink` books `amount === volumeMl` by construction** (`drink-service.ts:105-121`, verified: `amount: volumeMl` on the derived water row), so for every migrated drink the glass and the hydration are the same number and `waterContentPercent` reads 100 %. The suspects are precisely the rows where `V_water` equals the serving volume and the true water content is known not to be 100 %. The classifier is the ordered rule list below; **every input lands on exactly one rule, and the rule id and derivation version are stamped into `provenance.waterMl`** so any past number can be explained years later.

#### The rules, in order

| # | Rule id | Condition | Result |
|---|---|---|---|
| C0 | `water:food-content-preserved` | `hasEating` — the water row is `manual:food_water_content`, an explicit estimate of a *food's* water content, not a serving volume | **`waterMl` unchanged** (`foodWaterAmount`), `verdict: "unchanged"`. Food water was never the bug. |
| C1 | `water:none` | `V_water` is undefined — **no live non-food water row in the closure**, whatever substance volumes exist | key **absent**, **no provenance** — never determined. Covers the orphaned v12 substance whose intake row the user deleted years ago (`db.ts:319-320` writes `volumeMl: 250` for a coffee substance, and nothing cascades a delete from the intake row). Adding 250 ml back would revive a drink the user removed and would violate P3a. |
| C2 | `water:preset-table` | a `sourceString` matches `preset:<id>` with `<id>` in the **shipped** `DEFAULT_LIQUID_PRESETS` table, **and** no alcohol substance in the closure carries a finite `abvPercent > 0` | `waterMl := V_water × waterContentPercent / 100`, `verdict: "corrected"` |
| C3 | `water:v1-explicit` | no ethanol figure is derivable from the closure, **and** a substance volume exists and differs from `V_water` by more than 1 ml — V1 already recorded something other than the glass, and nothing on the row determines a correction | **unchanged**, and the disagreement is counted in `_repairState.volumeDisagreements` |
| C4 | `water:ethanol-complement` | an alcohol substance with a finite `abvPercent > 0` and a usable `V_ethanol` | `ethanolMl := V_ethanol × abvPercent / 100`; `waterMl := max(0, V_water − ethanolMl)`, `verdict: "corrected"` |
| C5 | `water:ethanol-from-std-drinks` | an alcohol substance with `amountStandardDrinks > 0` and no `abvPercent` | `ethanolMl := sd × 10 / 0.789`; `waterMl := max(0, V_water − ethanolMl)`, `verdict: "corrected"` |
| C6 | `water:undecidable-alcohol` | **no** derivable ethanol figure, **and** the token test below passes, **and** no suppressor fires, **and** a corroborator is present | key **absent**, `provenance.waterMl` stamped ⇒ **determined-unknown**, `verdict: "unknown"` |
| C7 | `water:aqueous-assumed` | anything else with a `V_water`: plain water, juice, soft drinks, coffee, tea, unidentified beverages, and every alcohol-suspect row that failed C6's evidence test | **unchanged** (i.e. 100 % of `V_water`) |

**Where the numbers come from — all of them already in the repo, none invented here:**

- `DEFAULT_LIQUID_PRESETS` (`apps/web/src/lib/constants.ts:126-137`, verified) already carries a `waterContentPercent` per preset: espresso 98, double espresso 98, moka 98, coffee 99, tea 99, **beer 93, wine 87, spirit 60**. C2 reads it.
- `ALCOHOL_KEYWORDS` and `CAFFEINE_KEYWORDS` (`apps/web/src/lib/db.ts:289-290`, verified: `['beer','wine','whiskey','whisky','vodka','gin','rum','cocktail','spirit','alcohol','brandy']` and `['coffee','espresso','tea','caffeine','matcha','latte','cappuccino']`) are the existing deterministic category vocabulary. C6 reads the alcohol list, under the restrictions below.
- `ETHANOL_DENSITY_G_PER_ML = 0.789` and `GRAMS_PER_STANDARD_DRINK = 10` (`packages/core/src/alcohol-units.ts:7`, `:11`).

**These tables move into `packages/core` verbatim as `WATER_DERIVATION_TABLE`,** because the correction must run identically on the server, which has neither `apps/web/src/lib/constants.ts` nor localStorage. **Normative: `deriveWaterMl` never reads a user-created preset.** A user preset's `waterContentPercent` lives in unsynced localStorage (`settings-store.ts:93`), so using it would make the server and the client disagree — the single thing the Q1 decision forbids. A `preset:<id>` whose id is not in the shipped table simply falls through to C3/C4/C5/C6/C7.

**C2 defers to the ethanol rules when the row carries an ABV, and here is why.** `updateLiquidPreset` maps over the whole preset array with **no `isDefault` guard** (`settings-store.ts:447-452`, verified), so a user can edit `default-spirit`'s `waterContentPercent` or `alcoholPer100ml` while it keeps the shipped id. Rows logged against that edited preset would then be "corrected" with the shipped 60 % the user never logged against. Ordering C2 *after* the ABV test removes the common case — a row that carries its own `abvPercent` is corrected from that number, which is per-row evidence rather than a table lookup. The residual is stated rather than hidden: for a row logged against a user-edited **default** preset that carries no ABV, C2 applies the shipped percentage, and the error is bounded by however far the user moved the number. It is counted (`_repairState.presetCorrectedCount`) and it is the same class of bounded, stated error as C7's ±2 %.

**Why the ethanol-complement rule (C4) is the right deterministic rule, and not a guess.** It is arithmetic — the volume occupied by ethanol is not water — and it **reproduces the repo's own shipped figures**: 40 % spirit → 60 % water (the table says 60, exactly); 12 % wine → 88 % (table: 87); 5 % beer → 95 % (table: 93). The residual 1-2 pp is dissolved extract, which C2 captures whenever the row identifies a shipped preset and which is below the rounding already present in the corpus.

**Why C4/C5 subtract from `V_water` rather than replacing it.** When the two owners of the volume disagree (M6: `water.amount = 500`, `substance.volumeMl = 330`), replacing the water figure with `V_ethanol − ethanolMl` would produce 290 ml of water against a 500 ml serving — a 58 % water content stamped on wine, a 209.6 ml drop of which only 39.6 ml is ethanol, and a violation of P3b. Subtracting the ethanol term from what V1 actually counted keeps P3a and P3b exact, and preserves the part of V1's figure that was a real measurement. If `ethanolMl > V_water` the result clamps to 0, the row is stamped `clamped` and counted in `_repairState.waterClampedCount`; P3b is asserted over the unclamped cohort.

**Why coffee and tea are left alone (C7).** The shipped table puts them at 98-99 % water. Rewriting five years of coffee to shave 1-2 % is churn with no clinical meaning, and marking it *unknown* would delete real hydration. The error is **bounded and stated**: for any C7 row, `|true − stored| ≤ 0.02 × V_water`, evidenced by the app's own table. Rows that *do* identify a coffee preset are corrected by C2 anyway, so the bound applies only to un-presetted beverages.

**Why C6 exists, and the three restrictions that stop it deleting real hydration.** A water row noted "whiskey" with an alcohol substance carrying no usable numbers is *known not to be* ~100 % water and *not determinable* — the ABV is nowhere on the row. Per the decision, it is marked **unknown**: the key leaves the map and the provenance entry stays, so §3 renders "≥ X (n of m known)" honestly instead of quietly counting 40 ml of spirit as 40 ml of hydration. This is the only class whose day total moves down *without* a replacement number, so it is the one rule that must not fire on weak evidence. A substring test over `ALCOHOL_KEYWORDS` is exactly that: `beverage-tab.tsx:65-68` writes the user-typed drink name straight into the water row's `source` as `beverage:<name>` and `drink-service.ts:113-114` writes it into `note`, so a 330 ml **"Alcohol-Free Beer"** — a case `preset-tab.tsx:115` explicitly names as supported — contains both `beer` and `alcohol`, and "Ginger Beer", "Root Beer", "Ginger Ale" and "Virgin Mojito" (`gin` ⊂ `ginger`, `gin` ⊂ `virgin`) and "Mocktail" (`cocktail` ⊂ `mocktail`) all match. Deleting their millilitres is guessing from a substring, and the decision forbids guessing. So C6 requires all three of:

1. **Whole-token match.** The text (`notes` ∪ `sourceStrings`, minus the `preset:`/`beverage:`/`substance:` prefix) is lowercased and split on non-alphanumeric characters; a keyword matches only as a complete token. `ginger`, `virgin` and `mocktail` therefore match nothing. `includes` is never used.
2. **No negative evidence.** A suppressor list, checked against the normalised text before tokenisation: `alcohol free`, `alcohol-free`, `non alcoholic`, `non-alcoholic`, `nonalcoholic`, `no alcohol`, `0%`, `0.0%`, `virgin`, `mock`, `mocktail`, `ginger beer`, `root beer`, `ginger ale`, `dandelion and burdock`. Any hit suppresses C6 outright and the row falls through to C7.
3. **Corroborating structure.** At least one of: (a) a `sourceString` of the form `preset:<id>` naming a shipped **alcohol** preset (`default-beer`, `default-wine`, `default-spirit`); or (b) a substance of `type: "alcohol"` present in the closure whose numbers are unusable (no finite positive `abvPercent`, no `amountStandardDrinks`). A keyword in free text, on its own, is never sufficient.

**If the evidence test fails, the verdict is C7 — unchanged.** Leaving a known upper bound in place is strictly better than deleting a measurement on a keyword hit, and it is the same argument C7 already makes for coffee. The false-positive vocabulary above is part of the P10 golden corpus, with an expected verdict of `unchanged` for every entry in it.

**Suppressors and tokenisation are versioned data.** Changing either changes the classifier's behaviour and therefore requires a `WATER_DERIVATION_VERSION` bump, which under §4.2 step 5 rule 6 is what allows a re-derivation to overwrite an earlier one — and which, per R2's gate below, requires an explicit re-run of pass A rather than being picked up ad hoc by whichever client folds next.

#### What this does to history, stated plainly

Hydration totals **fall** for alcohol with usable numbers and for shipped-preset drinks, and **do not move** for water, food, coffee, tea, unidentified beverages and every alcohol-suspect row that failed C6's evidence test. Every V1 hydration figure was an upper bound; V2's is the derived truth, with an audit trail per row. The user-visible one-time notice states the aggregate: *"Historical hydration was reduced by N ml because the volume occupied by alcohol is no longer counted as water. M drinks could not be determined and are now marked unknown."*

The reciprocal effect is that `waterContentPercent` becomes meaningful for history — a migrated neat spirit reads 60 %, not 100 % — and makes the `water_ml <= serving_volume_ml` relation a real constraint on the historical corpus instead of one satisfied by equality on exactly the rows it exists to protect.

### 4.2b Misfiled rows are corrected, not carried across

The decision record's *"if the data is in the wrong place then correcting that should be in order"*. These are the misfiling classes the investigation found, each with its deterministic correction. Every correction stamps a `rule` id.

**Stated up front, because the word "relocate" invites the wrong implementation: none of M1-M9 moves a row between tables.** M1 and M2 change the `kind` of the *folded entry*; M3 moves a measurement basis from a source string into provenance on the same entry; M4 makes an already-live row visible; M5 stamps provenance; M6 chooses between two numbers; M7 de-duplicates; M8 and M9 are unrecoverable and are represented as such. The two-pass mark-then-tombstone design is therefore never exposed to a cross-table double-count from a moved row, and pass B's per-member liveness rule (step 6) is unaffected.

| # | Misfiling | Evidence | Correction |
|---|---|---|---|
| **M1** | **A drink filed as a meal.** One dictated latte parsed as a `caffeine` item **and** a `food` item; the food half carries an `eatingRecord` plus a `manual:food_water_content` intake for something that is a beverage. | `voice-reconcile.ts:3-27`; report-3 §2.2 | The folded entry becomes `kind: "drink"` **only when** the group's eating record has **no `grams`** AND a live substance in the same group has `volumeMl > 0`. Then `servingVolumeMl := substance.volumeMl`, and the food-water row's amount is treated as `drinkWaterAmount` (so §4.2a's C2/C4/C5 apply instead of C0). Otherwise the entry stays `food`. Conservative by construction: a real meal always fails one of the two conditions. `rule:"kind:drink-from-fluid-food"` |
| **M2** | **A volume-less substance filed as a drink.** A caffeine tablet (`voice-panel.tsx:317-321`, verified — `addSubstance` with `amountMg` and no volume, `source: "standalone"`, no `groupId`) and pre-#323 preset alcohol substances written with no `volumeMl` (`preset-tab.tsx:238-249`). A `hasSubstance ? "drink" : …` rule would file both as drinks with a null serving volume. | verified | The `kind` rule in step 5 uses `hasFluid`, not `hasSubstance`: a caffeine substance with no fluid becomes **`kind: "supplement"`**; an alcohol substance with standard drinks but no volume stays **`"drink"`** with `servingVolumeMl: null` (it *was* a drink; only its size is unknown). `rule:"kind:supplement-no-fluid"` |
| **M3** | **A measurement basis filed in a source string.** `manual:salt` means "the user typed table-salt grams, back-divide by 0.39 on edit" (`parseSodiumKindFromSource`, `composable-entry-service.ts:620`, consumed at `food-section.tsx:186-191`). The basis is data living in a free-text column. | verified | The value stays in `sodiumMg` — it *is* elemental sodium — and the **basis moves into `provenance.sodiumMg.basis`** with V1's own factor snapshotted (0.39 / 0.12, per-mg input), so the inverse display reproduces exactly what the user typed with no 2.5 %-class drift. `rule:"basis:from-source-string"` |
| **M4** | **Orphaned solute rows.** A drink group with no substance (a salt- or sugar-only preset, `preset-tab.tsx:117-126`; a beverage-tab water+sugar entry, `beverage-tab.tsx:71-79`) falls through `classifyLiquidDelete` to `scope:"record"`, so deleting its water leaves a live sugar row that still counts and that no surface can reach. Test `composable-entry-service.test.ts:960` documents the behaviour. | verified | The closure still finds them by `groupId`. They fold into **one named entry** carrying the sugar (and no water, since the water row is tombstoned — §4.2a C1). **No total changes** — the sugar was already counted — but it becomes visible, editable and deletable for the first time. `rule:"orphan:solute-only"` |
| **M5** | **Keyword-guessed substances filed as measurements.** The v12 upgrade scans `intakeRecords.note` for keywords and mints substances with **table defaults**, not measurements (`db.ts:302-352`, verified: `DEFAULT_CAFFEINE_MG`, `DEFAULT_CAFFEINE_VOLUME_ML`, `DEFAULT_ALCOHOL_DRINKS` at `:292-300`), never enqueued, never grouped. | verified | Folded via R-link (which the v22 backfill never covered), and every value they contribute is stamped `provenance[k] = {origin:"migration", rule:"v12:keyword-default"}` — so a later surface can show "estimated from the word 'latte'" rather than presenting a guess as a measurement. **The provenance travels into the derived water figure too:** when `deriveWaterMl` reaches C5 through an `amountStandardDrinks` that is `DEFAULT_ALCOHOL_DRINKS` rather than a user figure, the result carries `derivedFrom: "v12:keyword-default"` alongside `rule: "water:ethanol-from-std-drinks"`. Without it the audit trail presents a keyword guess as arithmetic, and the rule id is Residual #9's only defence. |
| **M6** | **Two owners of one volume, disagreeing.** `updateSubstanceRecord` pushes `volumeMl → water.amount` (`substance-service.ts:230-250`); `syncLiquidEntrySubstances` pushes `amount → volumeMl` **only if the substance already had one** (`composable-entry-service.ts:709-711`), so a substance minted without a volume never acquires one. A group can hold `water.amount = 500` and `substance.volumeMl = 330`. | verified | **The live water row's `amount` is authoritative for `servingVolumeMl` and is `V_water`** — it is the number every V1 total actually read, so conservation is preserved — while `substance.volumeMl` is `V_ethanol`, the ABV's own denominator. §4.2a subtracts the ethanol term from `V_water`, which is what keeps P3b exact under the disagreement. The disagreement is counted in `_repairState.volumeDisagreements`; if the result violates `alcoholG <= 0.789 × servingVolumeMl` it is clamped by §2.8 with `rule:"alcohol:clamped-to-serving"`. |
| **M7** | **Two live water rows in one group** — pre-v22 and hand-built groups, the #322 residue. | step 5 | First by `(timestamp, id)` wins; the rest are **counted, never summed** (`deduplicatedMl`). |
| **M8** | **Potassium silently dropped on every backup import** (`backup-schemas.ts:43` validates `z.union([water, salt, sugar])` with no `"potassium"`; `importHealthTable` counts it as skipped, `backup-service.ts:596-598`). | verified | **Not recoverable — the data was never written.** Fixed forward as R0 item 1 so the corpus this migration reads stops losing rows; historical losses are stated, not invented. |
| **M9** | **Nutrients discarded at write time when a tracker was off** (`food-section.tsx:272-277`, `voice-panel.tsx:228-242`). | verified | Nothing to correct; the value was never persisted. The three-state model represents it correctly: no provenance key ⇒ **not applicable**, so it never enters §3's denominator and never renders as a missing measurement. §7.4 stops the ongoing loss. |

### 4.3 Testable properties

- **P1.** `repair(repair(D)) = repair(D)` — idempotent **and safe under concurrent invocation**.
- **P2.** For any two devices holding any subset-consistent view of the same logical groups **and running the same `WATER_DERIVATION_VERSION`**, `repair` produces byte-identical `intakeEntries` rows except for `updatedAt`/`deviceId`. The unequal-row-set case is required. Across unequal derivation versions the property is not asserted; §4.2 step 5 rule 6 is what makes the outcome deterministic there instead.
- **P2a.** `anchorId` agrees across a hook-run and a hook-skipped device for the same legacy pair.
- **P2b.** *Server-invisible member.* Seed intake `I` on the server only and substance `S` (linked by `sourceRecordId`) on the client only; run both folds; after a full sync assert **exactly one** live entry and its water booked once — with step 0 enabled (rule 1 path) and disabled (rule 0 path).
- **P3 — hydration accounting.** Conservation is not the property; it was the property only while the migration was forbidden to correct anything. Four properties replace it:
  - **P3a (monotone).** No row's `waterMl` increases. For every row, `after <= before`, and a row with no live water row before has none after (C1).
  - **P3b (bounded, per rule).** For a C4/C5 row that did not clamp, `before − after = ethanolMl` exactly, where `before = V_water` and `ethanolMl` is the rule's own term. For a C2 row, `before − after = V_water × (1 − waterContentPercent/100)` exactly, using the shipped table.
  - **P3c (accounted).** `Σ(before) − Σ(after) = _repairState.waterCorrectedMl + _repairState.waterUnknownMl + _repairState.deduplicatedMl`, asserted to the millilitre. Every millilitre that leaves the corpus is attributable to a named rule.
  - **P3d (untouched cohorts).** For every C0, C3 and C7 row, `after === before`, bit-for-bit.
- **P4.** No entry is created for a group whose members are all already tombstoned.
- **P5.** No V1 row is hard-deleted, ever.
- **P6.** After pass B, no **live** legacy row shares an anchor with an existing entry.
- **P7 — alcohol, SPLIT.** A single `Σ amountStandardDrinks === Σ alcoholG/10` is unsatisfiable by construction, because the fold prefers unrounded `ethanolGrams(abv, vol)` while V1 persisted `parseFloat(standardDrinksFromAbv(...).toFixed(2))` (`drink-service.ts:49`, `:196-201`).
  - **P7a — exact equality over the FALLBACK cohort** (rows lacking a finite positive `abvPercent` or `volumeMl`, including every v12-migrated alcohol row): `Σ amountStandardDrinks === Σ alcoholG / 10`, exactly.
  - **P7b — bounded drift over the RECOMPUTED cohort:** `|Σ stored − Σ alcoholG/10| <= 0.005 × n_recomputed`.
  - Seed corpus must contain a volume-less row, an abv-less row, and normal rows.
- **P8 — `revert(repair(D)) = D` modulo `updatedAt`, over a corpus that INCLUDES members the user deleted before the migration.**
- **P9.** The fold never emits a non-finite number anywhere — map values, `timestamp`, `lastOccurrenceAt`, occurrence `at` — over a fuzz corpus of legacy rows with arbitrary undefined/NaN fields. The alcohol arm is asserted independently of P7.
- **P10 — determinism of the Q1 derivation.** `deriveWaterMl` is invoked from a golden corpus of ~200 hand-built legacy rows covering every rule; the expected output is a committed snapshot. The corpus must include, as named cases: **"Alcohol-Free Beer", "Ginger Beer", "Root Beer", "Ginger Ale", "Virgin Mojito", "Mocktail", "0.0% Lager"** (all expected `unchanged`), a **two-substance espresso-martini row** (caffeine + alcohol in one group, expected to land on C4 via the alcohol substance), an **M6 disagreement row** (`water.amount = 500`, `substance.volumeMl = 330`, 12 % ABV, expected `waterMl = 460.4`), a row logged against a **user-edited default preset**, and an **orphaned v12 substance with no live water row** (expected C1, key absent). The **same test file runs in the client and the server test projects against the same `packages/core` module**, and a lint assertion confirms the module imports nothing outside `packages/core` and references neither `Date`, `Math.random`, `localStorage` nor `globalThis`.
- **P11 — total classification.** Every input in the golden corpus lands on **exactly one** rule id; the rule-id set is a closed union; a test asserts no input yields a rule id outside it and none yields two. The two-substance row is part of this assertion, so that a lossy input shape would fail the property rather than silently pick a branch.
- **P12 — components never sum.** A golden entry with a two-level component tree totals exactly its root map (§2.4 R1-map).
- **P13 — canonical map round trip.** §2.3 N-4's Dexie → push → jsonb → pull → Dexie hash-stability property over an `fc.double` corpus.
- **P14 — supplement emission (Q4).** Four sequences, all asserted across two simulated devices:
  - take → untake → take → `editDoseTime` → reschedule: exactly one entry id, exactly one live occurrence at the final time, the day total counted once, and a soft-deleted entry after the retract;
  - **CONCURRENT emission:** device A and device B both take the *same* dose slot without an intervening sync (the state `getDoseLogRaw` makes reachable); after sync, assert **exactly one live occurrence** and exactly one nutrient contribution;
  - **flag off / untake / flag on / re-take:** clear `isSupplement` after a dose was emitted, untake the dose, assert the entry is retracted and the day total drops; re-enable the flag, re-take, assert exactly one live occurrence and no doubling;
  - reschedule onto an already-taken slot: assert the target slot's entry is retracted when its log is reset to `pending`.
- **P15 — legacy delete after conversion.** Convert a group in pass A; delete both legacy rows through a V1 write path; run the post-pull reconciler with a complete closure; assert the entry is retracted (zero live occurrences, `deletedAt` set) and that the day's totals drop by exactly the entry's contribution. Assert also that a device holding an **incomplete** closure does not retract.
- **P16 — legacy edit after conversion.** Convert a group; change the water row's `amount` 500 → 250 through a V1 write path; re-fold with a complete closure; assert the entry's `waterMl` follows *down* and its `provenance.waterMl.derivationVersion` is unchanged. With an incomplete closure, assert the value is left alone.

### 4.4 The dual-write / dual-read window

**There is no dual-write window and no dual-read window on the client. Both are refused deliberately.** A window in which both a V2 entry and its live V1 rows are *read* doubles every total instantly and degrades every correlation non-linearly. Dual-write recreates the two-owners problem.

**What pass A creates is not a dual-read window**: after pass A, legacy rows are live **and** entries exist, but **exactly one of the two is ever read by a user-facing surface at any point** — legacy up to and including R3a, entries from R3b onward. §5.8's MCP union is the single, explicitly de-duplicated exception, and it is exact because it keys on `legacy_member_ids`.

**The legacy corpus keeps changing during R3a, and the fold is what tracks it.** Because the V1 write paths remain live until R3b, the user will delete and edit legacy rows for weeks after pass A has converted them. Step 5's rules 3 and 4 are what make those edits and deletes reach the entry: the echoed rows come back on the next pull, seed (ii) re-folds the group, a complete closure re-derives or retracts. Without that arm, a drink deleted in the V1 History screen on 2026-09-15 would reappear at the R3b cut-over, and R3a's own gate — "every non-water nutrient divergence is zero" — would be unsatisfiable after the first legacy delete.

**A V1 client still running against the same account** is the real hazard, and for this app it is the *default* for at least one launch after deploy (an installed PWA with a precached shell, `apps/web/public/sw.js`):

1. Its totals are unaffected while only pass A has run, and drop to zero for converted rows once pass B runs — which is why pass B is gated on every device being on v23.
2. **An edit from a V1 client to a row pass B has tombstoned is acked-and-discarded, then clobbered on the next pull.** `push/route.ts` Rule 1 (documented at `:22-26`, implemented at `:212-222`) acks with **no write**, unconditional on `updatedAt`; `ack()` removes the op from `_syncQueue`; the chained pull `bulkPut`s the server tombstone over the local row. **The user sees a successful save and loses it silently, with nothing left to retry.**
3. Its history renders empty (post-pass-B) until it updates.

**Mitigation, and it is a decision:** the forced service-worker update check (`skipWaiting` + a version gate that reloads a stale client) is an **R0 deliverable**, deployed and confirmed working before pass B. Combined with the `clientSchemaVersion` heartbeat (§5.2), pass B's gate is evidence-based rather than time-based.

### 4.5 How double-counting is prevented during the transition

| Hazard | Prevention |
|---|---|
| V2 entry + live V1 rows on one device | Only one of the two is ever read (§4.4). Same-transaction, one-group boundary (step 8). |
| V2 entry + live V1 rows pulled from server | Post-pull pass seeded by the exact pulled ids (step 1 ii). Idempotent by primary-key get; mandatory re-mark (step 4). |
| Two devices converting the same group | Step 0 pre-pass makes `groupId` a pushed, deterministic anchor ⇒ rule 1 everywhere; rule 0 adopts a published anchor regardless of member set. P2, P2a, P2b. |
| Devices in different v22-hook states | Anchor rule 2 equals `substanceId`, which is what the hook stamps as `groupId` (`db.ts:628-632`). |
| A member row one side has never seen | Rule 0 + step 0. P2b. |
| A device holding a partial member set | Pass gated on `_repairState.lastCompletePullAt`; with an **incomplete** closure the fold is add-only and may not retract (step 5 rule 5). P2. |
| **A legacy row DELETED through the V1 UI after pass A converted it** | Step 5 rule 4: a complete closure with zero live members retracts the entry's occurrences. Without it the deleted drink reappears at R3b. **P15.** |
| **A legacy row EDITED through the V1 UI after pass A converted it** | Step 5 rule 3: with a complete closure, `migration`-origin keys are re-derived in either direction. **P16.** |
| **Two devices re-folding one group with different derivation versions** | Step 5 rule 6: an older module never overwrites a newer module's value; equal versions are pure and agree. |
| A group with two live water rows | First-by-`(timestamp, id)` wins, remainder **counted** and reported. P3c. |
| Legacy rows unreachable by `groupId` | S-link and R-link closure — the latter is the v12 linkage the v22 hook never covered. |
| Entry lands but its members' marks do not | `legacyMemberIds` on the entry is the load-bearing exclusion key for the MCP union (§5.8); `intakeEntries` is first in `TABLE_PUSH_ORDER`. |
| Backup restore reintroducing V1 rows | `importBackup` must enqueue what it imports and seed the pass with those ids (§5.7). |
| Read path accidentally still summing V1 | At R3b the V1 read functions are deleted, not deprecated. |
| MCP reading an empty `intake_entries` | Union with legacy rows, de-duplicated on `legacy_member_ids`, gated by a **query-time `EXISTS`** predicate (§5.8). |
| **A supplement dose counted twice** | The emitted entry's id **is** the dose log's id and its single occurrence id is `${doseLog.id}:dose` (§2.10), so every emit — including a concurrent one from two devices — is an upsert on one primary key with one occurrence; a hand-logged duplicate triggers the §2.4 R6.2 warning. |
| Two entries for one physical drink | Not structural — §2.4 R1′/R6. |

### 4.6 What happens to the legacy tables

- **v23:** all 21 existing stores repeated verbatim + `intakeEntries` + `_repairState` = **23 tables**. Nothing dropped. The three legacy stores remain in the schema, in `records.ts`, in Drizzle, in parity — each gaining three fields.
- **v24 / R6: the three legacy stores are EMPTIED, never DROPPED**, because `importBackup` references them as direct properties: `db.intakeRecords.clear()` (`backup-service.ts:477`) in replace mode and `importHealthTable(data.intakeRecords || [], …, db.intakeRecords, result)` (`:522`). Once dropped, `db.intakeRecords` is `undefined`: replace mode throws inside the `Promise.all` of clears before a single row is written, merge mode throws on `bulkPut`. Both land in the outer catch, so the **whole** restore fails — the user also loses weight, blood-pressure, prescription and dose data from that file. `validateBackupData` (`:350-380`) checks only `typeof version === "number"`, so nothing warns them.
- **Test:** restore a **real v5 fixture** against the v24 schema and assert every table's import count, including the three legacy ones and the entries the reconciler derives from them.
- Dropping a table would also require editing `schema-consistency.test.ts:31-52`, which deliberately fails when a version omits a predecessor's table.

### 4.7 Fresh install

A device that creates the database at v23 has no legacy rows and needs no conversion. If it *also* pulls legacy rows (because some device has not yet pushed its repairs and pass A has not yet run), the post-pull pass converts them to the same deterministic anchors. **This is the specific failure the v22 hook documented and could not solve** (`db.ts:586-591`).

### 4.8 Ordering vs the Drizzle migration — non-negotiable

**Deploy order is: (1) server schema, (2) client. Never the reverse.** If reversed, a v23 client pushes `tableName: "intakeEntries"` at a server whose `tableNameSchema` does not know it: the op fails `opSchema_.safeParse` per-op, `push/route.ts:119-138` returns it with **`code: "invalid"`**, and `sync-engine.ts:331` drops any `code: "invalid"` op on the **first** cycle. **Data is gone after one push cycle.** `vercel-build` is `db:migrate && next build`, so this ordering is achieved by shipping the schema/sync-payload PR as its own deployment. It is a PR-splitting requirement; nothing in the pipeline enforces it.

**This ordering argument does NOT extend to registry changes, and §2.3 N-6 does not rely on it.** A nutrient registry entry lives in `packages/core`, which one build compiles into both the client bundle and the push route; there is no PR to split, the relationship that holds is deploy atomicity, and a rollback inverts it. That is exactly why the push route accepts well-formed unknown nutrient keys and reports them out of band instead of rejecting them onto the drop-on-cycle-1 path (N-6). The one normative rule that remains is the rollback rule stated there: a deploy that removes or deprecates a registry key must not be rolled back while an older bundle can still be live.

**Journal handling — the footgun is inert, and hand-editing is FORBIDDEN.** `HANDWRITTEN_CUTOFF = 1780800000000` (2026-06-07) at `drizzle-journal.test.ts:85`; the current date is past it, so the "no future-dated `when`" assertion is **live**. The journal's last two entries are real generated values — `0018_lazy_jackal` = `1781797699476`, `0019_uneven_ben_urich` = `1783948231861` — both above every hand-edited entry, so `drizzle-kit generate` emits a strictly-increasing `when` on its own. **Run `pnpm --filter @intake/db db:generate`, commit the SQL + snapshot + journal verbatim, do not touch `_journal.json`.**

**Rebase rule, because three R0/R1 PRs will now collide** (R0's `userProfile` columns, R1's `intake_entries`, and Q4's `prescriptions` columns). Renaming a migration without regenerating leaves its snapshot diffed against the wrong parent, and `drizzle-journal.test.ts` checks contiguous `idx`, file existence and monotonic `when` — **it will not catch a broken snapshot chain.** Normative: **after rebasing, delete the generated SQL, the snapshot and the journal entry, then re-run `db:generate` against the rebased parent.**

**New columns are all nullable or defaulted.** `name` and `nameKey` are `text NOT NULL` with no default, guaranteed non-blank by `writeEntry` (§2.8). `nutrients` is `jsonb NOT NULL DEFAULT '{}'::jsonb`. `prescriptions.is_supplement` and `supplement_profile` are **nullable** (§2.10). CHECKs are added `NOT VALID` then `VALIDATE`d (`0019_uneven_ben_urich.sql` precedent); on a brand-new table they can be inline.

---

## 5. SERVER + SYNC CHANGES

### 5.1 Drizzle

New table `intake_entries` in `packages/db/src/schema.ts`. The exported const **must be named `intakeEntries`**, matching the Dexie table name exactly (`schema-parity.test.ts:34-38`, `:118-127`).

```ts
export const intakeEntries = pgTable(
  "intake_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    // identity
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    kind: text("kind").notNull(),
    note: text("note"),
    originalInputText: text("original_input_text"),
    // occurrences (§2.1 Call 4) — the sole owner of "how many" and "when"
    occurrences: jsonb("occurrences").$type<EntryOccurrenceJson[]>().notNull(),
    // derived projections, materialised for indexing only
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    lastOccurrenceAt: bigint("last_occurrence_at", { mode: "number" }).notNull(),
    // serving (NOT nutrients — see §2.3)
    servingVolumeMl: doublePrecision("serving_volume_ml"),
    servingMassG: doublePrecision("serving_mass_g"),
    // ── THE NUTRIENT MAP: registry keys → finite numbers >= 0, known only ──
    nutrients: jsonb("nutrients").$type<Record<string, number>>()
      .notNull().default(sql`'{}'::jsonb`),
    // structure & provenance
    components: jsonb("components").$type<EntryComponentJson[]>(),
    provenance: jsonb("provenance").$type<Record<string, FieldProvenanceJson>>(),
    entrySource: text("entry_source").notNull(),
    sourceDoseLogId: text("source_dose_log_id"),
    legacySourceId: text("legacy_source_id"),
    legacyMemberIds: jsonb("legacy_member_ids").$type<string[]>(),
    // sync scaffold
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
    // SERVER-OWNED, client has no field for it (§5.2). The pull cursor key
    // for this table only. Advanced on every server-side change to the row,
    // INCLUDING an occurrence union applied in the LWW-losing branch.
    syncSeq: bigint("sync_seq", { mode: "number" }).notNull(),
  },
  (t) => ({
    kindCheck: check("intake_entries_kind_check",
      sql`${t.kind} IN ('drink','food','supplement','other')`),
    entrySourceCheck: check("intake_entries_entry_source_check",
      sql`${t.entrySource} IN ('quick_add','manual','preset','voice','ai_text','import','migration','dose')`),
    nameKeyNonEmpty: check("intake_entries_name_key_nonempty", sql`${t.nameKey} <> ''`),

    // ── OPEN-SET nutrient constraints (§2.3.5). These three cover every
    //    nutrient that exists today AND every nutrient added later, with no
    //    migration — the property per-column CHECKs could not have.
    nutrientsObject: check("intake_entries_nutrients_object",
      sql`jsonb_typeof(${t.nutrients}) = 'object'`),
    nutrientsNumeric: check("intake_entries_nutrients_numeric",
      sql`NOT jsonb_path_exists(${t.nutrients}, '$.* ? (@.type() <> "number")')`),
    nutrientsNonNegative: check("intake_entries_nutrients_nonneg",
      sql`NOT jsonb_path_exists(${t.nutrients}, '$.* ? (@ < 0)')`),

    // Counts LIVE occurrences, not array length. A tombstoned-occurrence array
    // is legal ONLY on a soft-deleted entry — the derived deletedAt rule of
    // §2.5, expressed in SQL.
    occurrencesCheck: check("intake_entries_occurrences_live",
      sql`jsonb_array_length(${t.occurrences}) >= 1
          AND ( ${t.deletedAt} IS NOT NULL
                OR jsonb_array_length(
                     jsonb_path_query_array(${t.occurrences}, '$[*] ? (@.removedAt == null)')
                   ) >= 1 )`),

    // Relational invariants, generated from NutrientDef.relations (§2.4 R5).
    // MIRRORS of writeEntry's mint-time enforcement — never the sole gate.
    // Written as JSONPATH PREDICATES, not as `->> ... ::double precision`
    // comparisons: a non-numeric value that ever slipped past
    // `nutrients_numeric` (CHECK evaluation order is unspecified, so it can)
    // would make a cast raise SQLSTATE 22P02 — invalid input syntax — rather
    // than 23514. Both land on the no-`code` retry-then-drop path of §2.8 and
    // `extractDbError` surfaces them differently. A jsonpath predicate
    // degrades to FALSE on a type mismatch instead of raising.
    waterVolumeCheck: check("intake_entries_water_le_volume",
      sql`${t.servingVolumeMl} IS NULL
          OR NOT jsonb_path_exists(${t.nutrients},
                   '$.waterMl ? (@ > $v)', jsonb_build_object('v', ${t.servingVolumeMl}))`),
    alcoholVolumeCheck: check("intake_entries_alcohol_le_volume",
      sql`${t.servingVolumeMl} IS NULL
          OR NOT jsonb_path_exists(${t.nutrients},
                   '$.alcoholG ? (@ > $v)',
                   jsonb_build_object('v', 0.789 * ${t.servingVolumeMl}))`),
    sugarCarbCheck: check("intake_entries_sugar_le_carb",
      sql`NOT jsonb_path_exists(${t.nutrients},
                '$ ? (exists(@.sugarG) && exists(@.carbohydrateG) && @.sugarG > @.carbohydrateG)')`),
    // …fibre ≤ carb, addedSugar ≤ sugar, satFat ≤ fat: same shape, emitted from
    // the registry so a new relation ships with the NutrientDef that declares it.

    userSeqIdx: index("idx_entries_user_seq").on(t.userId, t.syncSeq, t.id),
    userUpdatedIdx: index("idx_entries_user_updated").on(t.userId, t.updatedAt),
    userTimestampIdx: index("idx_entries_user_ts").on(t.userId, t.timestamp),
    userLastOccIdx: index("idx_entries_user_last_occ").on(t.userId, t.lastOccurrenceAt),
    doseLogIdx: index("idx_entries_dose_log").on(t.sourceDoseLogId),
    legacyMembersIdx: index("idx_entries_legacy_members").using("gin", t.legacyMemberIds),
  }),
);
```

**`idx_entries_user_last_occ` is the index that serves §3's R-L span-overlap prune**; `idx_entries_user_ts` serves cursor paging and the `timestamp` ordering, not the prune (`timestamp < W.end` is non-selective for a window ending at now). Together they also fix the fact that `eating_records` has **no** timestamp index at all today (`queryEatingHistory`, `mcp/queries.ts:349-377`, range-scans unindexed). `idx_entries_legacy_members` is the GIN index the §5.8 union predicate needs. **No index on any nutrient**, for the reason given in §2.3.5(b): no index assists a `SUM`. `idx_entries_dose_log` serves §2.10's emit/retract lookup — which is a lookup by `sourceDoseLogId`, never by a recomputed occurrence id.

**No `CHECK` on nutrient upper bounds, and no `CHECK` that `writeEntry` is not obliged to satisfy first** (§2.8). Ranges belong in the AI-response validators and the push Zod schema, not in a constraint that rejects a legitimately unusual meal and then drops the row after 8 silent retries.

**`prescriptions` gains two nullable columns** (§2.10), mirroring the `compounds` precedent at `schema.ts:307`:

```ts
    isSupplement: boolean("is_supplement"),
    supplementProfile: jsonb("supplement_profile").$type<SupplementProfileJson>(),
```

**No `timezone` column is added to `prescriptions`** — the schema's own note at `:309` records why, and the emitted entry takes its timezone from `dose_logs.timezone` (`:517-518`).

**Three legacy tables** each gain `repairedIntoEntryId`, `repairedFromDeletedAt`, `repairTombstonedAt`, all nullable. Index only `repaired_into_entry_id` (partial, `WHERE repaired_into_entry_id IS NOT NULL`).

**`user_profile` gains four columns** (§5.6): `day_start_hour integer`, `home_timezone text`, `alcohol_display_unit text`, `nutrient_prefs jsonb`.

### 5.2 Sync payload, the one non-LWW table, and the cursor column

Four list edits in `packages/db/src/sync-payload.ts` (pattern at `:44-97`, verified): `intakeEntriesRowSchema = createInsertSchema(schema.intakeEntries).omit({ userId: true, syncSeq: true })`; a discriminated-union arm keyed `"intakeEntries"`; an entry in `schemaByTableName` (the declared source of truth per `sync-payload.property.test.ts:437-438`); and the `tableNameSchema` enum.

The jsonb columns need explicit zod shapes rather than drizzle-zod's default opaque type: `entryOccurrenceSchema`, `entryComponentSchema` (recursive, `z.lazy`, **max depth 2, max 30 children per level**), `fieldProvenanceSchema`, `z.array(z.string()).max(200)` for `legacyMemberIds`, and:

```ts
// SHAPE-checked, key set OPEN — on the wire AND in the route (§2.3 N-5, N-6).
// A well-formed key the server's registry does not know is ACCEPTED and
// STORED, and reported through the unknown-key counter. It is never rejected:
// `code: "invalid"` is dropped from the queue on push cycle 1
// (sync-engine.ts:330-344), which would lose the whole row, not just the key.
export const nutrientMapSchema = z
  .record(z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/), z.number().finite().nonnegative())
  .refine((m) => Object.keys(m).length <= 128, "too many nutrient keys");
```

**The push Zod schema mirrors every relational invariant** — the registry's `relations` (evaluated only over keys the server's registry knows, so an unknown key is never a constraint's subject), `>= min`, `nameKey !== ""`, `Number.isFinite` on every number including both occurrence projections, canonical occurrence order, and `deletedAt != null ⟺ zero live occurrences` — as `.superRefine`s generated from the registry. A violation returns `code: "invalid"` and is surfaced and dropped **loudly on attempt 1** instead of failing a DB CHECK and being abandoned silently after 8.

**The unknown-key report.** After validation, the route diffs each row's nutrient keys against the server registry and increments a per-user, per-key counter (a small `unknown_nutrient_keys` table or a structured log line — either is sufficient, neither gates the write). It is an observability signal for the typo class of Residual #8, not a gate.

**`prescriptions`' row schema picks up the two new columns automatically** — `createInsertSchema` derives them — except for `supplementProfile`, whose jsonb needs an explicit `supplementProfileSchema` extension (nutrient map + `basisAmount` + `basisUnit` + `displayName`).

#### `syncSeq` — a server-owned pull cursor for this table only

An occurrence union "in the losing branch too", with nothing said about `updated_at`, is **undeliverable**. Pull is a keyset cursor on `(updated_at, id)` (`pull/route.ts:94-106`):

```ts
.where(and(…, or(gt(table.updatedAt, cursorUpdatedAt),
                 and(eq(table.updatedAt, cursorUpdatedAt), gt(table.id, cursorId)))))
.orderBy(asc(table.updatedAt), asc(table.id)).limit(PULL_SOFT_CAP + 1)
```

Phone taps `+1` at 10:00, pushes, server row `updated_at = 10:00`. Tablet was offline and tapped `+1` at 09:50; it reconnects and its op hits the skip branch (`push/route.ts:275-278`). A union applied there makes the server set `{o1,o2,o3}` but leaves `updated_at` at 10:00 — no device ever re-fetches it, both show 2 and the truth is 3, with no error. Bumping `updated_at` instead corrupts scalar LWW (R-12).

**Decision: a dedicated, server-owned cursor column.**

- `intake_entries.sync_seq bigint NOT NULL`. **Server-owned: NOT a field on `IntakeEntry`, `omit`ted from the push row schema, added to `DRIZZLE_ONLY_EXEMPTIONS` alongside `userId` (`schema-parity.test.ts:32`), and stripped by `verify-hash` exactly as `userId` already is (`verify-hash/route.ts:58-59`, verified).**
- **Push assigns it** on every server-side change: `sync_seq := GREATEST(serverNow, COALESCE(serverRow.sync_seq, 0) + 1)`. That includes the **LWW-losing branch when — and only when — the occurrence union actually changed the stored set**. `updated_at` is untouched there, so scalar LWW is exactly as documented.
- **Pull for `intakeEntries` keys on `(sync_seq, id)`**, served by `idx_entries_user_seq`. `_syncMeta` stores the `syncSeq` cursor for this table. The existing 30 s skew clamp (`SKEW_MARGIN_MS`, `sync-engine.ts:58`) applies unchanged and is still required, because `push/route.ts` has no transaction.
- **Property test at the ENGINE level, three devices, one loser.** Assert all three converge on **three** live occurrences.

#### `clientSchemaVersion` heartbeat

Every push body gains an optional `clientSchemaVersion: number`; the route records `{userId, deviceId, clientSchemaVersion, lastSeenAt}` in a small `device_heartbeats` table. This is what makes pass B's gate (§6 R3c) evidence rather than a guess. Additive; a v22 client simply omits the field.

#### The per-table merge

**`intakeEntries` is the one table whose merge is not whole-row LWW.** Both sides gain a per-table branch:

- **Push (`push/route.ts`), in the winning branch, the losing branch, AND the Rule-1 branch:**
  ```
  atRule := (serverRow.sourceDoseLogId ?? incoming.sourceDoseLogId) != null
              ? "rowLww" : "min"
  merged := unionOccurrences(serverRow.occurrences, incoming.occurrences, {
              atRule,
              // rowLww needs the two rows' (updatedAt, deviceId) to order them
              left:  { updatedAt: serverRow.updatedAt, deviceId: serverRow.deviceId },
              right: { updatedAt: incoming.updatedAt,  deviceId: incoming.deviceId },
            })
            // union by id; per-id LWW on removedAt by the same ordering;
            // `at` by atRule; emit canonical order (at asc, id asc)
  { timestamp, lastOccurrenceAt, deletedAt } := projectOccurrences(merged)
  assert Number.isFinite(timestamp) && Number.isFinite(lastOccurrenceAt)
  ```
  Every other column follows the existing LWW rules unchanged. `sync_seq` is bumped iff `merged ≠ serverRow.occurrences`. The `atRule` selection is the §2.1 Call 4 exception, and it is identical on the client's pull-side merge, so the two sides cannot disagree.
- **Push Rule 1 is named and decided.** `push/route.ts:212-222` short-circuits **before any merge** and **unconditionally on `updatedAt`**: a live incoming row against a server tombstone is acked with no write. This is reachable through ordinary V2 use, because removing the last live occurrence soft-deletes the entry:
  > "Ice lolly", one occurrence. Phone removes it at 20:00 → tombstoned. Tablet (offline since 19:00) taps `+1` twice → three live occurrences, `updatedAt: 20:30`. Tablet reconnects: Rule 1 fires regardless of 20:30, the op is acked with **no write**, `ack()` removes it, and the chained pull applies the server tombstone. The user ate three lollies; every device shows the entry gone.

  **Decision: for `intakeEntries` only, the Rule-1 branch unions occurrences and re-evaluates `deletedAt` from the merged set.** A live incoming row carrying occurrence ids the server tombstone lacks **revives** the entry; an incoming row carrying no new ids leaves the tombstone standing, exactly as Rule 1 intends. Coherent rather than exceptional: with `deletedAt` derived, "resurrect a tombstone" is a question about a join-semilattice, not about scalar LWW. Rule 1 is unchanged for all 18 other tables. **This is also what makes §2.10's retract-then-retake work**: a re-taken dose writes the same occurrence id with `removedAt: null` and a newer `updatedAt`, per-id LWW clears the removal, and the projection clears `deletedAt`.
- **Pull (`sync-engine.ts:539-546`):** for `intakeEntries` only, replace the blanket `bulkPut` with a read-merge-put that unions occurrences (same `atRule` selection) and re-projects against the local row. Every other column stays server-authoritative.

`unionOccurrences` and `projectOccurrences` live in `packages/core/src/occurrences.ts`, are called by both sides, and carry commutativity / associativity / idempotence property tests **for both `atRule` values** plus an explicit empty-live-set test asserting the soft-deleted projection and the absence of `±Infinity`.

### 5.3 Backup / export format versioning

Specified in §5.7, together with the restore-path changes it depends on.

### 5.4 Push order

Add `"intakeEntries"` to `TABLE_PUSH_ORDER` (`sync-topology.ts:28-55`) **FIRST — ahead of every other table.**

Converting a group enqueues one entry upsert plus one mark per member; a 200-group batch enqueues 400-1 400 ops against `PUSH_BATCH_CAP = 50`, so a split across batches is guaranteed. `collectAndOrderQueuedOps` (`sync-engine.ts:137-160`) FIFO-slices 50 ops and *then* regroups by `TABLE_PUSH_ORDER`, in which `intakeRecords` sits at index 8 and `substanceRecords` at 9. With `intakeEntries` first, the residual half-applied state is always "entry present, legacy rows live but unmarked" — and **§5.8's union is exact in that state anyway**.

**Add a topology test** asserting `idx(intakeEntries) < idx(intakeRecords | eatingRecords | substanceRecords)`. Add nothing to `sync-topology.test.ts`'s `fkPairs` (`:44-58`) — that list is hardcoded and not derived. Update the file's header comment, which says "the 18 Dexie/Neon data tables".

**The topology test must ASSERT insertion order rather than assume it.** §5.4's guarantee rests on an unstated premise: conversion enqueues the entry and its members inside one transaction with a single `now`, and `collectAndOrderQueuedOps` slices by `orderBy("enqueuedAt").limit(50)`, so intra-batch order for tied `enqueuedAt` depends on Dexie's secondary ordering by the `++id` primary key. The test seeds one conversion transaction and asserts the entry op precedes its member ops.

### 5.5 Pull

Beyond the occurrence merge and the `syncSeq` cursor (§5.2), no change to `pull/route.ts` other than it picking up the new key from `schemaByTableName` automatically. Precedent that a table can be one-way: `auditLogs` is filtered out of pull at `pull/route.ts:71`. `intakeEntries` is **two-way**.

### 5.6 `userProfile` gains the day boundary, the display unit and the nutrient preferences — plus the backfill that makes them reach the existing corpus

`dayStartHour: number | null`, `homeTimezone: string | null`, **`alcoholDisplayUnit: string | null`** (§2.11) and **`nutrientPrefs: {pinned: string[]; pinDefaultsApplied: string[]; limits: Record<string, {target: number; buffer: number}>} | null`** (§2.3.6, §8) are added to `UserProfile` (`records.ts:408-418`) and `user_profile`.

**Why the pin list and the limits are mirrored and not left in localStorage.** They are presentation decisions that must be consistent across devices, which is the same reason `dayStartHour` and `alcoholDisplayUnit` are mirrored. Left local-only, a user who pins `magnesiumMg` on their phone opens the tablet and the dashboard omits it, and §10 Q-A's "1 other limit exceeded" affordance counts differently on each device. One jsonb column carries both, so the cost is one column rather than one per preference.

A mirror writer on its own reaches nobody. `getUserProfile()` returns `emptyProfile()` with `id: ""` when no row exists (`profile-service.ts:31-43`, `:67-75`), and a row is only minted on the first explicit save; the profile is a medical-conditions form most users never open. `dayStartHour` today lives only in localStorage (`settings-store.ts:66`). So an existing Europe/Berlin user who set `dayStartHour = 4` a year ago writes no profile row, MCP finds nothing, falls back to 2, and computes it with `setHours` in the Vercel process's UTC zone.

**Deliverables, all three, for all four fields:**

1. **One-time backfill.** On first boot after R0, if no active `userProfile` row exists **or** any of the four is null, write the current localStorage values (`dayStartHour`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `alcoholDisplayUnit`, the pin list and limits) into the profile (minting the row if needed) and **enqueue it**. Guarded by `_repairState.profileBackfilledAt`.
2. **Mirror writers.** `setDayStartHour`, `setAlcoholDisplayUnit`, `setPinnedNutrients` and the limits setters write localStorage **and** the profile row (localStorage stays the offline-fast read; the profile row is the synced truth and wins on conflict).
3. **One read-side fallback order, identical on both sides.** Day boundary: `profile.dayStartHour` → localStorage → `DEFAULT_DAY_START_HOUR` (2). Display unit: `profile.alcoholDisplayUnit` → localStorage → `"metric_standard"`. Pins: `profile.nutrientPrefs.pinned` → localStorage → registry `defaultPinned`, with §2.3.6's top-up applied after whichever source wins. `date-utils.getDayStartTimestamp` and `mcp/queries.ts:45-59` both implement exactly that order. MCP has no localStorage, so its middle term is the profile row itself once it lands, and `push_settings.day_start_hour` until then; `mcp/queries.ts` computes the boundary in `homeTimezone`, not the server process zone. `push_settings.day_start_hour` stops being the day-boundary source; the `/api/push/settings` writer that hardcodes `2` (`route.ts:23-28`) is no longer authoritative.

### 5.7 Backup / restore

`CURRENT_BACKUP_VERSION` (`backup-service.ts:95`) goes **5 → 6**, and — for the first time — the number must actually be *read*. Today `validateBackupData` (`:350-380`) checks only `typeof backup.version === "number"`.

1. `BackupData` gains `intakeEntries?: IntakeEntry[]` (`:38-61`). `table-sync.test.ts:25-27` parses this interface with `/export interface BackupData\s*\{([^}]+)\}/s` — `[^}]+` means **a nested object type inside `BackupData` breaks the parse**. Keep the new key a plain array reference.
2. `backup-schemas.ts`: an `intakeEntrySchema` (`.passthrough()`, per the file's convention at `:15`), plus entries in `BackupTableName` (`:166-184`), `BACKUP_SCHEMAS` (`:186-205`) and `BACKUP_VALIDATORS` (`:213-232`). **`.passthrough()` is what makes the nutrient map future-proof across backup versions**: a file written by a newer registry restores its unknown keys untouched (§2.3 N-5), and the prescriptions schema likewise carries `supplementProfile` without a per-nutrient edit.
3. **One upcast mechanism.** A `version <= 5` file imports its legacy rows into the (retained, empty) legacy stores unchanged; the reconciler is then seeded with the ids just written (§4.2 step 1 iii). No import-time fold exists; there is one fold, in one place. This is only safe *because* §4.6 commits to never dropping the three stores — the two decisions are a pair.
4. **`importBackup` must enqueue.** It calls `table.bulkPut(toImport)` directly (`:420`, `:607`) with zero `_syncQueue` hits, so a restore never reaches the server — and, because pull `bulkPut`s unconditionally, the next pull can overwrite the restored rows. Replicate the v22 hook's hand-rolled enqueue.
5. **Route `intakeEntries` through `mergeTableWithConflicts` (`:386-423`), not `importHealthTable`.** The latter is skip-on-id-collision with no conflict detection (`:587-610`), and with deterministic anchor ids — and with `id === doseLog.id` for emitted entries — a collision is now *likely*. Union occurrences rather than picking a winner.
6. **Fix the pre-existing `potassium` bug in the same PR.** `backup-schemas.ts:43` validates `z.union([water, salt, sugar])` with no `"potassium"`, so every potassium record in every backup is silently dropped on import (`result.skipped++`, `backup-service.ts:596-598`). Nothing tests it. It will otherwise corrupt the V1 corpus we are about to migrate (§4.2b M8). **Independently shippable today** — R0.
7. **CSV/PDF export gains a format version**, records the alcohol display unit in use (§2.11), and the PDF "Recent Records" lexicographic date sort is fixed in the same pass.
8. **Test:** restore a real v5 fixture against the v24 schema (§4.6).

### 5.8 MCP transition — the external contract

`intake_entries` is empty on the server until pass A runs, and MCP is consumed by claude.ai over OAuth. **MCP must NOT be cut over in the same release as the client.** If it is, `get_today_summary` sums an empty table and answers `water_ml: 0` while the phone shows 1 750 ml.

**The union predicate, and why it is exact.** For each legacy table, the legacy arm selects:

```sql
WHERE user_id = $1
  AND deleted_at IS NULL
  AND repaired_into_entry_id IS NULL
  AND NOT EXISTS (
        SELECT 1 FROM intake_entries e
        WHERE e.user_id = $1
          AND e.deleted_at IS NULL
          AND e.legacy_member_ids @> to_jsonb(ARRAY[legacy.id]) )
```

The third clause is the load-bearing one. Relying on `repaired_into_entry_id` alone contradicts §5.4's decision to push `intakeEntries` **first**: a batch can carry the entry upsert while the member marks sit in a later batch, and during a 30 k-op drain that window is minutes to hours. The `legacy_member_ids` clause closes it because **the entry carries its own membership as data**. Served by `idx_entries_legacy_members` (GIN). **Prove it against a half-drained push batch, not a quiesced one.**

**The convergence signal is a query-time predicate, not a latched timestamp.** A `v2ConvergedAt` marker's clearing condition can never fire — Rule 1 makes a tombstone unresurrectable — so it would latch on the first clean pass and MCP would drop its legacy arm permanently, while a stale V1 device pushing a **new** row inserts it live with `repaired_into_entry_id` NULL. So the legacy arm is included **whenever, at query time,**

```sql
EXISTS (SELECT 1 FROM intake_records WHERE user_id=$1 AND deleted_at IS NULL
          AND repaired_into_entry_id IS NULL)
   OR EXISTS (… eating_records …) OR EXISTS (… substance_records …)
```

is true — three index-assisted existence checks per call. **Nothing needs to clear a marker, so `push/route.ts` needs no per-op hook on the three legacy tables.**

**Nutrient projection in the union.** The legacy arm can only produce the four V1 nutrients (`water/salt/sugar/potassium` + the two substance types); the entries arm produces the whole registry. The union therefore emits the registry-keyed shape with the legacy arm contributing keys it can and omitting the rest — which is the same three-state semantics MCP consumers see permanently, so no special case is needed after the window closes.

**Tool contracts.**
- `query_intake_history.type` (`tools.ts:147-149`) is a client-visible Zod enum. During the window it keeps accepting `water|salt|sugar|potassium` and maps them onto registry keys; it gains the registry's keys **additively**. Because the enum is generated from the registry, a nutrient added later widens the tool contract with no code change — which is itself worth documenting for consumers, since an OAuth tool's input enum growing between calls is otherwise surprising. A key that is `deprecated` stays in the enum and resolves forward (N-7).
- **Alcohol returns `{grams, display:{value,unit}}`** (§2.11), never a bare display number.
- `query_substance_history` is **retained**, reading the union, and deprecated in its description rather than deleted.
- **Q4 disclosure, mandatory:** `list_recent_doses` and `get_today_summary`/`query_intake_history` now overlap for supplement-flagged prescriptions. Both tool descriptions must state that a supplement dose appears in **both** and must not be added twice, and must name `sourceDoseLogId` as the join key. Without it a model asked "how much magnesium did I take today" can plausibly double it.
- `docs/mcp-connector.md` documents the window, the additive enums, the alcohol shape and the dose/intake overlap.

**Stale-client safety of the markers:** `sanitizeRow` iterates **the parsed row's own keys** (`push/route.ts:66-72`, verified) and `createInsertSchema` strips unknown keys without materialising absent optional ones — so a v22 client's whole-row upsert of an `intakeRecords` row does **not** null out a `repaired_into_entry_id` it knows nothing about.

### 5.9 Parity-test implications

Everything below fails the build until updated. **Note what is absent from this table: any per-nutrient row.** Under §2.3 the nutrient set is invisible to every list below, which is the structural statement of Q3's requirement.

| File | Change |
|---|---|
| `apps/web/src/__tests__/dexie-schema-extractor.ts:45-64` | `TABLE_TO_INTERFACE`: add `intakeEntries: "IntakeEntry"`. **Throws a hard error if omitted** (`:128-133`). |
| `apps/web/src/__tests__/schema-parity.test.ts:32` | `DRIZZLE_ONLY_EXEMPTIONS` gains `"syncSeq"`. Keep it a compile-time constant with no env escape hatch. |
| `apps/web/src/__tests__/schema-parity.test.ts:51-52` | `toHaveLength(18)` → `19`; add `intakeEntries` to the name list at `:55-75`. |
| — | **`prescriptions` needs no parity edit beyond the two fields being added on both sides in the same PR**; `userProfile` likewise for its four. |
| `apps/web/src/lib/sync-payload.property.test.ts:51-70`, `:458` | `KNOWN_TABLES` + `toHaveLength(18)` → `19`. |
| `apps/web/src/__tests__/sync-topology.test.ts:24-27` | 18/18 → 19/19; **plus the ordering and insertion-order assertions** (§5.4). |
| `apps/web/src/__tests__/integrity/schema-consistency.test.ts:17`, `:26` | versions `toHaveLength(13)` → `14`, version list gains `23`; `latest.tables` `21` → `23`. |
| `apps/web/src/__tests__/migration/dexie-v16.test.ts:249-259` | expected table-name array + `toHaveLength(21)` → `23`. |
| `apps/web/src/__tests__/integrity/table-sync.test.ts:71-90` | `TABLE_TO_FIXTURE` gains `intakeEntries`; add `_repairState` to `NON_BACKUP_TABLES` (`:94`). |
| `apps/web/src/__tests__/fixtures/db-fixtures.ts` | `makeIntakeEntry()`, `makeSupplementPrescription()`. |
| `apps/web/src/__tests__/fixtures/scenarios.ts:57-58, 89-90` | optional seeding hooks. |
| `apps/web/src/app/api/sync/verify-hash/route.ts:59` + `migration-service.ts:36-48` | strip `syncSeq` alongside `userId`; assert canonical occurrence array order **and** §2.3 N-4's map canonicalisation on both sides. |
| `apps/web/scripts/verify-schema.ts:32` | `EXPECTED_TABLE_COUNT = 31` → `32` (CI job at `.github/workflows/ci.yml:339`). |
| `apps/web/scripts/reset-neon-db.ts` | `TABLES` list. |
| **new** `packages/core/src/__tests__/nutrient-registry.test.ts` | every key matches N-1's pattern; every key is unique; **no key begins with `_` and no key equals a reserved provenance slot (N-8)**; `basis` non-empty; `relations` reference existing keys; no `deprecated` key lacks `supersededBy`; `supersededBy` chains are acyclic and resolve in ≤ 4 hops; **N-7's collision cases — an explicit both-keys row asserting one contribution, and a property test over randomly-seeded both-key rows**; the AI schema builder emits exactly the core keys as `required`. |

**Two hazards specific to writing the interface**, both from `dexie-schema-extractor.ts`:
- Declare `IntakeEntry` as an `interface` with **no `extends`**. The walker reads only own `node.members` (`:105-116`, verified).
- Keep `IntakeEntry`, `EntryComponent`, `EntryOccurrence`, `FieldProvenance`, `MeasurementBasisRef` and `SupplementProfile` all in `packages/types/src/records.ts`. The extractor does a single-file `ts.createSourceFile` parse (`:90-98`) with no module resolution — which is also why `NutrientKey` is **not** in that file (§2.2).

Also note the `parse-schema.ts` regex constraints on `db.ts` (`:44`, `:101`): the version receiver must literally be `realDb`, and **no store-map value may contain a `}`**.

**`PREVIEW_STORES` is a live landmine, not a stale comment.** It is `{...V15_STORES, _syncQueue, _syncMeta, _errorLogs, userProfile, insightReports}` (`db.ts:705-712`) and is stamped with `DB_SCHEMA_VERSION` (`db.ts:726`, `:657` — `= 22`). Bumping the constant to 23 without adding `intakeEntries` and `_repairState` declares a v23 preview database whose store set is v22's — every preview component touching `db.intakeEntries` throws. The doc comment at `:701` also still says "(v19)". **Fix the content, fix the comment, and add the missing guard**: a test asserting `PREVIEW_STORES` equals the latest version's stores, and a test asserting `DB_SCHEMA_VERSION` equals the highest `realDb.version(N)`. Neither exists today.

### 5.10 Other server-side lists that must be updated (none has a drift guard)

- `apps/web/src/app/api/sync/cleanup/route.ts:10-27` — `DELETION_ORDER`. **Already drifted**: missing `userProfile` and `insightReports`. Fix while adding `intakeEntries`. **Independently shippable today.**
- `apps/web/src/lib/user-data-deletion.ts:42-61` — `SYNCED_DELETION_ORDER`.
- `apps/web/src/lib/data-deletion-service.ts:21` — derives from `TABLE_PUSH_ORDER` so it picks `intakeEntries` up for free, but its `createdAt` filter is wrong for this table (§3).
- `apps/web/src/lib/mcp/queries.ts` + `tools.ts` — §5.8.

---

## 6. RELEASE SEQUENCE

Each step names its contents, its **hard precondition**, and its gate. Two properties are structural: the server conversion is split (pass A before the client, pass B after), and R3 is split so the read cut-over and the UI rewrite are separable.

### R0 — Independently shippable now, before anything else

1. **`backup-schemas.ts:43` potassium** — silent data loss on every restore, right now, and it will corrupt the V1 corpus this migration reads (§4.2b M8). Ship first.
2. **`DELETION_ORDER` drift** (`cleanup/route.ts:10-27`).
3. **`sanitizeForAI`'s unconditional 500-char truncation** (`packages/core/src/security.ts:73-77`) against voice-parse's 2 000-char cap. Parameterise the cap.
4. **Extract `findToolUse`** into `api/ai/_shared/` (currently five verbatim copies).
5. **Day-boundary, display-unit and nutrient-preference unification** (§3, §5.6) — the four `userProfile` columns, the **one-time backfill**, the mirror writers, the single fallback order in `date-utils` and `mcp/queries.ts`. Independent of `intake_entries`, so it ships on its own with its own migration.
6. **Forced service-worker update check** (§4.4) + the `clientSchemaVersion` push heartbeat (§5.2). Must be deployed and confirmed working before pass B.
7. **PDF "Recent Records" date sort** (`export-service.ts`) — lexicographic on `"MMM d, HH:mm"` today.
8. **`packages/core/src/nutrient-registry.ts` and `water-derivation.ts`, with their tests, ahead of every consumer.** Both are pure modules with no dependencies; landing them first means R1's schema, R2's fold and R5's AI schema all build against a registry that is already reviewed and property-tested (P10, P11).

**Gate:** existing e2e suites green; the profile backfill observed writing a row on a device that had never opened the profile form; P10/P11 green, including the false-positive vocabulary cases.

### R1 — Server schema and payload

`CREATE TABLE intake_entries` (with `sync_seq`, the open-set nutrient CHECKs and the GIN index); the three columns on each legacy table; the two on `prescriptions`; `sync-payload.ts` incl. `nutrientMapSchema`; `TABLE_PUSH_ORDER` with `intakeEntries` first; the occurrence-union merge in `push/route.ts` **including the Rule-1 branch and the `atRule` selection**; the `(sync_seq, id)` cursor in `pull/route.ts`; `device_heartbeats`; the unknown-nutrient-key counter. No client change ships in this deployment.

**Precondition:** R0 items 6 and 8 deployed.
**Gate:** a v22 client is unaffected; `POST /api/sync/push` accepts a hand-crafted `intakeEntries` op; **an op carrying a well-formed nutrient key the server registry does not know is ACCEPTED, STORED and counted** (§2.3 N-6), while one carrying a malformed key, a non-finite value or a relational violation is rejected with `code:"invalid"`; the three-device `syncSeq` delivery test passes for both `atRule` values; the immutability of every function used in a CHECK confirmed against `pg_proc` (§2.3.5).

### R2 — Server-side conversion, PASS A only (mark, do not tombstone)

`POST /api/sync/convert-v2?pass=a` plus `packages/core/src/legacy-fold.ts` (which calls `water-derivation.ts` from R0). Writes `intake_entries` (with `legacy_member_ids`), stamps `repaired_into_entry_id` on every member, **leaves `deleted_at` untouched**. Idempotent, resumable, re-invocable.

**Hard preconditions:** the server-side snapshot taken and hash-verified inside the job before the first write, with the restore procedure of §4.1 documented and rehearsed on a staging account.
**Gate:** dry-run reconciliation report reviewed (per-account counts, dedup totals, **the Q1 water-correction, water-clamped and water-unknown totals, and the C6 hit list read row by row**, any group the fold would skip, any anchor collision); after the real run, a server-side evaluation of P3a-P3d and P7a/P7b **on real data**; `SELECT count(*) … WHERE deleted_at IS NULL AND repaired_into_entry_id IS NULL` matches the expected straggler count.

**Normative, and it follows from the gate:** the classifier will be examined and may be tuned. **Any change to `water-derivation.ts` after pass A has run requires a `WATER_DERIVATION_VERSION` bump and an explicit re-run of pass A**, not an ad-hoc pickup by whichever client folds next. Step 5 rule 6 is what makes the interim state deterministic rather than oscillating, but it is not a substitute for re-running the pass.

**What the user sees during R2: nothing.** Every V1 read path keys on `deleted_at`, which pass A does not touch.

### R3a — Client: Dexie v23, the reconciler, entries as a SHADOW model

Dexie v23 + `_repairState`; `entry-service.ts`; `legacy-entry-repair.ts` (step 0 pre-pass, reconciler, `revertRepair()`); the pull-side occurrence merge and `syncSeq` cursor; `packages/core/src/{legacy-fold,occurrences,measurement-basis,component-units}.ts`; the debug panel's unknown-nutrient-key report (Residual #8).

**The V1 UI and every V1 read path remain the only rendered surface.** Legacy rows are still live, so they render exactly as before. `intakeEntries` is populated, synced and validated, and is read by **nothing user-facing** except a Debug-panel verification view.

**Gate — the strongest in the sequence:** a client-side **shadow reconciliation** over the last 90 days compares, per day and per nutrient, `TOTAL(k, day)` over entries against the V1 sums, reporting divergences into `_repairState` and the Debug panel. Q1 changes what "clean" means, so the assertion is stated precisely:

- **every water divergence is attributable to a stamped rule id** — C2, C4, C5 (a correction, reconciling to P3b) or C6 (an unknown), and to nothing else;
- **every non-water nutrient divergence is either zero, or attributable to a legacy row edited or deleted through the still-live V1 UI since pass A** — identified by the entry's re-fold record, not waved away. Step 5 rules 3 and 4 are what make that second class *converge* rather than accumulate; a divergence with no legacy change behind it is a failure of the gate.

Evaluated on a staging account with a five-year synthetic corpus and on the author's own account. Plus P1-P16 green; zero skipped groups; zero anchor collisions; `revertRepair()` round-trips.

### R3b — The read/write cut-over and the V2 UI

Deletion of every V1 read and write path in one PR (a deleted function cannot be called by a forgotten screen); the V2 dashboard, history and edit surfaces incl. the expandable line item and pinning (§2.3.6, §3); `optionalTrackers` demoted to a display filter; the settings limits registry; the alcohol display-unit control (§2.11); the supplement-profile editor (§2.10).

**Precondition:** R3a's shadow reconciliation clean (as stated) for at least one full week of live use.
**Gate:** the same shadow comparison, inverted — the last V1-computed totals recorded before the cut-over match the V2 totals rendered after it, modulo the accounted water correction.

### R3c — PASS B (tombstone the legacy corpus)

`POST /api/sync/convert-v2?pass=b`, plus lifting the client reconciler's "do not tombstone" flag.

**Hard precondition: the v23 client confirmed live on EVERY registered device**, evidenced by `device_heartbeats.clientSchemaVersion >= 23` for every device that has pushed in the last 90 days, with any older device either seen upgraded or explicitly retired by the user (see §10 Q-D). Until then, pass B does not run, and the cost of waiting is only that the MCP union keeps its (exact) legacy arm.

**Gate:** P6 evaluated server-side; day list and daily totals unchanged across the tombstoning, on every device.

### R4 — MCP cut-over

Only after the §5.8 `EXISTS` predicate reports no live unconverted legacy rows across a full pull cycle from every registered device. Until then MCP reads the de-duplicated union, exact from R2 onward. `docs/mcp-connector.md` updated in the same deployment.

**Gate:** `get_today_summary` returns identical numbers via the union path and the entries-only path for a sample of days, including one sampled **mid-push-drain**; the alcohol `{grams, display}` shape verified against both paths.

### R5 — AI endpoint replacement

`/api/ai/entry-parse` with the registry-derived tool schema; voice-parse's food/drink arms; retirement of `parse`, `substance-lookup`, `substance-enrich`. Independent of R4 and can precede it; kept separate from R3b so a prompt regression does not roll back the schema.

### R6 — Empty (never drop) the legacy tables

Gated on the §5.8 predicate reporting no live unconverted rows for a sustained period. The three Dexie stores and the three Postgres tables **remain declared and empty** (§4.6); only their rows go. The pre-v2 server snapshots are retained until this point and dropped with it.

### Rollback

**v23 is a one-way door at the device level. Once any device opens the Dexie v23 database, the V1 bundle is permanently unreachable on that device.** Dexie opens IndexedDB at `version × 10`, so a v23 device is at IDB 230; a redeployed v22 bundle calls `open(name, 220)`, which the specification answers with a `VersionError` and a rejected `db.open()`. `isDatabaseClosedError` / `recoverClosedDatabase` (`db.ts:665-698`) walk the `cause` chain for `DatabaseClosedError` **only**, so nothing catches it: the app fails to start — including the backup/export screen the user would need to rescue their data.

Consequently:

- **The single supported rollback is: keep the v23 client, and run `revertRepair()` client-side and server-side.** Rolling the *client* back is not a rollback and must never be attempted.
- **`revertRepair()` must be reachable from a surface that still renders when entry reads are broken.** That surface is the Debug panel (`debug-panel.tsx:421`), from R3a onward, behind a typed confirmation.
- **For a device whose database will not open, the pre-migration backup is the only recovery.**
- **The revert window closes the day R3b ships.** `revertRepair()` tombstones only entries with `entrySource === "migration"`; any V2-native entry created after the cut-over — including every emitted supplement entry — has no V1 representation and is destroyed by a revert. State this to the user before R3b, not after.

---

## 7. AI CONTRACT CHANGES

### 7.1 The endpoint

`POST /api/ai/parse` is replaced by `POST /api/ai/entry-parse`, returning a **root entry with children and a registry-shaped nutrient set**. `/api/ai/voice-parse` keeps its multi-item envelope but each item's food/drink payload becomes the same root-entry object. `/api/ai/substance-lookup` and `/api/ai/substance-enrich` are **retired** — their jobs (per-100 ml caffeine, ABV, water content) are subsumed by a root entry with `servingVolumeMl` + `waterMl` + `caffeineMg` + `alcoholG`.

**What happens to the preset model, since `substance-lookup` is its only writer.** `LiquidPreset.caffeinePer100ml` / `alcoholPer100ml` / `saltPer100ml` / `waterContentPercent` live in unsynced localStorage (`constants.ts:111-137`) and are the only per-unit nutrient basis that exists today. Under V2 they are **superseded, not migrated in place**: a preset becomes "a saved `IntakeEntry` template" — a per-unit nutrient map plus `servingVolumeMl`/`servingMassG`, stored as a soft-deleted `intakeEntries` row flagged `entrySource: "preset"` with zero occurrences, so it syncs, backs up and carries provenance like everything else. A one-time settings migration converts each existing `LiquidPreset` by multiplying its per-100 ml figures by `defaultVolumeMl / 100`. **Note the ordering constraint with §4.2a:** the *shipped* preset table is also the Q1 correction table, so it is copied into `packages/core` (R0 item 8) **before** the settings migration rewrites the localStorage presets — otherwise the migration's own output becomes the evidence for the correction, which would make the derivation depend on device state.

Model: `CLAUDE_MODELS.quality`, `temperature: 0`, `tools: [WEB_SEARCH_TOOL, ENTRY_PARSE_TOOL]`, `max_tokens: 8192` — raised from 4096 (`parse/route.ts:89`). Voice-parse must rise from its current **2048** (`voice-parse/route.ts:87`) for up to 20 items; cap components per item at 8 there.

Keep the existing skeleton verbatim: `withAuth` → IP rate limit → `parseJsonBody` → zod request → `getClaudeClientForUser` → `sanitizeForAI` → `messages.create` → `recordUsage` → `findToolUse` → **second turn with `tool_choice` forced and the prior assistant content replayed** → zod response. Preserve the comment about keeping `WEB_SEARCH_TOOL` declared on the forced turn.

### 7.2 The tool schema is GENERATED FROM THE REGISTRY

The `$defs/nutrients` block is **built**, never hand-written:

```ts
buildNutrientToolSchema(NUTRIENTS, { required: "core" })
// → { type:"object", additionalProperties:false,
//     properties: { water_ml: { type:["number","null"], description: <NutrientDef.basis> }, … },
//     required: [ …every core key… ] }
```

`snake_case(key)` on the wire, `camelCase` in storage, one mapping function. Deprecated registry keys are **omitted** from the generated schema — the model is never asked for a key that resolves forward. **`NutrientDef.basis` is the description string verbatim** — which is why §2.3.1 makes it mandatory and non-empty: the compositional basis is not decoration, it is the only thing standing between a US and an EU web-search result and a 10 g/day carbohydrate drift on identical foods.

```jsonc
{
  "name": "parse_intake_entry",
  "description": "Return ONE root consumption entry with its ingredient breakdown and full nutrition.",
  "input_schema": {
    "type": "object",
    "properties": {
      "name":        { "type": "string", "description": "Short user-facing title, e.g. 'Aperol Spritz'. Title case. No quantities in the name." },
      "kind":        { "type": "string", "enum": ["drink", "food", "supplement", "other"] },
      "unit_count":  { "type": "integer", "minimum": 1, "description": "How many identical units the description implies. '2 beers' -> 2. Default 1. The app records one occurrence per unit." },
      "serving_volume_ml": { "type": ["number", "null"],
        "description": "Physical liquid volume of ONE unit, in ml. The size of the glass. null for solids — including any solid food, however moist." },
      "serving_mass_g":    { "type": ["number", "null"],
        "description": "Mass of ONE unit, in grams. null if unknown." },
      "nutrients": { "$ref": "#/$defs/nutrients",
        "description": "Nutrition for ONE unit. Every CORE key is required — use null for UNKNOWN and 0 only when you know the value is zero, never omit one. Extended keys are optional: include one ONLY when you have a real basis for it." },
      "components": {
        "type": "array", "maxItems": 20,
        "description": "Ingredient breakdown for ONE unit of the root. Return [] when the item has no meaningful decomposition (a glass of water). Components EXPLAIN the root; the root's own nutrients remain the authoritative totals.",
        "items": { "$ref": "#/$defs/component" }
      },
      "confidence": { "type": "number", "description": "0..1 self-assessed confidence in the numeric estimates as a whole." },
      "field_confidence": { "type": "object", "additionalProperties": { "type": "number" },
        "description": "Optional per-nutrient confidence, 0..1, for any key you are markedly less sure about than `confidence`." },
      "sources": { "type": "array", "items": { "type": "string" }, "maxItems": 30,
        "description": "Every URL used via web_search. Empty array if you did not search." },
      "reasoning": { "type": "string", "description": "Brief explanation including sources consulted." }
    },
    "required": ["name", "kind", "unit_count", "serving_volume_ml", "serving_mass_g",
                 "nutrients", "components", "confidence", "sources", "reasoning"],
    "additionalProperties": false,
    "$defs": {
      "component": {
        "type": "object",
        "properties": {
          "id":       { "type": ["string", "null"],
            "description": "When re-analysing an entry whose existing components were given to you, echo each component's id VERBATIM so the app can merge rather than replace. Use null for a component you are introducing for the first time." },
          "name":     { "type": "string" },
          "unit":     { "type": "string",
            "enum": ["g","mg","ml","cl","l","piece","slice","shot","scoop","leaf","clove"],
            "description": "Unit of `amount`. Mass: g, mg. Volume: ml, cl, l. Count: piece, slice, shot, scoop, leaf, clove." },
          "amount":   { "type": ["number", "null"],
            "description": "How much of this component is present in ONE UNIT OF THE ROOT, in `unit`. Three slices of cheese in one cheeseburger is amount 3, unit 'slice' — or amount 60, unit 'g'. There is NO separate count field." },
          "nutrients":{ "$ref": "#/$defs/nutrients",
            "description": "This component's contribution to ONE UNIT OF THE ROOT — already the figure for `amount` of it. Nothing multiplies these by anything. If this component has sub-components, these values remain authoritative for it." },
          "components": { "type": "array", "maxItems": 8,
            "description": "Sub-components. Max ONE further level. Sub-components are never summed into anything.",
            "items": { "$ref": "#/$defs/componentLeaf" } }
        },
        "required": ["id", "name", "unit", "amount", "nutrients"],
        "additionalProperties": false
      },
      "componentLeaf": { /* as `component`, without `components` */ },
      "nutrients": "<<< generated by buildNutrientToolSchema(NUTRIENTS, {required:'core'}) >>>"
    }
  }
}
```

Sample of what the generator emits, so the pinned bases are on the record: `water_ml` — *"ml of WATER CONTENT in one unit — NOT the glass volume. A 200 ml spritz is ~180 ml water; a 40 ml neat spirit is ~24 ml; a 150 g apple is ~127 ml. Dissolved sugar and sodium do NOT reduce it. Must never exceed serving_volume_ml."*; `energy_kcal` — *"kcal, never kJ. INCLUDES energy from alcohol (7 kcal/g) and fibre (2 kcal/g)."*; `carbohydrate_g` — *"TOTAL carbohydrate, INCLUSIVE OF FIBRE (US convention). If your source uses the EU convention, ADD the fibre back."*; `sodium_mg` — *"ELEMENTAL sodium in mg, NOT NaCl. If a source reports salt in grams, sodium_mg = salt_g × 393.4."*; `alcohol_g` — *"GRAMS OF PURE ETHANOL in one unit = serving_volume_ml × (ABV% / 100) × 0.789. Never report ABV, standard drinks, units, or grams-per-100ml here."*; `vitamin_d_ug` — *"Cholecalciferol + ergocalciferol, µg (1 µg = 40 IU)."*

**On the component encoding.** A `quantity` + `unit` + `amount` triple is mutually redundant and renders ambiguously: "3 slices of cheese" is either `{quantity:3, unit:"slice", amount:3}` or `{quantity:3, unit:"g", amount:60}` (60 total or 20 each — nothing said which), and any consumer computing `quantity × nutrients` triples the component's sodium in the expanded view while the root shows the correct figure — the root/child contradiction §2.4 R3 claims is unreachable, arriving through the schema instead of through a sum. **`quantity` is deleted.**

**`unit` is enumerated and classified**, as data in `packages/core/src/component-units.ts`:

```ts
export const COMPONENT_UNITS = {
  g: {cls:"mass", toBaseG: 1}, mg: {cls:"mass", toBaseG: 0.001},
  ml: {cls:"volume", toBaseMl: 1}, cl: {cls:"volume", toBaseMl: 10}, l: {cls:"volume", toBaseMl: 1000},
  piece: {cls:"count"}, slice: {cls:"count"}, shot: {cls:"count"},
  scoop: {cls:"count"}, leaf: {cls:"count"}, clove: {cls:"count"},
} as const;
```

so component amounts within a class are summable and a recipe is scalable — and so §2.10 can decide whether a supplement dose sets `servingVolumeMl` or `servingMassG` from its `basisUnit`. **Σ of component volumes is NOT expected to equal the root's `servingVolumeMl`** and no invariant relates them (ice, dilution, garnishes, evaporation). The only rule is advisory — `writeEntry` warns when Σ volume-class amounts exceeds `1.5 × servingVolumeMl`.

### 7.3 The seven contract rules that make this safe

**AI-1 — Every CORE nutrient key is REQUIRED and NULLABLE; extended keys are optional and returned only with a basis.** The core set makes the three-state distinction survive the model and makes an AI-authored entry *applicable* for every core nutrient in §3's denominator. A missing core key would be indistinguishable from "unknown"; forcing an explicit `null` makes the model decide, and lets `0` mean a real zero. **An extended key the model omits stamps nothing, so the entry is honestly *not applicable* for it** rather than falsely "unknown" — which is what keeps `≥ X (n of m known)` meaningful as the registry grows. Mirrors `PARSE_RESULT_TOOL`'s `["number","null"]` idiom (`packages/ai-prompts/src/parse.ts:61-95`). **The tier is a prompt-economy decision only** (§2.7): promoting a nutrient from extended to core is a one-word registry change with no storage consequence whatsoever.

**AI-2 — Root nutrients are authoritative; components never sum into anything, at any depth.** Stated for **both** levels. The **server-side reconciler is the enforcement**, because a prompt is an instruction, not a guarantee: `rollupComponents()` fills a root nutrient from `Σ depth-1 components` only where the root key is absent and every depth-1 component has it (§2.4 R4). A discrepancy between a composite child's own value and Σ of its sub-components is **displayed, never repaired**.

**AI-3 — Per-unit only, and the count is separate.** `serving_*` and `nutrients` describe **one** unit; `unit_count` says how many, and the client materialises one occurrence per unit. This is what V1's `parse` endpoint could not express.

**AI-4 — Search provenance is verified, not trusted.** Keep and generalise `hasCompletedWebSearch` (`substance-lookup/route.ts:45-52`), which inspects raw content blocks for a non-empty `web_search_tool_result` and hard-refuses with 422 `SEARCH_REQUIRED` when absent. Apply the gate when the request asks for a **branded or packaged** item; exempt generic whole foods and ABV. `sources` copies the deployed pattern from `analytics-insights.ts:194-195, 216-221`.

**AI-5 — Per-item resilience, and a depth cap.** Keep `extractVoiceItems`' per-item validation (`voice-parse/schema.ts:105-136`): a bad component is dropped and counted, not fatal. Extend it to components. Cap recursion at **2 levels** with an explicit `items` schema at each level and 20/8 breadth in the zod schema, because Anthropic tool schemas cannot enforce recursion limits.

**AI-6 — Component identity survives a re-run, or the merge is refused.** On re-enrichment the client sends the stored components (id + name + unit); the model echoes each `id` verbatim for a component it is updating and returns `null` for one it is introducing. Server-side: every echoed id must exist in the sent set or it is treated as `null`. Client-side: matching is **by id only** — never by name. A stored component the model does not echo is deleted **unless** it carries any `provenance[*].origin === "user"` — and §2.6 names the writer that makes that true.

**AI-7 — Relational invariants are repaired at the API boundary.** The response zod runs the same registry-derived repairs `writeEntry` runs (§2.8) before the payload reaches the client. Every field arriving here has `origin: "ai"` by construction, so the provenance split of §2.8 never applies at this boundary — the "raise it silently" arm is always the right one. **Plus one rule the open key set adds: a returned key that is not in the registry is dropped and counted, never stored** (§2.3 N-6). The AI boundary is the one place a closed key set is correct, because the model's output is not data anyone else authored: a hallucinated `vitamin_d_micrograms` has no writer to protect and no forward-compatibility story, so dropping it loses nothing.

### 7.4 What the client persists from a response

```
name              := name
nameKey           := normalise(name) || entry.id
kind              := as returned
occurrences       := unit_count occurrences, all at `now` (or the parsed time)
servingVolumeMl   := serving_volume_ml
servingMassG      := serving_mass_g
nutrients         := every returned key with a non-null value, camelCased,
                     registry-checked — but ONLY where mayAiWrite(entry, key)
components        := merged BY COMPONENT ID (AI-6); never by name
originalInputText := the sanitised user text        [MANDATORY — V1 dropped this
                       on all three of its AI write paths]
entrySource       := "ai_text" | "voice"
provenance[k]     := { origin:"ai", at:now, model: CLAUDE_MODELS.quality,
                       promptVersion: "entry-parse/1",
                       confidence: field_confidence[k] ?? confidence,
                       priorValue/priorOrigin when replacing a non-user value }
                     — stamped for EVERY CORE key, including those returned null,
                       and for every EXTENDED key actually returned
```

`reasoning` and `sources` are persisted into `provenance["_entry"]` (not toasted-and-discarded as today, `food-section.tsx:281-287`).

**Disabled optional trackers must no longer drop data.** V1 discards AI-supplied sugar/potassium when the tracker is off (`food-section.tsx:272-277`, `voice-panel.tsx:228-242`). In a model where the AI fills the whole core set, that is data loss on every entry (§4.2b M9). **Persist everything; `optionalTrackers` becomes purely a display filter**, superseded by the pinning mechanism of §2.3.6. This also decouples "enabled tracker" from the `IntakeRecord.type` enum, which today makes enabling a tracker require a Drizzle migration (`optional-trackers.ts:12-17`) — the same coupling Q3 removes for nutrients generally.

### 7.5 Tests that land on this change

`parse/route.fuzz.test.ts` (the fast-check property `forall tool_block_input → status ∈ {200,400,422,429,502}`), `substance-lookup/enforce-search.test.ts` (235 lines guarding the search gate), and `voice-parse/schema.test.ts` (per-item resilience). All three need porting, not deleting. Add four more: AI-6's id-echo merge with a re-worded component name; the **latte case** from §2.4 R6 asserted end-to-end; a compositional-basis test asserting a returned `carbohydrate_g` less than `fibre_g` is repaired rather than stored; and a **registry-drift test** asserting the generated tool schema's `required` array equals exactly the registry's core keys, that deprecated keys are absent from it, and that an unknown returned key is dropped and counted (AI-7).

---

## 8. BLAST RADIUS

Sizing: **trivial** = mechanical/list edit; **moderate** = real logic, bounded; **major** = rewrite or new file.

### Schema & types

| File | Change | Size |
|---|---|---|
| `packages/core/src/nutrient-registry.ts` (new) | **the single definition site for every nutrient** (§2.3): defs, `NutrientKey`, `NutrientMap`, N-7's `resolve`, the zod builder, the AI-schema builder, the relation builder, the drift tests | major |
| `packages/core/src/water-derivation.ts` (new) | Q1's classifier + correction + `WATER_DERIVATION_TABLE` (the shipped preset water percentages and the alcohol keyword list, copied from `constants.ts:126-137` and `db.ts:289-290`) + the tokeniser, the suppressor vocabulary and `WATER_DERIVATION_VERSION`; golden-corpus and purity tests (P10, P11) | major |
| `packages/core/src/alcohol-units.ts` | `AlcoholDisplayUnit`, `ALCOHOL_UNIT_SYSTEMS`, `formatAlcohol`, `alcoholInUnits` — added to the existing file, UK unit **derived** from `ETHANOL_DENSITY_G_PER_ML` | trivial |
| `packages/types/src/records.ts` | `IntakeEntry` (23 fields), `EntryComponent`, `EntryOccurrence`, `FieldProvenance` (+`rule`, +`derivationVersion`, +`derivedFrom`, +`"dose"` origin), `MeasurementBasisRef`, `SupplementProfile`; `Prescription` +2; three fields ×3 legacy interfaces; `UserProfile` +4 | major |
| `packages/db/src/schema.ts` | `intakeEntries` pgTable + open-set CHECKs + 6 indexes + `sync_seq`; 3 legacy columns ×3 tables; **2 prescription columns**; 4 profile columns; `device_heartbeats`; the unknown-key counter table | major |
| `packages/db/migrations/0020_*` … `0022_*` + snapshots + `_journal.json` | generated, committed verbatim; **rebase rule of §4.8 applies to three colliding PRs** | trivial |
| `apps/web/src/lib/db.ts` | `AppDatabase` members; v23 block (repeat 21 stores + 2 new); `DB_SCHEMA_VERSION` 22→23; **`PREVIEW_STORES` content + comment + two new guard tests** (§5.9) | moderate |
| `packages/db/src/sync-payload.ts` | 4 list edits + recursive component/occurrence/provenance zod + **registry-derived `nutrientMapSchema`** + `supplementProfileSchema` + relational `superRefine`s + `omit(syncSeq)` | moderate |
| `apps/web/src/lib/sync-topology.ts` | 1 array entry (first) + header comment | trivial |
| `packages/core/src/measurement-basis.ts` (new) | bases, input units, one NaCl fraction, both directions + round-trip property test | trivial |
| `packages/core/src/component-units.ts` (new) | enumerated units + mass/volume/count classification | trivial |
| `packages/core/src/legacy-fold.ts` (new) | the shared fold incl. step 5's completeness/re-derivation/retraction rules; calls `water-derivation` and `nutrient-registry` | major |
| `packages/core/src/occurrences.ts` (new) | `unionOccurrences` (both `atRule` values), `projectOccurrences`, canonical ordering, property tests incl. empty-live-set | moderate |
| `packages/core/src/supplement-emit.ts` (new) | `buildSupplementEntry(doseLog, prescription, doseAmount, unit)` and `retractSupplementEntry(entry)` — pure; the scaling rule, the deterministic ids, the unit-mismatch branch (§2.10) | moderate |

### Migration

| File | Change | Size |
|---|---|---|
| `apps/web/src/app/api/sync/convert-v2/route.ts` (new) | server job, **pass A and pass B**, snapshot + hash + restore procedure | major |
| `apps/web/src/lib/legacy-entry-repair.ts` (new) | step-0 groupId pre-pass, client reconciler incl. the re-derivation and retraction arms, `revertRepair()`, the corrections of §4.2b | major |
| `apps/web/src/lib/sync-engine.ts` | seed the pass with pulled ids; occurrence merge + re-projection on pull; `syncSeq` cursor for one table; `_repairState.lastCompletePullAt` (**does not exist today**); re-entrancy flag; `clientSchemaVersion` on push | major |
| `apps/web/src/__tests__/migration/v23-repair.test.ts` (new) | P1-P16 incl. P2b, the split P7, P3a-P3d, P12-P16 | major |
| `apps/web/src/components/debug/…` | shadow-reconciliation view (R3a gate, rule-attributed) + unknown-nutrient-key report + "Revert V2 migration" | moderate |

### Write paths — all deleted and replaced by one entry service

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/entry-service.ts` (new) | `writeEntry`, `updateEntry`, `addOccurrence`, `removeOccurrence`, `scaleEntry`, `deleteEntry`, `undoDeleteEntry`, `enrichEntry`, `rollupComponents`, `updateComponent`, `addComponent`, `upsertSupplementEntry`, `retractSupplementEntry`, the §2.8 validator, the §2.4 R6 duplicate warning. **Enqueues `"upsert"` for soft-deletes, never `"delete"`** | major |
| `apps/web/src/lib/composable-entry-service.ts` (869 lines) | **delete** | major |
| `apps/web/src/lib/drink-service.ts` (226 lines) | **delete** | major |
| `apps/web/src/lib/intake-service.ts`, `substance-service.ts` | delete | major |
| `apps/web/src/lib/eating-service.ts` | delete | moderate |
| `apps/web/src/lib/substance-enrich.ts` + `/api/ai/substance-enrich` | delete (already dead) | trivial |
| **`apps/web/src/lib/dose-log-service.ts`** | **Q4:** the **six transactional** functions — `takeDose` (`:258`), `logPrnDose` (`:359`), `untakeDose` (`:465`), `skipDose` (`:534`), `rescheduleDose` (`:605`), `editDoseTime` (`:749`) — each gain one emit/retract call **inside the existing `rw` transaction**, with `db.intakeEntries` added to that transaction's table list. **`takeAllDoses` (`:683`), `skipAllDoses` (`:716`) and `editAllDoseTimes` (`:797`) get NO call of their own**: verified, they open no transaction and simply loop over the singular functions (the source comment at `:789` says so), so they inherit the behaviour. Adding a call at both levels would emit twice per dose. | moderate |
| **`apps/web/src/lib/medication-service.ts` / prescription form** | **Q4:** the `isSupplement` toggle and the supplement-profile editor (nutrient rows from the registry, basis amount + unit, unit-equality validation against the phase/schedule unit); prescription soft-delete retracts its emitted entries | moderate |
| `apps/web/src/lib/voice-reconcile.ts` | **Retained as a deterministic backstop (§2.4 R6), not shrunk.** Mechanical change: emit merged root-entry payloads instead of merged V1 item shapes; keep the water-flag branch; add the latte test | moderate |

### Read paths

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/analytics-service.ts` | `getRecordsByDomain` collapses to one query + occurrence projection over registry keys; fix bound convention; `fluidBalance` re-sourced | major |
| `apps/web/src/lib/analytics-snapshot.ts` | 12 parallel queries → ~5; share the divisor with summary-tab | moderate |
| `packages/core/src/analytics-stats.ts` | `avgByDay` → `sumByDay` for nutrient domains | moderate |
| `apps/web/src/lib/history-types.ts` | `UnifiedRecord` collapses; `FilterType` becomes nutrient-presence predicates over the registry; **`groupRecordsByDate` becomes an occurrence bucketer on the §5.6 day boundary** | major |
| `apps/web/src/hooks/use-records-tab-queries.ts` | 7 queries → 3 | moderate |
| `apps/web/src/hooks/use-history-queries.ts` | 6 queries → 3; **fixes the substance omission** that makes History and Analytics disagree | moderate |
| `use-intake-queries.ts`, `use-substance-queries.ts`, `use-eating-queries.ts`, `use-composable-entry.ts`, `use-drink-log.ts` | delete/replace with `use-entry-queries.ts` | major |
| `apps/web/src/hooks/use-record-adapters.ts` (271 lines) | 6 arms → 5; the entry arm's field map is a registry spread rather than a fixed list | major |
| `apps/web/src/lib/date-utils.ts` + every caller | one day-boundary function with the §5.6 fallback order | moderate |
| `apps/web/src/lib/data-deletion-service.ts` | `intakeEntries` filters on `lastOccurrenceAt`, not `createdAt`; partial-occurrence deletion (§3) | moderate |

### AI

| File | Change | Size |
|---|---|---|
| `packages/ai-prompts/src/entry-parse.ts` (new) | tool schema assembled from the registry + reference tables | major |
| `packages/ai-prompts/src/parse.ts`, `substance-lookup.ts`, `substance-enrich.ts` | delete | trivial |
| `apps/web/src/app/api/ai/entry-parse/{route,schema}.ts` (new) | recursive zod, depth caps, search gate, AI-7 repairs, unknown-key drop | major |
| `apps/web/src/app/api/ai/voice-parse/{route,schema}.ts` | food/drink arms adopt the root-entry shape; `max_tokens` up | major |
| `packages/ai-prompts/src/nutrient-analysis.ts` | send numbers, not just descriptions | moderate |
| `packages/ai-prompts/src/analytics-insights.ts` | `IntakeMetricSchema` (`:70-79`) hardcodes exactly 4 nutrients and **rejects** anything else — the whole insight request 400s rather than degrading. **Regenerate it from the registry**, which also stops it drifting on the next nutrient. | moderate |
| `apps/web/src/lib/analytics-registry.ts:33-46` | a second copy of the domain list re-declared inside Zod param schemas. Generate from the registry or delete. | trivial |

**Persisted `insightReports` carry V1 metric vocabulary** and are replayed as `priorAssessments` (exactly one — `getLatestInsightReport()` yields a single-element array, `use-insights.ts:86-101`). Regenerating `IntakeMetricSchema` does not fix stored narratives — see §10 Q-E.

### Server / MCP / backup

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/mcp/queries.ts` | `getTodaySummary` SQL (lateral occurrence count, jsonb nutrient extraction); `queryIntakeHistory` shape; the `legacy_member_ids` union + query-time `EXISTS`; §5.6 day boundary; §2.11 alcohol shape | major |
| `apps/web/src/lib/mcp/tools.ts` | registry-generated input enums; alcohol `{grams, display}`; **the dose/intake overlap disclosure (§5.8)**; `query_substance_history` deprecated not deleted | major |
| `docs/mcp-connector.md` | contract doc + transition window + display-unit contract + dose overlap | moderate |
| `apps/web/src/app/api/sync/push/route.ts` | occurrence union + re-projection in the winning, losing **and Rule-1** branches with the `atRule` selection; `sync_seq`; `clientSchemaVersion`; the unknown-nutrient-key counter. **No per-op hook on the legacy tables.** | moderate |
| `apps/web/src/app/api/sync/pull/route.ts` | `(sync_seq, id)` keyset for one table | moderate |
| `apps/web/src/lib/backup-service.ts` (~10 sites) | `BackupData`, counters, export, validate, clear list, merge/replace branches, stats, **+ enqueue on import**, **+ reconciler seeding**, **+ route entries through `mergeTableWithConflicts`** | major |
| `apps/web/src/lib/backup-schemas.ts` | new schema + 3 lists, **+ the potassium fix (R0)** | moderate |
| `apps/web/src/lib/export-service.ts` | `domainUnit`'s switch **deleted** in favour of registry units; alcohol unit from the setting (§2.11); format version; one row per occurrence; **PDF date-sort fix** | moderate |
| `apps/web/src/app/api/sync/cleanup/route.ts`, `user-data-deletion.ts` | order lists (+ fix existing drift, R0) | trivial |
| `apps/web/scripts/verify-schema.ts`, `reset-neon-db.ts` | counts/lists | trivial |
| `packages/types/src/analytics.ts` | `DOMAINS` generated from the registry + the non-nutrient domains | trivial |

### E2E

| File | Change | Size |
|---|---|---|
| `e2e/dashboard.spec.ts`, `history.spec.ts`, `chaos.spec.ts` | all exercise intake flows against the V1 UI | major |
| `e2e/sync-engine.spec.ts` | opens IndexedDB directly and hand-writes `_syncQueue` rows with `tableName: "intakeRecords"`; add the three-device `syncSeq` case | moderate |
| `e2e/mcp-connector.spec.ts` | must cover the transition window incl. a **mid-drain** sample (§5.8), not just the end state | moderate |
| `e2e/medications.spec.ts` (new coverage) | **Q4:** take a supplement dose → assert the dashboard nutrient moves and the day list shows a read-only medication-badged row; untake → assert it moves back; the concurrent-emission and flag-toggle cases of P14 | moderate |

### UI (out of detailed scope, sized for planning)

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/card-themes.ts` | the 11-key registry stops owning nutrient metadata; `unit`/`label`/`direction` come from the nutrient registry and the theme keeps only presentation | moderate |
| `apps/web/src/lib/optional-trackers.ts` | superseded by pinning (§2.3.6); display-only, then deleted | moderate |
| `apps/web/src/stores/settings-store.ts` | limits become `Partial<Record<NutrientKey, {target, buffer, direction}>>`; **`pinnedNutrients` + `pinDefaultsApplied`** (§2.3.6); **`alcoholDisplayUnit`** (§2.11); `dayStartHour` mirror + backfill and the `nutrientPrefs` mirror (§5.6); persist **16 → 17** with one migration arm seeding all of them; **delete dead `substanceConfig` and `weightGraphShow*`** | major |
| `apps/web/src/lib/quick-nav-defaults.ts` + `quick-nav-footer.tsx:32-46` | `QuickNavItem.id` is typed `CardThemeKey` and the list is **persisted**; renaming a theme key makes `CARD_THEMES[item.id]` `undefined` for every existing user. The 16→17 migration must remap persisted ids, and unknown ids must be dropped rather than rendered — the same rule §2.3.6 applies to pins | moderate |
| `components/settings/{water,salt,sugar,potassium}-settings-section.tsx` | 4 bespoke files → **1 data-driven section rendered from the registry**, which is also what makes a new nutrient's settings row free | moderate |
| `components/settings/…` (new) | pinned-nutrient picker; alcohol display-unit control; supplement-profile editor | moderate |
| `components/history/record-row.tsx` | 8-arm switch → 1 (**and fixes potassium rendering as "Sodium"**) | moderate |
| `components/history-drawer.tsx` | 6 edit dialogs → 2 | major |
| `components/text-metrics.tsx`, `analytics/summary-tab.tsx`, `liquids-card.tsx`, `food-salt/*`, `liquids/*`, `voice/parsed-item-row.tsx` | rewritten against the new model; **the expanded line item must list live occurrences with per-occurrence remove** (§2.5) **and every nutrient the entry carries** (§3); alcohol through `formatAlcohol` | major |
| `apps/web/src/lib/utils.ts` | **delete `getLiquidTypeLabel`** — the 9-format source grammar is replaced by `entry.name` | trivial |
| `packages/ui/src/styles/globals.css` | add `--color-sugar` / `--color-potassium` tokens (absent today); a fallback token for unpinned/extended nutrients so a new registry entry renders without a CSS edit | trivial |
| service worker / update gate | forced-update check + `clientSchemaVersion` (R0 item 6) | moderate |

**Rough total: ~92 files, of which ~25 are major**, spread across R0-R6. The compensating deletion is real: `composable-entry-service.ts` (869), `drink-service.ts` (226), `use-record-adapters.ts` (271), `history-types.ts` (58), the group-total helpers and three edit dialogs — well over 1 500 lines removed, and twelve parallel type enums reduced to two (`NutrientKey`, generated; and `kind`). Q3's registry removes as much as it adds: a fixed nutrient column set and its CHECKs out of `schema.ts`, its fields out of `records.ts`, the hand-written AI schema, four bespoke settings sections collapsing to one data-driven one, and `export-service`'s `domainUnit` switch.

**The number that matters for Q3 is not in this table.** With 22 nutrients in the seed registry, adding the **twenty-third** touches **one file**: `packages/core/src/nutrient-registry.ts`.

---

## 9. REJECTED ALTERNATIVES

**R-1 — Two tables: `intakeEntries` + `entryComponents` with a real FK.**
Loses on the sync engine. `TABLE_PUSH_ORDER` orders tables, but the batch is **FIFO-sliced to 50 ops before topological regrouping** (`sync-engine.ts:137-160`), and `enqueueInsideTx` rewrites `enqueuedAt` on every coalesce (`sync-queue.ts:62-74`), so re-editing a parent moves it behind its own child. With a `notNull().references()` FK the orphaned child insert throws, is `rejected` with **no `code`**, is retried 8 times, then **acked out of the queue and abandoned** (`sync-engine.ts:331-337`) — permanent silent loss. With a nullable FK it inserts fine and you have rebuilt `groupId`. Cost on top: ~20 files of table registration and a hand-maintained `fkPairs` entry.

**R-2 — One table with a self-referencing `parentEntryId`.**
Strictly worse than R-1: R-1's entire orphan class *plus* no ordering guarantee at all, because push order is defined **between** tables. It also makes every daily total a two-pass query ("sum roots, but exclude any row with a parent") — exactly the "sum with an unenforced membership predicate" shape §1 identifies as the bug class.

**R-3 — Keep the three tables, add a real `entryGroups` root table.**
The minimal-diff option, and it fails on the invariant. Totals would still be `Σ` over sibling rows, so two writers can still each book the volume. It adds a **fourth** linkage mechanism alongside `groupId`, `source: "substance:<id>"` and `sourceRecordId`, and buys a root for the *name* while leaving quantity, per-unit basis, provenance and the nutrient set exactly as broken as today.

**R-4 — Nutrients as EAV rows (`{entryId, key, value}`). Rejected — and the §2.3 map is not this.**
EAV loses on row count and join shape: it is `intakeRecords` generalised (the current design with `type` renamed to `key`), it multiplies row count by the size of the registry (11 k-22 k rows/year → 200 k-400 k at 18 keys, worse as the registry grows), it makes every daily total a join, and — the decisive objection — **it reintroduces the exact bug class of §1**: an open row set whose membership is decided by a predicate, where two rows can describe the same nutrient of the same entry and nothing structurally forbids it.

The canonical map shares none of that. It is **one value per entry per key, inside the entry's own row**: no extra rows, no join, no membership predicate, no second writer, no ordering problem on the wire, and one push op per entry exactly as before. What EAV and the map share is only the *openness of the key set* — and openness was never the reason EAV lost.

**R-5 — Store absolute (pre-multiplied) nutrients plus a display-only count.**
(a) `+1` becomes lossy: the per-unit basis is not recoverable from a rounded absolute, and `n × round(x) ≠ round(n × x)` — already an observed bug (`drink-service.ts:133-136`). (b) Editing becomes ambiguous: "sodium is 500" with 3 units means either 500 total or 1 500. (c) It leaves no per-unit basis at all, which is what `recalculateFromCurrentValues` (`composable-entry-service.ts:862-868`) has been stubbed out waiting for since Phase 13.

**R-6 — `integer` or `real` nutrient columns.**
`integer` is rejected because per-unit storage makes fractional values normal (0.4 g sugar per lolly, 3.2 g ethanol per small beer, 0.35 mg iron per slice), and the push validator silently drops fractional values today. `real` (float4, ~7 significant digits) is rejected because rollup sums and per-unit divisions produce values that do not round-trip, which would make `verify-hash` report MISMATCH for essentially every user. Under §2.3 the question is moot for nutrients — jsonb stores `numeric` — and `doublePrecision` remains correct for the two serving scalars.

**R-7 — A `quantity: number` multiplier instead of an occurrence set.**
Rejected on two independent grounds, both producing wrong numbers on shipping surfaces: it collapses N units onto one timestamp, so the rolling-24 h chip (`liquids-card.tsx:279`) drops 1 500 ml at once when the entry's single timestamp ages out, and the weekly grid puts three lollies spanning midnight in one bucket; and `quantity += 1` is strictly lossy under whole-row LWW. Its cost is one non-LWW table on both sides **plus one server-owned cursor column**, stated and accepted.

**R-8 — Do the V1→V2 conversion in the Dexie `.upgrade()` hook.**
A throw aborts the versionchange transaction and Dexie then refuses to open the database at all (`db.ts:616-618`); it cannot run on a fresh install (`db.ts:586-591`); it cannot catch legacy rows that arrive from the server afterwards; and it cannot be batched, resumed, observed or reverted across a 100 k-row corpus.

**R-9 — Client-only conversion (no server-side job).**
85 k-165 k queue ops against `PUSH_BATCH_CAP = 50`, with a chained pull per cycle, is ~1 700-3 300 foreground-online round trips — hours to days per device, with the sync indicator pinned on "Syncing…" and the server holding live V1 rows throughout. A server-side pass over the user's own three tables is one job with no queue. The client pass survives as a reconciler for stragglers, sharing one implementation of the fold.

**R-10 — Relational invariants enforced only by Postgres CHECKs.**
A CHECK violation is this engine's worst failure mode: no `code` on the rejection, 8 silent retries, then the op is acked out of the queue and abandoned (`sync-engine.ts:330-344`, whose own comment names "a CHECK violation" as exactly the permanent case). Enforcement is at mint time (§2.8), mirrored in the push Zod schema so a violation is loud on attempt 1, and mirrored again in Postgres as a backstop. **This is also the fallback if any jsonb function used in §5.1's CHECKs turns out not to be immutable** (§2.3.5).

**R-11 — Tombstone the legacy corpus in one server pass, before the client ships.**
Unshippable. Every V1 read path filters `deletedAt === null`, `pull/route.ts` returns tombstones verbatim, `sync-engine.ts:540` applies them with `bulkPut`, and the v22 bundle ignores the entries slice. For the whole gap the user's only working client shows water 0 ml and empty everything against a five-year dataset, and any edit made in that window is acked-and-discarded by push Rule 1 and then clobbered, with a success toast. Splitting into mark-then-tombstone costs one column and one invocation.

**R-12 — Bump `updated_at` in the LWW-losing branch to make the occurrence union visible.**
Corrupts scalar LWW: a bump to `serverNow` makes a third device's genuinely newer nutrient edit lose against a timestamp that carries no scalar intent. Leaving `updated_at` alone instead makes the union permanently invisible through a `(updated_at, id)` keyset cursor. A separate server-owned cursor column keeps LWW exactly as documented and makes delivery provable; its cost is one `DRIZZLE_ONLY_EXEMPTIONS` entry and one `verify-hash` strip entry, both with `userId` as precedent.

**R-13 — Drop the three legacy Dexie stores at v24.**
`importBackup` addresses them as direct properties (`backup-service.ts:477`, `:522`): once dropped, `db.intakeRecords` is `undefined`, replace mode throws inside the `Promise.all` of clears and merge mode throws on `bulkPut`, and both land in the outer catch so the **whole** restore fails — the user loses their weight, blood-pressure and medication data from that file too, with only "Invalid backup" to go on.

**R-14 — A fixed nutrient column set plus a second-class `extraNutrients` bag.**
Rejected by the Q3 decision, on both halves of it. Every measurable nutrient must be first-class **data-wise** — same provenance, same known/unknown/not-applicable distinction, same participation in totals, same availability to analytics — and **adding a nutrient must not cost a Drizzle migration + a Dexie version block + a parity-test update + a payload-schema edit**. The two-tier design fails both: an `extraNutrients` bag is excluded from every daily-total path, carries no provenance and therefore can never enter §3's `APPLIC` denominator (so a vitamin cannot even render with the known/applicable decoration every other nutrient gets), and the promotion path out of it is exactly the four-file cost being rejected.

Two further technical objections, independent of the decision: the bag's values would be `number | null` with no canonicalisation, so `{}` on one device and `{vitaminD: null}` on another hash differently under `verify-hash`; and the fixed columns' "required key, nullable value, never `?:`" rule exists **only** to work around `sanitizeRow` collapsing `undefined` to `null` at the top level of a row (`push/route.ts:66-72`) — a workaround that simply does not arise inside a jsonb value.

**R-15 — Hot/cold split with two writable homes: real columns for the hot nutrients *plus* a map for the rest.**
Rejected in its *writable* form for the reason the whole document exists: `water_ml` as a writable column **and** `nutrients.waterMl` in the map is two owners of one quantity, which is §1's bug class relocated inside a single row. Every writer would have to remember both; a rollup, a scale, a migration or a merge that updated one and not the other would produce a row that disagrees with itself, and no CHECK can express "these two are the same number" cheaply across an open map.

What survives from the idea is its *derived* form: §2.3.5's escape hatch, where a hot nutrient may be projected as a `GENERATED ALWAYS AS … STORED` column that is unwritable by construction and invisible to the client. The hot set is **empty at R1** because property (b) — index-assisted sums — turned out not to exist in the codebase today.

**R-16 — Postgres generated columns (or expression indexes) for every nutrient, over the jsonb map.**
Rejected because it reinstates precisely the per-nutrient cost Q3 removes, for a benefit that does not exist. Each generated column needs: a Drizzle migration, an entry in `DRIZZLE_ONLY_EXEMPTIONS` (`schema-parity.test.ts:32`) — otherwise the "no extra Drizzle columns" arm fails the build — an entry in `verify-hash`'s strip list (`verify-hash/route.ts:58-59`) and in `migration-service.ts:36-48`, or the cloud-migration wizard reports MISMATCH for every user. That is four files per nutrient, versus zero. And the benefit — faster aggregation — is unmeasured and probably nil: no index assists a `SUM`, and the row-selection predicate is already served by `idx_entries_user_last_occ`. An **expression index** (`ON intake_entries ((nutrients->>'waterMl'))`) avoids the parity and hash cost entirely but still needs a migration per nutrient and still does not help a sum; it is the right tool only for a future *filter* like "entries where sodium > 1000", which no surface asks for.

**R-17 — A per-nutrient Dexie index, or a client-side nutrient sub-table.**
No daily total is index-served on the client today (`getDailyTotal` is a range scan plus a JS filter and reduce, `intake-service.ts:104-112`), and IndexedDB cannot index into a JSON object anyway. A client-side nutrient sub-table is R-4 with extra steps and would break the one-row-per-entry property that makes the sync design work.

**R-18 — Re-derive historical water content with a per-item AI pass.**
Rejected by the Q1 constraint, and independently on the merits: it is not reproducible — the same corpus would produce different numbers on a re-run, on a different device, or after a model change; it could not be property-tested; it would need network access and API budget inside a migration that must also run server-side over an entire corpus; and it would make `revertRepair()`'s round-trip property (P8) meaningless, because the "before" state could not be recomputed. The deterministic classifier of §4.2a gets most of the accuracy — its ethanol-complement rule reproduces the app's own shipped water-content figures for spirits exactly and for beer and wine within 2 pp — with none of those costs, and it says "unknown" where the data genuinely does not determine an answer instead of asking a model to guess.

**R-19 — Preserve historical water content unchanged.**
Rejected by Q1. It would mark the entire historical drink corpus as 100 % water forever, including neat spirits, and satisfy the `water_ml <= serving_volume_ml` constraint by *equality* on exactly the rows that constraint exists to protect. The alternative of nulling the serving volume on migrated drinks so the percentage is honestly undefined is also rejected, because it discards the glass size, which is a real measurement and one of the four equality terms in §2.5's `+1` suggestion predicate.

**R-20 — Hardcode standard drinks in the CSV and MCP contracts.**
Rejected by Q2. `export-service.ts:125-154` returns the literal `"std_drinks"` and `text-metrics.tsx:450` renders `"std drinks"`. A user who thinks in UK units would read every surface in a unit they do not use, and the alternative of storing the display unit's value would put a presentation decision into canonical storage. §2.11's split — canonical grams stored, unit setting read by every presentation surface, MCP returning both — is the only arrangement in which the stored number never moves when the setting changes.

**R-21 — Compute supplement contributions by joining `doseLogs` at read time, instead of emitting an entry.**
Superficially the cleanest "single owner" answer, and it is wrong for four reasons. (i) It puts a second term into `TOTAL` sourced from a different table with a different lifecycle — verbatim §1's bug class, and it invalidates Invariant L. (ii) The supplement would be invisible in the day list (§3 R-L iterates entries), absent from CSV, absent from analytics `getRecordsByDomain`, and unreachable from history — so "it contributes to the day's totals" would be true of exactly one number on one screen. (iii) MCP would need the same join re-implemented server-side, which is a second implementation of one rule. (iv) The join would have to re-derive the scaling on every read, so a later change to `supplementProfile` would silently rewrite history. Emission with a deterministic id gives one owner, one lifecycle and one implementation, at the cost of one row per taken dose.

**R-22 — A non-deterministic id for the emitted supplement entry.**
`crypto.randomUUID()` at emit time means every `takeDose` → `untakeDose` → `takeDose` cycle mints a fresh entry, so the day's magnesium doubles on the second tap and triples on the third, with no mechanism anywhere to notice. `id := doseLog.id` makes every emit an idempotent primary-key upsert on both client and server. The same argument, one domain over, is §4.2 step 3's anchor rule.

**R-23 — An occurrence id that embeds the occurrence time on a dose-emitted entry.**
It looks like the fix for `editDoseTime` (a moved dose mints a new id, so the union's `at := min` rule never fires) and it trades a rare bug for a common one. Because two devices can emit for the same dose log independently — `getDoseLogRaw` finds the same row on both (`dose-log-service.ts:110-129`) — a time in the id means two ids, two live occurrences and a doubled nutrient contribution that §2.10 makes uneditable. The time edit is fixed at the merge instead, by the `rowLww` `atRule` of §2.1 Call 4, which leaves the id a pure function of dose-log identity.

**R-24 — Reject unknown nutrient keys at the push route.**
The natural reading of "the server registry is always ahead of the client" — and that premise is false. A registry lives in `packages/core`, which one build compiles into both the client bundle and the push route, so there is no PR to split and no ordering to arrange; and a rollback puts the server *behind* an installed client that still holds the newer bundle. A rejection lands on `code: "invalid"`, which `sync-engine.ts:330-344` drops from the queue on the **first** cycle, so the loss is not the unknown key — it is the entire row's write, silently, in exactly the direction N-5 exists to protect. Accept-and-store plus an out-of-band counter costs nothing the storage layer needs: the map's shape is already bounded by `nutrientMapSchema` and by the three open-set CHECKs.

**R-25 — A merge-only fold ("never lower a known value") as the sole rule for re-folding an existing entry.**
It is the right rule for one job — not losing information when a device with a partial member set re-folds a group — and the wrong rule for the other. Applied across time it freezes the entry against every subsequent legacy edit and delete, and since the V1 write paths stay live through the whole of R3a, a drink deleted in the V1 History screen weeks after pass A would reappear at the R3b cut-over with its full water and alcohol. §4.2 step 5 splits the rule by closure completeness instead: complete ⇒ re-derive and retract, incomplete ⇒ add-only.

---

## 10. OPEN QUESTIONS

None blocks R0.

**Q-A — the default pinned set, and whether an unpinned nutrient can still alert.**
§2.3.3 pins water, sodium, sugar, potassium, alcohol and caffeine by default — today's dashboard, plus the two that already have limits. Two sub-questions the data model cannot decide: (i) is that the right default set for the dashboard; (ii) if a nutrient has a limit in the settings registry but is **not** pinned, should exceeding the limit surface anything? *Default if unanswered:* yes — an unpinned nutrient over its limit raises a single collapsed "1 other limit exceeded" affordance rather than nothing, because a limit the user set and then cannot see is worse than no limit. (Mirroring the pin list and the limits to `userProfile` (§5.6) is what makes that affordance count the same on every device.)

**Q-B — which nutrients are `aiTier: "core"`.**
Core keys are required in every AI response, so the tier is a token-budget decision, not a data decision (§2.7, AI-1). §2.3.3 puts **12 in core and 10 in extended**. A larger core set costs tokens on every parse and every voice item (voice-parse must already rise from `max_tokens: 2048` for up to 20 items); a smaller one means more nutrients are *not applicable* rather than *determined unknown*, which is honest but shows fewer denominators. *Default if unanswered:* the split in §2.3.3, revisited after the first week of real parses with token counts in hand.

**Q-C — does turning on `isSupplement` apply to past doses?**
§2.10 says no: forward-only, because the profile is a present-tense claim with no basis at past dates, and a backfill would rewrite historical totals the user has already read. The alternative is an explicit, user-triggered "apply to the last N days" action, which is deterministic (it is the same pure emit function over existing dose logs) but changes past days. *Default if unanswered:* forward-only, with the option deferred rather than refused.

**Q-D — the stale-device policy that pass B is gated on.**
R3c requires `clientSchemaVersion >= 23` from every device that has pushed in the last 90 days. A device the user stops using — an old tablet, a reinstalled phone — never reports, so the gate never opens, the legacy corpus stays live forever and §4.6's "empty the legacy tables" step is unreachable. The consequence of never firing pass B is cost and complexity, not wrong numbers (the §5.8 `EXISTS` union is correct in the un-converged state), so this is not urgent — but it is a decision only the user can make: **how long may a device go silent before it is declared dead, and what happens to unsynced local rows on it when it is?** *Default if unanswered:* pass B waits indefinitely.

**Q-E — persisted `insightReports` carrying V1 metric vocabulary.**
They are replayed as `priorAssessments` (exactly one — `getLatestInsightReport()` yields a single-element array, `use-insights.ts:86-101`) and their narratives name V1 metrics. Either stamp reports with a schema version and stop replaying pre-V2 ones, or accept the mismatch and say so in the prompt. *Default if unanswered:* stamp and stop replaying — a narrative that references a metric the model can no longer see is worse than no prior assessment.

**Q-F — how a registry addition reaches an already-installed client.**
Adding a nutrient is a code deploy (§2.3.1). Until an installed PWA picks up the new bundle it will *store and carry* the new key (N-5) but not display it, not pin it, not export it and not include it in `APPLIC`. That is safe and lossless, but it means "I added vitamin D" and "vitamin D appears on my phone" are separated by a service-worker update. R0 item 6 already ships a forced-update check for a different reason; the question is whether a registry addition should **use** that forcing path (an immediate reload for a nutrient change is intrusive) or wait for the next natural update. *Default if unanswered:* wait; the data is never lost either way. Note that the lag interacts with N-7: while it lasts, an old bundle can mint a deprecated/successor key pair, which N-7's collision rule is written to make harmless.

---

## Residual Concerns

Adversarial review ran against this design in two rounds and did **not** sign off. The objections that changed the design are folded into the sections above. The objections below were **not** resolved, or were resolved in a way the reviewers still dispute. Each records the objection, the counter-argument, and why the disagreement remains. Concerns 1-4 predate the four decisions; 5 and 6 are closed and kept for the record; 7-9 arise from the decisions themselves; 10-14 arise from the changes made in the final round.

**1. The collision problem is only half-killed. The entry/entry axis is still a convention.**
*Objection.* §2.4 R1′ concedes that `writeEntry` mints one row per **call**, so two calls describing one physical drink produce two entries and `TOTAL("waterMl", W)` adds them. The live example is in the repo: `voice-reconcile.ts:3-27` documents one dictated latte returning as a `caffeine` item *and* a `food` item, both booking volume.
*Response.* The root/child axis — a drink's volume versus its own solutes and ingredients — is where every reproduced instance of #322 actually lives, and that axis becomes structural. The entry/entry axis is held by `reconcileLiquidItems` retained as a deterministic pre-review backstop, a write-time duplicate predicate that warns and never silently merges, and the review list itself.
*Why it stands.* No mechanism was found that closes the axis structurally without destroying legitimate data: any rule strong enough to merge the latte's two items also merges two genuinely separate identical coffees an hour apart. The reviewers who objected consider "warn, never merge" an admission that the invariant is still prose. That characterisation is accurate. **Q4 adds one new instance of the axis** — a hand-logged supplement alongside an emitted one — and §2.4 R6.2's extra warning clause is the same non-structural answer.

**2. The blast radius is disproportionate, and there is no client rollback.**
*Objection.* ~92 files, ~25 major, a five-year corpus, one user, and a device-level one-way door: once any device opens the Dexie v23 database it is at IDB 230 and a redeployed v22 bundle fails to open at all (§6, Rollback), including the export screen.
*Response.* §6 splits the largest step (R3a shadow model, R3b cut-over), R2 pass A never tombstones, a server-side snapshot with a hash check and a documented restore procedure precedes the first write, and `revertRepair()` is reachable from the Debug panel, which renders without any entry read path.
*Why it stands.* "Run both indefinitely" is exactly the state §1 identifies as the bug, so the proposal cannot adopt it. But the rollback story is weaker than the migration's size warrants: it depends on a snapshot and a revert path exercised only in tests, and the revert window closes at R3b. **Q1 makes this marginally worse**: `revertRepair()` restores the legacy rows exactly (P8), so the *pre-migration* numbers do come back — but any surface, export or insight report generated between R3b and a revert was computed on corrected water figures, and nothing reconciles those artefacts.

**3. `intakeEntries` is special-cased throughout the sync engine.**
*Objection.* §1.2(iv) argues the current design is unsafe partly because the sync engine has no per-table semantics — and then §5.2 gives exactly one table non-LWW merge behaviour, a server-owned `sync_seq` cursor, a parity-test exemption, a `verify-hash` strip-list entry, and a modified push Rule 1. Special cases in this engine are precisely where its existing bugs live.
*Response.* R-12 shows the alternatives are worse. The occurrence set is a join-semilattice, so the merge is commutative and the special case is principled rather than ad hoc; `userId` is existing precedent for both exemptions.
*Why it stands.* The resulting engine has one table whose behaviour must be reasoned about separately in five places, and the property tests proposed for it (three-device convergence, empty-live-set projection) are the only thing standing between that and silent data loss. **This round made it worse, not better**: the `atRule` selection of §2.1 Call 4 adds a *sixth* special case — one table, and within it one class of row, whose occurrence merge differs. It is tested for both rules, and it is still one more branch in the place the engine is least forgiving.

**4. Food logging becomes dependent on an AI round trip in an offline-first app.**
*Objection.* The V2 dashboard routes food and drink through "give it a name" → AI → line item (§7). Offline, or when the API is down, or when the search gate refuses with 422 `SEARCH_REQUIRED`, the entry is written with every core nutrient unknown (§2.7). §3's `≥ X (n of m known)` presentation is designed for that state, but if it becomes the normal state rather than the exception, every daily number carries a `≥`.
*Response.* Unknown-not-zero is strictly better than V1, which silently discards AI-supplied nutrients whenever the corresponding tracker is off (§7.4, §4.2b M9); quick-add water and the urination/defecation types stay fully offline; and `enrichEntry` can fill an entry later without touching user-authored fields, because provenance is per-field.
*Why it stands.* No offline enrichment queue is specified — nothing re-attempts enrichment automatically when connectivity returns, and no surface shows which entries are still unenriched. **Q3 sharpens this**: with an open registry the number of keys an entry *could* have determined grows over time, so an unenriched entry looks progressively emptier next to an enriched one, even though nothing about it changed.

**~~5. A fixed nutrient column set versus an open nutrient set.~~ CLOSED.**
Recorded because the resolution should be visible: the earlier design chose a fixed column set plus a second-class `extraNutrients` bag, with the note that it must be revisited before R1 if the answer to Q3 was "I want to add nutrients over time". Q3 answered that way. §2.3 replaces the columns with a registry-defined canonical map; §9 R-14 records the rejection; the four-file per-nutrient cost is gone and the second-class tier no longer exists. The new risks it introduces are recorded as 7 and 8 below rather than hidden.

**~~6. Migrated drinks will report 100 % water content.~~ CLOSED.**
Q1 chose deterministic re-derivation. §4.2a corrects the alcohol and shipped-preset cohorts from data already on the row, marks a narrow evidence-backed cohort unknown, leaves the aqueous and food cohorts untouched with a stated 2 % bound, and accounts for every millilitre that leaves the corpus (P3a-P3d). A migrated neat spirit now reads 60 % water, and the `water_ml <= serving_volume_ml` constraint is a real constraint on the historical corpus instead of one satisfied by equality.

**7. The registry's canonical form is load-bearing for `verify-hash`.**
*Objection.* Under typed columns, two devices could not disagree about the *shape* of a nutrient value. Under a map they can: `{}` versus `{sodiumMg: 0}` versus a key present with a different float text are all distinguishable to `deterministicJsonRow` (`verify-hash/route.ts:13-26`), and the observable failure is the cloud-migration wizard reporting MISMATCH and the next pull rewriting local data.
*Response.* §2.3 N-2 and N-4 make the canonical form normative (finite numbers only, no nulls, no `-0`, known values only), the hasher already key-sorts objects recursively so insertion order is a non-issue, and P13 is a required round-trip property test through Dexie → push → jsonb → pull.
*Why it stands.* It is a new invariant held by a writer and a test rather than by a type. If P13 is ever weakened or skipped under time pressure, the failure is silent until a user runs the migration wizard. The mitigation (quantise to 12 significant digits at the writer) is available but is not proposed, because it should not be needed and would itself be a new rounding rule to reason about. **N-7 adds a second shape hazard**: a row carrying both a deprecated key and its successor hashes differently from a normalised one, and the collision rule makes the *readings* agree without making the *bytes* agree.

**8. A mistyped nutrient key is data, not a compile error — and the final design detects it later than before.**
*Objection.* `records.ts` types the map as `Record<string, number>` because it cannot import the registry (§2.2), and the wire schema is deliberately open so a stale client can carry a newer key (N-5). So `sodiumMG` is, at the type level, a legal thing to write.
*Response.* Three gates: `writeEntry` may only *set* registry keys; the AI response schema is closed and registry-derived; and the push route accepts the key but **counts and reports it** (§5.2), with a debug-panel report over the local corpus shipping in R3a.
*Why it stands, and why it stands harder now.* The earlier draft had the push route *reject* an unknown key, which at least stopped it at the boundary. That was removed for a demonstrated data-loss path (R-24, N-6): a rejection lands on `code:"invalid"`, which the engine drops from the queue on cycle 1, so a rollback would silently discard whole rows. Accepting is correct, but the consequence is real and is recorded here rather than argued away: **a typo now reaches durable storage on the server and is only ever surfaced by a counter nobody is obliged to read.** Reviewers who wanted the rejection kept are not wrong that detection got weaker; the counter-argument is that the alternative was not "detect and reject" but "sometimes lose an unrelated row". The mitigation that would close it — a nightly job that alerts on any nonzero unknown-key counter — is a suggestion, not a deliverable in this document.

**9. The Q1 correction rewrites history on evidence the user cannot see.**
*Objection.* Every hydration figure before the migration date changes for alcohol and shipped-preset drinks. The evidence is a table compiled into `packages/core` and a rule id in a jsonb blob. A user looking at a 2023 fluid-balance chart has no way to know it moved, and the one-time notice will be read once and forgotten.
*Response.* Every corrected row carries `provenance.waterMl.rule`, `derivationVersion` and (for a v12 keyword-derived input) `derivedFrom`; `_repairState` carries the aggregate; P3c asserts that the totals reconcile to the millilitre; and `revertRepair()` restores the pre-migration corpus exactly (P8).
*Why it stands.* Auditability is not visibility. Nothing in this document specifies a surface that shows "this figure was corrected on 2026-09-xx by rule `water:ethanol-complement`, derivation version 1" at the point where the user sees the number, and the expanded line item is the obvious home for it but is out of schema scope. Until such a surface exists, the correction is right but opaque.

**10. C6's evidence test is a vocabulary, and vocabularies are incomplete in both directions.**
*Objection.* §4.2a C6 now requires a whole-token match, no suppressor, and a corroborator. That removes the demonstrated false positives ("Alcohol-Free Beer", "Ginger Beer", "Virgin Mojito", "Mocktail"), but it is still a hand-written word list deciding whether a measurement leaves the corpus. It is incomplete in both directions: "Sherry", "Prosecco", "Sake" and "Cider" are not in `ALCOHOL_KEYWORDS` at all, so a genuinely undecidable spirit row can fall through to C7 and keep its full hydration; and a suppressor list that misses a brand name ("Nozeco", "Seedlip") can still delete a real measurement, provided a corroborator is also present.
*Response.* The corroborator requirement is what bounds the damage: a keyword alone never fires C6, so a false positive needs *both* a missing suppressor *and* a shipped alcohol preset tag or an alcohol-typed substance row — and if an alcohol-typed substance row exists, the drink really was alcoholic. The false-negative direction leaves a *known upper bound* in place, which is the C7 argument and is the conservative failure.
*Why it stands.* The rule's two error directions are not symmetric in cost, and the design accepts asymmetric conservatism deliberately; reviewers who objected consider any word-list-driven deletion of a measurement unacceptable in principle, and would restrict C6 to the structural corroborator alone (dropping the keyword test entirely). That variant is strictly narrower and would be a defensible change; it is not adopted because it would also stop C6 firing on the cohort it was written for — a water row noted "whiskey" whose substance carries no numbers.

**11. `v1-explicit` does not take precedence over the ethanol rules, and reviewers wanted it to.**
*Objection.* §4.2a C3 (`water:v1-explicit`) fires only when **no** ethanol figure is derivable. For an M6 row where V1 recorded `water.amount = 500` against a `substance.volumeMl = 330` 12 % wine, the ethanol rules still fire and the stored figure moves 500 → 460.4. A rule whose stated purpose is "V1 already recorded something other than the glass, leave it alone" is therefore unreachable for every alcohol row.
*Response.* The ethanol rules subtract the ethanol term **from `V_water`**, they do not replace it: V1's explicit number is preserved minus a quantity that is arithmetic rather than a guess, P3a stays monotone and P3b stays exact, and the disagreement itself is counted in `_repairState.volumeDisagreements`. Full precedence for C3 would leave 500 ml of "water" on a 500 ml glass of wine, which is precisely the falsehood Q1 exists to remove.
*Why it stands.* It is a genuine judgement call about which of two conflicting V1 numbers deserves protection, and the document picks one. A reviewer who believes a user-visible V1 figure should never be altered by an inference — even an arithmetic one — will read the ordering as the wrong choice. The mitigation is that the cohort is small, counted, rule-stamped and revertible.

**12. Retraction and re-derivation of migrated entries are a new invariant held by a gate.**
*Objection.* §4.2 step 5 now has the fold retract an entry when its closure has zero live members, and re-derive `migration`-origin keys downward when a member changes — but only when the closure is **complete**, and completeness is computed from `legacyMemberIds` against what this device can currently see. A device whose pull is stale, or whose local corpus is genuinely missing a member another device holds, computes "incomplete" and does nothing; a device that computes "complete" retracts. Two devices can therefore disagree about whether an entry is live, for as long as one of them is behind.
*Response.* The disagreement is transient and converges: the retracting device pushes, the union carries the removals, and re-projection soft-deletes everywhere. The add-only arm cannot un-retract, because it may not add occurrences to an entry whose occurrences were removed by id — the union's per-id LWW on `removedAt` settles it by `updatedAt`. And the alternative — the merge-only rule alone — reproduces the deleted-drink-returns bug (R-25), which is worse and permanent rather than transient.
*Why it stands.* Correctness now depends on `_repairState.lastCompletePullAt` (a flag that does not exist yet and must be built) and on `legacyMemberIds` being accurate, and P15/P16 test the two arms in isolation rather than a three-device interleaving of them. This is the least-exercised new mechanism in the document and it operates on the one class of data — the migrated historical corpus — that the user cannot re-enter by hand.

**13. `derivationVersion` is enforced by convention at the operational layer.**
*Objection.* §4.2 step 5 rule 6 orders two folds by `derivationVersion`, and R2 states that a bump after pass A requires an explicit re-run of pass A. Nothing enforces either the bump or the re-run: a behavioural change to `water-derivation.ts` that someone forgets to version makes two builds disagree while claiming the same version, and P2's byte-identity property would then fail intermittently rather than deterministically.
*Response.* The golden corpus (P10) is a committed snapshot, so a behavioural change that is not accompanied by a snapshot update fails CI; and updating the snapshot is exactly the moment to bump the constant. A CI assertion tying the two together — "if the golden snapshot changed, `WATER_DERIVATION_VERSION` must have changed" — is cheap and should ship with the module.
*Why it stands.* That assertion is a recommendation in this paragraph rather than a specified deliverable, and until it exists the version is a comment that a careful author remembers. The failure mode is quiet: two devices producing different water figures for the same row, each stamping the same version, with P2 the only thing that would notice.

**14. The pin list and the limits become synced state, which is one more thing that can conflict.**
*Objection.* §5.6 mirrors `pinnedNutrients`, `pinDefaultsApplied` and the limits registry into `userProfile.nutrientPrefs` so that two devices show the same dashboard. That makes a presentation preference a synced, LWW jsonb blob: pin `magnesiumMg` on the phone and unpin `sugarG` on the tablet within one sync interval and one of the two edits is lost whole, because the column is a single LWW cell rather than a merged set.
*Response.* The alternative — leaving it in localStorage — was demonstrably worse: the dashboard differs per device, and §10 Q-A's "1 other limit exceeded" affordance counts differently on each. localStorage remains the offline-fast read; the profile row is the synced truth. A lost pin is a preference the user re-taps, not data.
*Why it stands.* It is a real regression in one direction traded for a real fix in another, and the document does not specify set-merge semantics for `nutrientPrefs` the way it does for `occurrences`. `pinDefaultsApplied` is the field where a lost write actually bites: losing it re-adds a default the user deliberately unpinned, which reads as the app overriding a choice.

**None of these blocks R0**, which is independently shippable and fixes existing bugs on its own. Concerns 7-9 are consequences of decisions taken deliberately and are recorded so the cost is visible, not because the decision should be reversed. Concerns 10-14 are consequences of the final round's changes and are the ones most worth re-examining at the R2 dry-run and the R3a gate, before the read cut-over makes them expensive to revisit. Concerns 1-4 are accepted risk.
