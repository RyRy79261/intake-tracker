# V2 Intake Schema Proposal — Spec Prep

**Status:** architect's proposal, pre-spec. Schema/data-model only.
**Date:** 2026-08-08.
**Baseline:** Dexie v22 (`apps/web/src/lib/db.ts:657`), 18 synced tables, Drizzle journal head `0019_uneven_ben_urich`.
**Scope:** the record model, its migration, its sync/server mirror, and the AI contract that fills it. UI implementation and the service/hook rewrite are acknowledged in §8 but not specified.

## Executive summary

The app stores one physical consumption event as several rows across three tables (`intakeRecords`, `substanceRecords`, `eatingRecords`), linked by a `groupId` that owns nothing and is enforced by nothing, and it computes every daily metric as a `SUM` over rows selected by a type predicate that no writer is obliged to respect. That is the whole of the double-counting problem behind issue #322 and commit `3070320`: a 500 ml drink can be booked as hydration by two different writers and the day reads 1 000 ml. This document proposes replacing the three tables with a single `intakeEntries` row per consumed thing — a named root line item that exclusively owns 18 per-unit nutrient columns (water and alcohol among them), carries its ingredients as a nested `components` array, represents repeats as a set of timestamped occurrences rather than a quantity multiplier, and stamps per-field provenance so re-enrichment cannot clobber a user's correction. It specifies the derived-totals contract that replaces every current daily sum, a migration split into two server passes (mark, then tombstone) plus a client reconciler so that no shipped client ever reads an empty corpus, the sync and Postgres changes the occurrence set forces — including one server-owned cursor column and one deliberately non-LWW table — the MCP transition contract, and the AI tool schema that fills the model. The change touches roughly 85 files, about 23 of them major, sequenced across R0-R6, and deletes well over 1 500 lines. Rejected alternatives are in §9, the decisions still owed by the user in §10, and the review objections that remain unresolved in the Residual Concerns section at the end.

## Decisions requested from the user

These are the questions the proposal cannot answer on its own. Full statements, with the consequences of each option, are in §10.

- **Retroactive hydration semantics (Q1).** V2 separates the glass (`servingVolumeMl`) from the hydration (`waterMl`). For migrated drinks those two numbers are identical by construction, so every historical drink reads 100 % water content. Choose: (a) preserve the totals and accept the meaningless historical percentage, (b) re-derive history from a per-item AI pass and change every past day's number, or (c) preserve totals but leave `servingVolumeMl` null on migrated drinks so the percentage is honestly undefined. Default if unanswered: (a).
- **Alcohol display unit (Q2).** Stored canonically as grams of ethanol. Display as metric standard drinks (10 g, matching today's numbers), UK units (8 g), or grams? This is not display-only — it changes §3's port table and the CSV `std_drinks` contract. Note also that migrated alcohol figures shift slightly whatever the answer, bounded at 0.005 std drinks per recomputed row.
- **Which nutrients surface by default (Q3).** Eighteen columns exist on every entry. Water and alcohol are stated priorities; sodium, sugar and potassium have limits today. Confirm that the other thirteen appear only inside the expanded line item and in analytics, and confirm the cut line that sends trans fat, added-vs-total sugar, polyols and all vitamins to `extraNutrients`, permanently outside every total.
- **Whether a nutritionally-significant medication also produces an `IntakeEntry` (Q4).** §2.9 keeps medications separate, so a magnesium tablet on a prescription does not contribute to daily magnesium. Confirm, or opt certain prescriptions into auto-emitting an entry on dose-taken — in which case the emitted entry id must be derived deterministically from the `doseLog` id.
- **What happens to persisted `insightReports` (§8).** They carry V1 metric vocabulary and are replayed as `priorAssessments`. Either stamp reports with a schema version and stop replaying pre-V2 ones, or accept the mismatch and say so in the prompt.

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

**(a) Multiple writers can each mint a row for the same fluid.** Five distinct code paths can create a `type:"water"` row: `addIntakeRecord` (`intake-service.ts:11-39`), `logDrink` (`drink-service.ts:83-225`), a caller-assembled `intakes[]` entry in `addComposableEntry` (`composable-entry-service.ts:56-174`), `syncEatingGroup`'s repair branch (`composable-entry-service.ts:506-517`), and backup restore / sync pull (`backup-service.ts:522-547`, `sync-engine.ts:540`). Three of these can be invoked for the same drink. The fix in commit `3070320` did not remove the other writers — it made `logDrink` the *conventional* owner. `addComposableEntry` is still exported and still called with hand-built water intakes from `beverage-tab.tsx:76`, `food-section.tsx:365`, `voice-panel.tsx:245` and `:307`. The invariant is a docstring (`drink-service.ts:69-78`), enforced by nothing in Dexie or Postgres.

**(b) The same physical quantity is stored twice, in two tables, with two owners.** A drink's volume lives as `intakeRecords.amount` on the derived water row *and* as `substanceRecords.volumeMl` (`drink-service.ts:107-121` vs `:182`/`:202`). Consistency is maintained by reconcilers that push one onto the other in opposite directions (`substance-service.ts:230-250` pushes `volumeMl → amount`; `composable-entry-service.ts:709-711` pushes `amount → volumeMl`) — and the latter only fires *if the substance already had a `volumeMl`*, so a substance created without one stays permanently desynced. Two owners of one fact is not a bug that gets fixed; it is a bug that gets *rediscovered*.

**(c) The unit of user intent and the unit of storage are different, so every edit is a partial edit.** The user's unit is "the Aperol Spritz". The storage unit is a row. There is no row that *is* the Aperol Spritz. Consequently:

- Editing a drink's amount from History (`useDeleteIntake` / `updateIntakeRecord`, `intake-service.ts:69-85`) does not touch the substance's `volumeMl` or `amountStandardDrinks`; editing it from the Liquids card (`updateSubstanceRecord`, `substance-service.ts:213-258`) does not touch the solute rows or the water row's `note`. Same record, two blast radii.
- Deleting a drink from History (`history-drawer.tsx:112`, `records-tab.tsx:193`) orphans its substance; deleting it from the Liquids card (`classifyLiquidDelete`, `composable-entry-service.ts:226-244`) removes the group. Same record, two blast radii.
- A drink group with a solute but **no** substance (a salt-only preset, `preset-tab.tsx:117-126`; a beverage-tab water+sugar entry, `beverage-tab.tsx:71-79`) falls through `classifyLiquidDelete`'s predicate to `scope: "record"`, leaving an orphan solute row that still counts toward the day.

### 1.2 Why the three-table + `groupId` design cannot hold the invariant

Five independent reasons, each sufficient on its own.

**(i) `groupId` has no owner row and no referential integrity.** It is a bare nullable `text` column with a plain index on all three tables (`packages/db/src/schema.ts:76`, `:165`, `:250`), no FK, no unique constraint, no root. Group membership is *discovered* by three separate `where("groupId").equals(...)` scans (`composable-entry-service.ts:288-292`). Nothing prevents an empty group, a group spanning two days, two groups with the same id, or a group with two live water rows. A link that cannot be violated is a constraint; `groupId` can be violated by an ordinary `.add()`.

**(ii) Group *kind* is inferred, never stored.** "Is this a drink or a meal?" is answered by two independently-written predicates — `substance-service.ts:150-158` (`!hasLiveEating`) and `classifyLiquidDelete` (`composable-entry-service.ts:237-243`, `!hasLiveEating && hasLiveSubstance`) — which **disagree** for a substance-less group. `groupSource` already carries the answer and is read by no branch anywhere in the app; it is a write-only tag.

**(iii) Nutrient slot identity is a magic string prefix.** Which intake row is "the meal's water" versus "the drink's water" is decided solely by `source === "manual:food_water_content"` versus anything else (`composable-entry-service.ts:346`, `:442-449`). `source` is free text with no CHECK. Nine distinct prefix formats are parsed by `getLiquidTypeLabel` (`apps/web/src/lib/utils.ts:61-124`), and `source` simultaneously encodes provenance, row identity, *and* measurement basis — `manual:salt` means "the user typed grams of table salt, so back-divide by 0.39 on edit" (`parseSodiumKindFromSource`, `composable-entry-service.ts:620`, consumed at `food-section.tsx:186-191`). A typo or a new writer using a different string silently creates a duplicate slot that `syncEatingGroup` then tombstones on the next edit.

**(iv) The sync engine has no group semantics and cannot acquire any.** Conflict resolution is **row-level last-write-wins on `updatedAt`** (`apps/web/src/app/api/sync/push/route.ts:205-279`), whole-row `onConflictDoUpdate` with no field merge. The push route has **no transaction** — it loops table-by-table, op-by-op, and a 50-op batch can half-apply and still return `200`. Pull is unconditional `db.table(tn).bulkPut(rows)` per table (`sync-engine.ts:540`). The batch window is FIFO-sliced *before* topological sort (`sync-engine.ts:137-160`, `PUSH_BATCH_CAP = 50` at `:50`), and coalescing rewrites `enqueuedAt` on every re-write (`sync-queue.ts:62-74`), so re-editing a parent moves it behind its own child. A "group" therefore has no atomicity anywhere: not on the wire, not on the server, not in the pull. It is 1-6 independent LWW cells that happen to share a string.

**(v) There is no representation for the user's actual operations.** No `quantity` field exists on any record (verified: `packages/types/src/records.ts:24-39`, `:114-127`, `:329-349`). No per-unit nutrient basis is stored anywhere in the database — the only one in the system is `LiquidPreset.*Per100ml` in **unsynced localStorage** (`apps/web/src/lib/constants.ts:111-123`). Every amount is pre-multiplied at write time and then `Math.round`ed into a Postgres `integer` column (`packages/db/src/schema.ts:73`; rounding at `drink-service.ts:97`, `:148`, `:181`). So "+1 another ice lolly" cannot be expressed *and cannot be derived*: `n × round(x) ≠ round(n × x)`, and the per-unit `x` was never kept.

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

Embedding children in a `jsonb`/plain-object column makes the whole tree **one row**. One entry = one row = one push op = one pull row. The orphan class does not exist because there is nothing to orphan. Precedent for a structured JSON column that passes the parity gate as a single field name already exists: `prescriptions.compounds: jsonb("compounds").$type<{name:string;strength:number}[]>()` (`packages/db/src/schema.ts:307`) against `compounds?: CompoundStrength[]` (`packages/types/src/records.ts:185`).

The cost we accept: children are not independently addressable by the sync engine, so a concurrent edit to a child on device A and to the root on device B resolves whole-entry, last-writer-wins. For a **single-user app** (stated in `CLAUDE.md`) whose devices sync on a cadence of minutes, that is acceptable, and it keeps the entry internally consistent instead of producing a Frankenstein entry whose children no longer explain its root. **It is not acceptable for the occurrence count — see Call 4.**

**Call 2 — nutrients are FLAT COLUMNS on the root, not a nested object, and are stored PER UNIT.**

Flat, because: (a) MCP aggregates server-side in SQL (`apps/web/src/lib/mcp/queries.ts:70-85`) and `sum(water_ml * n)` is trivial where a jsonb cast is not; (b) the single-ownership invariant is enforceable as a Postgres `CHECK` only against real columns (§2.4); (c) `createInsertSchema` derives per-column push validation for free (`packages/db/src/sync-payload.ts:44-97`).

Per unit, because occurrence count must be a real multiplier (§2.5).

**Call 3 — every nutrient column is `doublePrecision`, never `integer` and never `real`.**

`intake_records.amount integer` (`schema.ts:73`) is why `drink-service.ts:93-96` must round at mint time and why 0.4 g of sugar became a row recording zero. With per-unit × count arithmetic, integer storage is not a rounding annoyance, it is a correctness bug.

But `real` is wrong too. Drizzle `real()` is Postgres `float4` — single precision, ~7 significant digits. Rollup sums and per-unit divisions routinely produce values that do not round-trip through float4 (`0.1 + 0.2`, `382/3`). Two consequences that would bite immediately: the cloud-migration wizard's verification (`migration-service.ts:200-217` vs `api/sync/verify-hash`) would report MISMATCH on `intakeEntries` for essentially every user, and the next pull would silently rewrite the local value. **Use `doublePrecision` (float8), and quantise at the display boundary only.**

**Call 4 — occurrences, not a `quantity` scalar.**

A `quantity: number` multiplier is the obvious design and it is wrong twice over, both times silently:

- **It corrupts every window-bounded metric that is not the entry's own day.** Three 500 ml beverages at 09:00, 17:00 and 23:00 collapse to one entry timestamped 09:00 with quantity 3. `liquids-card.tsx:279` renders `24h: {rollingTotal} ml` from `getTotalInLast24Hours` (`intake-service.ts:99-102`). At 10:00 the next morning the single timestamp falls out of the 24 h window and **all three units leave at once**: the chip reads 0 ml when the user drank 1 500 ml inside the window. The weekly grid has the same defect across midnight.
- **`quantity += 1` is strictly lossy under whole-row LWW.** Tap `+1` on the phone (q=2) and `+1` on the tablet (q=2) before either syncs; both push 2, LWW keeps 2, the user ate three. V1's repeated-row shape did **not** lose this. Since `+1` is the headline V2 interaction, that is the feature's primary failure mode, and "one field-level change to one row" is an argument *against* the design, not for it.

So the entry stores an **occurrence set**, and count is derived from it:

```ts
occurrences: EntryOccurrence[];   // length >= 1
// EntryOccurrence = { id: string; at: number; removedAt: number | null }
```

This is an **LWW-element-set**: union by `id`, per-`id` last-write-wins on `removedAt`, and `at := min(a.at, b.at)` on an id collision (so the union stays commutative and associative even when two devices minted the same synthetic id with different times — see §4.2 step 5, where the fold does exactly that). `quantity` is **derived** (`occurrences.filter(o => o.removedAt === null).length`) and is **not a stored column** — there is exactly one owner of "how many", and it is the array.

Three scalar projections are materialised alongside it because IndexedDB and Postgres cannot index into a JSON array. **All three are computed by one fold, `projectOccurrences()`, which is the only writer of any of them, on the client and on the server:**

- `timestamp` = `min(at)` over live occurrences — the entry's "first consumed at". Used for cursor paging and for the `[nameKey+timestamp]` suggestion lookup. **It is NOT the sort key of the day list** (§3, read contract R-L).
- `lastOccurrenceAt` = `max(at)` over live occurrences — lets a window query prune to entries whose occurrence span overlaps the window.
- `deletedAt` — **derived, not an independently-LWW'd scalar.** `deletedAt != null ⟺ zero live occurrences`. See §2.5 and §5.2; this is what stops the LWW-element-set converging on the two divergent states an independently-LWW'd scalar cannot resolve.

`projectOccurrences()` is total: on an **empty live set** it returns `{timestamp: <unchanged>, lastOccurrenceAt: <unchanged>, deletedAt: now}` — it never evaluates `min`/`max` over an empty array, so `±Infinity` can never reach a `notNull` bigint column. `Number.isFinite` is asserted on both projections inside the fold, on both sides of the wire.

The cost, stated plainly: **`intakeEntries` is the one table whose pull and push cannot be whole-row LWW.** Both sides gain a per-table merge branch that unions `occurrences`, then re-projects, before applying LWW to every other column (§5.2, §5.3). That is ~60 lines in two files plus one server-owned cursor column, and it is the price of `+1` being correct across devices.

### 2.2 The interfaces, exactly as they would appear in `packages/types/src/records.ts`

Constraints these declarations must satisfy, all verified:

- Declared as `interface`, in **this file**, with **no `extends`** — `dexie-schema-extractor.ts:105-116` walks `ts.isInterfaceDeclaration` and collects only own `ts.isPropertySignature` members with identifier names. A `type X = {…}` alias or an inherited field is invisible and would fail parity (`:128-133` throws).
- `records.ts` is pure types, zero imports (`records.ts:21`) — so `NutrientKey`, `EntryComponent`, `EntryOccurrence`, `FieldProvenance`, `MeasurementBasisRef` are declared here too.
- Optionality is not compared by the parity test (`schema-parity.test.ts:11-13`), but the push path **is** sensitive: `sanitizeRow` rewrites `undefined` **and empty string `""`** to `null` *after* Zod validation (`apps/web/src/app/api/sync/push/route.ts:66-72` — verified). A `notNull()` text column that a user can leave blank therefore becomes a permanently unsyncable row. Every user-blankable text field below is nullable in Postgres; the two that are `notNull` (`name`, `nameKey`) carry a **writer-side non-empty guarantee** (§2.8).

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

/** Every nutrient the model can carry, as a key. Used by provenance + UI registries. */
export type NutrientKey =
  | "waterMl" | "energyKcal"
  | "carbohydrateG" | "sugarG" | "fibreG" | "proteinG"
  | "fatG" | "saturatedFatG" | "cholesterolMg"
  | "sodiumMg" | "potassiumMg" | "calciumMg" | "magnesiumMg"
  | "phosphorusMg" | "ironMg" | "zincMg"
  | "alcoholG" | "caffeineMg";

/**
 * One consumption of one unit of the entry. The array of these is the SOLE
 * owner of "how many" and "when". Merged across devices by union on `id`,
 * per-id LWW on `removedAt`, and `at := min` on id collision (§2.1 Call 4,
 * §5.2). `id` is addressable: removeOccurrence(entryId, occurrenceId).
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
  origin: "user" | "ai" | "preset" | "rollup" | "import" | "migration";
  at: number;              // Unix ms when this origin was stamped
  model?: string;          // e.g. "claude-sonnet-4-6" — only when origin === "ai"
  promptVersion?: string;  // AI tool-schema version, e.g. "entry-parse/2"
  confidence?: number;     // 0..1, model self-report; only when origin === "ai"
  /** The value this field held before the current one, whatever produced it.
   *  Provenance-NEUTRAL: it may hold an AI value a user overrode, or a user
   *  value a rollup replaced. `priorOrigin` says which. */
  priorValue?: number;
  priorOrigin?: FieldProvenance["origin"];
  basis?: MeasurementBasisRef;
  /** True when rollupComponents could only sum SOME depth-1 components for
   *  this key. The column stays NULL; `partialValue` is the incomplete sum,
   *  for display only. KNOWN() never counts a partial. (§2.4 R4) */
  partial?: boolean;
  partialValue?: number;
  /** True when writeEntry adjusted the value to satisfy a relational
   *  invariant (§2.8). Only ever set on a field whose prior origin was NOT
   *  "user" — a user-authored violation is a validation error, not a repair. */
  adjusted?: boolean;
  /** Set on a user-origin field when the entry's IDENTITY changed materially
   *  after the correction (name / servingMassG / servingVolumeMl). The value
   *  is kept and still protected from the AI, but the UI must offer
   *  "re-confirm or re-enrich". (§2.6) */
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
  /** Per-one-unit-of-root nutrient contribution. null = unknown, 0 = known zero. */
  nutrients: Partial<Record<NutrientKey, number | null>>;
  provenance?: Partial<Record<NutrientKey | "name" | "amount", FieldProvenance>>;
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
   *  keys but leaves array order alone). */
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

  // ── Nutrients, PER ONE UNIT. null = UNKNOWN. 0 = KNOWN TO BE ZERO. ──
  // Every field is a required key with a nullable value — never `?:`. The push
  // sanitiser collapses undefined→null anyway (push/route.ts:66-72), so an
  // optional key would make "unknown" and "absent" indistinguishable on the wire.
  waterMl: number | null;
  energyKcal: number | null;
  carbohydrateG: number | null;
  sugarG: number | null;
  fibreG: number | null;
  proteinG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  cholesterolMg: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  calciumMg: number | null;
  magnesiumMg: number | null;
  phosphorusMg: number | null;
  ironMg: number | null;
  zincMg: number | null;
  alcoholG: number | null;
  caffeineMg: number | null;

  /** Long-tail nutrients that do not warrant a column (vitamins, omega-3,
   *  polyols, trans fat, added-sugar split). Values nullable so unknown-vs-zero
   *  holds. NEVER read by any daily-total path — reporting/AI only, and never
   *  applicable in §3's denominator, so a UI must render them as a plain
   *  labelled value with no ≥/known-count decoration (§2.3). */
  extraNutrients: Record<string, number | null> | null;

  // ── Structure ──
  components: EntryComponent[] | null;

  // ── Provenance, PER FIELD (§2.6) ──
  provenance: Partial<
    Record<NutrientKey | "name" | "servingVolumeMl" | "servingMassG",
    FieldProvenance>
  > | null;

  entrySource:
    | "quick_add" | "manual" | "preset" | "voice" | "ai_text" | "import" | "migration";

  /** Non-null only on rows produced by the V1→V2 conversion. Carries the group
   *  ANCHOR ID (§4.2 step 2). Equal to `id` by construction. NOT indexed. */
  legacySourceId: string | null;
  /** The ids of every legacy row this entry subsumes, across all three legacy
   *  tables. Written by the fold; the SOLE load-bearing exclusion key for the
   *  MCP transition union (§5.8) — it makes the union exact against a
   *  half-drained push batch, because the entry carries its own membership
   *  rather than depending on a marker that lands in a later batch.
   *  Also what makes revertRepair() exact. Null on V2-native entries. */
  legacyMemberIds: string[] | null;
}
```

**Three fields added to the legacy record interfaces** (`IntakeRecord`, `EatingRecord`, `SubstanceRecord`). They are retained for as long as the legacy stores exist, which under §4.6 is indefinitely:

```ts
  /** Non-null iff the V1→V2 conversion folded this row into an IntakeEntry.
   *  Stamped in PASS A, which does NOT tombstone (§4.1). Distinguishes a
   *  migration tombstone from a genuine user delete, which is what makes
   *  revertRepair() possible. */
  repairedIntoEntryId?: string | null;
  /** The row's `deletedAt` immediately BEFORE pass B tombstoned it.
   *  `null` means "was live"; a number means "the user had already deleted it
   *  on that date and pass B must restore THAT value, not null" (§4.2 step 6). */
  repairedFromDeletedAt?: number | null;
  /** Set when pass B tombstoned this row, so revert can distinguish
   *  "marked but still live" (pass A only) from "marked and tombstoned". */
  repairTombstonedAt?: number | null;
```

**Dexie store string (v23):**

```
intakeEntries: "id, timestamp, lastOccurrenceAt, [kind+timestamp], [nameKey+timestamp], updatedAt"
```

Justification per index: `timestamp` for cursor paging and range pruning; `lastOccurrenceAt` so a window query can prune on occurrence-span overlap without opening the JSON; `[kind+timestamp]` for "today's drinks" style filters — this compound shape is the only one the app exercises today (`substance-service.ts:108-110`); `[nameKey+timestamp]` for the "+1 suggestion" lookup, compound rather than bare so a five-year history of rows named "Water" is not materialised on every keystroke; `updatedAt` for the debug panel. **The pull cursor for this one table is NOT `updatedAt`** — see `syncSeq` in §5.2.

**On nullable indexes.** IndexedDB omits `null`- and `undefined`-keyed rows from an index; it does not error. That is why `deletedAt: number | null` is *useless* as a bare index (the rows you want are exactly the ones with the null key) and why a `[deletedAt+timestamp]` compound has the same defect. Soft-delete filtering stays a JS `.filter()` as it is today (`intake-service.ts:96`, `:109`, `:189`). **Stated consequence, accepted:** every daily total materialises the window's tombstones and filters them in JS. At the estimated 11 k-22 k rows/year and a day- or week-bounded window that is tens of rows; it is only a problem for unbounded `"all"`-scope analytics, which already has that shape today.

### 2.3 The nutrient field set — units, COMPOSITIONAL BASES, nullability

Pinning sodium and alcohol precisely while leaving carbohydrate and energy as convention is not enough — a convention is exactly what §2.3 exists to abolish. Every row below states its basis, and §7.2 restates each verbatim in the tool description.

| Field | Unit | Compositional basis — pinned | Notes |
|---|---|---|---|
| `waterMl` | ml | Water **content** of one unit, not the glass volume. Dissolved solutes do not reduce it. | Drives hydration. |
| `energyKcal` | kcal | **INCLUDES** the contribution of `alcoholG` (7 kcal/g) and of `fibreG` (2 kcal/g, EU convention). Never kJ. | Without this pin, one 200 ml spritz can differ by ~74 kcal between two entries with no way to tell which. |
| `carbohydrateG` | g | **"Total carbohydrate", INCLUSIVE of `fibreG`** (US labelling convention). Consequent relations: `fibreG <= carbohydrateG`, `sugarG <= carbohydrateG`. An EU-labelled source reporting carbohydrate *excluding* fibre must have fibre added back before it is returned. | The single most likely silent divergence in the set: identical porridge oats differ by 10 g depending on which pack the model found. |
| `sugarG` | g | Total mono- and disaccharides, natural + added. **EXCLUDES polyols/sugar alcohols** (those go to `extraNutrients.polyolsG`). No added-vs-natural split. | `sugarG <= carbohydrateG`. |
| `fibreG` | g | Dietary fibre, AOAC total. Included in `carbohydrateG`. | |
| `proteinG` | g | Total protein, nitrogen × 6.25. | |
| `fatG` | g | Total fat as reported on a nutrition label (total lipid by acid hydrolysis, glycerol backbone included). **Not** "fatty acids expressed as triglyceride equivalents". | `saturatedFatG <= fatG`. |
| `saturatedFatG` | g | Saturated fatty acids. Trans fat is NOT included and goes to `extraNutrients.transFatG`. | |
| `cholesterolMg` | mg | | |
| `sodiumMg` | mg | **Elemental sodium**, never NaCl. NaCl and MSG are *input bases* (below). | |
| `potassiumMg` | mg | Elemental K⁺, total (not "available"). | |
| `calciumMg`, `magnesiumMg`, `ironMg`, `zincMg` | mg | Elemental, total content — **no bioavailability adjustment**, no haem/non-haem split for iron. | |
| `phosphorusMg` | mg | **Total** phosphorus including phytate-bound; no "absorbable P" adjustment. | CKD-relevant; the distinction matters clinically and must not float. |
| `alcoholG` | g ethanol | Grams of pure ethanol in one unit. | Standard drinks derive (`alcoholG / 10`); ABV derives (`alcoholG / (0.789 × servingVolumeMl) × 100`, defined only when `servingVolumeMl > 0`). |
| `caffeineMg` | mg | | |
| `extraNutrients` | per-key | Free-form. **No provenance, therefore never applicable, therefore never renderable with a "known / applicable" decoration** — a UI shows the value and its key label, or nothing. Excluded from every total. | |

**Measurement basis is data, with an explicit input unit, and ONE mass fraction used in both directions.** `packages/core/src/measurement-basis.ts`:

```ts
/** Sodium mass fraction of NaCl: 22.9898 / 58.4428. ONE constant, used by the
 *  forward conversion and by the saltEquivalent inverse. Nothing else may
 *  introduce a second NaCl figure — 0.39 forward with 1/2.5 backward loses
 *  2.5% on every round trip. */
export const NACL_SODIUM_MASS_FRACTION = 0.3934;
/** Sodium mass fraction of monosodium glutamate monohydrate (C5H8NNaO4·H2O). */
export const MSG_SODIUM_MASS_FRACTION = 0.1223;

export const MEASUREMENT_BASES = {
  sodiumMg: {
    // CONTRACT: storedValue(mg elemental) = inputValue(in `inputUnit`) × factor
    sodium: { inputUnit: "mg", factor: 1 },
    salt:   { inputUnit: "g",  factor: NACL_SODIUM_MASS_FRACTION * 1000 },  // 393.4
    msg:    { inputUnit: "g",  factor: MSG_SODIUM_MASS_FRACTION  * 1000 },  // 122.3
  },
} as const;
```

The `inputUnit` is what prevents a 1000× error: `{salt: 0.39}` against a *gram* input turns 2 g of salt into 0.78 mg of sodium, a 1000× under-count in a table whose stated purpose is preventing a 390× one. V1's own code applies `0.39` to an input already in **milligrams** (`food-section.tsx:~92`, `Math.round(sodiumMgNum * SODIUM_MULTIPLIERS[sodiumSource])`, with `SODIUM_MULTIPLIERS = {sodium:1.0, salt:0.39, msg:0.12}` at `:55-59`, matching `DEFAULT_SODIUM_PRESETS`' `sodiumPercent: 39` in `constants.ts:104` — verified). Either input unit is legal; what is illegal is leaving it undeclared.

**Round-trip is a property test, not a hope:** for every basis `b` and every `x` in a generated corpus, `saltEquivalent(sodiumFromBasis(x, b), b) === x` to within float tolerance, where both directions read `provenance.sodiumMg.basis.factor` — the **snapshotted** factor, not a lookup. Snapshotting is what keeps a V1-migrated row (`factor: 390`, from the 0.39 constant) displaying the user's original 2 g rather than 1.98 g, and what makes changing `NACL_SODIUM_MASS_FRACTION` later a non-event.

**Deliberately NOT stored** (all derivable; V1 proved that storing a derivation creates a second owner that drifts): `quantity` (= count of live occurrences), `amountStandardDrinks` (= `alcoholG / 10`), `abvPercent`, `saltEquivalentG` (= `sodiumMg / 1000 / NACL_SODIUM_MASS_FRACTION`, **the same constant**), `waterContentPercent` (= `waterMl / servingVolumeMl × 100`, **undefined for every solid** because `servingVolumeMl` is null there — the derivation table must say so, since the AI is still asked to reason about the water content of foods).

**The three-state distinction — measured / unknown / zero:**

| State | Representation | Survives because |
|---|---|---|
| **Known value** | `number`, with a `provenance[key]` entry | Column is `doublePrecision`, nullable. |
| **Known to be ZERO** | `0`, with a `provenance[key]` entry | **`sanitizeRow` (`push/route.ts:66-72`) rewrites `undefined` and `""` to `null` but leaves `0` alone** — verified. A known zero survives the wire. |
| **UNKNOWN** | `null` | Two sub-cases: *determined to be unknown* has a `provenance[key]` entry (an AI that returned `null`); *never determined* has no `provenance[key]` entry at all. §3 uses exactly this distinction for its denominator. |

**Nutrient coverage against the stated goal.** The 18 columns deliberately omit trans fat, added-vs-total sugar, polyols and all vitamins. These land in `extraNutrients` and are therefore permanently excluded from totals. The promotion path is a Drizzle migration + a `records.ts` field + a parity edit + an AI tool-schema key. That friction is accepted for the long tail and rejected for the 18; the cut line is "does any daily total or limit need it".

### 2.4 Liquid volume single ownership — what is structural and what is not

**Invariant L (formal):**

> Let `E` be the set of `intakeEntries` rows with `deletedAt === null`. For any window `W`,
> `H(W) = Σ_{e ∈ E, e.waterMl ≠ null} e.waterMl × |{o ∈ e.occurrences : o.removedAt === null ∧ o.at ∈ W}|`.
> No other table, column, or nested structure contributes a term to `H(W)`.

**R1 — Structural on the ROOT/CHILD axis, and only there.** Exactly one table has a `waterMl` column; `components` is a JSON column that no index, no `GROUP BY` and no §3 read path reaches into. A root/child double-count — issue #322 reproduced one level down — is therefore **unreachable**, not merely prevented. A second *table* owner cannot be introduced without a column the parity test surfaces immediately.

**R1′ — NOT structural on the ENTRY/ENTRY axis. Say it plainly.** `writeEntry` mints one row per **call**. Two calls for one physical event produce two entries, each with a non-null `waterMl`, and `TOTAL("waterMl", W)` adds them. "Exactly one table has a `waterMl` column, and it has exactly one row per item" does not touch this — "per item" is precisely what is not enforced. The live example: `voice-reconcile.ts:3-27` (verified) documents that "a latte" came back as a `caffeine` item **and** a `food` item and both volumes landed as water, and that "the prompt now forbids that shape … but a prompt rule is a request, not a guarantee". Under V2 both items survive review as two `IntakeEntry` rows (`kind: "drink"` at 250 ml, `kind: "food"` at 200 ml) and the day reads 450 ml for one 250 ml drink. Commit `3070320`'s own sentence — "two callers can still each book the volume" — applies verbatim to V2 on this axis.

**R6 — the mechanism that holds the entry/entry axis, since structure cannot.** Three parts, all deliverables:

1. **Keep `reconcileLiquidItems` (or its V2 equivalent) as a deterministic pre-review backstop over the AI's multi-item envelope.** It runs on the parse result *before* the review list renders, it merges only on an unambiguous pairing (same identifying words AND comparable volume, `VOLUME_TOLERANCE = 0.25`), and it reports merely-suspicious pairings as warnings with both rows intact. That conservatism is correct and is retained verbatim: wrongly dropping a companion loses real hydration silently, which is worse than the duplicate. **A test seeded on the latte case (one dictated drink → `{kind:caffeine, volumeMl:250}` + `{kind:food, waterMl:200}` → one entry) is a V2 acceptance test, not a legacy one.**
2. **A write-time duplicate-detection predicate.** `writeEntry` warns — never silently merges — when a candidate entry matches an existing live entry on `nameKey` AND `kind` AND overlapping occurrence times (within ±10 min of an existing live occurrence) AND comparable `servingVolumeMl` (±25%). The UI offers "+1 the existing one" or "save as separate". Silent merging is refused for the same reason `reconcileLiquidItems` refuses it.
3. **§8 no longer claims `voice-reconcile.ts` shrinks because "one item = one entry removes the merge cases".** That is a non sequitur: the merge case is two *items*, not two rows per item. The file's real V2 change is mechanical — it emits merged root-entry payloads instead of merged V1 item shapes — and it is sized `moderate` for that reason alone.

**R2 — Volume and hydration are different columns, so they cannot be confused.** `servingVolumeMl` is the glass; `waterMl` is the hydration. The relation `waterMl <= servingVolumeMl` (when both known) is enforced at mint time by `writeEntry` (§2.8) and mirrored — not solely held — in Postgres. It finally gives `waterContentPercent` an owner: a field the AI has been returning and the write path silently discarding since it was introduced (`preset-tab.tsx:225` sets it; `buildDrink` at `:250-277` never passes it; `logDrink` books the full volume, `drink-service.ts:107-121`).

**R3 — Children are physically un-summable by any aggregation.** As R1.

**R4 — The rollup sums EXACTLY the depth-1 components, and nothing deeper.**

Summing "every component at every depth" double-counts any composite child and contradicts AI-2. The rule, normative:

- `rollupComponents()` may set root nutrient `k` **only if** the root value is `null` **and** every **depth-1** component has a non-null, present value for `k`. The sum ranges over the **depth-1 set only**.
- **Sub-components are never a term in any sum, at any level.** A composite child's own `nutrients[k]` is authoritative for that child; its sub-components explain it.
- The abstention gate is over the **depth-1 set only**. A leaf grandchild with a null sodium does not block a rollup whose depth-1 terms are all known.
- **Reconciliation when a composite child's own `nutrients[k]` differs from Σ of its sub-components: the child's own value wins, and the discrepancy is NOT repaired.** It may be surfaced in the expanded view as an advisory ("components explain 780 of 800 mg"), never as a correction. This matches AI-2 exactly.
- Otherwise the root stays `null` and the partial sum is recorded as `provenance[k] = {origin:"rollup", partial:true, partialValue: Σ}` with the column left null. **A manufactured value that looks known is worse than a null**: a cheeseburger whose bun has `waterMl: null` would otherwise get root `waterMl = 53`, `KNOWN("waterMl")` would count it, §3 would render an exact total, and R4's "never overwrite non-null" would forbid correction.
- **Re-derivation:** a value whose `provenance[k].origin === "rollup"` **may** be re-derived when the depth-1 component set changes, because its provenance already declares it derived. "Never overwrite non-null" applies to `user` / `ai` / `preset` / `import` / `migration` origins, not to `rollup`. Without this, a cheeseburger whose root sodium was rolled up at 780 from three components stays at 780 when a re-run returns two, and the line item is permanently inconsistent with its own children.
- **Property test (the cheeseburger):** root `sodiumMg: null`, components `[patty {sodiumMg 400, components:[beef {300}, salt {100}]}, bun {sodiumMg 380}]` rolls up to **780**, not 1180.

**R5 — Relational invariants**, enforced at mint time and mirrored in the database: `sugarG <= carbohydrateG`; `fibreG <= carbohydrateG`; `saturatedFatG <= fatG`; `waterMl <= servingVolumeMl`; **`alcoholG <= 0.789 × servingVolumeMl`** (an entry cannot contain more ethanol than its own volume — free to add, and it catches a model returning grams-per-100 ml or standard drinks in the `alcohol_g` slot, which is exactly what `substance-lookup.ts`' "CRITICAL UNIT RULE" block exists to prevent today); every nutrient `>= 0`; at least one live occurrence unless `deletedAt != null`. The enforcement point is `writeEntry`, not the CHECK — §2.8.

### 2.5 Occurrences — representation, totals, and edit semantics

**Representation: an occurrence array on the root.** *Repeated rows* is rejected because three rows is three line items and "edit the sodium" becomes "edit three rows atomically", which the sync engine cannot do (§1.2 iv). *A `quantity` scalar* is rejected for the two reasons in §2.1 Call 4.

**Totals derive as `perUnitValue × (count of live occurrences inside the window)`, computed at read time, never at write time.** This is why nutrient columns must be `doublePrecision`: with `integer` storage, `3 × round(0.4) = 0` while `round(3 × 0.4) = 1`.

**Edit semantics.** Three occurrences, user edits sodium 400 → 500 mg: **the day's contribution goes 1 200 → 1 500 mg.** All three units are retroactively 500 mg. The rule to state in the spec: **an `IntakeEntry` is a claim that every one of its occurrences was one identical unit.** Non-identical units are separate entries.

**The primitive is `removeOccurrence(entryId, occurrenceId)`, and `-1` is sugar over it.**

Defining `-1` as "removes the most recent live occurrence" picks the wrong occurrence for the correction the user is actually making. Lollies at 23:30 Mon, 00:30 Tue, 08:00 Tue; on Tuesday morning the user realises the 23:30 Monday one was never eaten and taps `-1`. Under the old rule the 08:00 Tue occurrence dies: Monday still counts a lolly that was never eaten and Tuesday drops from 2 to 1 when it should stay 2 — both days wrong, in opposite directions, and the correct correction is unreachable from the API. That is the exact scenario the occurrence set was introduced to model.

So:

- **`removeOccurrence(entryId, occurrenceId)`** sets that occurrence's `removedAt = now`, re-runs `projectOccurrences()`, sets `updatedAt = now`. It is the only removal primitive.
- **`-1` is defined as `removeOccurrence(entryId, mostRecentLiveOccurrenceId)`** and is legal **only** where no occurrence is addressed (a collapsed row with a single live occurrence, or a deliberate "undo my last tap" affordance).
- **The expanded line item MUST list its live occurrences with their times**, each with its own remove control. This is a normative UI requirement flowing from the data model, not a suggestion: without it the model's addressability is unreachable and the `-1` default silently corrupts cross-midnight days.
- **Property test:** the three-lolly cross-midnight case above — remove the 23:30 Mon occurrence by id; assert Monday's bucket goes 1 → 0 and Tuesday's stays 2.

**`+1`** is `occurrences.push({id: uuid(), at: now, removedAt: null})`, re-project, `updatedAt = now`. Under the union merge it commutes with a concurrent `+1` on another device: the user gets 3, not 2.

**Zero live occurrences ⇒ soft-deleted, by projection, not by a separate write.** `deletedAt` is a *derived projection* of the occurrence set (§2.1). This is what closes the two divergent states an independently-LWW'd `deletedAt` scalar cannot:

- *Live entry with zero live occurrences.* Device A removes o2 (o1 still live, so A leaves `deletedAt: null`); device B, offline, removes o1 (o2 still live in B's copy, so B also leaves `deletedAt: null`); the merge unions to `{o1 removed, o2 removed}` and — because `deletedAt` is re-projected from the merged set rather than LWW'd — the merged row is **soft-deleted**. Under an independently-LWW'd scalar it would stay live at quantity 0, and `min`/`max` over the empty live set would write `±Infinity` into `notNull` bigint columns.
- *Soft-deleted entry with a live occurrence.* A removes the last occurrence; B taps `+1`. The union has one live occurrence, so the re-projection yields `deletedAt: null` regardless of which side won LWW on the scalars. B's `+1` survives.

**Fractional servings are not a count.** "Half a burger" is an entry whose *per-unit* vector is half a burger's (`servingMassG` 90 rather than 180). Count is a cardinality, so `-0.5` cannot arise and a day's water cannot go negative.

**Partial consumption gets an operation.** `scaleEntry(entryId, factor)` multiplies every per-unit nutrient, `servingVolumeMl` and `servingMassG` by `factor`, stamps `{origin:"user", at:now, priorValue, priorOrigin}` on every touched key, and leaves the occurrence set alone. Without it, "I only drank half the pint I already logged" requires hand-editing up to 18 nutrient fields plus both serving fields.

**`+1` is reachable only from a rendered row**, i.e. it takes an entry `id`. A `nameKey`-based *suggestion* is permitted only when the candidate matches on **`nameKey` AND `kind` AND `servingVolumeMl` AND `servingMassG` AND the full 18-value per-unit nutrient vector**. Without that predicate the identity rule is a convention with no mechanism: `Coffee` (black, 250 ml, 0 g sugar) and `coffee with two sugars` (200 ml, 10 g sugar) both normalise to `coffee`.

**Multi-day entries are permitted, and §3's read contract R-L is what makes them safe.** See §3.

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

**`priorValue`, not `aiValue`.** Naming the field for one of the several things it holds breaks as soon as §2.8 stashes a *user* value in it, producing a stored state that says `{origin:"user", adjusted:true, aiValue:30}` about a number no model ever produced. `priorValue` + `priorOrigin` is provenance-neutral and self-describing.

**Component-level merge on re-enrichment:** a returned component is matched to a stored component **by `id` only**. Components the model does not echo are deleted **unless** they carry any `provenance[*].origin === "user"`.

**The writer of component provenance is named**, closing AI-6's dangling retention rule: `updateComponent(entryId, componentId, patch)` — the sole client path for a user edit to a component field — stamps `{origin:"user", at:now, priorValue, priorOrigin}` on every key in `patch`, and `addComponent(entryId, component)` stamps `{origin:"user"}` on `name`, `amount` and every non-null nutrient it carries. Without a named writer, AI-6's "retained if user-authored" clause has no way to ever become true and a user-added component is deleted on the next re-enrichment.

**User provenance can go stale, and the model says so.** `mayAiWrite` protects a correction permanently, with no notion of the correction having been invalidated. User corrects sodium to 900 mg on "burger", later renames the entry to "double cheeseburger" and re-runs: every other nutrient doubles, sodium stays 900. So: when `name`, `servingMassG` or `servingVolumeMl` changes materially (name normalisation changes, or either serving field changes by >20%), every `user`-origin nutrient provenance entry is stamped `staleAfterIdentityChange: true`. The value is **kept** and still protected from the AI — but the UI must surface a per-field "re-confirm or accept the new estimate" affordance, and the re-enrichment response carries the AI's value in `priorValue` so the comparison is one tap.

Why `jsonb` rather than columns: 18 nutrients × 10 provenance fields is 180 columns. The map is never queried, only read alongside its row.

Additional facts this closes: `model`, `promptVersion`, `confidence`, `basis` (§2.3), and `originalInputText` on the root **mandatory on every AI-authored write** (today `food-section.tsx`, `voice-panel.tsx` and `preset-tab.tsx` all fail to pass it, so the field the system intends to re-run from is empty across essentially the whole corpus).

### 2.7 Default nutrient state per write path

The `≥` presentation in §3 is only meaningful if the denominator excludes entries that could never carry the nutrient. **A writer stamps `provenance[k]` if and only if it has determined something about `k` — including determining that it is unknown.**

| `entrySource` | Nutrient values written | `provenance` keys stamped |
|---|---|---|
| `quick_add` | `waterMl` **or** `sodiumMg` only; other 17 stay `null` | **only** the one nutrient written, `origin:"user"`. A quick-add water entry is *not applicable* for sodium and never enters that denominator. |
| `manual` | every field the form exposes and the user filled | one per filled field, `origin:"user"`. Blank optional fields stamp nothing. |
| `preset` | every nutrient the preset's per-100 ml profile defines, scaled | one per defined nutrient, `origin:"preset"` |
| `ai_text` / `voice` | all 18 (tool schema requires every key, `null` permitted) | **all 18**, `origin:"ai"` — including keys returned `null`, which is precisely "determined to be unknown" |
| `import` | whatever the backup carried | one per non-null field, `origin:"import"` |
| `migration` | only the nutrients the V1 corpus could express (§4.2 step 5) | one per non-null field, `origin:"migration"`. A migrated water row is not applicable for protein, and never will be. |

**Nothing ever stamps a speculative `0`.** "0 mg cholesterol" on a glass of water is a claim the app has no basis for; the correct state is "not applicable" — no provenance key, null column.

### 2.8 `writeEntry` is the enforcement point, not the database

**Normative rule: no constraint may exist in Postgres that the client is not obliged to satisfy before enqueueing.**

A CHECK violation is this engine's worst failure mode: `push/route.ts:262-271` pushes it into `rejected` with **no `code`**, `sync-engine.ts:330-344` bumps attempts and backs off, and at attempt 8 the op is acked out of the queue and abandoned with a `console.error` — the comment at `sync-engine.ts:59-73` names "a CHECK violation" as exactly the permanent case it drops. §5.1 already refuses nutrient *upper-bound* CHECKs for that reason.

Every relational invariant is enforced three times, in this order:

1. **AI-response zod** (`api/ai/entry-parse/schema.ts`) — §7.3 AI-7.
2. **`writeEntry` / `updateEntry` / `addOccurrence` / `removeOccurrence` / `scaleEntry` / `updateComponent`** — the sole writers. A violating row **cannot be persisted locally**.

   **The repair table is split by the provenance of the field being adjusted**, because an unconditional table silently overwrites user-authored values:

   | Violation | Field to be adjusted has `origin === "user"` | Otherwise |
   |---|---|---|
   | `sugarG > carbohydrateG` | **Reject with a user-visible validation error** naming both fields. A user asserting sugar > carbohydrate is a correctable input, not a model artefact. `carbohydrateG` is the authoritative member of the pair when both are user-authored (sugar ⊆ carbohydrate is a definition, so the carb figure is the one the user is more likely to have taken from a label). | raise `carbohydrateG := sugarG`, stamp `adjusted`, keep the old value in `priorValue`/`priorOrigin` |
   | `fibreG > carbohydrateG` | same — validation error; `carbohydrateG` authoritative | raise `carbohydrateG := fibreG` |
   | `saturatedFatG > fatG` | same — validation error; `fatG` authoritative | raise `fatG := saturatedFatG` |
   | `waterMl > servingVolumeMl` | validation error naming both | **clamp `waterMl := servingVolumeMl`, stamp `adjusted` on `waterMl`.** Nulling `servingVolumeMl` instead would destroy the denominator of two documented derivations (`waterContentPercent`, `abvPercent`), removes one of the four equality terms in §2.5's `+1` suggestion predicate, and contradicts R2, which introduces serving volume as *the thing that finally gives water content an owner*. Calling it "presentational" was wrong. |
   | `alcoholG > 0.789 × servingVolumeMl` | validation error | clamp `alcoholG := 0.789 × servingVolumeMl`, stamp `adjusted` — and log, because this almost always means a unit error upstream |
   | any nutrient `< 0` | **reject with a user-visible validation error** | same |
   | zero live occurrences | soft-delete via `projectOccurrences()` (§2.5) | same |
   | blank `name` | substitute `"Untitled entry"` | same |
   | `normalise(name) === ""` (emoji-only, `"+1"`, `"!!!"`) | `nameKey := entry.id` | same |

   Plus a blanket guard: **`Number.isFinite` is asserted on every numeric field, including the two occurrence projections, before the row is written.** (`push/route.ts:106-107` calls out the NaN→null-in-a-notNull-column hazard by name.)

3. **Postgres CHECK / NOT NULL** — a mirror and the last line of defence against a stale or buggy client. Because (2) exists, a rejection here means a client bug and should be loud in logs rather than silently dropped after 8 retries.

**Audit of every `notNull()` text column on `intake_entries`:** `id` (uuid), `kind` (enum), `entrySource` (enum), `timezone` (`Intl` output, never blank), `deviceId` (generated), `name` (guarded above), `nameKey` (guarded above, plus `CHECK (name_key <> '')`).

### 2.9 What stays separate, and why

| Domain | Verdict | Reason |
|---|---|---|
| `urinationRecords` | **Unchanged.** | Fluid *out*. Opposite sign, no nutrients, bucketed estimate. The user explicitly keeps it a unique record type. Folding it in would put a negative term in the column R1 declares additive-only. |
| `defecationRecords` | **Unchanged.** | Event marker, no quantities. |
| `weightRecords`, `bloodPressureRecords` | **Unchanged.** | Measurements of the body, not intakes. |
| medication domain (8 tables) | **Unchanged.** | Already normalised with real FKs and a working topology. Medications are a *schedule*; `doseLogs` records adherence, not nutrients. |
| `auditLogs`, `_syncQueue`, `_syncMeta`, `_errorLogs`, `insightReports` | **Unchanged.** | Infrastructure. |
| `userProfile` | **Two fields added** (§5.6) **plus a one-time backfill** (§5.6). | The only already-synced, already-backed-up singleton; §3's day-boundary unification needs a synced `dayStartHour` + IANA zone. |
| `intakeRecords`, `eatingRecords`, `substanceRecords` | **Three fields added; frozen at v23; read only by the conversion, `revertRepair()`, backup import and the MCP transition predicate; EMPTIED but never dropped** (§4.6). | Dropping them breaks every existing backup file. |

One consequence for medications to record: if a supplement (magnesium tablet) should contribute `magnesiumMg` to a daily total, it is an `IntakeEntry` with `kind: "supplement"`, **not** a `doseLog`. Correct — adherence and nutrition are different questions — but it must be stated so nobody tries to join them. See Q4.

---

## 3. DERIVED-TOTALS CONTRACT

Notation. `A` = `{ e ∈ intakeEntries : e.deletedAt === null }`. For entry `e` and window `W`, let

```
LIVE(e, W)   = { o ∈ e.occurrences : o.removedAt === null ∧ o.at ∈ W }
N(e, W)      = |LIVE(e, W)|
TOTAL(k, W)  = Σ_{e ∈ A, e[k] ≠ null}  e[k] × N(e, W)
KNOWN(k, W)  = |{ e ∈ A : N(e,W) > 0 ∧ e[k] ≠ null }|
APPLIC(k, W) = |{ e ∈ A : N(e,W) > 0 ∧ e.provenance?.[k] !== undefined }|
```

`TOTAL` is a lower bound when `KNOWN < APPLIC`. **Every surface that renders a total must also have access to `KNOWN`/`APPLIC`** so it can render "≥ 1 240 mg (3 of 4 known)". V1 could not express this — an unknown nutrient was indistinguishable from an absent row.

**The denominator is `APPLIC`, and it is defined by `provenance` alone — never by `kind`.** With a raw entry count, a typical day of 12 water quick-adds plus 3 food entries renders sodium as "≥ 1 240 mg (3 of 15 known)" forever, the `≥` presentation gets switched off within a week, and the three-state distinction goes with it. `APPLIC` counts only entries where someone determined something about `k` (§2.7), so the same day reads "1 240 mg (3 of 3 known)" — an exact number, correctly. `kind` does not participate in this denominator at any point; §2.2's field comment says so explicitly.

**Range-bound rule.** All windows are half-open `[start, end)`, **one convention, everywhere**. V1 mixed exclusive (`intake-service.ts:187`, `record-crud.ts:55`) and inclusive (`substance-service.ts:109`, `:114`) upper bounds, so an entry landing exactly on `range.end` was counted by one reader and dropped by another. Codify `[start, end)` in one shared helper and delete the per-service variants.

**Day-boundary rule.** `W_today = [dayStart(profile), dayStart(profile) + 24h)`. **One notion of a day, derived from a SYNCED `dayStartHour` + `homeTimezone` on `userProfile` (§5.6), used by every surface** — dashboard, analytics bucketing, history grouping, export, and MCP.

V1 has five mutually inconsistent notions (dashboard uses the localStorage `dayStartHour`, `settings-store.ts:66`; analytics `dayKey` uses local midnight, `analytics-service.ts:61-63`; correlations use the `Intl` device zone; range presets use `startOfDay`; MCP uses a server-process-timezone `setHours` reading `push_settings.day_start_hour`, whose only writer hardcodes `2`, `api/push/settings/route.ts:23-28`). Verified today: `mcp/queries.ts:45-52` reads `pushSettings.dayStartHour` with `?? DEFAULT_DAY_START_HOUR`, and `todayStartTimestamp` (`:54-59`) calls `d.setHours(...)` in the Vercel process zone. A Europe/Berlin user with `dayStartHour = 4` logging 750 ml at 03:00 local gets it counted toward the previous day by the dashboard and toward today by `get_today_summary`.

**Unifying them requires a schema change AND a backfill, both in scope** — see §5.6, which specifies the one-time write and the read-side fallback order, because the mirror writer alone reaches nobody who never touches the setting again.

### R-L — the read contract for "the ordered list of line items in window W"

This is the primary V2 surface. It cannot be an entry-ordered scan, because §2.5 permits (and the `+1` suggestion encourages) an entry whose occurrences span days:

> User logs "Coffee" Monday 08:00; Friday 16:00 they tap `+1` on the suggested row. `TOTAL("caffeineMg", W_friday)` correctly rises by 95 mg. But a `timestamp`-ordered list groups the coffee under **Monday** (`timestamp = min(live at)`), so Friday's list shows nothing for it — two surfaces on the same screen disagreeing about whether the user drank coffee on Friday. Sorting by `lastOccurrenceAt` instead just moves Monday's coffee out of Monday's list.

**Normative contract:**

- **The unit of the list is the OCCURRENCE, not the entry.** A day list over `W` is `{ (e, o) : e ∈ A, o ∈ LIVE(e, W) }`, projected as `{entry: e, at: o.at, occurrenceId: o.id}` and **sorted by `o.at`** (ties by `e.id`, then `o.id`).
- An entry with two live occurrences in `W` appears **twice** in that day's list. An entry with occurrences in two days appears **once in each day**, at the right time in each. Both are the correct rendering of "what did I consume, in order".
- The renderer may collapse adjacent same-entry rows into one line item showing a count, but the **expansion must list the individual occurrence times** (§2.5), and each row's `+1` / remove control addresses a specific `occurrenceId`.
- **Index that supports it:** `[kind+timestamp]` and `timestamp` prune the candidate entry set to those whose occurrence span can overlap `W` — the predicate is `e.timestamp < W.end AND e.lastOccurrenceAt >= W.start`, served by the `timestamp` and `lastOccurrenceAt` indexes (Dexie: two range scans intersected; Postgres: `idx_entries_user_ts` + `idx_entries_user_last_occ`). The occurrence projection and sort then happen in JS/SQL over that pruned set, which is tens of rows for a day window.
- **What `timestamp` is then for:** cursor paging over the entry table (`getEntriesByCursor`), the `[nameKey+timestamp]` suggestion lookup, and span pruning. It is **not** a display sort key and no list may order by it.
- `groupRecordsByDate` (`history-types.ts:27-46`) buckets on the record's own timestamp and must be replaced by an occurrence-bucketer keyed on `o.at` and on the §5.6 day boundary (it currently uses `toLocaleDateString` with hardcoded `"en-US"`, which is also its Map key).

### Metric-by-metric port table

| V1 metric | V1 computation | V2 computation |
|---|---|---|
| Dashboard water (ml) | `getDailyTotal("water", h)` — `intake-service.ts:104-112` | `TOTAL("waterMl", W_today)` |
| Dashboard sodium (mg) | `getDailyTotal("salt", h)` | `TOTAL("sodiumMg", W_today)` |
| Dashboard sugar (g) | `getDailyTotal("sugar", h)` | `TOTAL("sugarG", W_today)` |
| Dashboard potassium (mg) | `getDailyTotal("potassium", h)` | `TOTAL("potassiumMg", W_today)` |
| Dashboard caffeine (mg) | `Σ substance.amountMg` — `text-metrics.tsx:104-122` | `TOTAL("caffeineMg", W_today)` |
| Dashboard alcohol | `Σ substance.amountStandardDrinks` | `TOTAL("alcoholG", W_today) / 10` — one derivation, one place. Replaces three copies of the ABV rule (`drink-service.ts:196-201`, `composable-entry-service.ts:753-756`, `records-tab.tsx:381-383`). |
| Rolling 24 h (`liquids-card.tsx:279`) | `getTotalInLast24Hours` | `TOTAL(k, [now-24h, now))`. **Correct only because `N(e,W)` counts occurrences** — this is the metric a `quantity` scalar would have silently zeroed. |
| Weekly grid buckets | fixed 86 400 000 ms arithmetic — `text-metrics.tsx:62-71` (DST-unsafe) | 7 calls to `TOTAL(k, [dayStart(d), dayStart(d+1)))`, `dayStart` computed per calendar day. Fixes the DST shift and puts three lollies spanning midnight in the two days they happened in. |
| **Day / recent line-item list** (`getRecordsByCursor`, `getRecentRecords`, `RecentEntriesList`, `RecordsTab`, `HistoryDrawer`) | `orderBy("timestamp").reverse().toArray()` over 6-7 tables, fanned in by `useHistoryData` / `useRecordsTabData` | **R-L above.** New reads: `getEntryOccurrencesInWindow(W)` (the day list), `getEntriesByCursor(cursor, n)` (infinite history paging, ordered by `timestamp` descending — an entry appears once, with its occurrence count), `getRecentEntries(n)` (dashboard "last 3"), ordered by `lastOccurrenceAt` descending because "recent" means most recently consumed. |
| `getRecordsByDomain(domain, range)` | 11-arm switch over 4 services — `analytics-service.ts:72-163` | One query + one projection: for each live occurrence in range, `DataPoint{timestamp: o.at, value: e[k]}`. Non-nutrient domains unchanged. `eating` — valued at a constant `1` per event (`analytics-service.ts:132`) — becomes the live-occurrence count over `kind === "food"`, which finally counts a 3× snack as 3, at the three times it happened. |
| `fluidBalance.intakeMl` | Σ of water points | `TOTAL("waterMl", day)` per day. Urination side unchanged. **Changes the number** for spirits and other low-water-content drinks — see Q1. |
| Summary tab KPIs | own 9-arm reduce — `summary-tab.tsx:128-165` | Delete the reduce; call the same `TOTAL` the dashboard calls. Closes the defect where the summary tile and the AI narrative disagree about "average daily water" by construction. |
| AI snapshot `metrics.intake` | `sum(points)/days` — `analytics-snapshot.ts:222-239` | `TOTAL(k, W_30d) / 30`. Same divisor as the summary tab, from the same function. |
| Correlations | `avgByDay` = **mean** of raw points — `packages/core/src/analytics-stats.ts:118-131` | **Change to daily `TOTAL`.** V1 correlates "the average size of one salt entry that day" against weight, which is not a nutritional quantity. |
| MCP `get_today_summary` | `SELECT type, sum(amount) GROUP BY type` — `mcp/queries.ts:70-85` | Per-nutrient `sum(e.<col> * o.n)` with `o` a `LATERAL` count of live occurrences inside the window; pruned by `e.timestamp < $end AND e.last_occurrence_at >= $start`. Caffeine and alcohol become available here for the first time. **Not cut over in the same release as the client — §5.8.** |
| CSV `exportAllRecordsCSV` | 11 domains, `timestamp,domain,value,unit,note` — `export-service.ts:76-123` | Same columns, **one row per occurrence**; `domain` gains the new nutrients; `note` finally populates from `entry.name` (V1 always emitted empty because `getRecordsByDomain` never set `DataPoint.label`). Bump an explicit format version — the file has none. Fix the PDF "Recent Records" sort in the same pass: it sorts `"MMM d, HH:mm"` strings lexicographically (`export-service.ts:~268`), so cross-month order is wrong today, and that file is already being rewritten for one-row-per-occurrence. |
| Nutrient analysis input | descriptions only, never the stored numbers — `nutrient-analysis-card.tsx:225-233` | Send `{name, occurrenceCount, servingMassG, <known nutrients>}` per entry. The single largest capability unlock: the app has had these numbers all along and could not feed them to its own analyser because they lived in sibling rows. |

**Deleted read helpers** (they exist only to reassemble what should have been one row): `getIntakeTotalsByGroupIds` and its three wrappers (`intake-service.ts:205-240`), the three hooks at `use-intake-queries.ts:168-201`, `getEntryGroup` (`composable-entry-service.ts:288-303`), `useEntryGroup` (`use-composable-entry.ts:41-47`). Each becomes a property access.

**`data-deletion-service.ts` semantics must be restated for this table.** `DELETABLE_TABLES` is derived from `TABLE_PUSH_ORDER` (`data-deletion-service.ts:21`, verified) so it picks up `intakeEntries` for free — but it filters on `createdAt` (`:24-26`, `:38-40`, `:66`). A long-lived entry (Coffee, created in January, `+1`'d yesterday) is wiped by "delete records older than 90 days", taking yesterday's occurrence with it. **For `intakeEntries` the filter is `lastOccurrenceAt`, not `createdAt`**, and an entry is only deletable when *every* live occurrence falls in the range; otherwise the in-range occurrences are removed individually and the entry survives.

---

## 4. MIGRATION PLAN

### 4.1 Two conversion mechanisms, one fold, and a conversion split into TWO PASSES

**The primary mechanism is a SERVER-SIDE conversion. The client pass is a reconciler, not the migration.**

A client-only migration is wrong by three to four orders of magnitude: corpus estimate 55 k-110 k legacy rows ⇒ ~30 k-55 k entries plus 55 k-110 k member updates ⇒ **85 k-165 k queue ops** against `PUSH_BATCH_CAP = 50` (`sync-engine.ts:50`, verified), with a chained pull per cycle (`:368`) — **~1 700-3 300 foreground-online round trips**, hours to days, with the sync indicator pinned on "Syncing…" throughout. See R-9.

**(A) Server-side conversion — the migration. TWO PASSES, and the split is load-bearing.**

Running the server job (R2) strictly before the v23 client (R3), with the job tombstoning every converted member, is catastrophic: at the moment R2 runs, 100 % of devices are on the v22 bundle. `pull/route.ts` returns tombstones verbatim, `sync-engine.ts:540` applies them with `bulkPut`, and every V1 read path filters `deletedAt === null` (`intake-service.ts:96`, `:109`, `:189`; `record-crud.ts:41`, `:56`), while the v22 bundle's `TABLE_PUSH_ORDER` has no `intakeEntries` so the entries slice is silently ignored. For the whole R2→R3 gap the user's only working client shows **water 0 ml, empty History, empty weekly grid, empty fluid balance, empty CSV export**, against a five-year dataset. Worse, edits made in that window are destroyed silently (§4.4).

So the conversion is split:

- **PASS A — mark, do not tombstone.** For each legacy group: write the `intake_entries` row (carrying `legacyMemberIds`), and stamp `repaired_into_entry_id = <entryId>` on every member. **`deleted_at` is left exactly as it was.** V1 clients keep reading their whole corpus normally, because a marked row is still live and every V1 predicate keys on `deleted_at`. V2 clients read entries only. The MCP union predicate (§5.8) already excludes marked rows, so nothing double-counts. Pass A is idempotent and re-invocable and runs **before** the client ships.
- **PASS B — tombstone.** For each member that is still live and carries `repaired_into_entry_id`: record `repaired_from_deleted_at := deleted_at` (which is `null` for a live row), set `deleted_at := now`, `repair_tombstoned_at := now`, `updated_at := now`. **Members that are ALREADY tombstoned are stamped `repaired_into_entry_id` by pass A but are never touched by pass B** — see step 6. Pass B is gated on a hard precondition stated in §6: **the v23 client confirmed live on every registered device**, evidenced by a per-device `clientSchemaVersion` heartbeat written on each push (§5.2), not by elapsed time.

**Pass A has a real precondition of its own.** A client `exportBackup()` gate on the client pass leaves the server job — the thing that actually rewrites a multi-year corpus — with no precondition at all. So: **before its first write for an account, the pass-A job takes a server-side snapshot of the three legacy tables** (`CREATE TABLE intake_records_pre_v2 AS SELECT * FROM intake_records WHERE user_id = $1`, likewise for the other two, in a dedicated `migration_snapshots` schema), computes and stores a row count + `deterministicJson` hash per table, and re-verifies the hash before starting. **Documented restore procedure:** `DELETE FROM <table> WHERE user_id = $1; INSERT INTO <table> SELECT * FROM <table>_pre_v2 WHERE user_id = $1; DELETE FROM intake_entries WHERE user_id = $1 AND entry_source = 'migration';` followed by a forced full re-pull on every device (`_syncMeta` cursors reset). Snapshots are retained until R6.

**(B) Client-side reconciler — `repairLegacyEntries()`.** Same fold, same anchor ids, for the rows the server job cannot see: rows a stale V1 device pushes *after* pass A ran, rows imported from an old backup, and (for a device that upgrades before pass A runs on its account) its own local corpus. **The client reconciler stamps `repairedIntoEntryId` but NEVER writes `deletedAt` on a legacy row until pass B has run for the account** (a flag delivered on the entries pull). Same reason as pass A.

**The fold is implemented ONCE**, as a pure function in `packages/core/src/legacy-fold.ts`:

```ts
export function foldLegacyGroup(members: LegacyMembers): FoldedEntry
```

Both (A) and (B) call it. A second implementation in SQL is refused precisely because two implementations of one rule is the disease this document is about. **§5.8's union predicate does not need one** — it keys on `legacy_member_ids`, which is *data the fold already emitted*, not a re-derivation of the fold.

**Dexie v23 adds the `intakeEntries` store and carries NO `.upgrade()` conversion.** Four reasons, each from a confirmed constraint:

1. **A throwing upgrade hook bricks the database permanently.** The v22 hook wraps its per-pair body in `try/catch` precisely because "one malformed row must not abort the version change — Dexie then refuses to open the database at all, leaving the app unusable until the user clears storage" (`db.ts:616-618`).
2. **A fresh install never runs a hook, and the v22 comment says so** (`db.ts:586-591`).
3. **Legacy rows keep arriving after the upgrade** — pull is `bulkPut` with no merge (`sync-engine.ts:540`).
4. **A runtime pass can be batched, resumed, observed, re-run, and reverted.** An upgrade hook can do none of those.

State lives in a **local-only** Dexie table `_repairState` (never synced, never backed up — same category as `_syncQueue` / `_syncMeta` / `_errorLogs`, which `table-sync.test.ts:94` already excludes via `NON_BACKUP_TABLES`).

### 4.2 The conversion algorithm

#### Step 0 — GROUP-ID PRE-PASS (v23 client, runs and pushes BEFORE any fold)

This exists to close the anchor cascade (step 2) against member sets that differ between the server and a client. It is a separate, tiny, resumable pass:

> For every live-or-tombstoned legacy row with `groupId == null` that the closure rules can reach a partner through, compute the closure (step 2's link rules), derive `anchorId(members)`, and write `groupId := anchorId` on **every** member — **enqueuing each one**, exactly as the v22 hook does (`db.ts:593-606`). Then push, and wait for the push to drain before the fold starts.

After the pre-pass, **anchor rule 1 (`min groupId`) applies to every group the client can see**, and the value it yields is on the server too. The pre-pass writes only `groupId`, so it is safe for a V1 client to receive (V1 reads `groupId` and treats it as a group link, which is what it is).

#### Step 1 — SEED SET. Three exact seeds. **No timestamp cursor.**

A monotonically-advancing `timestamp` cursor contradicts "the post-pull pass converts whatever arrived": device B is offline Aug 1-5 on a V1 client, device A completes its pass Aug 10 (cursor = Aug 10), device B comes online Aug 12 and pushes 12 legacy groups timestamped Aug 1-5; device A pulls them, resumes from Aug 10, and never sees them. **The cursor is removed.**

- **(i) Initial backfill sweep** — one pass over the three legacy tables in **primary-key (`id`) order**, resumable by a `lastScannedId` cursor per table in `_repairState`, batched. Ordering by `id` rather than `timestamp` is deliberate: a row arriving mid-sweep with an id *below* the cursor is not missed, because it arrived through pull and is covered by seed (ii). Completion recorded as `backfillComplete: true`.
- **(ii) Post-pull reconciliation** — seeded by **the exact set of record ids the pull just wrote** to the three legacy tables. `sync-engine.ts:539-546` already has `rows` in hand; it passes their ids to the pass. Exact, cheap, immune to timestamp ordering.
- **(iii) Post-import reconciliation** — seeded by the ids `importBackup` wrote (§5.7).

Completeness: a legacy row is either present locally when the backfill runs (i) or arrives afterwards via pull or import (ii, iii). It cannot arrive any other way once the V1 writers are deleted at R3b.

Streaming uses `.each()`, never `.toArray()`.

**Re-entrancy.** The pass is invoked after every pull, and every push chains a pull (`sync-engine.ts:368`), so during the migration window there are thousands of invocations, some overlapping. An in-flight flag mirroring `pullInFlight`/`pushInFlight` guards it, and P1 is stated as *idempotent AND safe under concurrent invocation*.

**The backup gate applies to seed (i) ONLY.** A blanket rule — "the pass refuses to start its first batch unless `_repairState.backupConfirmedAt` is set by a backup that completed and validated in this session" — blocks the post-pull reconciler in every session where the user has not manually exported a backup — so a day logged on the old tablet is pulled, never converted, and (after R3b deletes the V1 read paths) never appears, with no error and no counter. Corrected:

- **Seed (i)** — the one-time local backfill sweep — requires `_repairState.backupConfirmedAt` from a backup that completed and validated in this session.
- **Seeds (ii) and (iii) run unconditionally**, always, in every session. They are reconciliation of already-synced data, not a bulk rewrite.
- The multi-year corpus is protected by the **server-side snapshot** in §4.1, which is where it is actually rewritten.

#### Step 2 — MEMBERSHIP, then a single NORMALISED ANCHOR ID

**Membership discovery** — transitive closure over three indexed relations, all present in Dexie today (`db.ts:557`: `intakeRecords: "id, [type+timestamp], timestamp, source, groupId, updatedAt"`; `db.ts:571`: `substanceRecords: "…, source, sourceRecordId, groupId, …"`):

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

**Anchor id** — a pure function of the *closed member set*, with a normative rule that closes the cascade **regardless of visibility**:

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

**Why rule 0 and step 0 are both required.** An anchor that is a pure function of the *locally visible* member set is not stable, and the two sources of local-only legacy rows in this repo are verified:

- `db.ts:302-352` — the v12 upgrade mints `substanceRecords` with `crypto.randomUUID()` and `sourceRecordId: record.id` inside an upgrade hook that predates the sync queue (`_syncQueue` first appears in `V16_STORES`) and **never enqueues**.
- `backup-service.ts:420`, `:607` — `importBackup` calls `table.bulkPut(toImport)` with **zero `_syncQueue` writes** (verified: `db.intakeRecords.clear()` at `:477` in replace mode, `importHealthTable(data.intakeRecords || [], …, db.intakeRecords, …)` at `:522` in merge mode; neither enqueues).

Scenario: intake `I` (500 ml water, no `groupId`, note "whiskey") is on the server; substance `S` exists only in the phone's IndexedDB. The server's closure for `I` is `{I}` → rule 3 → entry id `I.id`. The phone's closure is `{I, S}` via R-link → rule 2 → entry id `S.id`. Two live entries, both `waterMl 500`, different primary keys, LWW never merges them, step 4's `db.intakeEntries.get(anchorId)` misses, P6 passes, and the day reads 1 000 ml.

**Both fixes are shipped:**

- **Step 0** makes the anchor derivable from a single row: after the pre-pass every member carries `groupId = anchorId`, and that `groupId` is *enqueued and pushed*, so rule 1 applies identically on the server and on every device. This is the primary mechanism.
- **Rule 0** is the belt-and-braces: whatever the pre-pass missed, the first pass to fold a group publishes its anchor onto every member via `repairedIntoEntryId`, and any later pass on any device — with any member set — adopts that id rather than deriving a fresh one. This is what makes the fold safe against a member the *other* side has never seen.
- The `substance:` prefix is **always stripped** before use; it never appears in an anchor id. Rule 2 equals `substanceId`, which is exactly what the v22 hook stamps as `groupId` (`db.ts:628-632`), so a hook-run and a hook-skipped device coincide even without the pre-pass.

**Proof obligations, tested (§4.3 P2, P2a, P2b):** the determinism test seeds the same legacy pair on a hook-run and a hook-skipped device; **the new test (P2b) seeds a member the server has never seen** — server folds `{I}`, client folds `{I, S}` — and asserts a **single** entry id after both sides sync, via step 0 in the ordinary path and via rule 0 in the pathological one.

#### Step 3 — ENTRY ID

`entryId := anchorId`, verbatim. Not a hash, not a uuid. Same anchor everywhere ⇒ same primary key ⇒ LWW converges instead of duplicating. Collision with a V2-native id is impossible: anchors come from other tables' uuid keyspaces.

#### Step 4 — IDEMPOTENCY, and the mandatory re-mark

```ts
const existing = await db.intakeEntries.get(anchorId);   // primary key, no index needed
```

If an entry exists for the anchor, the pass **must not** skip. It **MUST** merge (step 5's rules) any information the existing entry lacks, union `legacyMemberIds`, and **re-stamp `repairedIntoEntryId` on every member of that anchor that lacks it** before advancing. Normative, not parenthetical: without it a group whose entry was written but whose marks did not commit is permanently un-excluded from the MCP union, and every later pass sees "already converted" and skips.

#### Step 5 — FOLD the member set into ONE `IntakeEntry` (`foldLegacyGroup`)

```
  hasEating         := members contain a live EatingRecord
  kind              := hasEating ? "food" : (hasSubstance || hasWater) ? "drink" : "other"

  name              := eating.note ?? substance.description ?? intake.note
                    ?? getLiquidTypeLabel(intake.source)
                    ?? TYPE_NAME[soleNutrientType]   // "Water" | "Sodium" | "Sugar"
                                                     // | "Potassium" | "Caffeine" | "Alcohol"
                    ?? "Untitled entry"
  nameKey           := normalise(name) || entryId

  occurrences       := [{ id: `${anchorId}:0`, at: min(LIVE member.timestamp), removedAt: null }]
  timestamp/lastOccurrenceAt/deletedAt := projectOccurrences(occurrences)

  servingVolumeMl   := hasEating ? null
                     : (drinkWaterIntake?.amount ?? substance.volumeMl ?? null)
  servingMassG      := eating.grams ?? null

  waterMl           := (drinkWaterIntake ?? foodWaterIntake)?.amount ?? null   // SEE Q1
  sodiumMg          := intake{type:"salt"}.amount ?? null
  sugarG            := intake{type:"sugar"}.amount ?? null
  potassiumMg       := intake{type:"potassium"}.amount ?? null
  caffeineMg        := substance{type:"caffeine"}.amountMg ?? null
  alcoholG          := foldAlcohol(substance)
  every other nutrient := null                       // UNKNOWN, not zero. Critical.

  basis             := sodium row source "manual:salt" -> provenance.sodiumMg.basis =
                         { id:"salt", inputUnit:"mg", factor:0.39 }   // V1's factor, snapshotted
                       "manual:msg"  -> { id:"msg",  inputUnit:"mg", factor:0.12 }
                       anything else -> { id:"sodium", inputUnit:"mg", factor:1 }
  components        := null                          // V1 had no ingredient data
  provenance        := { <every non-null key>: {origin:"migration", at:now, basis?} }
  entrySource       := "migration"
  originalInputText := member.originalInputText ?? null
  legacySourceId    := anchorId
  legacyMemberIds   := sorted ids of EVERY member in the closure (live and tombstoned)
  timezone/deviceId := from the seed row
  createdAt         := min(member.createdAt);  updatedAt := now
```

**The occurrence's `at` is `min(timestamp)` over the LOCALLY VISIBLE LIVE members, and the id is synthetic and shared (`${anchorId}:0`)** — so two devices with unequal member sets mint the same id with different `at`. That is exactly why `unionOccurrences` is specified as `at := min(a.at, b.at)` on id collision (§2.1 Call 4): the union stays commutative and associative, and `timestamp`/`lastOccurrenceAt` — derived from it — converge. Property-tested alongside the union laws.

**Snapshotting V1's own multipliers (0.39 / 0.12) rather than the new constants** is deliberate: it makes the inverse display of a migrated sodium value reproduce exactly what the user originally typed, with no 2.5 %-class drift on the historical corpus (§2.3).

**The water-slot discriminator is explicit, because after R3b the `source` string is the only surviving evidence of which slot a row occupied:**

```
  foodWaterIntake  := the water IntakeRecord whose source === "manual:food_water_content"
                      (FOOD_WATER_SOURCE, composable-entry-service.ts:346)
  drinkWaterIntake := any other live water IntakeRecord in the member set
```

**A meal's water row supplies `waterMl` only, never `servingVolumeMl`.** Setting `servingVolumeMl := waterIntake.amount` unconditionally stamps a false liquid serving volume on every migrated meal: a 2024 cheeseburger with 120 ml of food water becomes `{kind:"food", servingVolumeMl:120, waterMl:120}` — contradicting §2.2 ("null for solids"), making `waterContentPercent` read 100 % for every solid food ever logged, and making the `water_ml <= serving_volume_ml` relation satisfied by *equality* on the entire historical food corpus.

**Alcohol — a guarded derivation, never a `??` chain:**

```ts
function foldAlcohol(s?: LegacySubstance): number | null {
  if (!s) return null;
  const abv = s.abvPercent, vol = s.volumeMl;
  if (Number.isFinite(abv) && abv! > 0 && Number.isFinite(vol) && vol! > 0) {
    const g = ethanolGrams(abv!, vol!);
    if (Number.isFinite(g)) return g;
  }
  const sd = s.amountStandardDrinks;
  if (Number.isFinite(sd) && sd! >= 0) return sd! * GRAMS_PER_STANDARD_DRINK;
  return null;
}
```

`ethanolGrams(abvPercent, volumeMl)` is `volumeMl * (abvPercent / 100) * 0.789` (`packages/core/src/alcohol-units.ts:13`, verified), and **both inputs are optional on `SubstanceRecord`** (`records.ts:333-336`). Two legacy cohorts have one or both missing: the pre-#323 preset path wrote alcohol substances **with no volume at all** (`preset-tab.tsx:238-249` states this verbatim), and rows logged before `abvPercent` was stored. For either, `ethanolGrams(...)` returns `NaN`, and `NaN ?? (sd * 10)` evaluates to **`NaN`** — `??` does not catch `NaN`. A wine entry with `amountStandardDrinks: 2.4` and no `volumeMl` would fold to `alcoholG = NaN`, render as "NaN std drinks", and after one round trip serialise to `null` (`push/route.ts:106-107` names this hazard), so the day silently reads 0.0.

**Every numeric field the fold emits is asserted `Number.isFinite` before the entry is written.**

**MULTI-MEMBER COLLISIONS.** Two live water rows in one member set — possible for pre-v22 or hand-built groups, and exactly the #322 residue — are resolved by taking the **first by `(timestamp, id)`** and recording the rest. **Do NOT sum them.** The dropped volumes are **materialised**: each goes to `_errorLogs` *and* increments a durable `deduplicatedMl` / `deduplicatedCount` counter in `_repairState`, surfaced in the debug panel and in a one-time user-visible reconciliation notice ("we removed 3 duplicate water entries totalling 700 ml"). P3 depends on this set being counted.

**MERGE RULES when an entry already exists for the anchor.** The fold is a pure function of *locally visible* rows and the row set is routinely unequal across devices: pull applies one table per transaction with `PULL_SOFT_CAP = 500` and an early return on network failure (`sync-engine.ts:539-546`), so a device can hold a group's `intakeRecords` row while its `substanceRecords` row is still on a later page.

1. **The pass does not run against a partially-drained pull.** Gated on `pullComplete`. **This gate has to be built** — `runPullCycle` keeps `anyHasMore` in a function-local (`sync-engine.ts:498`, `:504`, `:550`, verified) and only sets a global `initialSyncComplete` store flag after a full drain across all tables (`:553-560`). There is no persisted per-table `hasMore`. The deliverable is a `_repairState.lastCompletePullAt` written by `runPullCycle` when it exits the loop with `anyHasMore === false`, and the gate is **per cycle, not per table**. Listed in §8.
2. **The fold is merge-only against an existing entry.** It may fill a `null` with a non-null. It may **never** write `null` over a non-null, and may never lower a known value to unknown. `occurrences` union; `legacyMemberIds` union.
3. **`updatedAt := now`, and that is safe *because of* (2)**: a newer `updatedAt` can only ever carry more information than the row it replaces, so LWW cannot lose a nutrient. (`max(member.updatedAt)` is rejected: it can make a genuine repair look older than the row it is repairing.)

#### Step 6 — MARK (pass A) and TOMBSTONE (pass B), reversibly

**Membership discovery has no live filter** (the fold only filters for liveness when picking nutrient slots), so a member set routinely contains rows the user deleted years ago. Stamping `{deletedAt: now, …}` on **every** member would overwrite a 2026-03-03 deletion with `now`; `revertRepair()` would then restore it to `deletedAt: null`, putting 2 000 ml back on a day the user had cleared, changing that day's total, the March fluid-balance chart and every CSV export — verbatim the hazard used to reject `undoDeleteEntryGroup` (`composable-entry-service.ts:248-279`, which restores every row with `deletedAt !== null`). It would also make P8 unsatisfiable, because the pre-repair `deletedAt` would have been destroyed.

Corrected, normative:

- **Pass A stamps `repairedIntoEntryId` on EVERY member, live or tombstoned.** Tombstoned members participate in anchor computation and in `legacyMemberIds`; marking them is what makes rule 0 work and what keeps the MCP union exact. Marking changes no read anywhere (every V1 predicate keys on `deletedAt`).
- **Pass B tombstones ONLY rows that were live at fold time**, and records the pre-repair value first:
  ```
  for each member m with m.repairedIntoEntryId != null && m.repairTombstonedAt == null:
      if (m.deletedAt !== null) { /* user-deleted long ago — LEAVE ALONE, never stamp */ continue; }
      m.repairedFromDeletedAt = null      // it was live
      m.deletedAt = now; m.repairTombstonedAt = now; m.updatedAt = now; enqueue
  ```
  `repairedFromDeletedAt` exists so the restore is a value restore rather than a `null` write; today it is always `null` by construction (pass B skips already-deleted rows), and it is stored anyway so a future pass that *does* need to overwrite a non-null cannot be written without confronting the field.
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
  It runs client-side **and** server-side (the server job stamps the same columns, so a second device's revert is coherent), and it is **reachable from the Debug panel**, which renders from `db.table(...).orderBy(...)` directly and does not depend on any entry read path — see §6 R3.
- **P8 is restated over a corpus that includes pre-deleted members** (§4.3).

#### Step 7 — ENQUEUE, by hand, inside the same transaction

The v22 lesson (`db.ts:583-606`): the repair must reach the server or a later pull overwrites it (`bulkPut`, no field merge). Enqueue:

- `("intakeEntries", entryId, "upsert")`
- `("intakeRecords" | "eatingRecords" | "substanceRecords", memberId, "upsert")` — **`"upsert"` not `"delete"`**. `SyncQueueRow.op = "delete"` synthesises a `{id, deletedAt, updatedAt}` stub when the local row is gone (`sync-engine.ts:170-187`, verified), which would fail `createInsertSchema` for `intakeEntries`' ten `notNull` columns and be dropped with `code:"invalid"` on cycle 1. **`entry-service` must enqueue `"upsert"` for soft-deletes and never `"delete"`**, as the group services already do (`composable-entry-service.ts:197`).

Coalesce exactly as the v22 hook does: skip if a queue row already exists for `[tableName+recordId]`, because push reads the live row at push time (`db.ts:591-592`).

#### Step 8 — TRANSACTION BOUNDARY: exactly one group

**One Dexie `rw` transaction per GROUP** over `[intakeEntries, intakeRecords, eatingRecords, substanceRecords, _syncQueue, _repairState]`. Batching means "N transactions per invocation" (N = 200), **never** "one transaction per N groups". Dexie does not abort a transaction whose operation error you catch — with 200 groups in one transaction and a catch inside the loop, a group that throws between step 5 and step 6 is skipped and the transaction then **commits the partial result**.

#### Step 9 — Per-group `try`/`catch` INSIDE the loop, never around it

One malformed group is logged to `_errorLogs` and skipped; the pass continues. `_repairState` carries durable `converted` / `skipped` / `remaining` / `deduplicatedCount` / `deduplicatedMl` / `anchorCollisions` counters, surfaced in the debug panel and in the reconciliation notice.

### 4.3 Testable properties

- **P1.** `repair(repair(D)) = repair(D)` — idempotent **and safe under concurrent invocation**.
- **P2.** For any two devices holding any subset-consistent view of the same logical groups, `repair` produces byte-identical `intakeEntries` rows except for `updatedAt`/`deviceId`. The unequal-row-set case is a required test (device A holding only the water row, device B the pair; assert the merged result carries the alcohol).
- **P2a.** `anchorId` agrees across a hook-run and a hook-skipped device for the same legacy pair.
- **P2b.** *Server-invisible member.* Seed intake `I` on the server only and substance `S` (linked by `sourceRecordId`) on the client only. Run the server fold and the client fold. After a full sync, assert **exactly one** live `intakeEntries` row exists for that drink and its `waterMl` is booked once. Assert it both with the step-0 pre-pass enabled (rule 1 path) and with it disabled (rule 0 path).
- **P3.** *Hydration conservation modulo a counted deduplication set.* `Σ hydration after` = `Σ hydration before` − `Σ(dropped duplicate volumes)`, with the dropped set materialised in `_repairState.deduplicatedMl` and asserted equal to the difference.
- **P3a.** No group yields **more** hydration after repair than before.
- **P4.** No entry is created for a group whose members are all already tombstoned.
- **P5.** No V1 row is hard-deleted, ever.
- **P6.** After pass B, no **live** legacy row shares an anchor with an existing `intakeEntries` row.
- **P7 — alcohol, SPLIT into two assertions.** A single assertion `Σ amountStandardDrinks (V1) === Σ alcoholG/10 (V2)` over a corpus containing normal rows is **unsatisfiable by construction**, and would end up deleted or loosened to a post-hoc tolerance, taking the NaN guard with it: `foldAlcohol` prefers unrounded `ethanolGrams(abv, vol)` while V1 persisted `parseFloat(standardDrinksFromAbv(...).toFixed(2))` (`drink-service.ts:49` `STANDARD_DRINKS_DP = 2`, `:196-201`, verified). A 200 ml 11 % spritz: ethanol 17.358 g → 1.7358 std drinks, stored 1.74.
  - **P7a — exact equality over the FALLBACK cohort.** For rows lacking a finite positive `abvPercent` or `volumeMl` (where the fold uses `amountStandardDrinks × 10`): `Σ amountStandardDrinks === Σ alcoholG / 10`, exactly.
  - **P7b — bounded drift over the RECOMPUTED cohort.** `|Σ stored − Σ alcoholG/10| <= 0.005 × n_recomputed`, the bound following directly from 2-dp persistence.
  - Seed corpus must contain a volume-less row, an abv-less row, and normal rows.
- **P8 — `revert(repair(D)) = D` modulo `updatedAt`, over a corpus that INCLUDES members the user deleted before the migration.** Specifically: seed a group with one live water row and one water row tombstoned on a fixed past date; run pass A, pass B, then `revertRepair()`; assert the pre-deleted row's `deletedAt` is still that fixed past date and the live row is live again.
- **P9.** The fold never emits a non-finite number in any column — including `timestamp`, `lastOccurrenceAt` and every occurrence `at` — over a fuzz corpus of legacy rows with arbitrary undefined/NaN fields. **The alcohol arm is asserted independently of P7**: no folded `alcoholG` is `NaN` or `±Infinity`, ever, so the NaN guard survives whatever happens to the conservation assertions.

### 4.4 The dual-write / dual-read window

**There is no dual-write window and no dual-read window on the client. Both are refused deliberately.** A window in which both a V2 entry and its live V1 rows are *read* doubles every total instantly and degrades every correlation coefficient non-linearly (`avgByDay` takes a mean, `analytics-stats.ts:118-131`). Dual-write recreates the two-owners problem.

**What pass A creates is not a dual-read window**, and the distinction is the whole reason the release sequence works: after pass A, legacy rows are live **and** entries exist, but **exactly one of the two is ever read by a user-facing surface at any point in the sequence** — legacy up to and including R3a, entries from R3b onward. §5.8's MCP union is the single, explicitly de-duplicated exception, and it is exact because it keys on `legacy_member_ids` (§5.8).

**The server residual window** — between a device marking locally and its push landing — is one-directional: another device pulling in that interval sees unmarked legacy rows that its own pass converts, deterministically, to the same entry id, and marks. LWW then compares `updatedAt` on identical ids.

**A V1 client still running against the same account** is the real hazard, and for this app it is the *default* for at least one launch after deploy: it is an installed PWA with a precached shell (`apps/web/public/sw.js`). Three consequences, and the second one is the opposite of what the sync engine's documentation leads you to expect:

1. Its totals are unaffected while only pass A has run (marking changes no V1 read), and drop to zero for converted rows once pass B runs — which is precisely why pass B is gated on every device being on v23.
2. **An edit from a V1 client to a row pass B has tombstoned is acked-and-discarded, then clobbered on the next pull.** The intuitive reading is "its `updatedAt` is newer, so LWW makes it live again". `push/route.ts` does the exact opposite: Rule 1 is documented at the file header (`:22-26`) and implemented at `:212-222` (verified) —
   ```ts
   if (serverRow && serverRow.deletedAt != null && op.row.deletedAt == null) {
     accepted.push({ queueId: op.queueId, serverUpdatedAt: serverRow.updatedAt });
     continue;   // ← ACK with NO WRITE, unconditional on updatedAt
   }
   ```
   The op is acked, `ack()` removes it from `_syncQueue`, and the chained pull `bulkPut`s the server tombstone over the local row. **The user sees a successful save and loses it silently, with nothing left in the queue to retry.** That is the argument for the forced service-worker update, and it is a strong one: the failure is not "the edit survives in a mangled form" but "the edit is destroyed while the UI says it saved".
3. Its history renders empty (post-pass-B) until it updates.

**Mitigation, and it is a decision:** the forced service-worker update check (`skipWaiting` + a version gate that reloads a stale client) is an **R0 deliverable** and must be deployed and confirmed working before pass B. Combined with the per-device `clientSchemaVersion` heartbeat (§5.2), pass B's gate is evidence-based rather than time-based.

### 4.5 How double-counting is prevented during the transition — the exhaustive list

| Hazard | Prevention |
|---|---|
| V2 entry + live V1 rows on one device | Only one of the two is ever read (§4.4). Same-transaction, one-group boundary (step 8). |
| V2 entry + live V1 rows pulled from server | Post-pull pass seeded by the exact pulled ids (step 1 ii). Idempotent by primary-key get; mandatory re-mark (step 4). |
| Two devices converting the same group | Step 0 pre-pass makes `groupId` a pushed, deterministic anchor ⇒ rule 1 everywhere; rule 0 adopts a published anchor regardless of member set ⇒ same primary key ⇒ LWW merge, not duplicate. Properties P2, P2a, P2b. |
| Devices in different v22-hook states | Anchor rule 2 equals `substanceId`, which is what the hook stamps as `groupId` (`db.ts:628-632`) ⇒ rules 1 and 2 coincide. |
| **A member row one side has never seen** | Rule 0 (adopt a published `repairedIntoEntryId`) + step 0 (push the anchor as `groupId` before any fold). Property P2b. |
| A device holding a partial member set | Pass gated on a completed pull (`_repairState.lastCompletePullAt`); fold is merge-only; never null over non-null. Property P2. |
| A group with two live water rows | First-by-`(timestamp, id)` wins, remainder **counted** and reported; never summed. Properties P3/P3a. |
| Legacy rows unreachable by `groupId` | S-link and R-link closure — the latter is the v12 linkage the v22 hook never covered. |
| Entry lands but its members' marks do not | `legacyMemberIds` on the entry is the load-bearing exclusion key for the MCP union (§5.8), so the union is exact even against a half-drained push batch. `intakeEntries` is first in `TABLE_PUSH_ORDER` (§5.4). |
| Backup restore reintroducing V1 rows | Restore bypasses the sync queue entirely (`backup-service.ts:420`, `:607`, verified). `importBackup` must enqueue what it imports and seed the pass with those ids (§5.7). Required work, not optional. |
| Read path accidentally still summing V1 | At R3b the V1 read functions are deleted, not deprecated: `getDailyTotal`, `getRecordsInLast24Hours`, `getRecordsByDateRange(type)`, `getSubstanceRecordsByDateRange`, `getRecordsByCursor`, `getRecentRecords` and the three group-total helpers. |
| MCP reading an empty `intake_entries` | Union with legacy rows, de-duplicated on `legacy_member_ids` + `repaired_into_entry_id`, gated by a **query-time EXISTS predicate**, not a latched marker (§5.8). |
| Two entries for one physical drink | Not structural — §2.4 R1′/R6: `reconcileLiquidItems` backstop + write-time duplicate warning. |

### 4.6 What happens to the legacy tables

- **v23:** all 21 existing stores repeated verbatim + `intakeEntries` + `_repairState` = **23 tables**. Nothing dropped. `intakeRecords`/`eatingRecords`/`substanceRecords` remain in the schema, in `records.ts`, in Drizzle, in parity — each gaining three fields.
- **v24 / R6: the three legacy stores are EMPTIED, never DROPPED, and this document commits to that now** because §5.7's choice forecloses the alternative.

  `importBackup` references the stores as direct properties: `db.intakeRecords.clear()` (`backup-service.ts:477`) in replace mode and `importHealthTable(data.intakeRecords || [], …, db.intakeRecords, result)` (`:522`) in merge mode — both verified. Once the store is dropped, `db.intakeRecords` is `undefined`: replace mode throws inside the `Promise.all` of clears before a single row is written, merge mode throws on `table.bulkPut`. Both land in the outer catch, so the **whole** restore fails — the user also loses their weight, blood-pressure, prescription and dose data from that file. `validateBackupData` (`:350-380`) checks only `typeof version === "number"`, so nothing warns them. Concrete: a user exports a v5 backup today, the account converts, R6 ships six months later, their laptop dies, they restore: "Invalid backup", zero records imported, five years of data on disk and unreadable.

  Keeping three empty stores costs one line each in every future `stores({})` block and removes that entire failure class. A v5 backup restores into the (empty) legacy stores exactly as it does today, and seed (iii) folds the restored rows into entries — the mechanism already exists, so no import-time fold and no second fold implementation is needed.
- **Test:** restore a **real v5 fixture** against the v24 schema and assert every table's import count, including the three legacy ones and the entries the reconciler derives from them.
- Dropping a table would also require editing `schema-consistency.test.ts:31-52`, which deliberately fails when a version omits a predecessor's table. Not dropping means that guard stays untouched and un-weakened.

### 4.7 Fresh install

A device that creates the database at v23 has no legacy rows and needs no conversion. It pulls `intakeEntries` normally. If it *also* pulls legacy rows (because some device has not yet pushed its repairs and pass A has not yet run), the post-pull pass converts them to the same deterministic anchors. **This is the specific failure the v22 hook documented and could not solve** (`db.ts:586-591`).

### 4.8 Ordering vs the Drizzle migration — non-negotiable

**Deploy order is: (1) server, (2) client. Never the reverse.** If reversed, a v23 client pushes `tableName: "intakeEntries"` at a server whose `tableNameSchema` does not know it: the op fails `opSchema_.safeParse` per-op, `push/route.ts:119-138` returns it with **`code: "invalid"`**, and `sync-engine.ts:331` drops any `code: "invalid"` op on the **first** cycle (`if (r.code === "invalid" || nextAttempts >= MAX_PUSH_ATTEMPTS)`). There is no 8-retry grace window. **Data is gone after one push cycle.** (The 8-retry path *is* correct for a DB CHECK/FK failure, which is why §2.8 exists.)

**Journal handling — the footgun is inert, and hand-editing is FORBIDDEN.** Verified: `HANDWRITTEN_CUTOFF = 1780800000000` (2026-06-07) at `drizzle-journal.test.ts:85`; today is 2026-08-10, so the "no future-dated `when`" assertion is **live**. The journal's last two entries are real generated values — `0018_lazy_jackal` = `1781797699476`, `0019_uneven_ben_urich` = `1783948231861` — both above every hand-edited entry, so `drizzle-kit generate` emits a strictly-increasing `when` on its own. **Run `pnpm --filter @intake/db db:generate`, commit the SQL + snapshot + journal verbatim, do not touch `_journal.json`.**

**Rebase rule, because two R0/R1 PRs will collide.** R0 item 5 (`userProfile` day-boundary columns) and R1 (`intake_entries`) each emit a migration from a separate PR; both generate as `0020_*` against the `0019` snapshot. Resolving that by renaming one to `0021` **without regenerating** leaves that migration's snapshot diffed against the wrong parent, so the next `db:generate` emits DDL for columns that already exist. `drizzle-journal.test.ts` checks contiguous `idx`, file existence and monotonic `when` — **it will not catch a broken snapshot chain.** Normative rule: **after rebasing, delete the generated SQL, the snapshot and the journal entry, then re-run `pnpm --filter @intake/db db:generate` against the rebased parent.**

`vercel-build` is `db:migrate && next build`, so **server-first ordering is achieved by shipping the schema/sync-payload PR as its own deployment**. It is a PR-splitting requirement; nothing in the pipeline enforces it.

**New columns are all nullable or defaulted.** `name` and `nameKey` are `text NOT NULL` with no default, guaranteed non-blank by `writeEntry` (§2.8). Every other text column is nullable; every nutrient column is `doublePrecision` and nullable. CHECKs are added `NOT VALID` then `VALIDATE`d (`0019_uneven_ben_urich.sql` precedent); on a brand-new table they can be inline.

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
    // serving
    servingVolumeMl: doublePrecision("serving_volume_ml"),
    servingMassG: doublePrecision("serving_mass_g"),
    // nutrients — ALL doublePrecision, ALL nullable
    waterMl: doublePrecision("water_ml"),
    energyKcal: doublePrecision("energy_kcal"),
    carbohydrateG: doublePrecision("carbohydrate_g"),
    sugarG: doublePrecision("sugar_g"),
    fibreG: doublePrecision("fibre_g"),
    proteinG: doublePrecision("protein_g"),
    fatG: doublePrecision("fat_g"),
    saturatedFatG: doublePrecision("saturated_fat_g"),
    cholesterolMg: doublePrecision("cholesterol_mg"),
    sodiumMg: doublePrecision("sodium_mg"),
    potassiumMg: doublePrecision("potassium_mg"),
    calciumMg: doublePrecision("calcium_mg"),
    magnesiumMg: doublePrecision("magnesium_mg"),
    phosphorusMg: doublePrecision("phosphorus_mg"),
    ironMg: doublePrecision("iron_mg"),
    zincMg: doublePrecision("zinc_mg"),
    alcoholG: doublePrecision("alcohol_g"),
    caffeineMg: doublePrecision("caffeine_mg"),
    extraNutrients: jsonb("extra_nutrients").$type<Record<string, number | null>>(),
    // structure & provenance
    components: jsonb("components").$type<EntryComponentJson[]>(),
    provenance: jsonb("provenance").$type<Record<string, FieldProvenanceJson>>(),
    entrySource: text("entry_source").notNull(),
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
      sql`${t.entrySource} IN ('quick_add','manual','preset','voice','ai_text','import','migration')`),
    nameKeyNonEmpty: check("intake_entries_name_key_nonempty", sql`${t.nameKey} <> ''`),
    // Counts LIVE occurrences, not array length. A tombstoned-occurrence array
    // is legal ONLY on a soft-deleted entry — which is exactly the derived
    // deletedAt rule of §2.5, expressed in SQL.
    occurrencesCheck: check("intake_entries_occurrences_live",
      sql`jsonb_array_length(${t.occurrences}) >= 1
          AND ( ${t.deletedAt} IS NOT NULL
                OR jsonb_array_length(
                     jsonb_path_query_array(${t.occurrences}, '$[*] ? (@.removedAt == null)')
                   ) >= 1 )`),
    // Relational invariants. MIRRORS of writeEntry's mint-time enforcement
    // (§2.8) — never the sole enforcement point.
    waterVolumeCheck: check("intake_entries_water_le_volume",
      sql`${t.servingVolumeMl} IS NULL OR ${t.waterMl} IS NULL
          OR ${t.waterMl} <= ${t.servingVolumeMl}`),
    alcoholVolumeCheck: check("intake_entries_alcohol_le_volume",
      sql`${t.servingVolumeMl} IS NULL OR ${t.alcoholG} IS NULL
          OR ${t.alcoholG} <= 0.789 * ${t.servingVolumeMl}`),
    sugarCarbCheck: check("intake_entries_sugar_le_carb",
      sql`${t.sugarG} IS NULL OR ${t.carbohydrateG} IS NULL
          OR ${t.sugarG} <= ${t.carbohydrateG}`),
    fibreCarbCheck: check("intake_entries_fibre_le_carb",
      sql`${t.fibreG} IS NULL OR ${t.carbohydrateG} IS NULL
          OR ${t.fibreG} <= ${t.carbohydrateG}`),
    satFatCheck: check("intake_entries_satfat_le_fat",
      sql`${t.saturatedFatG} IS NULL OR ${t.fatG} IS NULL
          OR ${t.saturatedFatG} <= ${t.fatG}`),
    userSeqIdx: index("idx_entries_user_seq").on(t.userId, t.syncSeq, t.id),
    userUpdatedIdx: index("idx_entries_user_updated").on(t.userId, t.updatedAt),
    userTimestampIdx: index("idx_entries_user_ts").on(t.userId, t.timestamp),
    userLastOccIdx: index("idx_entries_user_last_occ").on(t.userId, t.lastOccurrenceAt),
    legacyMembersIdx: index("idx_entries_legacy_members")
      .using("gin", t.legacyMemberIds),
  }),
);
```

`idx_entries_user_ts` and `idx_entries_user_last_occ` together serve §3's R-L span-overlap prune, and fix the fact that `eating_records` has **no** timestamp index at all today (`queryEatingHistory`, `mcp/queries.ts:349-377`, range-scans unindexed). `idx_entries_legacy_members` is the GIN index the §5.8 union predicate needs.

**No `CHECK` on nutrient upper bounds, and no `CHECK` that `writeEntry` is not obliged to satisfy first** (§2.8). Ranges belong in the AI-response validators and the push Zod schema, not in a constraint that rejects a legitimately unusual meal and then drops the row after 8 silent retries.

**Three legacy tables** each gain `repairedIntoEntryId`, `repairedFromDeletedAt`, `repairTombstonedAt`, all nullable. Index only `repaired_into_entry_id` (partial, `WHERE repaired_into_entry_id IS NOT NULL`) — pass B and `revertRepair()` scan on it; the MCP predicate's hot path is the GIN index above.

### 5.2 Sync payload, the one non-LWW table, and the cursor column

Four list edits in `packages/db/src/sync-payload.ts`: `intakeEntriesRowSchema = createInsertSchema(schema.intakeEntries).omit({ userId: true, syncSeq: true })` (pattern at `:44-97`); a discriminated-union arm keyed `"intakeEntries"`; an entry in `schemaByTableName` (the declared source of truth per `sync-payload.property.test.ts:437-438`); and the `tableNameSchema` enum.

The jsonb columns need explicit zod shapes rather than drizzle-zod's default `any`: `entryOccurrenceSchema`, `entryComponentSchema` (recursive, `z.lazy`, **max depth 2, max 30 children per level**), `fieldProvenanceSchema` and `z.array(z.string()).max(200)` for `legacyMemberIds`, `.extend()`ed onto the row schema. Without a cap, a hallucinated 200-node tree lands in the push body.

**The push Zod schema mirrors every relational invariant** — the five relations of §2.4 R5, nutrients `>= 0`, `nameKey !== ""`, `Number.isFinite` on every numeric including both occurrence projections, canonical occurrence order, and `deletedAt != null ⟺ zero live occurrences` — as `.superRefine`s. A violation returns `code: "invalid"` and is surfaced and dropped **loudly on attempt 1** instead of failing a DB CHECK and being abandoned silently after 8.

#### `syncSeq` — a server-owned pull cursor for this table only

An occurrence union "in the losing branch too", with nothing said about `updated_at`, is **undeliverable**. Pull is a keyset cursor on `(updated_at, id)` — verified at `pull/route.ts:94-106`:

```ts
.where(and(…, or(gt(table.updatedAt, cursorUpdatedAt),
                 and(eq(table.updatedAt, cursorUpdatedAt), gt(table.id, cursorId)))))
.orderBy(asc(table.updatedAt), asc(table.id)).limit(PULL_SOFT_CAP + 1)
```

Phone taps `+1` at 10:00 (occurrences `{o1,o2}`), pushes, server row `updated_at = 10:00`. Tablet was offline and tapped `+1` at 09:50 (`{o1,o3}`, `updatedAt 09:50`); it reconnects and its op hits the skip branch (`push/route.ts:275-278`). A union applied there makes the server set `{o1,o2,o3}` but leaves `updated_at` at 10:00 — the laptop's cursor is already past 10:00 and never re-fetches, the phone never re-fetches, both show 2 lollies forever and the truth is 3, with no error. Bumping `updated_at` instead is not free either: it makes a third device's genuinely newer scalar edit lose LWW against a timestamp that carries no scalar intent.

**Decision: a dedicated, server-owned cursor column.**

- `intake_entries.sync_seq bigint NOT NULL`. **Server-owned: it is NOT a field on `IntakeEntry`, is `omit`ted from the push row schema, is added to `DRIZZLE_ONLY_EXEMPTIONS` alongside `userId` (`schema-parity.test.ts:32`), and is stripped by `verify-hash` exactly as `userId` already is (`verify-hash/route.ts:59`)** — so parity, push validation and the migration wizard's hash all stay correct with no client-side counterpart.
- **Push assigns it** on every server-side change to the row: `sync_seq := GREATEST(serverNow, COALESCE(serverRow.sync_seq, 0) + 1)`. That includes the **LWW-losing branch when — and only when — the occurrence union actually changed the stored set**. `updated_at` is untouched in that branch, so LWW semantics for every scalar column are exactly as documented today.
- **Pull for `intakeEntries` keys on `(sync_seq, id)`** instead of `(updated_at, id)`, served by `idx_entries_user_seq`. `_syncMeta` stores the `syncSeq` cursor for this table. The existing 30 s skew clamp (`SKEW_MARGIN_MS`, `sync-engine.ts:56`) applies to it unchanged and is still required: `push/route.ts` has no transaction, so a row assigned `sync_seq = T` can commit after a concurrent reader has already passed `T`.
- **Delivery is provable:** any change to the row — scalar, occurrence-only, or both — strictly advances `sync_seq` beyond every cursor value already issued, so every device re-fetches it on its next cycle.
- **Property test at the ENGINE level, three devices, one loser** — not just the `unionOccurrences` commutativity test in `packages/core`, which cannot see cursor delivery. Phone `+1` at 10:00 pushes; tablet (offline, `+1` at 09:50) reconnects and loses LWW; laptop's cursor is already past 10:00. Assert all three devices converge on **three** live occurrences.

#### `clientSchemaVersion` heartbeat

Every push body gains an optional `clientSchemaVersion: number` (the pushing device's `DB_SCHEMA_VERSION`); the route records `{userId, deviceId, clientSchemaVersion, lastSeenAt}` in a small `device_heartbeats` table. This is what makes pass B's gate ("v23 live on every registered device", §6) evidence rather than a guess. It is additive and a v22 client simply omits the field.

#### The per-table merge

**`intakeEntries` is the one table whose merge is not whole-row LWW.** Both sides gain a per-table branch:

- **Push (`push/route.ts`), in the winning branch, the losing branch, AND the Rule-1 branch.**
  ```
  merged := unionOccurrences(serverRow.occurrences, incoming.occurrences)
            // union by id; per-id LWW on removedAt; at := min(a.at, b.at)
            // on id collision; emit canonical order (at asc, id asc)
  { timestamp, lastOccurrenceAt, deletedAt } := projectOccurrences(merged)
  assert Number.isFinite(timestamp) && Number.isFinite(lastOccurrenceAt)
  ```
  Every other column follows the existing LWW rules unchanged. `sync_seq` is bumped iff `merged ≠ serverRow.occurrences`.
- **Push Rule 1 is named and decided.** It is easy to overlook, and left alone it silently destroys occurrences. `push/route.ts:212-222` short-circuits **before any merge** and **unconditionally on `updatedAt`**: a live incoming row against a server tombstone is acked with no write. This is reachable through ordinary V2 use, because §2.5 makes removing the last live occurrence soft-delete the entry:
  > Entry "Ice lolly", one occurrence. Phone removes it at 20:00 → `deletedAt = 20:00`, pushes, server tombstoned. Tablet (offline since 19:00) taps `+1` twice → `{o1,o2,o3}`, `deletedAt: null`, `updatedAt: 20:30`. Tablet reconnects: Rule 1 fires regardless of 20:30, the op is acked with **no write**, `ack()` removes it from `_syncQueue`, and the chained pull applies the server tombstone. The user ate three lollies; every device shows the entry gone, the day's water 0 ml, and nothing left in the queue to retry. The same rule makes `undoDeleteEntry` unsyncable: undo restores locally, the server refuses the write, the next pull re-deletes it on the user's own screen.

  **Decision: for `intakeEntries` only, the Rule-1 branch unions occurrences and re-evaluates `deletedAt` from the merged set.** A live incoming row carrying occurrence ids the server tombstone lacks **revives** the entry (`deletedAt` becomes null by projection); an incoming row carrying no new occurrence ids leaves the tombstone standing, exactly as Rule 1 intends. This is coherent rather than an exception: with `deletedAt` derived (§2.1 Call 4), "resurrect a tombstone" is not a scalar-LWW question at all — it is a question about the occurrence set, and the set is a join-semilattice. Rule 1 is unchanged for all 18 other tables. The two convergence sequences of §2.5 and this one are property tests.
- **Pull (`sync-engine.ts:539-546`):** for `intakeEntries` only, replace the blanket `bulkPut` with a read-merge-put that unions occurrences and re-projects against the local row before writing. Every other column stays server-authoritative, exactly as today.

`unionOccurrences` and `projectOccurrences` live in `packages/core/src/occurrences.ts`, are called by both sides, and carry commutativity / associativity / idempotence property tests **plus** an explicit empty-live-set test asserting the soft-deleted projection and the absence of `±Infinity`.

### 5.3 Backup / export format versioning

Specified in §5.7, together with the restore-path changes it depends on.

### 5.4 Push order

Add `"intakeEntries"` to `TABLE_PUSH_ORDER` (`sync-topology.ts:28-55`) **FIRST — ahead of every other table.**

Converting a group enqueues one entry upsert plus one mark per member; a 200-group batch enqueues 400-1 400 ops against `PUSH_BATCH_CAP = 50`, so the split across batches is guaranteed. `collectAndOrderQueuedOps` (`sync-engine.ts:137-160`) FIFO-slices 50 ops and *then* regroups by `TABLE_PUSH_ORDER`, in which **`intakeRecords` sits at index 8 and `substanceRecords` at 9** (verified against the array). `push/route.ts` has no transaction, so even one batch can half-apply and still return 200. With entries last, a member mark can land while its entry does not.

With `intakeEntries` first, the residual half-applied state is always "entry present, legacy rows live but unmarked" — and **the §5.8 union is exact in that state anyway**, because it keys on `legacy_member_ids`, which the entry carries.

**Add a topology test** asserting `idx(intakeEntries) < idx(intakeRecords | eatingRecords | substanceRecords)`. Add nothing to `sync-topology.test.ts`'s `fkPairs` (`:44-58`) — that list is hardcoded and not derived, so an entry there would be a lie. Update the file's header comment, which says "the 18 Dexie/Neon data tables".

**The topology test must ASSERT insertion order rather than assume it.** §5.4's guarantee rests on an unstated premise: conversion enqueues the entry and its members inside one transaction with a single `now`, and `collectAndOrderQueuedOps` slices by `orderBy("enqueuedAt").limit(50)`, so the intra-batch order for tied `enqueuedAt` depends on Dexie's secondary ordering by the `++id` primary key. The test seeds one conversion transaction and asserts the entry op precedes its member ops in the collected batch.

### 5.5 Pull

Beyond the occurrence merge and the `syncSeq` cursor (§5.2), no change to `pull/route.ts` other than it picking up the new key from `schemaByTableName` automatically. Precedent that a table can be one-way: `auditLogs` is filtered out of pull at `pull/route.ts:71`. `intakeEntries` is **two-way**.

### 5.6 `userProfile` gains the day boundary — plus the backfill that makes it reach the existing corpus

`dayStartHour: number | null` and `homeTimezone: string | null` are added to `UserProfile` (`records.ts:408-418`) and `user_profile`.

A mirror writer on its own reaches nobody. Verified: `getUserProfile()` returns `emptyProfile()` with `id: ""` when no row exists (`profile-service.ts:31-43`, `:67-75`), and a row is only minted on the first explicit save; the profile is a medical-conditions form most users never open. `dayStartHour` today lives only in localStorage (`settings-store.ts:66`). So an existing Europe/Berlin user who set `dayStartHour = 4` a year ago and never touched it again writes no profile row, MCP finds nothing, falls back to 2, computes it with `setHours` in the Vercel process's UTC zone — and the 750 ml divergence §3 claims to have fixed is still present for every pre-existing user.

**Deliverables, all three:**

1. **One-time backfill.** On first boot after R0, if no active `userProfile` row exists **or** `dayStartHour` is null on it, write the current localStorage `dayStartHour` and `Intl.DateTimeFormat().resolvedOptions().timeZone` into the profile (minting the row if needed) and **enqueue it**. Guarded by a `_repairState.dayBoundaryBackfilledAt` flag so it runs once.
2. **Mirror writer.** `setDayStartHour` writes localStorage **and** the profile row (localStorage stays the offline-fast read; the profile row is the synced truth and wins on conflict).
3. **One read-side fallback order, identical on both sides: `profile.dayStartHour` → localStorage → `DEFAULT_DAY_START_HOUR` (2).** `date-utils.getDayStartTimestamp` and `mcp/queries.ts:45-59` both implement exactly that order, so the two cannot disagree while the backfill is in flight. MCP has no localStorage, so its middle term is "the last `dayStartHour` any push carried" — the profile row itself once it lands, and `push_settings.day_start_hour` (the current source) until then. `mcp/queries.ts` computes the boundary in `homeTimezone`, not the server process zone. `push_settings.day_start_hour` stops being the day-boundary source; the `/api/push/settings` writer that hardcodes `2` (`route.ts:23-28`) is left alone or fixed to mirror, but it is no longer authoritative.

### 5.7 Backup / restore

`CURRENT_BACKUP_VERSION` (`backup-service.ts:95`) goes **5 → 6**, and — for the first time — the number must actually be *read*. Today `validateBackupData` (`:350-380`) checks only `typeof backup.version === "number"`: no version switch, no upcast, no minimum, no future-version rejection.

1. `BackupData` gains `intakeEntries?: IntakeEntry[]` (`:38-61`). `table-sync.test.ts:25-27` parses this interface with `/export interface BackupData\s*\{([^}]+)\}/s` — `[^}]+` means **a nested object type inside `BackupData` breaks the parse**. Keep the new key a plain array reference.
2. `backup-schemas.ts`: an `intakeEntrySchema` (`.passthrough()`, per the file's convention at `:15`), plus entries in `BackupTableName` (`:166-184`), `BACKUP_SCHEMAS` (`:186-205`) and `BACKUP_VALIDATORS` (`:213-232`).
3. **One upcast mechanism, and §4.6 now guarantees it stays viable.** A `version <= 5` file imports its legacy rows into the (retained, empty) legacy stores unchanged; the reconciler is then seeded with the ids just written (§4.2 step 1 iii). No import-time fold exists; there is one fold, in one place. This choice is only safe *because* §4.6 commits to never dropping the three stores — the two decisions are a pair and neither may be revisited alone.
4. **`importBackup` must enqueue.** It calls `table.bulkPut(toImport)` directly (`:420`, `:607`) with zero `_syncQueue` hits, so a restore never reaches the server — and, because pull `bulkPut`s unconditionally, the next pull can overwrite the restored rows. Replicate the v22 hook's hand-rolled enqueue.
5. **Route `intakeEntries` through `mergeTableWithConflicts` (`:386-423`), not `importHealthTable`.** The latter is skip-on-id-collision with no conflict detection (`:587-610`), and with deterministic anchor ids a collision is now *likely*. Union occurrences rather than picking a winner.
6. **Fix the pre-existing `potassium` bug in the same PR.** `backup-schemas.ts:43` validates `z.union([water, salt, sugar])` with no `"potassium"`, so every potassium record in every backup is silently dropped on import (`result.skipped++`, `backup-service.ts:596-598`). Nothing tests it. It will otherwise corrupt the V1 corpus we are about to migrate. **Independently shippable today** — R0.
7. **CSV/PDF export gains a format version**, and the PDF "Recent Records" lexicographic date sort is fixed in the same pass (§3).
8. **Test:** restore a real v5 fixture against the v24 schema (§4.6).

### 5.8 MCP transition — the external contract

`intake_entries` is empty on the server until pass A runs for the account, and MCP is consumed by claude.ai over OAuth. **MCP must NOT be cut over in the same release as the client.** If it is, `get_today_summary` sums an empty table and answers `water_ml: 0` while the phone shows 1 750 ml, and `query_substance_history` — documented in `tools.ts:228` as *"the authoritative source for alcohol and caffeine intake"* — returns nothing.

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

The third clause is the load-bearing one. Relying on `repaired_into_entry_id` alone contradicts §5.4's decision to push `intakeEntries` **first**: with entries first, a batch can carry the entry upsert while the member marks sit in a later batch, and during a 30 k-op drain that window is minutes to hours. In that window the entries arm sums the 19:04 Aperol Spritz (500 ml) **and** the legacy arm sees the water row still unmarked (`deleted_at IS NULL AND repaired_into_entry_id IS NULL`) and adds another 500 — `water_ml: 1000` against a phone showing 500. The `legacy_member_ids` clause closes it because **the entry carries its own membership as data**: whenever the entry exists, its members are excluded, whatever any later batch has or has not done. It needs no second SQL implementation of the fold — the fold already emitted the list. Served by `idx_entries_legacy_members` (GIN). **Prove it against a half-drained push batch, not a quiesced one:** an integration test that lands only the entry op and asserts `get_today_summary` returns 500.

**The convergence signal is a query-time predicate, not a latched timestamp.** The obvious alternative — a `user_profile.v2ConvergedAt` set when a pass leaves zero live legacy rows and "cleared if a later push resurrects any" — does not work, because that clearing condition **can never fire** — `push/route.ts` Rule 1 makes a tombstone unresurrectable at any `updatedAt` (§4.4) — so the marker latches on the first clean pass and MCP drops its legacy arm permanently. But a stale V1 device pushing a **new** row is an insert (`!serverRow` → upsert), which lands live with `repaired_into_entry_id` NULL and does not touch the marker. Concrete: the old tablet logs 2 000 ml on 2026-09-14; the phone's v23 app never converts it (it is not in that device's pull-seed set until the tablet's rows reach it); the user asks Claude "how much water today?" and `get_today_summary` answers `water_ml: 0` while the tablet shows 2 000 ml.

So the legacy arm is included **whenever, at query time,**

```sql
EXISTS (SELECT 1 FROM intake_records WHERE user_id=$1 AND deleted_at IS NULL
          AND repaired_into_entry_id IS NULL)
   OR EXISTS (… eating_records …) OR EXISTS (… substance_records …)
```

is true — three index-assisted existence checks per call. A straggler's new rows re-enable the union automatically; a fully converged account pays three cheap `EXISTS` probes and reads entries only. **Nothing needs to clear a marker, so `push/route.ts` needs no per-op hook on the three legacy tables** — which any latched-marker scheme would have required, and which §8 therefore does not list among the route's changes.

**Tool input enums**: `query_intake_history.type` (`tools.ts:147-149`) is a client-visible Zod enum. During the window it keeps accepting `water|salt|sugar|potassium` and maps them onto nutrient columns; it gains the new nutrient names additively. `query_substance_history` is **retained**, reading the union, and deprecated in its description rather than deleted. `docs/mcp-connector.md` documents the window and the additive enum, not a "hard break".

**Stale-client safety of the markers, stated explicitly because the union depends on it:** `sanitizeRow` iterates **the parsed row's own keys** (`push/route.ts:66-72`, verified), and `createInsertSchema` strips unknown keys without materialising absent optional ones — so a v22 client's whole-row upsert of an `intakeRecords` row does **not** null out a `repaired_into_entry_id` it knows nothing about. The marker survives stale-client writes.

### 5.9 Parity-test implications

Everything below fails the build until updated:

| File | Change |
|---|---|
| `apps/web/src/__tests__/dexie-schema-extractor.ts:45-64` | `TABLE_TO_INTERFACE`: add `intakeEntries: "IntakeEntry"`. **Throws a hard error if omitted** (`:128-133`). |
| `apps/web/src/__tests__/schema-parity.test.ts:32` | `DRIZZLE_ONLY_EXEMPTIONS` gains `"syncSeq"` (§5.2). Keep it a compile-time constant with no env escape hatch. |
| `apps/web/src/__tests__/schema-parity.test.ts:51-52` | `toHaveLength(18)` → `19`; add `intakeEntries` to the name list at `:55-75`. |
| `apps/web/src/lib/sync-payload.property.test.ts:51-70`, `:458` | `KNOWN_TABLES` + `toHaveLength(18)` → `19`. |
| `apps/web/src/__tests__/sync-topology.test.ts:24-27` | 18/18 → 19/19; **plus the ordering and insertion-order assertions** (§5.4). |
| `apps/web/src/__tests__/integrity/schema-consistency.test.ts:17`, `:26` | versions `toHaveLength(13)` → `14`, version list gains `23`; `latest.tables` `21` → `23`. |
| `apps/web/src/__tests__/migration/dexie-v16.test.ts:249-259` | expected table-name array + `toHaveLength(21)` → `23`. |
| `apps/web/src/__tests__/integrity/table-sync.test.ts:71-90` | `TABLE_TO_FIXTURE` gains `intakeEntries`; add `_repairState` to `NON_BACKUP_TABLES` (`:94`). |
| `apps/web/src/__tests__/fixtures/db-fixtures.ts` | `makeIntakeEntry()` — required by the above. |
| `apps/web/src/__tests__/fixtures/scenarios.ts:57-58, 89-90` | optional seeding hooks. |
| `apps/web/src/app/api/sync/verify-hash/route.ts:59` + `migration-service.ts:36-48` | strip `syncSeq` alongside `userId`; assert canonical occurrence array order on both sides. |
| `apps/web/scripts/verify-schema.ts:32` | `EXPECTED_TABLE_COUNT = 31` → `32` (CI job at `.github/workflows/ci.yml:339`). |
| `apps/web/scripts/reset-neon-db.ts` | `TABLES` list. |

**Two hazards specific to writing the interface**, both from `dexie-schema-extractor.ts`:
- Declare `IntakeEntry` as an `interface` with **no `extends`**. The walker reads only own `node.members` (`:108-116`). A shared `NutrientFields` mixin — the obvious DRY move — would make every nutrient invisible to the parity test, which would then pass while the Drizzle table had 18 unmatched columns. **Write the 18 fields out longhand.**
- Keep `IntakeEntry`, `EntryComponent`, `EntryOccurrence`, `FieldProvenance`, `MeasurementBasisRef` and `NutrientKey` all in `packages/types/src/records.ts`. The extractor does a single-file `ts.createSourceFile` parse (`:92-98`) with no module resolution.

Also note the `parse-schema.ts` regex constraints on `db.ts` (`:44`, `:101`): the version receiver must literally be `realDb`, and **no store-map value may contain a `}`**.

**`PREVIEW_STORES` is a live landmine, not a stale comment.** It is `{...V15_STORES, _syncQueue, _syncMeta, _errorLogs, userProfile, insightReports}` (`db.ts:705-712`) and is stamped with `DB_SCHEMA_VERSION` (`db.ts:726`, `:657` — verified `= 22`). Bumping the constant to 23 without adding `intakeEntries` and `_repairState` to that map declares a v23 preview database whose store set is v22's — every preview component touching `db.intakeEntries` throws. The doc comment at `:701` also still says "(v19)". **Fix the content, fix the comment, and add the missing guard**: a test asserting `PREVIEW_STORES` equals the latest version's stores, and a test asserting `DB_SCHEMA_VERSION` equals the highest `realDb.version(N)`. Neither exists today.

### 5.10 Other server-side lists that must be updated (none has a drift guard)

- `apps/web/src/app/api/sync/cleanup/route.ts:10-27` — `DELETION_ORDER`. **Already drifted**: missing `userProfile` and `insightReports`. Fix while adding `intakeEntries`. **Independently shippable today.**
- `apps/web/src/lib/user-data-deletion.ts:42-61` — `SYNCED_DELETION_ORDER`.
- `apps/web/src/lib/data-deletion-service.ts:21` — derives from `TABLE_PUSH_ORDER` so it picks `intakeEntries` up for free, but its `createdAt` filter is wrong for this table (§3).
- `apps/web/src/lib/mcp/queries.ts` + `tools.ts` — §5.8.

---

## 6. RELEASE SEQUENCE

Each step names its contents, its **hard precondition**, and its gate. Two properties of the sequence are structural: the server conversion is split (pass A before the client, pass B after), and R3 is split so the read cut-over and the UI rewrite are separable.

### R0 — Independently shippable now, before anything else

1. **`backup-schemas.ts:43` potassium** — silent data loss on every restore, right now, and it will corrupt the V1 corpus this migration reads. Ship first.
2. **`DELETION_ORDER` drift** (`cleanup/route.ts:10-27`).
3. **`sanitizeForAI`'s unconditional 500-char truncation** (`packages/core/src/security.ts:73-77`) against voice-parse's 2 000-char cap — two-thirds of long transcripts are discarded today. Parameterise the cap.
4. **Extract `findToolUse`** into `api/ai/_shared/` (currently five verbatim copies).
5. **Day-boundary unification** (§3, §5.6) — the two `userProfile` columns, the **one-time backfill**, the mirror writer, the single fallback order in `date-utils` and `mcp/queries.ts`. A schema change, but independent of `intake_entries`, so it ships on its own with its own migration.
6. **Forced service-worker update check** (§4.4) + the `clientSchemaVersion` push heartbeat (§5.2). Must be deployed and confirmed working before pass B, because its whole job is closing the stale-V1-client window and supplying the evidence pass B is gated on.
7. **PDF "Recent Records" date sort** (`export-service.ts`) — lexicographic on `"MMM d, HH:mm"` today.

**Gate:** existing e2e suites green; the day-boundary backfill observed writing a profile row on a device that had never opened the profile form.

### R1 — Server schema and payload

`CREATE TABLE intake_entries` (with `sync_seq` and the GIN index); the three columns on each legacy table; `sync-payload.ts`; `TABLE_PUSH_ORDER` with `intakeEntries` first; the occurrence-union merge in `push/route.ts` **including the Rule-1 branch**; the `(sync_seq, id)` cursor in `pull/route.ts`; `device_heartbeats`. No client change ships in this deployment.

**Precondition:** R0 item 6 deployed (so heartbeats start accumulating immediately).
**Gate:** a v22 client is unaffected (existing e2e sync suite against the deployed server); `POST /api/sync/push` accepts a hand-crafted `intakeEntries` op; the three-device `syncSeq` delivery test passes against the deployed route.

### R2 — Server-side conversion, PASS A only (mark, do not tombstone)

`POST /api/sync/convert-v2?pass=a` plus `packages/core/src/legacy-fold.ts`. Writes `intake_entries` (with `legacy_member_ids`), stamps `repaired_into_entry_id` on every member, **leaves `deleted_at` untouched**. Idempotent, resumable, re-invocable.

**Hard preconditions:** the server-side snapshot of the three legacy tables taken and hash-verified inside the job before the first write, with the restore procedure of §4.1 documented and rehearsed on a staging account.
**Gate:** dry-run reconciliation report reviewed (per-account counts, dedup totals, any group the fold would skip, any anchor collision); after the real run, a server-side evaluation of P3/P7a/P7b **on real data**; `SELECT count(*) FROM intake_records WHERE user_id=$1 AND deleted_at IS NULL AND repaired_into_entry_id IS NULL` matches the expected straggler count (normally 0).

**What the user sees during R2: nothing.** Every V1 read path keys on `deleted_at`, which pass A does not touch. That is the entire point of the split.

### R3a — Client: Dexie v23, the reconciler, entries as a SHADOW model

Dexie v23 + `_repairState`; `entry-service.ts` (`writeEntry`, `updateEntry`, `addOccurrence`, `removeOccurrence`, `scaleEntry`, `deleteEntry`, `undoDeleteEntry`, `enrichEntry`, `rollupComponents`, `updateComponent`, `addComponent`, plus the §2.8 mint-time validator); `legacy-entry-repair.ts` (step 0 pre-pass, the reconciler, `revertRepair()`); the pull-side occurrence merge and `syncSeq` cursor; `packages/core/src/{legacy-fold,occurrences,measurement-basis,component-units}.ts`.

**The V1 UI and every V1 read path remain the only rendered surface.** Legacy rows are still live (pass A does not tombstone), so they render exactly as before. `intakeEntries` is populated, synced and validated, and is read by **nothing user-facing** except a Debug-panel verification view. **This is not a dual-read window**: entries are not a read source for any metric.

**Why this split is possible:** it is a direct consequence of pass A not tombstoning. It removes the concentration of risk in a single step — R3 no longer bundles Dexie v23, the reconciler, the pull merge, deletion of every V1 path and the whole UI in one PR.

**Gate — and it is the strongest gate in the sequence:** a client-side **shadow reconciliation** runs over the last 90 days and compares, per day and per nutrient, `TOTAL(k, day)` over entries against the V1 `getDailyTotal`/substance sums, reporting any day that differs by more than float tolerance into `_repairState` and the Debug panel. **Zero divergent days on a staging account with a five-year synthetic corpus, and zero on the author's own account, before R3b.** Plus P1-P9 green; reconciliation counters report zero skipped groups and zero anchor collisions; `revertRepair()` round-trips.

### R3b — The read/write cut-over and the V2 UI

Deletion of every V1 read and write path in one PR (a deleted function cannot be called by a forgotten screen); the V2 dashboard, history and edit surfaces; `optionalTrackers` demoted to a display filter; the settings/limits registry.

**Precondition:** R3a's shadow reconciliation clean for at least one full week of live use.
**Gate:** the same shadow comparison, now inverted — the last V1-computed totals recorded before the cut-over match the V2 totals rendered after it.

### R3c — PASS B (tombstone the legacy corpus)

`POST /api/sync/convert-v2?pass=b`, plus lifting the client reconciler's "do not tombstone" flag.

**Hard precondition, stated as a gate and not a guess: the v23 client confirmed live on EVERY registered device**, evidenced by `device_heartbeats.clientSchemaVersion >= 23` for every device that has pushed in the last 90 days, with any older device either seen upgraded or explicitly retired by the user. Until then, pass B does not run, and the cost of waiting is only that the MCP union keeps its (exact) legacy arm.

**Gate:** P6 evaluated server-side; the day-list and daily totals unchanged across the tombstoning, on every device.

### R4 — MCP cut-over

Only after the §5.8 `EXISTS` predicate reports no live unconverted legacy rows across a full pull cycle from every registered device. Until then MCP reads the de-duplicated union, which is exact from R2 onward. `docs/mcp-connector.md` updated in the same deployment. Note the union arm never has to be *removed* — the `EXISTS` predicate turns it off and on by itself.

**Gate:** `get_today_summary` returns identical numbers via the union path and the entries-only path for a sample of days, including one day sampled **mid-push-drain**.

### R5 — AI endpoint replacement

`/api/ai/entry-parse`; voice-parse's food/drink arms; retirement of `parse`, `substance-lookup`, `substance-enrich`. Independent of R4 and can precede it; kept separate from R3b so a prompt regression does not roll back the schema.

### R6 — Empty (never drop) the legacy tables

Gated on the §5.8 predicate reporting no live unconverted rows for a sustained period. The three Dexie stores and the three Postgres tables **remain declared and empty** (§4.6) so every existing backup file stays restorable; only their rows go. The pre-v2 server snapshots are retained until this point and dropped with it.

### Rollback

**v23 is a one-way door at the device level. Once any device opens the Dexie v23 database, the V1 bundle is permanently unreachable on that device.** Dexie opens IndexedDB at `version × 10`, so a v23 device is at IDB 230; a redeployed v22 bundle calls `open(name, 220)`, which the IndexedDB specification answers with a `VersionError` and a rejected `db.open()`. `isDatabaseClosedError` / `recoverClosedDatabase` (`db.ts:665-698`, verified) walk the `cause` chain for `DatabaseClosedError` **only**, so nothing catches it: the app fails to start — including the backup/export screen the user would need to rescue their data — and R0's forced service-worker update makes the broken bundle land promptly on every device. A V1 build against converted data does not render empty; it does not render at all.

Consequently:

- **The single supported rollback is: keep the v23 client, and run `revertRepair()` client-side and server-side.** Rolling the *client* back is not a rollback and must never be attempted. The two halves of that sentence are the same statement, not a contradiction: `revertRepair()` exists only in the v23 bundle, so reverting the data requires keeping the v23 bundle installed.
- **`revertRepair()` must be reachable from a surface that still renders when entry reads are broken.** That surface is the Debug panel, which reads tables directly (`db.table(...).orderBy(...)`, `debug-panel.tsx:421`) and depends on no entry service. A "Revert V2 migration" action lives there, behind a typed confirmation, from R3a onward.
- **For a device whose database will not open, the pre-migration backup is the only recovery.** That is why the client backfill gate (§4.2 step 1) requires a validated export in-session, and why the server snapshot (§4.1) exists for the corpus.
- **The revert window closes the day R3b ships.** `revertRepair()` tombstones only entries with `entrySource === "migration"`; any V2-native entry created after the cut-over has no V1 representation and is destroyed by a revert. P8 does not cover it and cannot. State this to the user before R3b, not after.

---

## 7. AI CONTRACT CHANGES

### 7.1 The endpoint

`POST /api/ai/parse` is replaced by `POST /api/ai/entry-parse`, returning a **root entry with children and a full nutrient set**. `/api/ai/voice-parse` keeps its multi-item envelope but each item's food/drink payload becomes the same root-entry object. `/api/ai/substance-lookup` and `/api/ai/substance-enrich` are **retired** — their jobs (per-100 ml caffeine, ABV, water content) are subsumed by a root entry with `servingVolumeMl` + `waterMl` + `caffeineMg` + `alcoholG`.

**What happens to the preset model, since `substance-lookup` is its only writer.** `LiquidPreset.caffeinePer100ml` / `alcoholPer100ml` / `saltPer100ml` / `waterContentPercent` live in unsynced localStorage (`constants.ts:111-123`) and are the only per-unit nutrient basis that exists today. Under V2 they are **superseded, not migrated in place**: a preset becomes "a saved `IntakeEntry` template" — a per-unit nutrient vector plus `servingVolumeMl`/`servingMassG`, stored as a soft-deleted `intakeEntries` row flagged `entrySource: "preset"` with zero occurrences, so it syncs, backs up and carries provenance like everything else. A one-time settings migration converts each existing `LiquidPreset` into one such row by multiplying its per-100 ml figures by `defaultVolumeMl / 100`, and `entrySource: "preset"` in §2.7 refers to that row. `preset` remains a legal `entrySource` on logged entries, meaning "minted from a template".

Model: `CLAUDE_MODELS.quality`, `temperature: 0`, `tools: [WEB_SEARCH_TOOL, ENTRY_PARSE_TOOL]`, `max_tokens: 8192` — raised from 4096 (`parse/route.ts:89`) because a decomposed tree with 18 nutrients per node will not fit in the old budget. Voice-parse must rise from its current **2048** (`voice-parse/route.ts:87`) for up to 20 items; cap components per item at 8 there.

Keep the existing skeleton verbatim: `withAuth` → IP rate limit → `parseJsonBody` → zod request → `getClaudeClientForUser` → `sanitizeForAI` → `messages.create` → `recordUsage` → `findToolUse` → **second turn with `tool_choice` forced and the prior assistant content replayed** → zod response. Preserve the comment about keeping `WEB_SEARCH_TOOL` declared on the forced turn.

### 7.2 The tool schema

```jsonc
{
  "name": "parse_intake_entry",
  "description": "Return ONE root consumption entry with its ingredient breakdown and full nutrition.",
  "input_schema": {
    "type": "object",
    "properties": {
      "name":        { "type": "string", "description": "Short user-facing title, e.g. 'Aperol Spritz', 'Cheeseburger'. Title case. No quantities in the name." },
      "kind":        { "type": "string", "enum": ["drink", "food", "supplement", "other"] },
      "unit_count":  { "type": "integer", "minimum": 1, "description": "How many identical units the description implies. '2 beers' -> 2. Default 1. The app records one occurrence per unit." },

      "serving_volume_ml": { "type": ["number", "null"],
        "description": "Physical liquid volume of ONE unit, in ml. The size of the glass. null for solids — including any solid food, however moist." },
      "serving_mass_g":    { "type": ["number", "null"],
        "description": "Mass of ONE unit, in grams. null if unknown." },

      "nutrients": { "$ref": "#/$defs/nutrients",
        "description": "Nutrition for ONE unit. Every key required; use null for UNKNOWN and 0 only when you know the value is zero. Never omit a key." },

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
            "description": "How much of this component is present in ONE UNIT OF THE ROOT, in `unit`. Three slices of cheese in one cheeseburger is amount 3, unit 'slice' — or amount 60, unit 'g'. There is NO separate count field: do not also report a quantity." },
          "nutrients":{ "$ref": "#/$defs/nutrients",
            "description": "This component's contribution to ONE UNIT OF THE ROOT — i.e. already the figure for `amount` of it, NOT per single slice/gram. Nothing multiplies these values by anything. If this component itself has sub-components, these values remain authoritative for it — the sub-components explain it, they do not replace it." },
          "components": {
            "type": "array", "maxItems": 8,
            "description": "Sub-components. Max ONE further level; do not nest deeper. Sub-components are never summed into anything.",
            "items": { "$ref": "#/$defs/componentLeaf" }
          }
        },
        "required": ["id", "name", "unit", "amount", "nutrients"],
        "additionalProperties": false
      },
      "componentLeaf": {
        "type": "object",
        "properties": {
          "id":       { "type": ["string", "null"] },
          "name":     { "type": "string" },
          "unit":     { "type": "string", "enum": ["g","mg","ml","cl","l","piece","slice","shot","scoop","leaf","clove"] },
          "amount":   { "type": ["number", "null"] },
          "nutrients":{ "$ref": "#/$defs/nutrients" }
        },
        "required": ["id", "name", "unit", "amount", "nutrients"],
        "additionalProperties": false
      },
      "nutrients": {
        "type": "object",
        "properties": {
          "water_ml":        { "type": ["number","null"], "description": "ml of WATER CONTENT in one unit — NOT the glass volume. A 200 ml spritz is ~180 ml water; a 40 ml neat spirit is ~24 ml; a 150 g apple is ~127 ml. Dissolved sugar and sodium do NOT reduce it. Must never exceed serving_volume_ml when that is non-null." },
          "energy_kcal":     { "type": ["number","null"], "description": "kcal, never kJ. INCLUDES the energy from alcohol (7 kcal/g) and from fibre (2 kcal/g). Do not report a figure that excludes alcohol." },
          "carbohydrate_g":  { "type": ["number","null"], "description": "TOTAL carbohydrate, INCLUSIVE OF FIBRE (US labelling convention). If your source uses the EU convention (carbohydrate excluding fibre), ADD the fibre back before reporting. Must be >= sugar_g and >= fibre_g." },
          "sugar_g":         { "type": ["number","null"], "description": "Total mono- and disaccharides, natural + added. EXCLUDES polyols/sugar alcohols. Must be <= carbohydrate_g." },
          "fibre_g":         { "type": ["number","null"], "description": "AOAC total dietary fibre. It is INCLUDED in carbohydrate_g. Must be <= carbohydrate_g." },
          "protein_g":       { "type": ["number","null"], "description": "Total protein (nitrogen x 6.25)." },
          "fat_g":           { "type": ["number","null"], "description": "Total fat as reported on a nutrition label (total lipid, glycerol backbone included). Must be >= saturated_fat_g." },
          "saturated_fat_g": { "type": ["number","null"], "description": "Saturated fatty acids. EXCLUDES trans fat. Must be <= fat_g." },
          "cholesterol_mg":  { "type": ["number","null"] },
          "sodium_mg":       { "type": ["number","null"], "description": "ELEMENTAL sodium in mg, NOT NaCl. If a source reports salt in grams, sodium_mg = salt_g * 393.4." },
          "potassium_mg":    { "type": ["number","null"], "description": "Elemental K+, total content." },
          "calcium_mg":      { "type": ["number","null"], "description": "Elemental, total content — no bioavailability adjustment." },
          "magnesium_mg":    { "type": ["number","null"], "description": "Elemental, total content." },
          "phosphorus_mg":   { "type": ["number","null"], "description": "TOTAL phosphorus including phytate-bound. Do not report an 'absorbable phosphorus' figure." },
          "iron_mg":         { "type": ["number","null"], "description": "Elemental, total content — do not split haem/non-haem." },
          "zinc_mg":         { "type": ["number","null"], "description": "Elemental, total content." },
          "alcohol_g":       { "type": ["number","null"], "description": "GRAMS OF PURE ETHANOL in one unit = serving_volume_ml * (ABV% / 100) * 0.789. Never report ABV, standard drinks, units, or grams-per-100ml here. Must never exceed 0.789 * serving_volume_ml." },
          "caffeine_mg":     { "type": ["number","null"] }
        },
        "required": ["water_ml","energy_kcal","carbohydrate_g","sugar_g","fibre_g",
                     "protein_g","fat_g","saturated_fat_g","cholesterol_mg","sodium_mg",
                     "potassium_mg","calcium_mg","magnesium_mg","phosphorus_mg",
                     "iron_mg","zinc_mg","alcohol_g","caffeine_mg"],
        "additionalProperties": false
      }
    }
  }
}
```

**On the component encoding.** A `quantity` + `unit` + `amount` triple is mutually redundant and renders ambiguously: "3 slices of cheese" is either `{quantity:3, unit:"slice", amount:3}` (amount duplicates quantity) or `{quantity:3, unit:"g", amount:60}` (60 total or 20 each — nothing said which), and an expanded row reading `{quantity} × {amount}{unit}` renders "3 × 3 slice" or "3 × 60 g" (implying 180 g). Worse, `quantity` shared a name with the root-level concept the whole document teaches readers to multiply by, so any consumer computing `quantity × nutrients` triples the component's sodium in the expanded view while the root shows the correct figure — the root/child contradiction §2.4 R3 claims is unreachable, arriving through the schema instead of through a sum. **`quantity` is deleted. `amount` is the whole magnitude present in one unit of the root, `nutrients` is already that magnitude's contribution, and nothing multiplies anything.**

**`unit` is enumerated and classified**, as data in `packages/core/src/component-units.ts` alongside `MEASUREMENT_BASES`:

```ts
export const COMPONENT_UNITS = {
  g: {cls:"mass", toBaseG: 1}, mg: {cls:"mass", toBaseG: 0.001},
  ml: {cls:"volume", toBaseMl: 1}, cl: {cls:"volume", toBaseMl: 10}, l: {cls:"volume", toBaseMl: 1000},
  piece: {cls:"count"}, slice: {cls:"count"}, shot: {cls:"count"},
  scoop: {cls:"count"}, leaf: {cls:"count"}, clove: {cls:"count"},
} as const;
```

so component amounts within a class are summable and a recipe is scalable. **Σ of component volumes is NOT expected to equal the root's `servingVolumeMl`** and no invariant relates them: ice, dilution, garnishes, evaporation and unlisted components all break it legitimately. The only rule is advisory — `writeEntry` warns (never adjusts) when Σ volume-class amounts exceeds `1.5 × servingVolumeMl`, which catches a model that reported per-100 ml figures in a component.

### 7.3 The seven contract rules that make this safe

**AI-1 — Every nutrient key is REQUIRED and NULLABLE.** This makes the three-state distinction (§2.3) survive the model and makes an AI-authored entry *applicable* for all 18 nutrients in §3's denominator. A missing key would be indistinguishable from "unknown"; forcing an explicit `null` makes the model decide, and lets `0` mean a real zero. Mirrors `PARSE_RESULT_TOOL`'s `["number","null"]` idiom (`packages/ai-prompts/src/parse.ts:61-95`).

**AI-2 — Root nutrients are authoritative; components never sum into anything, at any depth.** Stated for **both** levels: a composite component's own `nutrients` are authoritative for that component, and its sub-components explain rather than replace them. The **server-side reconciler is the enforcement**, because a prompt is an instruction, not a guarantee: `rollupComponents()` fills a root nutrient from `Σ depth-1 components` only where the root value is `null` and every **depth-1** component has a non-null value for that key (§2.4 R4). A discrepancy between a composite child's own value and Σ of its sub-components is **displayed, never repaired**.

**AI-3 — Per-unit only, and the count is separate.** `serving_*` and `nutrients` describe **one** unit; `unit_count` says how many, and the client materialises one occurrence per unit. This is what V1's `parse` endpoint could not express — it returned totals for an implicit portion and did not return the portion, which is why "+1" was impossible on that path.

**AI-4 — Search provenance is verified, not trusted.** Keep and generalise `hasCompletedWebSearch` (`substance-lookup/route.ts:45-52`), which inspects raw content blocks for a non-empty `web_search_tool_result` and hard-refuses with 422 `SEARCH_REQUIRED` when absent. Apply the gate when the request asks for a **branded or packaged** item; exempt generic whole foods and ABV, per the existing rationale at `route.ts:123`. `sources` copies the deployed pattern from `analytics-insights.ts:194-195, 216-221` — the only URL-citation mechanism already working in this codebase. **Note the interaction with AI-4 and §2.3: because the model may land on a US or an EU source for the same branded item, the compositional-basis language in `carbohydrate_g` and `energy_kcal` is not decoration — it is the only thing standing between a web-search result and a 10 g/day carbohydrate drift on identical foods.**

**AI-5 — Per-item resilience, and a depth cap.** Keep `extractVoiceItems`' per-item validation (`voice-parse/schema.ts:105-136`): a bad component is dropped and counted, not fatal. Extend it to components. Cap recursion at **2 levels** with an explicit `items` schema at each level and 20/8 breadth in the zod schema, because Anthropic tool schemas cannot enforce recursion limits (`voice-parse.ts:65-67` documents the analogous limitation).

**AI-6 — Component identity survives a re-run, or the merge is refused.** On re-enrichment the client sends the stored components (id + name + unit) in the user turn; the model echoes each `id` verbatim for a component it is updating and returns `null` for one it is introducing. Server-side: every echoed id must exist in the sent set or it is treated as `null`. Client-side: matching is **by id only** — never by name, because the model is free to re-word "Aperol" as "Aperol aperitif" and a name matcher would then destroy the user's correction silently. A stored component the model does not echo is deleted **unless** it carries any `provenance[*].origin === "user"` — and §2.6 now names the writer that can make that true (`updateComponent` / `addComponent`), without which the clause was unreachable. `mayAiWriteComponent` governs every field written into a matched component.

**AI-7 — Relational invariants are repaired at the API boundary.** The response zod runs the same repairs `writeEntry` runs (§2.8) before the payload reaches the client: `sugar_g > carbohydrate_g` and `fibre_g > carbohydrate_g` raise the carb; `saturated_fat_g > fat_g` raises the fat; `water_ml > serving_volume_ml` clamps the water; `alcohol_g > 0.789 × serving_volume_ml` clamps the alcohol and logs a suspected unit error; non-finite numbers are rejected. Every field arriving here has `origin: "ai"` by construction, so the provenance split of §2.8 never applies at this boundary — the "raise it silently" arm is always the right one, and the "reject with a validation error" arm belongs exclusively to user-authored input.

### 7.4 What the client persists from a response

```
name              := name
nameKey           := normalise(name) || entry.id
kind              := as returned
occurrences       := unit_count occurrences, all at `now` (or the parsed time)
servingVolumeMl   := serving_volume_ml
servingMassG      := serving_mass_g
<18 nutrients>    := nutrients[*]        — but ONLY where mayAiWrite(entry, key)
components        := merged BY COMPONENT ID (AI-6); never by name;
                     component fields written only where mayAiWriteComponent(c, key)
originalInputText := the sanitised user text        [MANDATORY — V1 dropped this
                       on all three of its AI write paths]
entrySource       := "ai_text" | "voice"
provenance[k]     := { origin: "ai", at: now, model: CLAUDE_MODELS.quality,
                       promptVersion: "entry-parse/1",
                       confidence: field_confidence[k] ?? confidence,
                       priorValue/priorOrigin when replacing a non-user value }
                     — stamped for ALL 18 keys, including those returned null
```

`reasoning` and `sources` are persisted into `provenance` under a reserved `provenance["_entry"]` key (not toasted-and-discarded as today, `food-section.tsx:281-287`), rather than duplicated 18 times.

**Disabled optional trackers must no longer drop data.** V1 discards AI-supplied sugar/potassium when the tracker is off (`food-section.tsx:272-277`, `voice-panel.tsx:228-242`). In a model where the AI fills all 18 nutrients, that is data loss on every entry. **Persist everything; `optionalTrackers` becomes purely a display filter.** This decouples "enabled tracker" from the `IntakeRecord.type` enum, which today makes enabling a tracker require a Drizzle migration (`optional-trackers.ts:12-17`).

### 7.5 Tests that land on this change

`parse/route.fuzz.test.ts` (the fast-check property `forall tool_block_input → status ∈ {200,400,422,429,502}`), `substance-lookup/enforce-search.test.ts` (235 lines guarding the search gate), and `voice-parse/schema.test.ts` (per-item resilience). All three need porting, not deleting. Add three more: AI-6's id-echo merge with a re-worded component name; the **latte case** from §2.4 R6 (one dictated drink → two items → one entry, asserted end-to-end through `reconcileLiquidItems`' V2 equivalent); and a compositional-basis test asserting that a returned `carbohydrate_g` less than `fibre_g` is repaired rather than stored.

---

## 8. BLAST RADIUS

Sizing: **trivial** = mechanical/list edit; **moderate** = real logic, bounded; **major** = rewrite or new file.

### Schema & types

| File | Change | Size |
|---|---|---|
| `packages/types/src/records.ts` | `IntakeEntry`, `EntryComponent`, `EntryOccurrence`, `FieldProvenance`, `MeasurementBasisRef`, `NutrientKey`; three fields ×3 legacy interfaces; `UserProfile.dayStartHour`/`homeTimezone` | major |
| `packages/db/src/schema.ts` | `intakeEntries` pgTable + CHECKs + 5 indexes + `sync_seq`; 3 legacy columns ×3 tables; 2 profile columns; `device_heartbeats` | major |
| `packages/db/migrations/0020_*`, `0021_*` + snapshots + `_journal.json` | generated, committed verbatim; **rebase rule of §4.8 applies** | trivial |
| `apps/web/src/lib/db.ts` | `AppDatabase` members; v23 block (repeat 21 stores + 2 new); `DB_SCHEMA_VERSION` 22→23; **`PREVIEW_STORES` content + comment + two new guard tests** (§5.9) | moderate |
| `packages/db/src/sync-payload.ts` | 4 list edits + recursive component/occurrence/provenance zod + relational `superRefine`s + `omit(syncSeq)` | moderate |
| `apps/web/src/lib/sync-topology.ts` | 1 array entry (first) + header comment | trivial |
| `packages/core/src/measurement-basis.ts` (new) | bases, input units, one NaCl fraction, both directions + round-trip property test | trivial |
| `packages/core/src/component-units.ts` (new) | enumerated units + mass/volume/count classification | trivial |
| `packages/core/src/legacy-fold.ts` (new) | the shared fold, called by server job and client reconciler | major |
| `packages/core/src/occurrences.ts` (new) | `unionOccurrences`, `projectOccurrences`, canonical ordering, property tests incl. empty-live-set | moderate |

### Migration

| File | Change | Size |
|---|---|---|
| `apps/web/src/app/api/sync/convert-v2/route.ts` (new) | server job, **pass A and pass B**, snapshot + hash + restore procedure | major |
| `apps/web/src/lib/legacy-entry-repair.ts` (new) | step-0 groupId pre-pass, client reconciler, `revertRepair()` | major |
| `apps/web/src/lib/sync-engine.ts` | seed the pass with pulled ids; occurrence merge + re-projection on pull; `syncSeq` cursor for one table; `_repairState.lastCompletePullAt` (the `pullComplete` gate — **does not exist today**, `anyHasMore` is a function-local at `:498-550`); re-entrancy flag; `clientSchemaVersion` on push | major |
| `apps/web/src/__tests__/migration/v23-repair.test.ts` (new) | properties P1-P9 incl. P2b and the split P7 | major |
| `apps/web/src/components/debug/…` | shadow-reconciliation view (R3a gate) + "Revert V2 migration" action | moderate |

### Write paths — all deleted and replaced by one entry service

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/entry-service.ts` (new) | `writeEntry`, `updateEntry`, `addOccurrence`, `removeOccurrence`, `scaleEntry`, `deleteEntry`, `undoDeleteEntry`, `enrichEntry`, `rollupComponents`, `updateComponent`, `addComponent`, the §2.8 validator, the §2.4 R6 duplicate warning. **Enqueues `"upsert"` for soft-deletes, never `"delete"`** (§4.2 step 7) | major |
| `apps/web/src/lib/composable-entry-service.ts` (869 lines) | **delete** | major |
| `apps/web/src/lib/drink-service.ts` (226 lines) | **delete** — `LogDrinkInput` is already the V2 row shape minus name and occurrences | major |
| `apps/web/src/lib/intake-service.ts`, `substance-service.ts` | delete | major |
| `apps/web/src/lib/eating-service.ts` | delete | moderate |
| `apps/web/src/lib/substance-enrich.ts` + `/api/ai/substance-enrich` | delete (already dead — no caller for `runSubstanceEnrichment`) | trivial |
| `apps/web/src/lib/voice-reconcile.ts` | **Retained as a deterministic backstop (§2.4 R6), not shrunk.** Its merge cases are two *items*, not two rows per item, and one-entry-per-item does not remove them — the file's own docstring (`:3-27`) states this is issue #322's shape and that "a prompt rule is a request, not a guarantee". The change is mechanical: emit merged root-entry payloads instead of merged V1 item shapes; keep the water-flag branch; add the latte test | moderate |

### Read paths

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/analytics-service.ts` | `getRecordsByDomain` collapses to one query + occurrence projection; fix bound convention; `fluidBalance` re-sourced | major |
| `apps/web/src/lib/analytics-snapshot.ts` | 12 parallel queries → ~5; share the divisor with summary-tab | moderate |
| `packages/core/src/analytics-stats.ts` | `avgByDay` → `sumByDay` for nutrient domains | moderate |
| `apps/web/src/lib/history-types.ts` | `UnifiedRecord` collapses; `FilterType` becomes nutrient-presence predicates; **`groupRecordsByDate` becomes an occurrence bucketer on the §5.6 day boundary** (§3 R-L) | major |
| `apps/web/src/hooks/use-records-tab-queries.ts` | 7 queries → 3 | moderate |
| `apps/web/src/hooks/use-history-queries.ts` | 6 queries → 3; **fixes the substance omission** that makes History and Analytics disagree | moderate |
| `use-intake-queries.ts`, `use-substance-queries.ts`, `use-eating-queries.ts`, `use-composable-entry.ts`, `use-drink-log.ts` | delete/replace with `use-entry-queries.ts` | major |
| `apps/web/src/hooks/use-record-adapters.ts` (271 lines) | 6 arms → 5 | major |
| `apps/web/src/lib/date-utils.ts` + every caller | one day-boundary function with the §5.6 fallback order | moderate |
| `apps/web/src/lib/data-deletion-service.ts` | `intakeEntries` filters on `lastOccurrenceAt`, not `createdAt`; partial-occurrence deletion (§3) | moderate |

### AI

| File | Change | Size |
|---|---|---|
| `packages/ai-prompts/src/entry-parse.ts` (new) | tool schema + reference tables + the compositional-basis language of §2.3 | major |
| `packages/ai-prompts/src/parse.ts`, `substance-lookup.ts`, `substance-enrich.ts` | delete | trivial |
| `apps/web/src/app/api/ai/entry-parse/{route,schema}.ts` (new) | recursive zod, depth caps, search gate, AI-7 repairs | major |
| `apps/web/src/app/api/ai/voice-parse/{route,schema}.ts` | food/drink arms adopt the root-entry shape; `max_tokens` up | major |
| `packages/ai-prompts/src/nutrient-analysis.ts` | send numbers, not just descriptions | moderate |
| `packages/ai-prompts/src/analytics-insights.ts` | `IntakeMetricSchema` (`:70-79`) hardcodes exactly 4 nutrients and **rejects** anything else — the whole insight request 400s rather than degrading. Must be widened. `CorrelationMetricSchema.domainA/B` is `z.enum(DOMAINS)`. | moderate |
| `apps/web/src/lib/analytics-registry.ts:33-46` | **a second copy of the domain list**, re-declared inside Zod param schemas for 10 stable query ids described as "suitable for AI discovery" (verified). Low risk — the read-paths report found no live consumer of `listQueries` — but it is a duplicate of `DOMAINS` that will silently drift. Update or delete it in the same pass. | trivial |

**Persisted `insightReports` carry V1 metric vocabulary** and are replayed as `priorAssessments` (capped at 3, `use-insights.ts:86-101`). Widening `IntakeMetricSchema` does not fix the stored narratives. Decide explicitly — stamp reports with a schema version and stop replaying pre-V2 ones, or accept the mismatch and say so in the prompt.

### Server / MCP / backup

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/mcp/queries.ts` | `getTodaySummary` SQL (lateral occurrence count); `queryIntakeHistory` shape; **the `legacy_member_ids` union predicate + the query-time `EXISTS` convergence check** (§5.8); §5.6 day boundary | major |
| `apps/web/src/lib/mcp/tools.ts` | tool descriptions + Zod input enums are a **client-visible contract consumed by claude.ai over OAuth**; enums extend additively, `query_substance_history` deprecated not deleted | major |
| `docs/mcp-connector.md` | contract doc + the transition window | moderate |
| `apps/web/src/app/api/sync/push/route.ts` | occurrence union + re-projection in the winning, losing **and Rule-1** branches for one table; `sync_seq` assignment; `clientSchemaVersion` heartbeat. **No per-op hook on the legacy tables** — the query-time `EXISTS` predicate replaced the latched marker that would have required one | moderate |
| `apps/web/src/app/api/sync/pull/route.ts` | `(sync_seq, id)` keyset for one table | moderate |
| `apps/web/src/lib/backup-service.ts` (~10 sites) | `BackupData`, counters, export, validate, clear list, merge/replace branches, stats, **+ enqueue on import**, **+ reconciler seeding**, **+ route entries through `mergeTableWithConflicts`** | major |
| `apps/web/src/lib/backup-schemas.ts` | new schema + 3 lists, **+ the potassium fix (R0)** | moderate |
| `apps/web/src/lib/export-service.ts` | `Domain` union, `domainUnit`, both domain arrays, format version, one row per occurrence, **PDF date-sort fix** | moderate |
| `apps/web/src/app/api/sync/cleanup/route.ts`, `user-data-deletion.ts` | order lists (+ fix existing drift, R0) | trivial |
| `apps/web/scripts/verify-schema.ts`, `reset-neon-db.ts` | counts/lists | trivial |
| `packages/types/src/analytics.ts` | `DOMAINS` gains the new nutrients | trivial |

### E2E

| File | Change | Size |
|---|---|---|
| `e2e/dashboard.spec.ts`, `history.spec.ts`, `chaos.spec.ts` | all exercise intake flows against the V1 UI | major |
| `e2e/sync-engine.spec.ts` | opens IndexedDB directly and hand-writes `_syncQueue` rows with `tableName: "intakeRecords"`; add the three-device `syncSeq` case | moderate |
| `e2e/mcp-connector.spec.ts` | must cover the transition window incl. a **mid-drain** sample (§5.8), not just the end state | moderate |

### UI (out of detailed scope, sized for planning)

| File | Change | Size |
|---|---|---|
| `apps/web/src/lib/card-themes.ts` | 11-key registry gains `unit` + `direction` per nutrient; the presentation registry becomes the nutrient registry | moderate |
| `apps/web/src/lib/optional-trackers.ts` | decouple from the `type` enum; display-only | moderate |
| `apps/web/src/stores/settings-store.ts` | limits become `Record<NutrientKey, {target, buffer, direction, unit}>`; `dayStartHour` mirror writer + backfill (§5.6); persist version 16→17 + migration; **delete dead `substanceConfig` and `weightGraphShow*`** | major |
| `apps/web/src/lib/quick-nav-defaults.ts` + `quick-nav-footer.tsx:32-46` | **`QuickNavItem.id` is typed `CardThemeKey`** (`quick-nav-defaults.ts:1-8`, verified) and the list is **persisted** in the settings store. Renaming a theme key (`salt` → `sodiumMg`) makes `CARD_THEMES[item.id]` `undefined` for every existing user. The persist 16→17 migration must remap persisted quick-nav ids, and unknown ids must be dropped rather than rendered | moderate |
| `components/settings/{water,salt,sugar,potassium}-settings-section.tsx` | 4 bespoke files → 1 data-driven | moderate |
| `components/history/record-row.tsx` | 8-arm switch → 1 (**and fixes potassium rendering as "Sodium"**) | moderate |
| `components/history-drawer.tsx` | 6 edit dialogs → 2 | major |
| `components/text-metrics.tsx`, `analytics/summary-tab.tsx`, `liquids-card.tsx`, `food-salt/*`, `liquids/*`, `voice/parsed-item-row.tsx` | rewritten against the new model; **the expanded line item must list live occurrences with per-occurrence remove** (§2.5) | major |
| `apps/web/src/lib/utils.ts` | **delete `getLiquidTypeLabel`** — the 9-format source grammar is replaced by `entry.name` | trivial |
| `packages/ui/src/styles/globals.css` | add `--color-sugar` / `--color-potassium` tokens (absent today) | trivial |
| service worker / update gate | forced-update check + `clientSchemaVersion` (R0 item 6) | moderate |

**Rough total: ~85 files, of which ~23 are major**, spread across R0-R6, with R3a/R3b splitting the largest step in two. The compensating deletion is real: `composable-entry-service.ts` (869), `drink-service.ts` (226), `use-record-adapters.ts` (271), `history-types.ts` (58), the group-total helpers and three edit dialogs — well over 1 500 lines removed, and twelve parallel type enums reduced to two (`NutrientKey`, `kind`).

---

## 9. REJECTED ALTERNATIVES

**R-1 — Two tables: `intakeEntries` + `entryComponents` with a real FK.**
Loses on the sync engine. `TABLE_PUSH_ORDER` orders tables, but the batch is **FIFO-sliced to 50 ops before topological regrouping** (`sync-engine.ts:137-160`), and `enqueueInsideTx` rewrites `enqueuedAt` on every coalesce (`sync-queue.ts:62-74`), so re-editing a parent moves it behind its own child. With a `notNull().references()` FK the orphaned child insert throws, is `rejected` with **no `code`**, is retried 8 times, then **acked out of the queue and abandoned** (`sync-engine.ts:331-337`) — permanent silent loss. With a nullable FK it inserts fine and you have rebuilt `groupId`. The server has no transaction to save you and pull applies one table per transaction with a 500-row cap and an early return on network failure. Cost on top: ~20 files of table registration and a hand-maintained `fkPairs` entry.

**R-2 — One table with a self-referencing `parentEntryId`.**
Strictly worse than R-1: R-1's entire orphan class *plus* no ordering guarantee at all, because push order is defined **between** tables. It also makes every daily total a two-pass query ("sum roots, but exclude any row with a parent") — exactly the "sum with an unenforced membership predicate" shape §1 identifies as the bug class.

**R-3 — Keep the three tables, add a real `entryGroups` root table.**
The minimal-diff option, and it fails on the invariant. Totals would still be `Σ` over sibling rows in `intakeRecords`, so two writers can still each book the volume. It adds a **fourth** linkage mechanism alongside `groupId`, `source: "substance:<id>"` and `sourceRecordId`. It buys a root for the *name* while leaving quantity, per-unit basis, provenance and the nutrient set exactly as broken as today.

**R-4 — Nutrients as EAV rows (`{entryId, key, value}`).**
This is `intakeRecords` generalised — it *is* the current design with `type` renamed to `key`. Every failure in §1 reproduces verbatim, plus it multiplies row count by ~18 (11 k-22 k rows/year → 200 k-400 k), breaking the already-binding full-table-scan paths and making every daily total a join.

**R-5 — Store absolute (pre-multiplied) nutrients plus a display-only count.**
(a) `+1` becomes lossy: the per-unit basis is not recoverable from a rounded absolute, and `n × round(x) ≠ round(n × x)` — already an observed bug (`drink-service.ts:133-136`). (b) Editing becomes ambiguous: "sodium is 500" with 3 units means either 500 total or 1 500 and nothing says which. (c) It leaves no per-unit basis at all, which is what `recalculateFromCurrentValues` (`composable-entry-service.ts:862-868`) has been stubbed out waiting for since Phase 13.

**R-6 — `integer` or `real` nutrient columns.**
`integer` is rejected because per-unit storage makes fractional values normal (0.4 g sugar per lolly, 3.2 g ethanol per small beer, 0.35 mg iron per slice), and the push validator silently drops fractional values today. `real` (float4, ~7 significant digits) is rejected because rollup sums and per-unit divisions produce values that do not round-trip, which would make `verify-hash` report MISMATCH on `intakeEntries` for essentially every user and let the next pull silently rewrite the local value. `doublePrecision` costs nothing.

**R-7 — A `quantity: number` multiplier instead of an occurrence set.**
Rejected on two independent grounds, both producing wrong numbers on shipping surfaces: it collapses N units onto one timestamp, so the rolling-24 h chip (`liquids-card.tsx:279`) drops 1 500 ml at once when the entry's single timestamp ages out, and the weekly grid puts three lollies spanning midnight in one bucket; and `quantity += 1` is strictly lossy under whole-row LWW. The occurrence set is an LWW-element-set that merges commutatively, answers "do repeats need their own times?" by construction, and — with `deletedAt` derived from it rather than LWW'd independently — converges on every sequence in §2.5. Its cost is one non-LWW table on both sides of the wire **plus one server-owned cursor column** (§5.2), stated and accepted.

**R-8 — Do the V1→V2 conversion in the Dexie `.upgrade()` hook.**
A throw aborts the versionchange transaction and Dexie then refuses to open the database at all (`db.ts:616-618`); it cannot run on a fresh install (`db.ts:586-591`); it cannot catch legacy rows that arrive from the server afterwards; and it cannot be batched, resumed, observed or reverted across a 100 k-row corpus.

**R-9 — Client-only conversion (no server-side job).**
Rejected on arithmetic. 85 k-165 k queue ops against `PUSH_BATCH_CAP = 50`, with a chained pull per cycle, is ~1 700-3 300 foreground-online round trips — hours to days per device, with the sync indicator pinned on "Syncing…" and the server holding live V1 rows throughout. That window is also exactly when MCP would have to answer questions about a table that is mostly empty. A server-side pass over the user's own three tables is one job with no queue, and it makes every device's local pass a no-op. The client pass survives as a reconciler for stragglers, sharing one implementation of the fold.

**R-10 — Relational invariants enforced only by Postgres CHECKs.**
A CHECK violation is this engine's worst failure mode: no `code` on the rejection, 8 silent retries, then the op is acked out of the queue and abandoned (`sync-engine.ts:330-344`, whose own comment names "a CHECK violation" as the permanent case). The row then lives on exactly one device forever, invisible to every other device, to MCP, and to any cloud restore. Enforcement is at mint time (§2.8), mirrored in the push Zod schema so a violation is loud on attempt 1, and mirrored again in Postgres as a backstop.

**R-11 — Tombstone the legacy corpus in one server pass, before the client ships.**
This is unshippable. Every V1 read path filters `deletedAt === null` (`intake-service.ts:96`, `:109`, `:189`; `record-crud.ts:41`, `:56`), `pull/route.ts` returns tombstones verbatim, `sync-engine.ts:540` applies them with `bulkPut`, and the v22 bundle's `TABLE_PUSH_ORDER` has no `intakeEntries` so the entries slice is ignored. For the whole gap between the server pass and the client release — a ~75-file PR's build and rollout — the user's only working client shows water 0 ml, empty History, empty weekly grid, empty fluid balance and empty CSV export against a five-year dataset, and any edit made in that window is acked-and-discarded by push Rule 1 and then clobbered by the next pull, with a success toast. Splitting the job into mark-then-tombstone (§4.1) costs one extra column and one extra invocation and removes the entire class.

**R-12 — Bump `updated_at` in the LWW-losing branch to make the occurrence union visible.**
The straightforward alternative to `syncSeq`, and it corrupts scalar LWW: a bump to `serverNow` makes a third device's genuinely newer nutrient edit lose against a timestamp that carries no scalar intent. Leaving `updated_at` alone instead makes the union permanently invisible, because pull is a keyset cursor on `(updated_at, id)` (`pull/route.ts:94-106`) — the union lands and no device ever re-fetches it. A separate, server-owned cursor column keeps LWW exactly as documented and makes delivery provable; its only cost is one entry in `DRIZZLE_ONLY_EXEMPTIONS` and one in the `verify-hash` strip list, both of which already have `userId` as precedent.

**R-13 — Drop the three legacy Dexie stores at v24.**
Rejected because `importBackup` addresses them as direct properties (`backup-service.ts:477`, `:522`, verified): once dropped, `db.intakeRecords` is `undefined`, replace mode throws inside the `Promise.all` of clears and merge mode throws on `bulkPut`, and both land in the outer catch so the **whole** restore fails — the user loses their weight, blood-pressure and medication data from that file too, with only "Invalid backup" to go on. Keeping three empty stores costs one line each per future version block. See §4.6.

---

## 10. OPEN QUESTIONS FOR THE USER

Four questions. Q2 (per-occurrence times), Q3 (fractional quantity) and Q5 (component editability) of the original list are **decisions**, not questions — §2.1 Call 4, §2.5 and §2.6/AI-6 — because in each case the alternative produced a wrong number on a shipping surface.

**Q1 — Retroactive hydration semantics, and what "preserve" actually looks like.** V2 separates the glass (`servingVolumeMl`) from the hydration (`waterMl`), which finally gives the AI's water-content figure an owner — today it is collected, stored on the preset, displayed and then ignored, so a 40 ml neat spirit books 40 ml of hydration. Going forward the AI returns true water content. For **existing** entries the fold sets `waterMl` = the old water row's amount, preserving every historical total exactly.

**Be aware of exactly what that preservation implies, because it reintroduces for drinks the same defect the fold fixes for meals.** V1's `logDrink` books `amount === volumeMl` by construction (`drink-service.ts:107-121`), so `servingVolumeMl := drinkWaterIntake?.amount` and `waterMl := drinkWaterIntake?.amount` are **the same number** for every migrated drink. The derived `waterContentPercent` therefore reads **100 % for the entire historical drink corpus**, including 40 ml neat spirits and every migrated glass of wine, and the `water_ml <= serving_volume_ml` CHECK is satisfied by *equality* on precisely the rows it was introduced to protect. Migrated drinks are, in effect, marked "pure water" forever unless you say otherwise.

Options: (a) **preserve** — every past day's number is unchanged, historical `waterContentPercent` is meaningless for drinks, and the discontinuity is at the migration date; (b) **re-derive** historical water content from a per-item AI pass — more accurate history, but every past day's hydration number and every fluid-balance chart changes retroactively; (c) **preserve the totals but null `waterContentPercent`'s inputs for migrated drinks** by leaving `servingVolumeMl` null on `entrySource === "migration"` drinks, so the derived percentage is honestly undefined rather than falsely 100 % — at the cost of losing the glass size on historical drinks. *(Default if unanswered: (a). Accuracy that rewrites the past is usually worse than a documented discontinuity — but (c) is cheap and removes a false 100 %.)*

**Q2 — Alcohol display unit, and a note that the numbers move either way.** Stored canonically as grams of ethanol. Display as metric standard drinks (10 g, matching today's numbers), UK units (8 g), or grams? Two things to know. (a) This is **not** display-only: §3 specifies `TOTAL("alcoholG") / 10` on the dashboard *and* in MCP, and `export-service`'s `alcohol` domain unit is `std_drinks` — a UK-units answer changes §3's port table and the CSV contract. (b) **Migrated alcohol figures shift slightly regardless of your answer**, because the fold prefers unrounded `ethanolGrams(abv, volume)` over the stored `amountStandardDrinks`, which was persisted at 2 dp (`drink-service.ts:49`, `:196-201`). P7b bounds that drift at 0.005 std drinks per recomputed row; P7a asserts the fallback cohort is exact.

**Q3 — Whitelist of nutrients surfaced by default.** Eighteen columns exist on every entry. Which appear on the V2 dashboard without being asked for? Water and alcohol are stated priorities; sodium, sugar and potassium have limits today. The other thirteen would be visible only inside the expanded line item and in analytics — confirm that split. Related: the 18 deliberately omit trans fat, added-vs-total sugar, polyols and all vitamins, which land in `extraNutrients` and are permanently excluded from totals **and from the known/applicable decoration** (§2.3). Confirm that cut line.

**Q4 — Should a nutritionally-significant medication (a magnesium tablet on a prescription) also produce an `IntakeEntry`?** §2.9 keeps medications separate — adherence and nutrition are different questions — which means such a dose does **not** contribute to daily magnesium unless you also log it as a supplement entry. Is that what you want, or should certain prescriptions auto-emit an entry on dose-taken? **If auto-emit is chosen, the emitted entry's id must be derived deterministically from the `doseLog` id**, or every dose edit or undo mints a duplicate supplement entry and double-counts the magnesium — the same class of bug as §4.2 step 2, one domain over.

---

## Residual Concerns

Two rounds of adversarial review ran against this proposal. Most objections were
accepted and changed the design; those changes are folded into the sections above
and are not itemised here. The objections below were **not** resolved, and the
review did not reach unanimous sign-off. They are recorded verbatim in substance,
with the counter-argument that was offered and the reason the disagreement stands.

**1. The collision problem is only half-killed. The entry/entry axis is still a
convention.**
*Objection.* The user's stated goal is to end double-counting. §2.4 R1′ concedes
that `writeEntry` mints one row per **call**, so two calls describing one physical
drink produce two entries, each with a non-null `waterMl`, and `TOTAL("waterMl", W)`
adds them. The live example is in the repo: `voice-reconcile.ts:3-27` documents one
dictated latte returning as a `caffeine` item *and* a `food` item, both booking
volume. Commit `3070320`'s sentence — "two callers can still each book the volume" —
applies verbatim to V2 on this axis. A proposal that costs ~85 files and does not
structurally close the bug it was commissioned to close is, on this reading, not
worth its blast radius.
*Response.* The root/child axis (a drink's volume versus its own solutes and
ingredients) is where every reproduced instance of #322 actually lives, and that axis
becomes structural: one row owns the quantity, there is no second row to disagree
with it. The entry/entry axis is held by `reconcileLiquidItems` retained as a
deterministic pre-review backstop (§2.4 R6), a write-time duplicate-detection
predicate that warns and never silently merges, and the review list itself, on which
the user sees both rows before they are committed.
*Why it stands.* No mechanism was found that closes the axis structurally without
also destroying legitimate data: any rule strong enough to merge the latte's two
items also merges two genuinely separate identical coffees an hour apart, and
silently losing real hydration is worse than a visible duplicate. The reviewers who
objected consider "warn, never merge" an admission that the invariant is still
prose. That characterisation is accurate; the proposal accepts it and says so rather
than claiming otherwise.

**2. The blast radius is disproportionate, and there is no client rollback.**
*Objection.* ~85 files, ~23 major, a five-year corpus, one user, and a device-level
one-way door: once any device opens the Dexie v23 database it is at IDB 230 and a
redeployed v22 bundle fails to open at all (§6, Rollback), including the export
screen. A change of this size with no client-side reverse gear should be staged as an
additive shadow table that runs alongside V1 indefinitely, with the V1 paths never
deleted.
*Response.* §6 splits the largest step (R3a shadow model, R3b cut-over), R2 pass A
never tombstones, a server-side snapshot with a hash check and a documented restore
procedure precedes the first write, and `revertRepair()` is reachable from the Debug
panel, which renders without any entry read path.
*Why it stands.* "Run both indefinitely" is exactly the state §1 identifies as the
bug — two owners of one quantity — so the proposal cannot adopt it without
abandoning the invariant. But the reviewers are right that the rollback story is
weaker than the migration's size warrants: it depends on a snapshot and a revert path
that will have been exercised only in tests, never against this user's real corpus,
and the revert window closes at R3b. Nothing in the proposal removes that exposure.

**3. Pass B has a gate but no deadline.**
*Objection.* R3c fires pass B only once the v23 client is confirmed live on **every
registered device** via the `clientSchemaVersion` push heartbeat. A device the user
stops using — an old tablet, a reinstalled phone — never reports, so the gate never
opens. The legacy corpus stays live forever, the MCP `EXISTS` union stays in the query
path forever, and §4.6's "empty the legacy tables" step is unreachable.
*Response.* The `EXISTS` predicate is correct in the un-converged state, so the
consequence of never firing pass B is cost and complexity, not wrong numbers.
*Why it stands.* No stale-device eviction policy was agreed. How long a device may go
silent before it is declared dead, and what happens to unsynced local rows on it when
it is, are operational decisions this document does not make. Until they are made,
"the transition window is temporary" is an assumption, not a property.

**4. `intakeEntries` is special-cased throughout the sync engine.**
*Objection.* §1.2(iv) argues the current design is unsafe partly because the sync
engine has no per-table semantics — and then §5.2 gives exactly one table non-LWW
merge behaviour, a server-owned `sync_seq` cursor, a parity-test exemption, a
`verify-hash` strip-list entry, and a modified push Rule 1. Special cases in this
engine are precisely where its existing bugs live.
*Response.* R-12 shows the alternatives are worse: bumping `updated_at` in the losing
branch corrupts scalar LWW, and leaving it alone makes the union permanently
undeliverable through a `(updated_at, id)` keyset cursor. The occurrence set is a
join-semilattice, so the merge is commutative and the special case is principled
rather than ad hoc, and `userId` is existing precedent for both exemptions.
*Why it stands.* The reviewers accept the argument and still hold that the resulting
engine has one table whose behaviour must be reasoned about separately in five
places, and that the property tests proposed for it (three-device convergence,
empty-live-set projection) are the only thing standing between that and silent data
loss. That is a real increase in the engine's surface area, and the proposal does not
deny it.

**5. Eighteen fixed columns versus an open nutrient set.**
*Objection.* Every new nutrient is a Drizzle migration, a Dexie version block
repeating all stores, a parity-test update and a payload-schema edit. The cut line
(§2.3) sends trans fat, added-versus-total sugar, polyols and all vitamins to
`extraNutrients`, where they have no provenance, are never applicable, and are
excluded from every total — a second-class tier that will be relitigated the first
time the user wants to track vitamin D.
*Response.* R-4 rejects EAV on row-count and query-shape grounds; a JSONB bag would
lose the CHECK constraints of §2.4 R5 and the index-assisted sums of §3. Q3 asks the
user to confirm the cut line explicitly rather than assuming it.
*Why it stands.* The objection is about future cost, not present correctness, and the
proposal has no answer to it beyond "the migration is mechanical". If the answer to
Q3 is "I want to add nutrients over time", this decision should be revisited before
R1, not after.

**6. Migrated drinks will report 100 % water content.**
*Objection.* Because V1's `logDrink` books `amount === volumeMl`, the fold sets
`servingVolumeMl` and `waterMl` to the same number for every historical drink, so the
derived `waterContentPercent` reads 100 % across the entire drink corpus — including
neat spirits — and the `water_ml <= serving_volume_ml` CHECK is satisfied by equality
on exactly the rows it exists to protect. Shipping a knowingly-false derived figure
over five years of data is worse than losing the glass size.
*Response.* Option (c) in Q1 removes the false percentage at that cost, and is cheap.
*Why it stands.* It is the user's call, not the architect's — totals versus derived
accuracy on historical data is a product decision. It remains open as Q1, and the
default if unanswered is (a), which is the option the objecting reviewers consider
wrong.

**7. Food logging becomes dependent on an AI round trip in an offline-first app.**
*Objection.* The V2 dashboard routes food and drink through "give it a name" → AI →
line item (§7). Offline, or when the API is down or the search gate refuses with 422
`SEARCH_REQUIRED`, the entry is written with all 18 nutrients `null` (§2.7). §3's
`≥ X (n of m known)` presentation is designed for that state, but if it becomes the
normal state rather than the exception, every daily number carries a `≥` and the
three-state distinction the whole model is built on stops meaning anything.
*Response.* Unknown-not-zero is strictly better than V1, which silently discards
AI-supplied nutrients whenever the corresponding tracker is off (§7.4); quick-add
water and the urination/defecation types stay fully offline; and `enrichEntry` can
fill an entry later without touching user-authored fields, because provenance is
per-field.
*Why it stands.* No offline enrichment queue is specified — nothing in the proposal
re-attempts enrichment automatically when connectivity returns, and no surface is
defined that shows the user which entries are still unenriched. Until that exists,
the objection that the model degrades quietly rather than loudly is correct.

None of these blocks R0, which is independently shippable and fixes existing bugs on
its own. Items 1 and 6 are partly answerable by the user (§10). Items 2, 3, 4, 5 and
7 are accepted risk, and should be re-examined at the R3a gate, before the read
cut-over makes them expensive to revisit.
