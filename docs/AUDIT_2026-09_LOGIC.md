# Intake Tracker: Logic, Data and Schema Audit (2026-09-25)

**Scope:** data, schema, business logic, state, and whether inputs behave consistently. Visual styling is out of scope.
**Baseline:** HEAD `74ac8290` (branch `fix/android-exact-alarm-prompt`), Node 22.
**Method:** 30 audit domains. Each finding was checked by 1–3 independent verifiers. Wherever a verifier changed a claim or a severity, the verifier's version is used here (`final_severity`). Critical and high items were reproduced with throwaway vitest / fake-indexeddb / testcontainers-Postgres tests, which have since been deleted. The owner's live data was read through the read-only Intake Tracker MCP.

Severity scale:
- **critical:** data loss or corruption, or wrong medical dosing information.
- **high:** a core feature is broken, or the app shows wrong data.
- **medium:** wrong in edge cases, or inconsistent.
- **low:** minor or latent.

---

## 1. Verdict

**The owner's suspicion is justified.** Normal-day logging of water, BP and weight works. Underneath that there are three problems, in this order of severity:

1. **The medication domain is not trustworthy.** Soft delete (`deletedAt`) is written everywhere but read almost nowhere in the medication code. The dose schedule is rebuilt from *today's* regimen for every past date. Dose logs are keyed on a display time string. Schedule times are stored as fixed UTC minutes that move by one hour at every DST change. Europe/Berlin changes on **2026-10-25**, one month from now. The concrete effects:
   - Completing or editing a titration puts the old dose and the new dose on the schedule together.
   - Deleted prescriptions keep showing as due and keep firing reminders.
   - Android reminders fire 2 hours early all year round.
   - Adherence history rewrites itself whenever the schedule changes.

   Live data shows the damage already happened. A deleted Sacubitril/valsartan prescription collected 81 "taken" logs. On 5 days in August both it and its replacement were logged, which records 400 mg per slot. The replacement's stock reads −7.

2. **Sync is not safe for more than one device or for medication data.** An edit made while a push is in flight is lost. A pull overwrites pending local edits. Phase status changes are silently dropped by last-write-wins (LWW). The pull cursor relies on the client clock, so data written offline never reaches other devices. Fractional amounts are rejected by the server and dropped permanently. The wipe, delete-account and cancel-migration routes fail on a foreign-key error. The push upsert can move a row from one account to another when ids collide.

3. **Records written as a group (meals and drinks) drift after edits and deletes.**
   - Deleting a meal leaves its sodium, water, sugar and potassium rows still counting.
   - Deleting a beverage that has sugar leaves the sugar.
   - Changing a drink's time moves only some of its rows.
   - Undo brings back rows the user had already removed.
   - Create and edit forms apply different validation to the same fields.

What holds up well:
- The Dexie version chain is correctly ordered and complete.
- The Drizzle migrations match the schema (`drizzle-kit generate` reports no changes).
- MCP scoping by userId is correct.
- The AI routes use tool-use with zod validation, and keys are encrypted with AES-GCM.
- `logDrink` itself is sound.
- The progress maths guards against divide-by-zero, NaN and Infinity.
- Two concurrent Take taps do *not* double-deduct stock, because the check runs inside a Dexie transaction.
- The baseline checks are green: typecheck and lint pass, 2244/2244 unit tests and 69/69 integration tests pass. The problems sit in code those gates never exercise.

**Recommendation:** do not do the styling refresh until at least Phases 0–2 of §8 are merged. The refresh will touch every one of these forms and cards, and restyling components whose logic is duplicated three times just preserves all three copies.

### Count by severity and domain (final severities)

| Domain | Crit | High | Med | Low |
|---|---|---|---|---|
| liquids-save | – | 1 | 6 | 4 |
| substance-sugar | – | – | 5 | 3 |
| food-salt-voice | – | 1 | 7 | 4 |
| prescriptions-model | – | 1 | 7 | 1 |
| doses-titration-schedule | 3 | 6 | 4 | 1 |
| dexie-schema | 1 | 3 | 4 | 4 |
| server-schema-parity | – | 2 | 2 | 4 |
| sync-engine | 1 | 8 | 7 | – |
| health-records-inputs | – | – | 4 | 7 |
| dates-timezones | 1 | – | 8 | 1 |
| analytics-history-export | – | 4 | 6 | 5 |
| ai-routes-models | – | 1 | 6 | 14 |
| state-settings-cache | – | 1 | 4 | 4 |
| mcp-server-auth | – | 1 | 3 | 7 |
| core-duplication | – | 2 | 1 | 3 |
| native-android | – | 4 | 4 | 3 |
| baseline-health | – | 1 | – | 7 |
| live-data-forensics | – | 1 | 5 | 4 |
| repro-water-save | – | 1 | 1 | 2 |
| repro-sugar | – | – | 3 | 1 |
| gap-combo-drugs-pill-math | – | 2 | 6 | 5 |
| gap-bulk-dose-actions | – | 1 | 6 | 4 |
| gap-timezone-travel-recalc | – | 1 | 3 | 4 |
| gap-voice-reconcile-save | – | – | 4 | 6 |
| gap-dashboard-metrics-settings-inputs | – | – | 3 | 9 |
| gap-ai-insights-snapshot | – | 1 | 4 | 9 |
| gap-records-history-listing | – | 1 | 4 | 5 |
| gap-inventory-refill-ui-flows | – | – | 5 | 6 |
| **Total (~299 surviving)** | **6** | **44** | **122** | **127** |

Many findings describe the same root cause from different angles. Consolidated, there are roughly **12 root causes** (see §8). Fixing those resolves most of the list.

---

## 2. The two owner-reported bugs

### 2a. "Saving water doesn't work all the time"

This is not one bug. Five independent causes produce the same symptom:

| # | Root cause | Evidence | Fix |
|---|---|---|---|
| 1 | **React Query `networkMode: 'online'` (the default) pauses every Dexie mutation** once the browser fires an `offline` event. Nothing is written, the button stays on "Recording…", and closing the app loses the entry. If the app stays open, the write runs on reconnect with `Date.now()` from that moment (wrong time, possibly wrong day). This affects every `useMutation` in the app, including dose Take/Skip. (`repro-water-save#0`, `gap-bulk-dose-actions#0`) | `apps/web/src/lib/query-client.ts:15-24` sets only query defaults. `use-intake-queries.ts:69-84` uses a plain `useMutation`. Repro: after dispatching `offline`, 0 rows are written and the button stays disabled. After `online`, the row appears. | `new QueryClient({ defaultOptions: { mutations: { networkMode: 'always' }, queries: { networkMode: 'always' } } })`. Every one of these mutations only writes to IndexedDB, and the sync engine already handles connectivity. Add a regression test that dispatches `offline`. |
| 2 | **Recovery from a closed IndexedDB connection (#287) is only wired into voice.** The Water, Beverage and Preset tabs use a bare `catch {}` that shows "Failed to record intake" and throws the cause away. Dexie 4.4.5 auto-reopens in most cases, so this only sticks once a reopen itself has failed. (`liquids-save#0`) | Grep for `recoverClosedDatabase` finds only `voice-panel.tsx:391`. Bare catches at `water-tab.tsx:63,87`, `beverage-tab.tsx:101,126`, `preset-tab.tsx:227,291,325`. | Add a shared `withDbRecovery()` wrapper used by all write hooks. Log the cause, or buffer it in memory, because the error log is itself stored in the same IndexedDB. |
| 3 | **An empty custom date/time throws inside the submit handler.** `dateTimeLocalToTimestamp("")` throws outside any try. Nothing is saved, no toast appears, and the dialog stays open. (`repro-water-save#3`) | `manual-input-dialog.tsx:91`, `date-utils.ts:33-37` | Add `customTime` to the zod schema when "Set different time" is on, and disable "Add Entry" while it is invalid. |
| 4 | **The "tap to edit" button opens a dialog that saves immediately.** It never updates the pending amount. If the user cancels, the value they typed is lost and Confirm saves the old amount. If they use "Add Entry" and then tap Confirm, the drink is logged twice. (`repro-water-save#4`) | `water-tab.tsx:150-170` and `74-86` | Pick one model. Either the dialog only sets `pendingAmount` (relabel it "Set amount"), or relabel it "Log custom amount" and reset the pending amount after it saves. |
| 5 | **Unrounded amounts are silently dropped from sync.** Voice oz→ml gives values like 354.882. The Postgres `integer` column rejects them as `invalid`, and the client drops them from the queue on the first attempt. The value saves locally but never reaches the cloud or MCP. (`server-schema-parity#3`) | `voice-panel.tsx:195-210`, `packages/db/src/schema.ts:72`, `sync-engine.ts:331` | Round in one place: the service layer (`addIntakeRecord`, `addComposableEntry`, `addSubstance`, `updateSubstanceRecord`). Alternatively change these columns to `real`/`numeric`, as migration 0020 did for stock. |

Related problems that make it look like saves fail: undo after the delete has already synced is silently rejected, so the record disappears again (`sync-engine#8`); a pull overwrites an edit made during the push window (`sync-engine#0/#1`); and future-dated entries count toward "today" (`liquids-save#7`).

### 2b. "Sugar isn't filled in when looking up drinks with the old lookup"

"Old lookup" here means the sparkle AI search on the Liquids card's **Coffee and Alcohol** tabs: `PresetTab` → `POST /api/ai/substance-lookup`.

| # | Root cause | Evidence | Fix |
|---|---|---|---|
| 1 | **The endpoint cannot return sugar.** The request enum is `caffeine\|alcohol`. The prompt, the tool schema and the zod response have no sugar field. The tool is `additionalProperties:false`, so the model has nowhere to put it. (`repro-sugar#0`) | `api/ai/substance-lookup/route.ts:14-17`, `schema.ts:3-9`, `packages/ai-prompts/src/substance-lookup.ts:9-99` | Add `sugarPer100ml` (g) and `sodiumPer100ml` to the tool, prompt and schema. The better option is to retire substance-lookup and route this search through the parse/voice-parse contract, so there is a single drink-nutrient schema. |
| 2 | **`handleAiLookup` never sets or clears `sugarG` (or `saltPer100ml`).** Neither do `selectPreset` or deselect. Sugar typed for an earlier drink stays in the field and is logged against the new one. (`repro-sugar#1`, `liquids-save#15`) | `preset-tab.tsx:134-160`, `200-236` | Reset every nutrient field whenever a lookup runs or a preset is tapped. Better, move the form into one reducer where each preset or lookup sets all fields at once. |
| 3 | **`LiquidPreset` has no sugar field.** "Save as preset & log" drops the sugar, so every later tap on that preset logs 0 g. Sugar is also entered as absolute grams while caffeine and salt are per 100 ml. (`substance-sugar#2`) | `lib/constants.ts:111-123`, `preset-tab.tsx:302-316` | Add `sugarPer100ml` and `potassiumPer100ml` to `LiquidPreset`. Scale them by volume in `buildDrink` and persist them in the Settings editor. |
| 4 | **Deleting a drink that has sugar but no caffeine or alcohol orphans the sugar row**, which keeps counting toward the daily total. The unit test asserts this behaviour. (`liquids-save#3`) | `composable-entry-service.ts:226-244` | In `classifyLiquidDelete`, treat any group with no live eating row as a drink and delete it whole. Update the test. |
| 5 | The Food card's AI re-parse only overwrites a field when the new value is above 0, so the previous item's sugar and water carry over to the next one. (`repro-sugar#3`) | `food-section.tsx:266-279` | On every parse, set all fields from the result, using `''` for null or 0. |

Totals are not the problem. `useDailyIntakeTotal` reads live rows correctly. The sugar is lost or wrong at input time, before anything is written.

---

## 3. Critical and high findings

Format: **ID — title**. Files · what happens · fix. Where several findings share a root cause they are grouped under one heading.

### Critical (6)

**C1. dexie-schema#0 (also doses#0, prescriptions#1, core-dup#0, live#0, analytics#5) — Deleted prescriptions and schedules stay on the dose schedule, in reminders and in AI insights.**
- Files: `prescription-service.ts:142-170` · `dose-schedule-service.ts:106-143` · `medication-notification-service.ts:72-80` · `phase-service.ts:55-58` · `analytics-snapshot.ts:45`.
- What happens: delete sets only `deletedAt`, and `isActive`, `status` and `enabled` stay true. Every medication reader filters on those three flags and never on `deletedAt`. **This has happened in the live data:** 81 taken logs were recorded against the deleted Sacubitril/valsartan, including double 200 mg slots.
- Fix: delete must also set `isActive=false`, `status='cancelled'` and `enabled=false`. Backfill existing tombstones in a Dexie upgrade. Route every read through shared "live" selectors (see §4).

**C2. doses#2 (also prescriptions#0) — Completing a titration shows the old and new maintenance doses together.**
- Files: `titration-service.ts:420-446`, `dose-schedule-service.ts:139-143`.
- What happens: the old maintenance schedules are only soft-deleted, and new copies are added with `enabled=true`. The schedule reads both. Schedules that were soft-deleted by earlier plan edits are copied as well. Reproduced: `50mg 08:00` + `100mg 09:00` (+ a duplicate `100mg`).
- Fix: filter `deletedAt` everywhere, set `enabled=false` on the superseded schedules, and add a regression test for complete → daily schedule.

**C3. doses#3 — Editing an active titration plan makes taken doses show as pending again, and re-taking deducts stock twice.**
- Files: `titration-service.ts:238-309`.
- What happens: phases and schedules are recreated with new ids. Dose logs are remapped to the new `phaseId` but keep the old `scheduleId`, so no log matches. The Edit form always resends the entries, so even a title-only edit triggers this. Reproduced: stock 30 → 28 → 26.
- Fix: update schedules in place and keep their ids, or remap `scheduleId` as well. Mark replaced phases as cancelled.

**C4. doses#4 — Activating an edited draft plan re-activates the soft-deleted phases.**
- Files: `titration-service.ts:350-362`.
- What happens: `activateTitrationPlan` selects `status==='pending'` without checking `deletedAt`. About half the time (depending on UUID order) the schedule shows the discarded dose.
- Fix: filter `deletedAt===null` in activate, complete and cancel, and in `getPhasesForTitrationPlan`.

**C5. dates-timezones#9 (also analytics#0/#1, baseline#2) — "Delete data older than N days" deletes active prescriptions, schedules and inventory, and filters on `createdAt`.**
- Files: `data-deletion-service.ts:21,66`, `delete-data-controls.tsx:38`.
- What happens: `DELETABLE_TABLES` is the whole push order minus userProfile. A prescription set up 100 days ago is tombstoned and the tombstone is synced, while a record backdated last year that was entered yesterday survives. The feature has 0% test coverage.
- Fix: restrict this to time-series tables (intake, substance, weight, BP, eating, urination, defecation, and dose logs by `scheduledDate`) and filter on the event `timestamp`. Never delete configuration by age.

**C6. sync-engine#1 (also repro-water#6) — A pull overwrites pending local edits, and the push then sends the stale server copy.**
- Files: `sync-engine.ts:539-546` (`bulkPut(rows)` with no updatedAt or queue check), `startEngine` (pulls only).
- What happens: the newer edit is lost on both the device and the server. This triggers on the startup pull, and on a single device through the 30 s skew re-scan.
- Fix: when applying a pull, skip rows that have a pending `_syncQueue` entry or a local `updatedAt` at least as new. Push before the startup pull.

### High (44), grouped by root cause

**Soft delete, stock and history**
- **dexie-schema#1 (prescr#2, doses#15) — The app-launch stock recount counts soft-deleted transactions again.** `inventory-service.ts:268-276` (`getCurrentStock` has no `deletedAt` filter) runs on every launch via `providers.tsx:52-59`. A deleted refill comes back (30 → 130) and is pushed to the server. *Fix:* filter `deletedAt===null`. The existing unit test asserts the bug and must be changed.
- **dexie-schema#6 (prescr#15), core-dup#4 — Stock is stored twice** (cached `currentStock` plus the transaction ledger), and the MCP uses `SUM()::int`. The launch recount stamps `updatedAt=now` on every item and pushes it, overwriting other devices. *Fix:* derive stock from the ledger in one helper, and drop the synced `currentStock` or make it local-only.
- **dexie-schema#3 (sync#5) — Hard deletes are never synced.** `deletePrescription` hard-deletes dose logs and inventory transactions with no enqueue (`prescription-service.ts:146-150`). `updatePhase` `bulkDelete`s schedules, and the stub tombstone fails server validation (`phase-service.ts:268-273`, `sync-payload.ts`). Removed dose times come back on a fresh device. *Fix:* soft-delete and enqueue. Never hard-delete synced tables.
- **live-data#1 — Same root cause, seen in the owner's data:** 81 orphan dose logs are live on the server.
- **prescriptions#3 (doses#14) — Editing a schedule rewrites history.** Dose logs store no dose. Past days are rebuilt from the current phase (ignoring `startDate`) and matched by `phaseId|scheduleId`. `updatePhase` hard-deletes rows that were removed. Taken doses relabel to the new amount, and any row that is deleted and re-added turns every past day into "missed". *Fix:* snapshot dose, unit, pills and strength on the DoseLog, and resolve each past date from the regimen that was effective on that date.
- **doses#13 (dates#7, analytics#6) — History and adherence use the current regimen for past dates.** `dose-schedule-service.ts:115-143`, `analytics-service.ts:285`. A completed titration phase shows 0% adherence. Starting a titration marks months of maintenance as missed. *Fix:* the same effective-dated resolution.

**Dose keys and actions**
- **doses#5 (prescr#5, dates#1, live#6) — Dose logs are keyed on the display time string.** `dose-log-service.ts:110-129` looks up by `scheduledTime===time`, while the view keys ignore time. The detail dialog's past-date Take passes the picked time as the key and never passes `takenAtTime` (`dose-detail-dialog.tsx:64-75`). The result is a duplicate log, a wrong `actionTimestamp`, and an Untake that never restores the pill. Schedule-time edits and DST changes also break the lookup. *Fix:* key logs on `(scheduleId, scheduledDate)` with a unique index. In the dialog, pass `time: slot.localTime, takenAtTime`.
- **doses#6 (prescr#6) — Reschedule does nothing useful.** The pending log at the new time has no slot. The two logs collide in `logMap` (last one wins, in UUID order), so after a Take the row can still show "pending". *Fix:* store an effective-time override on a single log and build the slot from it.
- **gap-bulk#0 — Dose mutations pause while offline** (see 2a#1) and then record the reconnect time as the time taken.

**Time and DST**
- **doses#7 (dexie#4, dates#0, live#3) — Schedule times move by one hour at every DST change.** `timezone.ts:47-55` uses today's offset for both encoding and decoding, and recalculation only runs when the IANA zone name changes. From 26 Oct, an 08:30 dose shows as 07:30. *Fix:* treat wall-clock `time` + IANA zone as the source of truth and resolve per date.
- **gap-tz#0 — Travel recalculation across DST writes the drift into `time`.** `timezone-recalculation-service.ts:37-50` decodes UTC with the current offset and overwrites `time`. After one Adjust the original 08:00 is unrecoverable. *Fix:* recalculation should only change the anchor and recompute UTC from `time`.
- **native#0 (doses#8, dexie#5, dates#2, live#2) — Android reminders use UTC hour/minute as local time.** `local-notifications.ts:72-74` feeds Capacitor `on:{hour,minute}`, which is read in device time. They fire 2 h early in Berlin summer, 06:30 instead of 08:30. The unit test only covers UTC. *Fix:* use `utcMinutesToLocalTime(...)`, or better, the stored local `time`.
- **native#1 (doses#9) — Native reminders fire for both the maintenance and the titration phase.** There is no titration-first selection. *Fix:* use one shared effective-phase helper.
- **native#2 (doses#12) — Native reminders are only rebuilt on cold start.** The resync hooks (`useAdd/Update/DeleteSchedule`) are never used. Wizard, phase, titration, delete, timezone and pull changes never reschedule. *Fix:* resync from a debounced Dexie hook on the medication tables and after each pull.
- **doses#10 (mcp#5, state#1), state-settings#0 (dates#4, core#5) — Push reminders don't work in the background and send the wrong content.** There is no scheduler for `/api/push/send`. The client pings only while `/medications` is open. The payload is built from **today's** slots and spread across the union of weekdays. An empty day never clears the server. *Fix:* add a real cron, build per-weekday entries from the regimen, and always sync (including an empty list).
- **dates#6 was downgraded to medium** (see §7).

**Sync engine**
- **sync#0 — An edit made while a push is in flight is acked out of the queue.** Coalescing reuses the queue row id, and the ack deletes it (`sync-queue.ts:62-65`, `sync-engine.ts:304`). *Fix:* ack only if `enqueuedAt` still matches the snapshot.
- **sync#2 (prescr#7, dexie#2) — `updatePhase`, `activatePhase` and `startNewPhase` never bump `updatedAt`.** The server's LWW (strict `>`) skips the write and acks it anyway. Unit and food-instruction edits never reach the server. *Fix:* stamp `updatedAt` on every synced update through a helper.
- **sync#3 — The pull cursor uses the client's `updatedAt`.** Rows written offline, or from a device with a slow clock, never reach other devices. *Fix:* add a server-assigned `server_updated_at` or sequence column for the cursor.
- **sync#4 — Queue rows whose record was hard-deleted are never acked.** 50 of them at the head of the queue stop all sync. *Fix:* drop upsert rows whose record is missing when collecting.
- **sync#6 (server#1) — Wipe, delete-account and cancel-migration fail on a foreign-key error.** `dose_logs` is deleted before the rows that reference it (`user-data-deletion.ts:43`, `cleanup/route.ts:10`). Deleting an account is impossible for anyone who has logged a dose against inventory. *Fix:* delete children first, inside one transaction, and add a real-Postgres test.
- **sync#7 — Cancel-migration ignores the cleanup response.** It wipes the whole account's cloud data, and auto-detect later switches the device back to cloud sync. The upload loop is also never aborted. *Fix:* check `res.ok`, abort the loop, and persist the user's explicit mode choice.
- **sync#9 — Switch-to-local wipes the cloud even when the pull before it failed or was skipped.** *Fix:* make `runPullCycle` return success, wait for any in-flight pull, and abort the wipe unless it succeeded.
- **sync#10 (server#2) — An empty `indication` is coerced to NULL, and the NOT NULL constraint rejects it.** The prescription and all its children are dropped after 8 attempts. The wizard defaults this field to `""`. *Fix:* coerce only `undefined`, or make indication optional.
- **server-schema#3 (liquids#8, sugar#8, food#3, core#1, repro-water#1, repro-sugar#4, ai#26) — Integer columns reject fractional values.** Voice food, voice water/salt, AI enrichment and the Records caffeine edit all write fractions, which are dropped as `invalid`. *Fix:* round once in the service layer, or switch to `real`.
- **server-schema#4 (sugar#17) — Backup restore validators have drifted.** `potassium` is missing from the intake enum and PRN dose logs require `phaseId`. They are silently skipped, and replace mode deletes them first. *Fix:* derive the backup validators from drizzle-zod, or add the missing values, and add a parity test.

**Records, analytics, export**
- **food-salt-voice#0 — Deleting a meal leaves its sodium, water, sugar and potassium rows counting.** `useDeleteEating` soft-deletes only the eating row (`eating-service.ts:52`). *Fix:* use `deleteEntryGroup` from the Food card and the Records tab, plus a repair migration for existing orphans.
- **analytics#3 — Restoring a backup after any deletion imports nothing.** Tombstoned ids count as duplicates, and `isContentEqual` ignores `deletedAt` (`backup-service.ts:133,406,600`).
- **analytics#4 (sync#15) — Import and conflict resolution never enqueue for sync.** Restored data never reaches the cloud, and replace mode never sends tombstones.
- **analytics#7 — Correlations use each day's mean entry instead of the daily total** (`analytics-stats.ts:118-133`). Intake correlations are meaningless, and eating and defecation always come out as "none".
- **analytics#8 — CSV export writes BP as systolic only**, presents estimated urination as measured ml, never fills the note column, and has no dose logs.
- **gap-records#0 — Potassium rows are labelled "Sodium"** in Records (`record-row.tsx:29-37`).
- **ai#1 — The interaction-lookup cache is keyed only by substance name**, so a newly added medication is ignored for 24 h and can produce a false "No significant interactions".
- **gap-ai-insights#0 — During titration the AI medication summary picks a phase arbitrarily.** It often reports the old dose, and days-on-phase of 200.
- **mcp#0 — `list_medications` returns maintenance and titration as both active** with no precedence rule, so the model sees two regimens.

**Pill maths and labels**
- **gap-combo#0 — "Take 2 tablets of 200mg"** for a 200 mg dose on 100 mg tablets. The single-compound label puts the *total* dose after "of" (`medication-ui-utils.ts:102-104`). *Fix:* always show the per-tablet strength.
- **gap-combo#1 — `formatPillCount` concatenates the parts:** 1⅓ → "10.33 tablets", 2.996 → "21 tablets" (`medication-ui-utils.ts:69-81`).
- **doses#19 — Titration hard-codes `unit: "mg"`**, and completing it overwrites the maintenance unit, so a mcg drug is labelled mg.

**Auth, native, platform, UI**
- **native#5 — `useAuth` on native wipes the token on any non-2xx reply**, including a Neon outage mapped to 401. After an offline cold start, sync never starts for that session.
- **baseline-health#0 — The web reminder/refill service ignores `deletedAt`** and has 0% test coverage.
- **liquids-save#0** (see 2a#2). **repro-water-save#0** (see 2a#1).

---

## 4. Schema assessment

### What is wrong with it today

**Dexie (v22) and Postgres (packages/db/migrations):**
1. **Lifecycle state is spread over four fields that drift apart:** `isActive` (prescriptions, inventory), `status` (phases, plans), `enabled` (schedules) and `deletedAt` (everything). Delete sets only one of them, and readers check only the other three.
2. **`deletedAt: null` cannot be indexed** (null is not an IndexedDB key), so every "live" read is a full scan followed by a JS filter. Nothing forces callers to remember that filter. Boolean indexes (`isActive`, `enabled`) never match anything, and the debug stock panel queries one.
3. **Stock is stored twice:** `inventoryItems.currentStock` (marked deprecated, but it is the value the UI shows and it is synced with LWW) and the transaction ledger. Four different computations disagree with each other: the cache, `getCurrentStock`, the MCP `SUM()::int`, and the edit/delete recompute.
4. **Schedule time is stored three ways:** `time` (HH:MM, deprecated but still read by the web notifier), `scheduleTimeUTC` (fixed with the offset of the day it was saved, so it drifts at DST), and `DoseLog.scheduledTime` (a string that depends on the device's timezone).
5. **Dose logs do not record what was taken:** no dose, unit, pill count or strength, and `inventoryTransactions.doseLogId` is NULL on a first take. History can only be rebuilt from the current regimen. There is no natural key, so two devices marking the same slot create duplicate rows.
6. **Overloaded or implicit meanings.** `IntakeRecord.type='salt'` actually stores sodium mg (and the MCP exposes it as `salt_mg`). The unit of `amount` depends on the type and is not stored. `source` combines a kind with a foreign key (`preset:<uuid>`, `substance:<id>`, `food:ai_parse`). `groupSource` and `amountEstimate` are free strings.
7. **Integer columns sit next to float TypeScript types** (`amount`, `amountMg`, `volumeMl`, `grams`, `heartRate`). Only some writers round, and the rest are dropped by sync.
8. **Nullability is out of step.** TypeScript uses `field?: T` and code checks `!== undefined`, but pulled rows contain `null`. `sanitizeRow` turns `""` into `null`, which then fails NOT NULL. Clearing a field with `undefined` never reaches the server (`health-records#4`).
9. **The ownership key is `id` alone.** The push upsert `ON CONFLICT(id)` with no user guard can reassign another account's row (`server-schema#0`, rated medium because it needs two whitelisted accounts). Inner foreign keys allow references across users.
10. **User data that should sync lives in localStorage:** limits, buffers, liquid presets, `dayStartHour`, optional trackers, regions. It is not synced, not restored from backup, and "Reset to Defaults" wipes it. `push_settings.day_start_hour` is hard-coded to 2.
11. **Unbounded or dead tables and fields:** `auditLogs` has no retention (`purgeOldAuditLogs` is never called) and gets one row plus N item pushes per launch. `dailyNotes` has no UI and its add path bypasses sync. `sourceRecordId` is read only by MCP. Legacy `timezone` fields are local-only. `PhaseSchedule.unit` is never written. The `'adjusted'` and `'initial'` transaction types have no writer.
12. **Unit is stored three times** (phase, inventory, schedule) with no conversion. There is also no CHECK on ranges: negative amounts, `scheduleTimeUTC` > 1439, weekday 9 are all accepted.
13. **The parity test compares field names only.** Types, nullability, enums and CHECK constraints, foreign-key deletion order, and backup schemas are all invisible to it.

### Recommended target model

Keep the "every table mirrored Dexie ↔ Postgres" design, and fix the model underneath it.

**Common columns (all synced tables)**
- Replace `deletedAt: number|null` with `deletedAt: number` where **0 means live** (indexable), or add `isDeleted: 0|1`. Add compound indexes such as `[isDeleted+timestamp]` and `[isDeleted+type+timestamp]`.
- Postgres: add `server_updated_at timestamptz DEFAULT now()`, set on every write, and use it for the pull cursor. Keep the client `updatedAt` for LWW only. Primary key `(user_id, id)`, or `UNIQUE(user_id,id)` plus an ownership guard on the upsert.
- Every read goes through a `live(table)` helper in `@intake/core`.

**Medication domain**

| Table | Change |
|---|---|
| `prescriptions` | Add `lifecycle: 'active'\|'paused'\|'archived'` and remove `isActive`. `indication` becomes nullable. `compounds` stays as a reference only. |
| `medicationPhases` | Keep `status` (`pending\|active\|completed\|cancelled`) as the one lifecycle field and remove the need for "delete while still active". Add a **partial unique index "one active phase per prescription"**, or keep titration and maintenance and add an explicit `supersedesPhaseId`. `startDate` and `endDate` are authoritative for effective dating. Make `unit` a controlled enum. |
| `phaseSchedules` | **Source of truth: `localTime 'HH:MM'` + `timezone` (IANA) + `daysOfWeek`.** Drop `scheduleTimeUTC`, or make it derived and never read. Add `effectiveFrom` / `effectiveTo` so edits create a new version instead of mutating or hard-deleting rows. Remove `enabled` in favour of `effectiveTo` / soft delete. |
| `doseLogs` | **Snapshot at action time:** `doseAmount`, `unit`, `pillsConsumed`, `inventoryItemId`, `pillStrength`, `kind ('scheduled'\|'prn')`, `scheduledAt` (an instant) + `scheduledDate` (local). **Natural key `UNIQUE(user_id, schedule_id, scheduled_date) WHERE kind='scheduled' AND deleted=0`**, with a deterministic id (a hash of scheduleId and date) so writes from two devices converge. Remove `scheduledTime` as a lookup key. Add `effectiveTime` for reschedules. |
| `inventoryItems` | **Remove `currentStock` from the synced schema.** Keep it only as a device-local cache, or derive it as `SUM(transactions WHERE live)`. Add `lifecycle` and remove `isActive` / `isArchived`, plus a partial unique index "one active brand per prescription". `strength > 0`, CHECK constraint. Make `refillAlert*`, `strength`, `unit` and `brandName` editable in the UI. |
| `inventoryTransactions` | The ledger is authoritative. `type` is one of `initial\|refill\|adjusted\|consumed\|reversal`. `doseLogId` is always set for `consumed` and `reversal`. Undo writes a `reversal` that points at the original transaction instead of recomputing. Amount is `real`. |
| `titrationPlans` | Stays. Phases are cancelled when replaced, and ids are kept on edit. |

**Intake domain**

| Table | Change |
|---|---|
| `intakeRecords` | Rename type `salt` → **`sodium`**. `amount` becomes `real` (or round in one choke point). Add `unit` (enum), and CHECK `amount >= 0`. Split `source` into `sourceKind` (enum) + `presetId?` + `linkedRecordId?` + `displayName` (the stored name, used for labels instead of looking up the preset). |
| `substanceRecords` | `amountMg` and `volumeMl` become `real`. Always store `volumeMl` and `abvPercent`. Derive `amountStandardDrinks`, or tag it with `stdDrinkGrams` so the old 14 g rows can be told apart. |
| groups | Add an explicit **`entryGroups`** table (`id, kind: 'meal'\|'drink', timestamp, name`). Members reference `groupId`, and edits to time or delete operate on the group as a whole. This removes the per-caller cascade logic that has drifted. |
| `eatingRecords` | Show `grams`. `note` can be cleared (write explicit `null`). |

**Settings and profile:** add a synced `userSettings` row (one per user) holding limits, buffers, `dayStartHour`, optional trackers, regions and `homeTimezone`. Move `liquidPresets` into a synced `liquidPresets` table with a `sugarPer100ml` field. Keep only device UI preferences (theme, animations) in localStorage. `userProfile` gets a deterministic id (the userId).

**Housekeeping:** add retention for `auditLogs` (90 days, device-local or pruned). Either implement `dailyNotes` properly or drop it. Drop the dead `time`, `sourceRecordId`, legacy `timezone`, `PhaseSchedule.unit`, `substanceConfig`, `aiAuthSecret`, `dataRetentionDays`, the `weightGraphShow*` settings and `saltIncrement`.

### Migration notes
- **Dexie v23, repair pass:**
  1. For every row with `deletedAt != null`, set `isActive=false`, `status='cancelled'`, `enabled=false`.
  2. Convert `deletedAt: null` to `0` if you adopt the sentinel.
  3. Tombstone intake rows whose group's only eating row is deleted (meal orphans), and do the same for drink groups whose water row is deleted.
  4. Normalise legacy sources `food:ai_parse` and `manual:<preset>` to `manual:sodium` / `manual:food_water_content`.
  5. Recompute `currentStock` from **live** transactions.
  6. Enqueue every changed row so the server heals.
- **DST:** rebuild `scheduleTimeUTC` from `time` + `anchorTimezone` *before 2026-10-25*. `time` is still correct for every schedule unless it went through a travel recalculation (gap-tz#0).
- **Postgres:** migrations add `server_updated_at` (backfill `= updated_at`), the dose_log partial unique index (dedupe first), the `(user_id,id)` uniqueness, CHECK constraints, and `real` columns. Remember the journal-timestamp caveat in CLAUDE.md: we are past 2026-05-31, so **do not hand-edit `when`**.
- **Historical alcohol:** backfill `abvPercent` from volume and std drinks for the 14 g window (2026-03-29 → 05-08), then recompute. Fix persisted presets whose `alcoholPer100ml < 3` (they were stored in std-drinks/100 ml units).
- **Server:** the orphan dose logs and transactions for deleted prescriptions need a one-off server-side tombstone script. It cannot be done from the client because the client no longer has those rows.
- The parity test must also compare nullability, number type (int vs float), and enum/CHECK lists against the TypeScript unions and the backup zod schemas.

---

## 5. AI models and integration status

| Tier | Model id | Used by | Status |
|---|---|---|---|
| fast | `claude-haiku-4-5-20251001` | bug-report | Current. |
| quality | `claude-sonnet-4-6` | parse, voice-parse, substance-lookup, substance-enrich, nutrient-analysis, insights (fast) | One generation behind Sonnet 5. |
| premium | `claude-opus-5` | medicine-search, interaction-check, titration-warnings, deep insights (batch) | Still a valid default. Opus 5.5 is available if chosen explicitly. |
| transcription | Groq `whisper-large-v3-turbo` | voice-transcribe | The only non-Anthropic provider. |
| tool | `web_search_20250305` | parse, lookup, enrich, nutrient, deep | Legacy version. `web_search_20260209` (dynamic filtering) is supported. |

**Upgrade blockers (ai#4, low, but they matter as soon as you upgrade):** every Sonnet route sends `temperature`, which Sonnet 5 rejects with a 400. Medicine-search, interaction-check and titration-warnings force `tool_choice:{type:'tool'}`, which Opus 5.5 rejects with a 400. `premium-model-sampling.test.ts` guards temperature only for premium routes. No route uses `strict:true` or structured outputs. Upgrade order: remove temperature → replace forced tool_choice with strict tools, auto choice and a retry → bump the ids → set `effort` explicitly.

**Integration problems that are live today:**
- The voice transcript is **cut to 500 characters** by `sanitizeForAI` while zod allows 2000, so items spoken after about 35 s are silently dropped (food#2, medium). Voice also drops invalid items and caps the list at 20 without telling the user (ai#11).
- **The interaction cache ignores the medication list** for 24 h (ai#1, high). The check doesn't verify that every medication was assessed, so an omitted drug looks the same as OK (ai#18).
- **The nutrient-analysis card uses a raw relative `fetch()`**, which is dead on Android (native#6, medium).
- **substance-lookup cannot return sugar** (see 2b). `substance-enrich` and `runSubstanceEnrichment` are dead code (ai#8), and their prompt re-allows recalled figures that #262 forbade.
- **`waterContentPercent`** is fetched and stored but never applied. Spirits count as 100% water via presets and voice, but about 60% via text parse (ai#9).
- **Voice-parse timeout handling is dead.** The SDK error name is `Error`, so a timeout becomes a 502 after up to 3 retries (ai#6).
- **Insights payload:** the water *limit* is sent as a "goal" and "on target" means drinking more (a problem for a fluid-restricted heart-failure user, insights#1). Trackers the user never logs are sent as 0 (#5). Caffeine and alcohol are never sent (#6). PRN medications and adherence are missing (#3). Alternate-day schedules are sent as "twice daily" (#2). "Include previous summary" bypasses the sharing toggles (#4). The phase is chosen arbitrarily (#0).
- **Deep reports** are rejected entirely when there are more than 30 sources or one entry isn't a URL (ai#15). Polling uses the caller's *current* key, so switching keys leaves the job stuck for 24 h (ai#14). The result only reaches the device through an ungated full pull (insights#8).
- **Cost tracking** undercounts: web-search fees, errored calls and the batch discount are missing, and totals are not split by model (ai#13).
- **No `stop_reason` handling** on the synchronous routes (ai#19). Rate limiting is per IP and in memory, and titration-warnings (Opus) has none (ai#21).
- **Salt → sodium conversion is inconsistent:** the prompts use ×400 / ÷2.5 while the UI uses ×0.39 (core#13). The parse tool description omits the g→mg step (ai#22).

---

## 6. Input consistency matrix

"Create" is the card or dashboard form. "Card edit" is the inline `useEditRecord`. "Records edit" is the dialog on the Analytics › Records tab. HistoryDrawer and `use-record-adapters` are **not mounted** (dead code).

| Record | Create | Card edit | Records edit | Voice | Notes |
|---|---|---|---|---|---|
| **Water** | Manual dialog: `parseInt` (`1e3`→1), HTML `max` not enforced, empty time throws. Tap-to-edit saves directly. | No max date, `parseInt`. | No max date. | No rounding (oz→ml fractions are dropped by sync). | Future dates count in "today". Seconds truncated on every edit. |
| **Beverage / preset** | Sugar in absolute g. Preset has no sugar. AI lookup has no sugar and keeps stale sugar/salt. Sugar field ignores the tracker toggle. | Renaming doesn't change the label. Can resurrect caffeine from the preset. Time edit leaves salt/potassium/sugar behind. | Deleting water keeps caffeine. Deleting caffeine removes water/sugar with no undo. | Solutes saved but not shown in review. Reconcile merges different drinks that share one token. | Label comes from the local preset list, not the stored name. |
| **Food / sodium** | Needs a nutrient value (plain meal can't be saved). Re-parse keeps previous values. 0.39 conversion. | Sodium doubles on legacy-source meals. A save before prefill finishes wipes nutrients. | Time/note edit doesn't move linked rows. Note can't be cleared. | Timestamp = save time (spoken times ignored). Fractions dropped by sync. | Delete orphans sodium, water, sugar and potassium. |
| **Weight** | 0.1–1000 kg. Typed value **snapped to the increment** (72.4 → 72 at a 1 kg step). No note. Defaults to 69 kg. | > 0, no max, step 0.01. Clearing the note is not synced. | Step 0.1 blocks .x5 values. Min 0.1. | 1–500 kg. Note = "voice". | No undo for delete. |
| **BP** | Sys 50–300, dia 20–200, HR 20–250, `parseInt`. **Accepts sys < dia** (80/120 → "Grade 3"). No note. | > 0, no upper bound. HR and irregular flag can't be cleared. | Sys 60–300, dia 40–200, HR 30–250. No irregular field. Clears ignored. | Sys 40–260. Irregular flag dropped. | No undo for delete. |
| **Urination** | Always has an amount (no "none"). Time = when the card mounted. Quick buttons commit instantly and double-fire (27 near-duplicate pairs in live data). | No "none". | "None" is a no-op. | Allows no amount, which analytics imputes as 300 ml. | Edit dialogs accept future dates (live row 8 h ahead). |
| **Defecation** | Has "No estimate". Time = when the card mounted. | Works. | "No estimate" is a no-op. | — | — |
| **Prescription** | Free-text strength: `1,000 mg` → 0, blank → 1 mg, `.5` → 5. Negative custom dose accepted. One dose for all times. Blank indication breaks sync. | Free-text unit relabels without converting. Split doses are possible here but not in create. | — | — | Inactive or archived items can't be reached again. Brand strength and thresholds can't be edited. |
| **Titration** | Unit hard-coded `mg`. Summed mg for combination drugs with no tablet preview. Start date never auto-activates. | Every edit recreates phases (C3). | — | — | AI warnings request gets wrong totals and frequency. |
| **Dose action** | Row Take (past date): picker defaults to **now**. Mark All: same. Detail dialog: defaults to the slot time but passes it as the key. Future dates can be taken from the detail drawer. Empty picker → "now". | Undo is tied to the slot key, not the log. Toast limit 1. | — | — | Offline → paused (2a#1). |
| **Stock** | Wizard `parseInt` (27.5 → 27). Refill form prefilled with 30, positive only. | Refill edit accepts 0 or negative. Note can't be cleared. | — | — | No "set counted value". The `'adjusted'` type is unreachable. |

---

## 7. Medium and low findings by domain

Titles are shortened. The key file is in the finding JSON. Where a verifier corrected a claim, the correction is folded into the title.

### liquids-save
| ID | Sev | Issue |
|---|---|---|
| #3 | M | Beverage-with-sugar and solute-only drink delete orphans sugar/salt (orphans are still deletable in Records) |
| #4 | M | Undo of a group delete brings back substances removed earlier (drink groups with ≥ 2 substances) |
| #5 | M | Time edit leaves salt, potassium and (conditionally) sugar at the old time |
| #7 | M | Future-dated entries count toward today and 24 h, and pin to the top of Recent |
| #9 | M | `preset:manual` rows have no label (note ignored); renaming never changes the label |
| #6 | L | Edit form resurrects a cleared caffeine value from the current preset (visible in the form) |
| #12 | L | `parseInt` turns `1e3` into 1 ml (the decimal case is blocked by the browser) |
| #13 | L | Beverage manual-dialog path keeps the name; dialog is titled "Water" |
| #14 | L | `isLoading` guard is dead (useLiveQuery defaults to 0) |
| #15 | L | Save-as-preset writes before logging; stale salt carries over after AI lookup |

### substance-sugar
| ID | Sev | Issue |
|---|---|---|
| #2 | M | Presets have no sugar field (see 2b) |
| #3 | M | Historic std drinks mix 14 g and 10 g conventions; the edit back-derives the wrong ABV |
| #4 | M | Presets persisted between 03-24 and 03-29 store std-drinks/100 ml, now read as % ABV |
| #5 | M | Preset editor can't clear a nutrient (merge keeps the old value) |
| #15 | M | Sugar tracker toggle ignored by the Beverage and Coffee/Alcohol tabs and the Recent badge |
| #13 | L | "Beverage" preset category can be created but is never rendered |
| #14 | L | Settings label shows ABV as "std alc/100ml" |
| #16 | L | Stale `aiLookupUsed` duplicates presets; 0.4 g sugar is rounded away |

### food-salt-voice
| ID | Sev | Issue |
|---|---|---|
| #1 | M | Editing legacy-source meals doubles sodium once (only meals from 03-24 to 04-06 still in the last 5) |
| #2 | M | Voice transcript truncated to 500 chars |
| #7 | M | A plain meal with no nutrients can't be saved; the else-branch is dead |
| #8 | M | Records-tab meal time/note edit doesn't move linked rows; note can't be cleared |
| #9 | M | Editing a meal's water row in Liquids re-times the meal's sugar and splits the group |
| #11 | M | Voice ignores spoken times |
| #13 | M | Food AI parse drops a drink's caffeine (different record type from voice) |
| #15 | L | Sodium/sugar headline capped at the limit when the buffer is 0 |
| #16 | L | Dead code: ComposablePreview, recalculateFromCurrentValues stub, saltIncrement setting |
| #17 | L | Saving a Food edit before prefill wipes nutrients (only if prefill is rejected) |
| #18 | L | Parse and enrich route comments say "Opus" but the code uses Sonnet |

### prescriptions-model
| ID | Sev | Issue |
|---|---|---|
| #4 | M | Undo, skip and reschedule restore stock using the current dose and strength |
| #9 | M | Wizard strength parsing: `1,000 mg` → 0, `.5` → 5; preview uses a different regex |
| #10 | M | Negative custom dose accepted; schedule-step validation checks a field that is never used |
| #11 | M | Deactivated prescriptions and archived brands can't be reached again |
| #12 | M | Deleted inventory items stay visible, switchable and debitable |
| #13 | M | Brand switch is two writes; no single-active-brand guarantee |
| #14 | M | No unit or strength compatibility check when adding a brand |
| #18 | L | Dead APIs (getDailySchedule, activatePhase…); initial stock is written as 'refill' |

### doses-titration-schedule
| ID | Sev | Issue |
|---|---|---|
| #11 | M | Reminders keep firing after the dose is taken; different tags on each channel |
| #21 | M | Titration start date never auto-activates |
| #22 | M | PRN doses are write-only (no list or undo) |
| #24 | M | createdAt cutoff uses the UTC date; in-app reminder reads `time` while the UI reads UTC minutes |
| #25 | L | AI titration-warnings total ignores days, frequency and currentDosage |

### dexie-schema
| ID | Sev | Issue |
|---|---|---|
| #7 | M | v12 keyword migration invented caffeine/alcohol records ("ginger", "instead") that were never grouped |
| #10 | M | Audit log is unbounded; every launch writes a row and pushes every item |
| #11 | M | Deprecated `time` is still indexed and still used as the source of truth |
| #12 | M | `salt` type stores sodium; units are implicit; int vs float |
| #8 | L | Boolean indexes never match; debug stock panel is always empty |
| #9 | L | `deletedAt:null` can't be indexed; full scans (performance only) |
| #13 | L | Enums and foreign keys stored as free strings |
| #15 | L | Local-only `timezone` field on medication tables |

### server-schema-parity
| ID | Sev | Issue |
|---|---|---|
| #0 | M | Push `ON CONFLICT(id)` can reassign another account's row (needs two whitelisted accounts) |
| #6 | M | No uniqueness on scheduled dose logs; two devices produce duplicate rows and double-deduct on recount |
| #7 | L | `push_subscriptions.user_id` is UNIQUE, so only the last web-push device gets reminders |
| #9 | L | Parity test checks field names only |
| #10 | L | No domain CHECK constraints |
| #11 | L | First take writes a consumed transaction with no doseLogId |

### sync-engine
| ID | Sev | Issue |
|---|---|---|
| #8 | M | Undo after the delete has pushed is rejected by the "tombstones are sticky" rule, and the pull deletes the row again |
| #11 | M | Sign-out keeps queue and cursors; the next account pushes them (single-owner deployment) |
| #12 | M | Migration ignores per-row rejections; hash verification is dead code |
| #13 | M | Rejected ops dropped after 8 attempts (counter shared with network failures); pull clears the error banner |
| #14 | M | Queue not flushed on web startup; queueDepth reads 0 (native is fine) |
| #16 | M | Auto-detect overrides an explicit local-only choice and skips migration |
| #18 | M | Profile id is per device; the first save on a fresh device hides the old profile |

### health-records-inputs
| ID | Sev | Issue |
|---|---|---|
| #0 | M | Records weight dialog `step=0.1` blocks every .x5 value |
| #3 | M | Clearing note, HR, amount or irregular flag is ignored in Records and BP card edit |
| #4 | M | Card edits that clear a field send `undefined`; the server keeps the old value and the pull restores it |
| #7 | M | No undo for weight or BP deletes |
| #8 | L | Records tab and the dead HistoryDrawer keep diverging copies of the edit logic |
| #10 | L | Weight/BP create has no note field; voice stamps "voice" into the note |
| #11 | L | Urination has no "No estimate" option |
| #12 | L | Every edit truncates the timestamp to the minute |
| #13 | L | Daily notes have no UI, and their add path bypasses sync |
| #14 | L | Undo result is ignored |
| #15 | L | Weight card defaults to 69 kg |

### dates-timezones
| ID | Sev | Issue |
|---|---|---|
| #3 | M | Three reminder paths use three time definitions (in-page path only runs on /medications) |
| #5 | M | `dayStartHour` only affects dashboard totals; analytics and medications use midnight; push stores 2 |
| #6 | M | MCP `get_today_summary` uses server UTC with a hard-coded 2am day start |
| #10 | M | Today's caffeine/alcohol lags up to 60 s; water has no upper bound; inconsistent range ends |
| #11 | M | Time inputs prefilled at mount time (urination/defecation details use it unconditionally; manual dialog is fine) |
| #12 | M | Custom analytics range parses YYYY-MM-DD as UTC; preset ranges go stale overnight |
| #15 | M | Medications "today" is fixed at mount; header shows "Today" for yesterday |
| #16 | M | Retroactive take after midnight is recorded on the scheduled day, about 22 h early |
| #19 | L | Dashboard weeks are fixed 24 h × 7 blocks starting Monday; medications weeks start Sunday |

### analytics-history-export
| ID | Sev | Issue |
|---|---|---|
| #2 | M | "Clear All Data" clears intake records only |
| #9 | M | Records-tab water delete leaves caffeine/alcohol (HistoryDrawer is unmounted) |
| #10 | M | Adherence counts today's not-yet-due doses |
| #13 | M | Daily averages divide by the calendar span; "All" divides by active days; AI uses 30 |
| #16 | M | PDF Recent table sorted as text then truncated |
| #19 | M | Titration tab ignores the range and lists deleted phases |
| #17 | L | PDF with "All" loops every day since 1970 (~14 s) |
| #18 | L | Nutrient scans live only in state (documented as session-only) |
| #20 | L | Import toast total omits profile and reports |
| #21 | L | Dead backup and history paths (replace mode unreachable and non-atomic) |
| #22 | L | Summary totals print float noise |

### ai-routes-models
| ID | Sev | Issue |
|---|---|---|
| #6 | M | Voice timeout detection is dead (SDK error name is "Error") |
| #9 | M | waterContentPercent unused; spirits count 100% vs 60% |
| #11 | M | Voice drops malformed items and caps at 20 silently |
| #14 | M | Deep-insight polling uses the current key, so the job is stuck 24 h |
| #15 | M | Deep report rejected for more than 30 sources or a non-URL source |
| #18 | M | Interaction check doesn't verify every medication was assessed; a gap shows as "no interactions" |
| #4 | L | Model registry is behind; temperature and forced tool_choice block upgrading |
| #5 | L | Medicine search has no web_search (pill appearance from memory; user can edit) |
| #7 | L | Only voice sets an upstream timeout; interaction 15 s timer starts after the response |
| #8 | L | substance-enrich is dead; its prompt re-allows recalled figures |
| #13 | L | Cost tracking undercounts |
| #16 | L | Insights payload not sanitised; deep jobs keep requestPayload indefinitely |
| #17 | L | PII regex misses names and addresses, and mangles barcodes |
| #19 | L | stop_reason ignored (refusal / max_tokens / pause_turn) |
| #20 | L | Key decrypt failure gives a generic 502 while Settings says the key is set |
| #21 | L | Rate limit is per IP and in memory; titration-warnings has none |
| #22 | L | Parse tool salt → sodium wording omits the g→mg step |
| #23 | L | Legacy web_search tool version |
| #24 | L | AI error codes discarded in lookup, refresh and titration UIs |
| #25 | L | "Previous assessment" is simply the latest report |

### state-settings-cache
| ID | Sev | Issue |
|---|---|---|
| #2 | M | Limits, presets, dayStartHour and trackers are localStorage-only; backup restore ignores settings |
| #3 | M | Reset to Defaults has no confirmation, wipes presets and turns off reminders without server cleanup |
| #7 | M | Two Medication Region UIs with incompatible values (UK vs GB, "Other") |
| #11 | M | Analytics range memoised on scope only; stale after midnight |
| #8 | L | Time Format setting is dead |
| #9 | L | Dead settings: weight overlays, substanceConfig, aiAuthSecret, theme, dataRetentionDays |
| #14 | L | Upgraded users get 8/3 shake defaults instead of 10/5 (needs a v17 migration) |
| #16 | L | Unused hooks; the unmounted HistoryDrawer would replace the undo toast |

### mcp-server-auth
| ID | Sev | Issue |
|---|---|---|
| #3 | M | Stock `SUM()::int` rounds half-pills (29.5 → 30) |
| #7 | M | Push schedule never cleared when empty; built from today only |
| #8 | M | Subscribe upsert resets timezone to UTC after a toggle off/on in the same session |
| #10 | L | Today summary groups by actionTimestamp; no outstanding doses listed |
| #11 | L | Validation errors shown as "internal error" |
| #12 | L | Truncation keeps the oldest 5000 rows |
| #13 | L | Tokens can't be revoked |
| #14 | L | Native mint inserts before users_sync exists (FK error for first-time users) |
| #15 | L | Consent screen under-lists the data exposed |
| #16 | L | list_recent_doses omits kind, doseMg and phaseId |

### core-duplication
| ID | Sev | Issue |
|---|---|---|
| #7 | M | BP and weight ranges differ across every path; no sys > dia check (card inline edit is unbounded) |
| #3 | L | Pulled `null` vs `!== undefined` checks (ABV prefill lost; alert at 0) |
| #12 | L | Dead or half-built code that looks live |
| #13 | L | Sodium 39% vs 40% |

### native-android
| ID | Sev | Issue |
|---|---|---|
| #3 | M | Native reminders ignore the toggle; the WebView shows it as "not supported" |
| #4 | M | Repeat alarms after the first firing are non-wakeup RTC |
| #6 | M | Nutrient analysis uses raw `fetch`, dead on Android (optional feature) |
| #9 | M | allowBackup=false plus default local mode means reinstall loses unsynced data |
| #8 | L | Sign-out keeps reminders and local DB; server session not revoked |
| #10 | L | syncMedicationNotifications not serialised (latent) |
| #11 | L | Network listener leaks on fast detach |

### baseline-health
| ID | Sev | Issue |
|---|---|---|
| #3 | L | Flaky prescription-card PRN test (race on the phases hook) |
| #4 | L | UI CSS tree-shake guard never runs in CI |
| #5 | L | e2e not type-checked or linted (5 errors) |
| #6 | L | sw.ts not type-checked; apps/native has no gates; 4 packages have no lint |
| #7 | L | 0–9% coverage on push sync, tz detection, account, permissions; tz test replicates logic instead of importing the hook |
| #8 | L | 6 lint warnings (one real keyboard gap on dose-row) |
| #9 | L | Vitest config deprecations |

### live-data-forensics
| ID | Sev | Issue |
|---|---|---|
| #5 | M | No duplicate-prescription guard (two Sacubitril/Valsartan) |
| #7 | M | Adherence data covers 46/172 days; unlogged shown as missed |
| #9 | M | MCP labels sodium as `salt_mg` |
| #10 | M | Urination quick-log double-fires and commits instantly (27 near-duplicate pairs) |
| #11 | M | Timestamps can be saved in the future |
| #4 | L | Entresto stock −7 (stock never recorded for the replacement box; not caused by the `>0` guard) |
| #12 | L | Beverage tab logs beer as water only (Coffee/Alcohol tabs exist) |
| #13 | L | Moka caffeine 67 vs 157 mg/100 ml depending on path |
| #16 | L | Historic substance rows lack volume/ABV; "AF beer" = 1 std drink |

### repro-water-save
| ID | Sev | Issue |
|---|---|---|
| #3 | M | Empty custom time throws (see 2a) |
| #4 | L | Tap-to-edit dialog saves directly (see 2a; dialog wording discloses it) |
| #7 | L | Double-submit guard uses state rather than a ref (not reachable with real taps) |

### repro-sugar
| ID | Sev | Issue |
|---|---|---|
| #0, #1, #3 | M | See 2b |
| #8 | L | Preset summary hides salt when caffeine/ABV is set (stale sugar is visible in the input) |

### gap-combo-drugs-pill-math
| ID | Sev | Issue |
|---|---|---|
| #2 | M | Negative fractional stock prints as positive "½ tablets" |
| #3 | M | Combination dose labelled from three sources (≈1 mg rounding drift; the risk is a swapped ratio) |
| #4 | M | splitDose invents per-compound mg (200 → 96/104) |
| #5 | M | Combination Rx with a brand that has no compounds shows no tablet count |
| #7 | M | strength = 0 deducts 0 pills; ∞ days; no refill alert |
| #9 | M | Combination dose input means pills in the wizard and summed mg in edit/titration |
| #6 | L | odd_fraction warning computed but never shown |
| #8 | L | Missing strength → NaN/−Infinity (only via a hand-edited backup) |
| #11 | L | Negative days-of-supply |
| #12 | L | Wizard `parseInt` stock; no downward correction |
| #13 | L | Maintenance "/day" sums schedules regardless of weekdays |

### gap-bulk-dose-actions
| ID | Sev | Issue |
|---|---|---|
| #1 | M | Stale inventoryItemId on the log → phantom pills on an archived item |
| #2 | M | Detail drawer allows Take/Skip on future dates |
| #3 | M | Picker accepts future and empty times; empty = now; edit rejects silently |
| #4 | M | Past-date Mark All / row Take default to the current clock time |
| #5 | M | Untake on a past date turns "missed" into a permanent "pending" and syncs a pending row |
| #9 | M | Skip All converts taken doses, with no confirm, reason or undo; stale skipReason reappears |
| #6 | L | Banner counts skipped as done ("All done" with 0 taken) |
| #7 | L | Undo keyed on the slot; toast limit 1 |
| #8 | L | Bulk actions not atomic; failures silent (needs an IndexedDB error) |
| #10 | L | Picker resets the typed time on re-render |

### gap-timezone-travel-recalc
| ID | Sev | Issue |
|---|---|---|
| #1 | M | Two devices in different zones ping-pong the anchor and show false "you travelled" prompts |
| #2 | M | Editing any prescription abroad re-anchors only that one (self-heals if the prompt is accepted) |
| #4 | M | "Not Now" lasts one session; list shows UTC-derived time while cards show `time` |
| #3 | L | Push timezone not re-sent after an in-session Adjust |
| #5 | L | TZ cache never refreshed after a dismissal |
| #6 | L | Recalculation includes tombstones and completed phases |
| #7 | L | Dialog names only one origin zone |

### gap-voice-reconcile-save
| ID | Sev | Issue |
|---|---|---|
| #0 | M | Reconcile merges drinks that share one token ("coffee with milk" + "glass of milk") |
| #1 | M | Merged or parsed solutes saved but not shown in review |
| #3 | M | Offline save: drinks written, then the batch sticks at "saving" (half-committed) |
| #4 | M | Negative and cleared (0) values accepted and saved |
| #2 | L | Misses real splits (prompt already forbids them) |
| #6 | L | Merge keeps an explicit 0 over the companion's value |
| #7 | L | Warnings not attached to rows; exact-ml match only |
| #8 | L | No kind or unit change in review |
| #9 | L | Voice urination with no amount → imputed 300 ml |
| #10 | L | Recording again discards unsaved rows |

### gap-dashboard-metrics-settings-inputs
| ID | Sev | Issue |
|---|---|---|
| #0 | M | Weight typed value snapped to the increment grid |
| #1 | M | BP accepts swapped values ("Grade 3", pulse pressure −40) |
| #2 | M | "Over but in buffer" shows red, orange or neutral depending on the surface |
| #3 | L | Float noise in the Food and caffeine totals |
| #4 | L | 1040 ml shows as "1.0L / 1.0L" in red |
| #5 | L | Settings silently revert out-of-range input; may show an unstored value |
| #6 | L | Sodium increment setting has no consumer |
| #7 | L | BP `parseInt` makes `.int()` unreachable; edit has no range check |
| #8 | L | Two-stage bar drops from 100% to 67% (intentional) |
| #9 | L | Progress bar never passes `value` to Radix (a11y) |
| #10 | L | Liquids sugar badge ignores the tracker toggle |
| #11 | L | BP loading state is dead |

### gap-ai-insights-snapshot
| ID | Sev | Issue |
|---|---|---|
| #1 | M | Water limit sent as a "goal"; fluid balance "on target" means drinking more |
| #2 | M | Alternate-day schedules sent as "twice daily" |
| #3 | M | No adherence data; PRN-only prescriptions omitted |
| #5 | M | Untracked domains sent as 0; averages over the whole window |
| #4 | L | Include-previous bypasses the sharing toggles (opt-in, disclosed) |
| #6 | L | Caffeine/alcohol amounts never sent (drinks still produce water rows) |
| #7 | L | AI card's fixed 30 days disappears on an empty range |
| #8 | L | Deep result only arrives via an ungated full pull |
| #9 | L | Reports can't be deleted |
| #10 | L | Personalised flag reflects the toggles, not the payload |
| #11 | L | "Stay on this device" copy is wrong (conditions sync to the cloud) |
| #12 | L | Fluid balance includes partial first and last days |
| #13 | L | Trend slope computed per reading, not per day |

### gap-records-history-listing
| ID | Sev | Issue |
|---|---|---|
| #1 | M | Drink labels from local presets; "Beverage" on other devices |
| #2 | M | Pre-deletedAt backup rows imported but invisible |
| #3 | M | Deleting caffeine in Records removes water/sugar with no undo (intentional cascade, no UI warning) |
| #4 | M | "24h" means since local midnight |
| #6 | L | Soft-delete/undo helpers skip the existence check (orphan upsert stays queued forever) |
| #7 | L | Substance range end-inclusive, others exclusive |
| #8 | L | Eating rows ignore grams |
| #9 | L | Day counts reflect only the loaded page |
| #10 | L | "Salt" filter vs "Sodium" rows |

### gap-inventory-refill-ui-flows
| ID | Sev | Issue |
|---|---|---|
| #2 | M | No "set counted stock"; 'adjusted' type unreachable |
| #4 | M | Days-remaining: drawer uses titration, notification uses an arbitrary phase |
| #5 | M | Archiving the active brand leaves no active brand; doses stop deducting silently |
| #6 | M | Strength, unit and refill thresholds can't be edited |
| #7 | M | Free-text dosage unit relabels without converting (mcg → 1000 pills) |
| #0 | L | adjustStock reads outside its transaction (latent race; self-heals on launch) |
| #1 | L | Note-only edit rewrites and pushes currentStock |
| #3 | L | Refill edit accepts 0 or negative; note can't be cleared |
| #8 | L | Supply ignores spare boxes; drawer days shown for an inactive brand |
| #10 | L | Refill prefilled with 30; no backdating |
| #11 | L | Transaction delete has no undo |

---

## 8. Recommended fix order (before the styling refresh)

Each bullet is roughly one PR. Phase 0 is urgent (DST on 2026-10-25, live medication data).

### Phase 0 — Stop the active harm (this week)
1. **`networkMode: 'always'`** for queries and mutations, plus an offline regression test. This fixes 2a#1 and dose actions pausing offline.
2. **Android reminder time:** convert with `utcMinutesToLocalTime` (native#0) and pick the effective phase (native#1). Fix the unit test so it runs under TZ=Europe/Berlin.
3. **`getCurrentStock` filters `deletedAt`** (dexie#1). Update the test that asserts the bug.
4. **"Delete older than N days":** time-series tables only, filtered on `timestamp` (C5).
5. **Soft-delete readers:** add a `deletedAt===null` filter to `getDailyDoseSchedule`, `getActivePrescriptions`, `getActivePhaseForPrescription`, the inventory readers, the notification service and the titration activate/complete/cancel functions. On delete, also clear `isActive`, `status` and `enabled` (C1–C4). Add a Dexie upgrade that repairs existing tombstones.
6. **Titration completion and edit:** keep schedule ids on edit, remap `scheduleId`, and cancel replaced phases (C2, C3, C4).
7. **DST pre-emption:** re-derive `scheduleTimeUTC` from `time` + anchor on read (a minimal patch before 25 Oct). Stop the recalculation service overwriting `time` (gap-tz#0).

### Phase 1 — Sync correctness
1. Ack by `enqueuedAt` snapshot (sync#0). Skip pulled rows that have pending ops or a newer local `updatedAt`, and push before the startup pull (sync#1, C6).
2. `updatedAt` helper for every synced update, starting with phase-service (sync#2).
3. Drop orphan upsert queue rows (sync#4). Soft-delete dose logs and transactions in `deletePrescription`, and soft-delete schedules in `updatePhase` (dexie#3). Run a server script to tombstone the live orphans.
4. Round amounts in one choke point (or migrate to `real`) (server#3). Coerce `""` only for nullable columns, and make indication nullable (sync#10).
5. Fix the FK deletion order in wipe, account-delete and cleanup, with a real-Postgres test (sync#6). Fix cancel-migration (check `res.ok`, abort the loop) and switch-to-local (require a successful pull) (sync#7/#9).
6. Server `server_updated_at` cursor (sync#3). Ownership guard on the upsert (server#0).
7. Send an explicit `null` for cleared fields (health#3/#4).

### Phase 2 — Medication data model (per §4)
1. Snapshot the dose on DoseLog. Natural key `(scheduleId, scheduledDate)` with a deterministic id. Fix the detail-dialog key/takenAtTime (doses#5). Reschedule as an override (doses#6).
2. Effective-dated regimen resolution for past days and adherence (prescr#3, doses#13). Adherence excludes not-yet-due doses (analytics#10).
3. Undo, skip and reschedule reverse the linked consumed transaction (prescr#4, gap-bulk#1). One stock derivation helper; stop syncing `currentStock` (dexie#6).
4. Store wall-clock time + zone for schedules; one reminder builder used by native, web push and in-app (dates#3, doses#10/#11, state#0). Add a cron for `/api/push/send`.
5. Wizard and edit validation: a shared strength parser, positive finite doses, a unit enum, a titration unit taken from the Rx, a "Set count" action, editable brand strength and thresholds (prescr#9/#10/#14, gap-inventory#2/#6/#7, doses#19).
6. Dose labels: tablet strength after "of", a fixed `formatPillCount`, and one combination labeller (gap-combo#0/#1/#3/#5).

### Phase 3 — Grouped intake records and inputs
1. `entryGroups` (or one shared group-op helper): delete, time edit and undo act on the whole group (food#0, liquids#3/#4/#5, food#8/#9, analytics#9, records#3).
2. Liquids and sugar: add `sugarPer100ml` to presets and the lookup, reset stale fields, honour the tracker toggle, label rows from the stored name (2b, liquids#9, records#1).
3. One zod schema per record type, shared by create, card edit, Records edit, voice and backup import: BP sys > dia, ranges, no snapping, no future dates, keep seconds (core#7, health#0, dashboard#0/#1, live#11).
4. Delete HistoryDrawer and `use-record-adapters`, plus the other dead paths (health#8, core#12, food#16).
5. Voice: 2000-char cap, report dropped items, show solutes in review, stricter reconcile, timestamps (food#2/#11, voice#0/#1/#4).

### Phase 4 — Day boundaries, settings, analytics, AI
1. A single `logicalDayRange(dayStartHour, tz)` used by the dashboard, analytics, medications, MCP and push. Sync the settings row (dates#5/#6, state#2).
2. Correlations use daily sums; the CSV export is per-type; backup restore handles tombstones and enqueues for sync; potassium label (analytics#3/#4/#7/#8, records#0).
3. Insights payload: water *limit*, per-weekday frequency, adherence, PRN, untracked domains left out, effective phase (insights#0–#5). Interaction cache keyed on the medication list plus coverage check (ai#1/#18).
4. Model upgrade prep: remove temperature, strict tools instead of forced tool_choice, new web_search version, stop_reason handling, then bump the ids (ai#4/#19/#23).

### Phase 5 — Test gates (run alongside the phases above)
- Extend the parity test to nullability, int vs float, enums/CHECKs and backup schemas.
- Add a DST-crossing test in the Europe/Berlin CI job.
- Add fake-indexeddb tests for the notification service, push schedule sync and timezone detection (the real hook, not a copy of its logic).
- Real-Postgres tests for wipe and delete.
- Run the CSS tree-shake guard after the build in CI. Type-check `e2e/` and `sw.ts`.

Once Phases 0–3 are merged, the styling refresh can start on a single form or card per record type.

---

## 9. Appendix: refuted or dismissed claims

- **doses#1** "Deleting an active titration plan leaves its doses overriding maintenance": refuted as stated. The service-level behaviour exists, but the UI delete path differs. The underlying no-`deletedAt` reader issue is covered by C1.
- **doses#20** "Editing a titration plan throws away existing schedules": refuted. `EditPhaseScheduleLoader` overwrites the placeholder with the stored schedules.
- **ai#2** "Refresh interactions overwrites stored contraindications and warnings": refuted as a defect. Rebuilding them from the fresh check is the intended behaviour.
- **repro-water#8** "Backdated entry before day-start hour has no visible effect": refuted. `getDayStartTimestamp` rolls back a day, so the entry counts in the current logical day.
- **gap-voice#5** "Two Save clicks in one task write twice": refuted. `setStage('saving')` plus a re-render blocks real taps; only synthetic same-task clicks get through.
- **gap-records#5** "updateRecord lets callers change id-like fields": refuted. Every caller passes through a service wrapper whose type narrows the fields.
- Dismissed or downgraded along the way (claims that were verified false):
  - "Every save fails until reload after an IDB sever": Dexie auto-reopens; failure needs a failed reopen.
  - "Entresto −7 caused by the `currentStock > 0` guard": no; stock was never recorded for the replacement box.
  - "Offline cold start pauses mutations": no; onlineManager starts online.
  - "Records BP dialog saves 1200": no; native min/max blocks it. The card inline edit does allow it.
  - "Push-sync pull merges all cloud rows into a local-only device": in practice there are no cloud rows.
  - "Two concurrent Takes double-deduct stock": no; the check runs inside a Dexie transaction.
  - "PRN-only prescription dropped from insights": confirmed only when there is no active phase.
