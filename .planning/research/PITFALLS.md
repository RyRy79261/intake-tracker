# Domain Pitfalls

**Domain:** Composable data entries, unified input cards, AI substance lookup for offline-first health tracking PWA
**Researched:** 2026-03-23
**Confidence:** HIGH (codebase inspection + Dexie.js docs + IndexedDB specification behavior)

## Critical Pitfalls

Mistakes that cause data corruption, orphaned records, or require schema rewrites.

### Pitfall 1: Forgetting Tables in Dexie Transaction Declarations

**What goes wrong:** Dexie's `db.transaction("rw", [tableList], callback)` requires every table you touch to be declared upfront. If a composable entry service writes to `intakeRecords`, `substanceRecords`, AND `eatingRecords` but only declares two of three, the third write silently operates outside the transaction. On failure, the transaction rolls back the declared tables but the undeclared write persists — creating orphaned records that survive the rollback.

**Why it happens:** Composable entries are the first feature in this codebase where a single user action touches 3+ tables simultaneously (food parse -> eating record + intake record + substance record + salt intake record). The existing `addSubstanceRecord` in `substance-service.ts` already demonstrates this pattern with 2 tables (`substanceRecords` + `intakeRecords`), but composable entries scale this to 3-5 tables per operation.

**Consequences:** Orphaned records with no parent linkage. Cascading delete misses them. useLiveQuery shows phantom entries. Backup/restore exports inconsistent state.

**Prevention:**
- Create a single `composable-entry-service.ts` that owns all multi-table write operations. No individual domain services should create linked records across domains.
- Define a `COMPOSABLE_TABLES` constant listing all tables involved, and use it consistently in every transaction.
- Write a test that intentionally fails mid-transaction and verifies zero records were written to ANY table.

**Detection:** Audit query: count records where `source` contains a colon (e.g., `substance:xyz`) but the referenced ID does not exist in the target table.

### Pitfall 2: Cascading Delete Leaves Orphans When Link Direction Is Ambiguous

**What goes wrong:** The current `deleteSubstanceRecord` in `substance-service.ts` finds linked intake records by querying `source` field for `substance:${id}`. But the composable entry model has links going in both directions: a food entry creates substance records, AND a substance record creates intake records. If delete cascades only follow one direction, records linked in the other direction survive.

**Why it happens:** The existing `sourceRecordId` on `SubstanceRecord` points upstream (to the intake record that spawned it during v12 migration), while the `source: "substance:${id}"` on `IntakeRecord` points downstream (to the substance that created the liquid entry). Composable entries add a THIRD direction: a parent "composable entry" that owns children in multiple tables. Without a clear parent-child hierarchy, delete logic becomes a graph traversal problem.

**Consequences:** User deletes a food entry, but the linked salt intake and caffeine substance record persist. UI shows phantom entries. Daily totals are wrong. Over time, orphaned records accumulate and pollute analytics.

**Prevention:**
- Introduce a `parentEntryId` field on ALL records that participate in composable entries. This is a single, unambiguous link back to the parent. Cascading delete only needs to query one field.
- Do NOT use bidirectional links. The parent entry knows its children (stored as `childRecordIds: { table: string, id: string }[]`), and children know their parent (`parentEntryId`). Delete cascades from parent to children only.
- The `source` field on `IntakeRecord` and `sourceRecordId` on `SubstanceRecord` should be deprecated for linkage purposes. Keep them for provenance/audit but do not use them for cascade logic.

**Detection:** Periodic integrity check: for every record with a `parentEntryId`, verify the parent exists. Flag orphans in a maintenance view.

### Pitfall 3: useLiveQuery Reactivity Gaps With Multi-Table Composable Reads

**What goes wrong:** A composable entry display component needs data from 3+ tables (eating record + linked intake records + linked substance records). If these are fetched in separate `useLiveQuery` hooks, they update independently — the eating record deletes instantly, but the substance query hasn't re-fired yet, so the UI briefly shows orphaned substance data. Worse: if the queries depend on each other (fetch eating record, then use its ID to fetch linked records), the dependency chain creates a render waterfall.

**Why it happens:** `useLiveQuery` tracks which tables are touched during its callback and re-fires when those tables change. If you use separate hooks for each table, there is no guarantee they fire in the same render cycle. Dexie's observation system is fine-grained per query, not per transaction — so a multi-table transaction that writes atomically still triggers separate observation events per table.

**Consequences:** Flickering UI, briefly showing stale linked data after the parent is deleted. In edge cases, attempting to render a linked record that no longer exists causes runtime errors if the component doesn't handle missing data.

**Prevention:**
- Use a SINGLE `useLiveQuery` callback that fetches the parent record AND all linked children in one pass. Dexie's observation system correctly tracks all tables touched within a single callback, so changes to any of them trigger a re-render.
- Pattern: `useLiveQuery(async () => { const entry = await getComposableEntry(id); const children = await getLinkedRecords(entry.childIds); return { entry, children }; })`.
- This is already validated by the Dexie maintainer: "You can query multiple tables in loops or however you want" within a single `useLiveQuery`.
- For list views, use `{cache: 'immutable'}` on the Dexie constructor to avoid deep cloning overhead when querying multiple tables per list item.

**Detection:** React DevTools profiler — if composable entry components render 2-3 times per data change instead of once, they have split queries.

### Pitfall 4: Dexie Version Migration Corrupts Existing Substance Records

**What goes wrong:** The v12 migration created `SubstanceRecord` entries from intake records using keyword matching, with `sourceRecordId` pointing to the original intake record. The new composable entry model likely changes the linking mechanism (adding `parentEntryId`, changing `source` semantics). If the v15+ migration doesn't carefully transform existing substance records, they become unlinkable — no parent entry, no valid `parentEntryId`, and the old `sourceRecordId` now points to a record that may have been restructured.

**Why it happens:** Existing substance records have `source: "water_intake"` and `sourceRecordId` pointing to an intake record. New composable entries will have `source: "composable"` (or similar) and `parentEntryId`. The migration must bridge these two models without losing the existing provenance chain.

**Consequences:** Historical substance records become invisible to composable entry queries. Caffeine/alcohol daily totals drop to zero for historical dates. Users think their data was lost.

**Prevention:**
- Existing substance records with `source: "water_intake"` should remain unchanged. They are standalone records with a provenance link, not composable children.
- New composable entries create NEW substance records with the new linking model. Do not retrofit old records into the new model.
- The display layer queries BOTH old-model records (standalone with `sourceRecordId`) and new-model records (composable children with `parentEntryId`). This dual-query pattern stays until the next major version.
- Write migration tests against the actual v12 migration output format (the codebase already has `v12-migration.test.ts` — extend it for v15+).

**Detection:** Compare substance record count before and after migration. If count changes, the migration is destructive.

## Moderate Pitfalls

### Pitfall 5: AI Substance Lookup Returns Wildly Inaccurate Data

**What goes wrong:** The Perplexity API returns caffeine/alcohol estimates that are off by 2-10x for non-standard beverages. Research shows LLMs have ~35-37% MAPE (Mean Absolute Percentage Error) for nutritional estimation. For caffeine specifically: a "flat white" might return 63mg (espresso default) when the actual value is 130mg+ (double shot standard in most markets).

**Why it happens:** LLMs estimate from training data averages, but caffeine content varies enormously by preparation method, bean type, serving size, and regional standards. The existing `DEFAULT_CAFFEINE_MG` map in `db.ts` shows this problem: all "coffee" variants default to 95mg regardless of size. Perplexity does better but still lacks serving-size awareness for specific brands/chains.

**Consequences:** Users tracking caffeine for medical reasons (e.g., heart conditions, which this user has based on the titration plan feature) get dangerously inaccurate daily totals. They may exceed safe limits while the app shows them as under.

**Prevention:**
- AI estimates are SUGGESTIONS, not facts. Always show the AI estimate with an "edit" affordance. Never silently commit AI values without user confirmation.
- Build a local preset system (saved caffeine-per-100ml values for user's common drinks). Presets override AI lookups. AI is only used for new/unknown beverages.
- Show confidence indicators: if the AI's `reasoning` field is vague or generic, mark the estimate as LOW confidence in the UI.
- Bound AI responses with Zod validation (already done in `substance-enrich/route.ts` — max 2000mg caffeine, max 5000ml volume). Add domain-specific bounds: caffeine per 100ml should be 0-200mg (nothing exceeds espresso concentration).

**Detection:** Flag substance records where AI estimate differs from the user-edited value by >50%. This reveals systematic AI bias for specific drink types.

### Pitfall 6: Soft Delete vs Hard Delete Inconsistency in Composable Entries

**What goes wrong:** The existing `deleteSubstanceRecord` uses soft delete (`deletedAt` timestamp). But `deleteIntakeRecord` in `intake-service.ts` uses HARD delete (`db.intakeRecords.delete(id)`). If a composable entry cascading delete soft-deletes the substance child but hard-deletes the intake child, the records are irrecoverable at different levels. Backup/restore behavior becomes unpredictable.

**Why it happens:** The codebase evolved incrementally. The v10 schema added `deletedAt` for sync-readiness, but not all services adopted soft delete. The intake service predates the sync fields and was never updated to use them.

**Consequences:** After a cascading delete: substance records are recoverable (soft-deleted), but intake records are gone forever. If the user later wants to undo the delete, partial recovery is the best case. Backup export includes soft-deleted substances but not the hard-deleted intakes, creating inconsistent restore state.

**Prevention:**
- Decide NOW: all composable entry operations use soft delete exclusively. Hard delete is reserved for explicit "purge" operations.
- Update `deleteIntakeRecord` to use soft delete before building composable entries on top of it.
- The composable entry delete service sets `deletedAt` on all children in a single transaction. A separate "purge" background job can hard-delete records where `deletedAt` is older than 30 days.

**Detection:** In tests, verify that after a composable entry delete, ALL child records have `deletedAt` set and NONE are hard-deleted.

### Pitfall 7: Transaction Scope Escaping via Async/Await Patterns

**What goes wrong:** In Dexie transactions, any `await` that resolves a non-Dexie promise (e.g., `fetch()`, `setTimeout`, custom promise) causes the IndexedDB transaction to auto-close. Subsequent Dexie operations within the callback silently start a NEW implicit transaction. If the composable entry service calls an AI endpoint mid-transaction to enrich data, the transaction scope is lost.

**Why it happens:** IndexedDB transactions auto-commit when the event loop is idle. A `fetch()` call yields to the event loop, closing the transaction. This is a fundamental IndexedDB limitation, not a Dexie bug. Safari is especially aggressive about this — it closes transactions even faster.

**Consequences:** The first half of a composable entry write commits, the AI call runs, and the second half starts a new transaction. If the second half fails, the first half is already committed. Orphaned partial records.

**Prevention:**
- NEVER call external APIs inside a Dexie transaction. The pattern must be: (1) gather all data and call AI OUTSIDE the transaction, (2) construct all records, (3) write everything in a single atomic transaction.
- The existing `addSubstanceRecord` already follows this pattern correctly — the transaction only contains Dexie operations. Composable entries must maintain this discipline.
- Lint rule or code review checklist: no `fetch()`, no `setTimeout()`, no non-Dexie promises inside `db.transaction()` callbacks.

**Detection:** Search for `fetch` or `setTimeout` inside any function that runs within a `db.transaction` callback.

### Pitfall 8: useLiveQuery Default Value Masks Loading State for Composable Entries

**What goes wrong:** All existing hooks use a default value as the third argument to `useLiveQuery` (e.g., `useLiveQuery(() => getSubstanceRecords(type), [type], [])`). The empty array default means the component renders immediately with empty data, then re-renders when the query resolves. For composable entries that join multiple tables, the initial render shows an empty/incomplete entry, then "pops in" with full data.

**Why it happens:** The default value is returned synchronously on first render before the async query runs. With single-table queries this is barely noticeable. With multi-table composable queries that may take 10-50ms, the flash of empty content is visible.

**Consequences:** Jarring UX — composable entry cards flash empty then populate. If the component conditionally renders based on whether linked records exist, the initial "empty" state may show a "no data" message before the real data arrives.

**Prevention:**
- Use `undefined` as the default value instead of `[]`. Check for `undefined` in the component to show a skeleton/loading state.
- Pattern: `const data = useLiveQuery(...); if (data === undefined) return <Skeleton />;`
- This is already partially done in `useIntake` where `isLoading` checks for `undefined`, but the substance hooks use `[]` which is truthy.

**Detection:** Visual regression: composable entry cards should never flash empty content on initial load.

## Minor Pitfalls

### Pitfall 9: Existing `source` Field Conventions Collide With Composable Entry Sources

**What goes wrong:** Intake records already use the `source` field with values like `"manual"`, `"food:apple"`, `"substance:${id}"`. Composable entries will need their own source identifier. If the naming convention isn't carefully designed, existing queries that filter by source prefix will break.

**Prevention:** Use a distinct prefix like `"composable:${parentId}"` for all composable-created records. Update any queries that use `.startsWith("substance:")` to also handle the new prefix.

### Pitfall 10: Backup/Restore Breaks Composable Entry Links

**What goes wrong:** The existing backup/restore exports all 16 tables independently. If a restore imports substance records but the linked parent composable entry records import later (or fail), the links are broken. The import is not transactional across tables.

**Prevention:** Backup format must preserve composable entry groups as units. Restore should validate referential integrity of `parentEntryId` links after import, and flag (not silently discard) orphaned records.

### Pitfall 11: AI Parse Route Returns Water+Salt but Not Caffeine/Alcohol

**What goes wrong:** The existing `/api/ai/parse` route estimates water and salt content from food descriptions. The composable entry "type food, get everything" flow needs caffeine and alcohol content too. If these are separate API calls (parse for water/salt, substance-enrich for caffeine), the user waits for two sequential AI roundtrips, and the results may be inconsistent (one call says "250ml coffee" is 250ml water, the other says it has 95mg caffeine per 250ml — but what if the volume estimates disagree?).

**Prevention:** Create a unified AI parse endpoint that returns water, salt, caffeine, and alcohol in a single response. One Perplexity call, one Zod schema, one set of consistent estimates. The existing separate routes can remain for backward compatibility but the composable entry flow should use the unified endpoint.

### Pitfall 12: Dexie Schema Version Repetition Causes Copy-Paste Errors

**What goes wrong:** Dexie requires repeating the FULL schema definition for every version. The codebase is already at version 14 with the same store definitions copied 5 times. Adding new fields or indexes for composable entries means editing the latest version AND getting the copy right. A typo in the index string silently drops an index.

**Prevention:** Extract store definitions into constants and compose them. E.g., `const INTAKE_STORES = "id, [type+timestamp], timestamp, source, updatedAt"` defined once and referenced in each version. The codebase doesn't do this yet — it should before adding v15+.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Composable entry data model (schema) | Pitfall 2 (ambiguous link direction), Pitfall 4 (migration corruption) | Design `parentEntryId` field first. Write migration tests before migration code. |
| Composable entry service layer | Pitfall 1 (forgot tables in transaction), Pitfall 7 (async escaping) | Single service file, `COMPOSABLE_TABLES` constant, no external calls inside transactions. |
| Composable entry UI/hooks | Pitfall 3 (reactivity gaps), Pitfall 8 (loading flash) | Single `useLiveQuery` per composable entry, `undefined` default value. |
| Unified AI parse endpoint | Pitfall 11 (inconsistent multi-call), Pitfall 5 (inaccuracy) | Single unified endpoint, user confirmation UX, preset system. |
| Cascading delete | Pitfall 2 (orphans), Pitfall 6 (soft vs hard delete) | Standardize on soft delete, parent->children cascade only, integrity audit. |
| DB migration to v15+ | Pitfall 4 (migration corruption), Pitfall 12 (copy-paste) | Extract store definitions, dual-model query layer, migration tests. |
| Preset/lookup system | Pitfall 5 (AI inaccuracy) | Presets override AI, editable estimates, confidence indicators. |

## Sources

- [Dexie.js transaction() documentation](https://dexie.org/docs/Dexie/Dexie.transaction())
- [Dexie.js cascade on delete discussion (#1932)](https://github.com/dexie/Dexie.js/issues/1932)
- [useLiveQuery multi-delete reactivity bug (#2067)](https://github.com/dexie/Dexie.js/issues/2067)
- [Multi-table observation in useLiveQuery (#2090)](https://github.com/dexie/Dexie.js/issues/2090)
- [DietAI24 LLM nutrition accuracy study](https://www.nature.com/articles/s43856-025-01159-0)
- [LLM nutritional estimation MAPE evaluation](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- [IndexedDB transaction auto-close behavior](https://javascript.info/indexeddb)
- [Dexie.js "table not part of transaction" error](https://javascriptio.com/view/1047322/dexie-table-tablename-not-part-of-transaction)
- [Dexie Cloud best practices](https://dexie.org/cloud/docs/best-practices)
- Codebase inspection: `src/lib/substance-service.ts`, `src/lib/medication-service.ts`, `src/lib/db.ts`, `src/hooks/use-substance-queries.ts`
