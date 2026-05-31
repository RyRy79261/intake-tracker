# 39 — Data Model & Enums (Canonical)

**Files covered:**
- `/home/ryan/repos/Personal/intake-tracker/src/lib/db.ts` (Dexie / IndexedDB — client-side source of truth)
- `/home/ryan/repos/Personal/intake-tracker/src/db/schema.ts` (Drizzle / Neon Postgres — server mirror, 31 tables; the file's own header comment says "29", an undercount that omits `users_sync` and `insight_jobs`)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/constants.ts` (presets, BP categories, amount options)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/card-themes.ts` (per-domain theme keys + labels)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/quick-nav-defaults.ts` (footer nav defaults)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/sync-topology.ts` (table push order / FK graph)
- `/home/ryan/repos/Personal/intake-tracker/src/stores/settings-store.ts` (all persisted preferences + defaults + ranges)

**Purpose:** The canonical reference for every data table, interface, field, type, enum, status value, preset, default, and limit across the entire app. This is the spec a design-generator must respect so that every screen, form, picker, badge, and progress bar can represent exactly the values the data layer supports — no more, no less.

---

## Features

- **Single source of truth, mirrored two ways.** All user data lives client-side in **Dexie/IndexedDB** (`db.ts`, current schema **v21**, exported as `DB_SCHEMA_VERSION = 21`). A **Neon Postgres** schema (`schema.ts`, **31** `pgTable`/`neonAuth.table` definitions — 18 app tables + `users_sync` + `insight_jobs` + 4 push + 3 AI + 4 MCP) mirrors it field-for-field for optional cloud sync; `src/__tests__/schema-parity.test.ts` fails the build if they drift. `userId` is the only Postgres-only column allowed. (The schema.ts header comment says "29 tables" but undercounts — it omits `users_sync` and `insight_jobs`.)
- **Soft-delete + sync scaffolding on every data table.** Every record carries `id`, `createdAt`, `updatedAt`, `deletedAt` (`null` = active, number = tombstone), and `deviceId`. Most also carry `timezone` (IANA string).
- **18 synced data tables + 3 local-only system tables** in Dexie. Postgres additionally has 4 push-notification tables, 3 server-only AI tables, 4 MCP-connector tables, and 1 deep-research job table.
- **Composable groups.** `intakeRecords`, `eatingRecords`, and `substanceRecords` share an optional `groupId` so multiple records (e.g. from one AI food parse) form one atomic, editable, deletable group. `originalInputText` + `groupSource` live on the primary record for AI re-run.
- **Event-sourced inventory.** Pill stock is the *sum of* `inventoryTransactions` (`initial`/`refill`/`consumed`/`adjusted`), not a stored counter (`currentStock` is deprecated).
- **Combination-drug support.** `compounds: CompoundStrength[]` lets a single tablet carry two active ingredients (e.g. Sacubitril 49 + Valsartan 51 = "Vymada 100").
- **Timezone-anchored medication schedules.** `phaseSchedules` store `scheduleTimeUTC` (minutes from UTC midnight) + `anchorTimezone`; the legacy `time` "HH:MM" string is deprecated but retained.
- **Audit log** of 30 distinct actions; **error log** (local-only) of 6 sources; **AI insight reports** cache (fast/deep); **user medical profile** singleton.

---

## User actions & interactions

This is a data-layer unit; "actions" are the mutations the model must support across the UI:

- **Create / quick-add** a record in any domain (water, salt, sugar, potassium, eating, BP, weight, urination, defecation, caffeine, alcohol, dose, prescription, phase, schedule, inventory item, transaction, daily note).
- **Edit** any field of any record (timestamp, amount, note, position/arm, amount-estimate, dosage, etc.).
- **Soft-delete / undo** — delete sets `deletedAt`; the row persists for sync; undo clears it.
- **Group edit / group delete** — records sharing a `groupId` are mutated together; AI re-run uses `originalInputText`.
- **Dose lifecycle** — mark a scheduled dose `taken`, `skipped` (with `skipReason`), `rescheduled` (with `rescheduledTo`), or leave `pending`; un-take reverts.
- **Inventory** — refill, consume (auto-linked to a dose via `doseLogId`), manually adjust, recalculate stock.
- **Titration plan** — draft → activate → complete/cancel; phases link via `titrationPlanId`.
- **Toggle optional trackers** (sugar, potassium) on/off — hides/shows the tracker everywhere and gates persistence.
- **Configure limits, increments, buffers, presets, regions, reminders, theme, day-start, animation timing** via settings.
- **Consent to AI sharing** (conditions, medications) in the user profile.
- **Switch storage mode** local ↔ cloud-sync.

---

## States & presentations

State the model must let the UI express:

- **Active vs soft-deleted** — `deletedAt === null` (shown) vs a number (tombstoned/hidden but synced).
- **AI-enriched vs estimated** — `substanceRecords.aiEnriched` true/false (refined vs default estimate); `liquidPreset.source` `manual` vs `ai` (+ optional `aiConfidence`).
- **Optional tracker enabled/disabled** — sugar/potassium hidden from forms, voice editor, progress bars, weekly grid, analytics, history filter, AI snapshot when off.
- **Over-limit / extended-buffer** — progress bars render a normal segment up to `limit`, a second-tone "extended" segment from `limit` to `limit + extendedBuffer`, then red beyond (`progressGradient` / `progressExtended` / `progressOverLimit` per theme). Only `water`, `salt`, `sugar` define a non-empty `progressExtended`; `potassium` omits the key entirely, and `caffeine`, `alcohol`, `eating`, `urination`, `defecation`, `weight`, `bp` all set `progressExtended: ""`. `progressGradient` is non-empty for `water`, `salt`, `sugar`, `potassium`, `caffeine`, `alcohol`; `weight`, `bp`, `eating`, `urination`, `defecation` have an empty `progressGradient` (no progress bar).
- **Blood-pressure category** — Optimal / Normal / High normal / Grade 1–3 hypertension, each with its own color (see enums).
- **Dose status** — `pending` (actionable), `taken`, `skipped`, `rescheduled`.
- **Phase / plan / inventory status** — active, completed, cancelled, pending, draft, archived.
- **Sync status** (from `sync-status-store`) — ephemeral runtime fields `isSyncing`, `isOnline`/offline, `queueDepth`, `lastError` (null = healthy), plus three persisted fields: `lastPushedAt`, `lastPulledAt` (last successful push/pull, Unix ms) and `initialSyncComplete` (true once a full pull-drain has completed on this device).
- **Insight report mode** — `fast` (Sonnet, sync) vs `deep` (Opus + web search, async; carries `sources[]`); `personalised` true/false.
- **Combination vs single-compound drug** — `compounds` present (length ≥ 2) vs absent.
- **Irregular heartbeat flag** on a BP reading (boolean badge).
- **Refill alert** — triggered by `refillAlertDays` and/or `refillAlertPills` thresholds.

---

## Enums, options & configurable values

### Record-type & status enums (db.ts / schema.ts CHECK constraints)

| Enum / field | Allowed values |
|---|---|
| `IntakeRecord.type` | `water` \| `salt` \| `sugar` \| `potassium` (units: ml / mg / g / mg) |
| `IntakeRecord.source` (free-ish) | e.g. `manual`, `food:apple`, `voice` |
| `groupSource` (intake/eating/substance) | `ai_food_parse` \| `ai_substance_lookup` \| `manual` |
| `SubstanceRecord.type` | `caffeine` \| `alcohol` |
| `SubstanceRecord.source` | `water_intake` \| `eating` \| `standalone` |
| `BloodPressureRecord.position` | `standing` \| `sitting` |
| `BloodPressureRecord.arm` | `left` \| `right` |
| `Urination/DefecationRecord.amountEstimate` | `small` \| `medium` \| `large` (plus UI "No estimate" = none) |
| `PillShape` | `round` \| `oval` \| `capsule` \| `diamond` \| `tablet` |
| `FoodInstruction` | `before` \| `after` \| `none` |
| `DoseStatus` | `taken` \| `skipped` \| `rescheduled` \| `pending` |
| `PhaseType` | `maintenance` \| `titration` |
| `MedicationPhase.status` | `active` \| `completed` \| `cancelled` \| `pending` |
| `TitrationPlanStatus` | `draft` \| `active` \| `completed` \| `cancelled` |
| `InventoryTransaction.type` | `refill` \| `consumed` \| `adjusted` \| `initial` |
| `InsightReport.mode` | `fast` \| `deep` (undefined ⇒ treated as `fast`) |
| `SyncQueueRow.op` | `upsert` \| `delete` |
| `ErrorLogSource` | `window-error` \| `unhandled-rejection` \| `error-boundary` \| `console-error` \| `console-warn` \| `api-error` |
| `PhaseSchedule.daysOfWeek` | integer array, `0`=Sunday … `6`=Saturday |

### `AuditAction` — 30 values
`ai_parse_request`, `ai_parse_success`, `ai_parse_error`, `data_export`, `data_import`, `data_clear`, `settings_change`, `api_key_set`, `api_key_clear`, `pin_set`, `pin_verify_success`, `pin_verify_failure`, `dose_taken`, `dose_skipped`, `dose_rescheduled`, `dose_time_edited`, `prescription_added`, `prescription_updated`, `inventory_adjusted`, `phase_activated`, `validation_error`, `dose_untaken`, `prescription_deleted`, `phase_completed`, `phase_started`, `stock_recalculated`, `inventory_added`, `inventory_deleted`, `titration_plan_updated`, `timezone_adjusted`.

### Server-only enums (schema.ts CHECK constraints)
- `insight_jobs.status`: `pending` \| `completed` \| `failed` \| `expired` (one pending job per user enforced).
- `user_key_shares.provider` / `ai_usage.provider`: `anthropic` \| `groq`.
- `ai_usage.keySource`: `own_stored` \| `shared_from` \| `env_var`.
- `ai_usage.status` / `mcp_audit_log.status`: `success` \| `error`.
- `mcp_oauth_clients.tokenEndpointAuthMethod`: `none` \| `client_secret_basic` \| `client_secret_post`.
- `mcp_auth_codes.codeChallengeMethod`: `S256` \| `plain`.

### Card theme keys & labels (`card-themes.ts`) — 11 domains
`water` (Water), `salt` (Sodium), `sugar` (Sugar), `potassium` (Potassium), `weight` (Weight), `bp` (Blood Pressure), `eating` (Eating), `urination` (Urination), `defecation` (Defecation), `caffeine` (Caffeine), `alcohol` (Alcohol). Each `CardTheme` carries a full set of style fields: `label`, `icon`, `gradient`, `border`, `iconBg`, `iconColor`, `buttonBg`, `outlineBorder`, `outlineText`, `progressGradient`, `progressExtended`, `progressOverLimit`, `hoverBg`, `inputBg`, `inputText`, `loadingBg`, `latestValueColor`, `activeToggle`, `sectionId`. Footer label overrides: `water → "Liquids"`, `eating → "Food & Salt"`.

### Blood-pressure categories (`getBPCategory`, ESH 2023 scale, OR-based highest-first)
| Category | Threshold (systolic OR diastolic) | Color |
|---|---|---|
| Grade 3 hypertension | ≥180 / ≥110 | red-700 |
| Grade 2 hypertension | ≥160 / ≥100 | red-600 |
| Grade 1 hypertension | ≥140 / ≥90 | orange-600 |
| High normal | ≥130 / ≥85 | yellow-600 |
| Normal | ≥120 / ≥80 | lime-600 |
| Optimal | below all | green-600 |

### Presets (constants.ts)
- **FOOD_PRESETS** (21, `name` + `waterPercent`): Apple 86, Banana 75, Orange 87, Watermelon 92, Grapes 81, Strawberries 91, Cucumber 96, Tomato 94, Lettuce 96, Celery 95, Carrot 88, Broccoli 89, Spinach 91, Peach 89, Pineapple 86, Milk 87, Yogurt 85, Soup (broth) 92, Rice (cooked) 70, Pasta (cooked) 62, Custom 80.
- **DEFAULT_SODIUM_PRESETS** (3, `sodiumPercent`): Sodium 100, Table Salt 39, MSG 12.
- **DEFAULT_LIQUID_PRESETS** (8, tab/volume/water%/strength): Espresso (coffee, 30ml, 98%, caffeine 210/100ml), Double Espresso (60ml, caffeine 210), Moka (50ml, caffeine 130), Coffee (250ml, caffeine 38), Tea (250ml, caffeine 19), Beer (alcohol, 330ml, 93%, ABV 5), Wine (150ml, 87%, ABV 12), Spirit (45ml, 60%, ABV 40). `LiquidPreset.tab`: `coffee` \| `alcohol` \| `beverage`; `source`: `manual` \| `ai`.
- **URINATION_AMOUNT_OPTIONS / DEFECATION_AMOUNT_OPTIONS**: Small / Medium / Large.

### Substance config defaults (settings-store)
- **Caffeine types**: Coffee 95mg/250ml, Espresso 63mg/30ml, Tea 47mg/250ml, Other 80mg/250ml.
- **Alcohol types**: Beer 1 drink/330ml, Wine 1/150ml, Spirits 1/45ml, Other 1/250ml.

### Migration default-amount maps (v12 keyword backfill, db.ts)
- CAFFEINE_KEYWORDS: coffee, espresso, tea, caffeine, matcha, latte, cappuccino. DEFAULT_CAFFEINE_MG: coffee 95, espresso 63, tea 47, latte 95, cappuccino 95, matcha 70. DEFAULT_CAFFEINE_VOLUME_ML: coffee 250, espresso 30, tea 250, latte 350, cappuccino 250, matcha 250.
- ALCOHOL_KEYWORDS: beer, wine, whiskey, whisky, vodka, gin, rum, cocktail, spirit, alcohol, brandy. DEFAULT_ALCOHOL_DRINKS: beer 1, wine 1, cocktail 1.5.

### Settings defaults, ranges & enums (settings-store, `SETTINGS_PERSIST_VERSION = 16`)
| Setting | Default | Sanitize range |
|---|---|---|
| waterIncrement (ml) | 250 | 10–1000 |
| saltIncrement (mg) | 250 | 10–1000 |
| waterLimit (ml) | 1000 | 100–10000 |
| saltLimit (mg) | 1500 | 100–10000 |
| sugarLimit (g) | 30 | 5–500 |
| potassiumLimit (mg) | 3500 | 100–20000 |
| waterExtendedBuffer (ml) | 500 | 0–10000 |
| saltExtendedBuffer (mg) | 500 | 0–10000 |
| sugarExtendedBuffer (g) | 10 | 0–500 |
| optionalTrackers | `{ sugar: true, potassium: false }` | — |
| theme | `system` | `light` \| `dark` \| `system` |
| dataRetentionDays | 90 | 0–365 (0 = forever) |
| dayStartHour | 2 | 0–23 |
| showQuickNav | true | — |
| quickNavOrder | `rtl` | `ltr` \| `rtl` |
| scrollDurationMs | 300 | 100–1000 |
| autoHideDelayMs | 500 | 0–2000 |
| barTransitionDurationMs | 200 | 50–500 |
| swipeNavDistanceThresholdPct | 28 | 10–60 |
| swipeNavVelocityThreshold | 500 | 100–2000 |
| urinationDefaultAmount | `small` | small/medium/large |
| defecationDefaultAmount | `medium` | small/medium/large |
| weightGraphShow{Eating,Urination,Defecation,Drinking} | all true | — |
| weightIncrement (kg) | 0.05 | 0.05–1 (2 dp) |
| timeFormat | `24h` | `12h` \| `24h` |
| storageMode | `local` | `local` \| `cloud-sync` |
| primaryRegion / secondaryRegion | `""` (UI falls back to `US` / `None`) | country code |
| doseRemindersEnabled | false | — |
| reminderFollowUpCount | 2 | — |
| reminderFollowUpInterval (min) | 10 | — |
| shakeToReportEnabled | true | — |
| shakeThreshold (m/s²) | 10 | 4–20 |
| shakeRequiredJolts | 5 | 2–8 |
| analyticsIntroSeen | false | — |

**Other persisted `Settings` fields (no tracked numeric default/range, so omitted from the table above):**
- `aiAuthSecret` — obfuscated secret used to authenticate against the server-side AI (matched to the server's `AI_AUTH_SECRET` env var); read back via `getDeobfuscatedAuthSecret`.
- `liquidPresets: LiquidPreset[]` — the persisted, user-editable copy of `DEFAULT_LIQUID_PRESETS`, mutated via `addLiquidPreset` / `updateLiquidPreset` / `deleteLiquidPreset` CRUD.
- `quickNavItems: QuickNavItem[]` — the persisted footer item list (order + per-item enabled state), seeded from `DEFAULT_QUICK_NAV_ITEMS`; separate from the `showQuickNav` / `quickNavOrder` flags.

**Quick-nav default footer order** (`quick-nav-defaults.ts`): water, eating, bp, weight, urination, defecation (all enabled).

### Push-notification defaults (schema.ts)
- `push_settings`: enabled true, followUpCount 2, followUpIntervalMinutes 10, dayStartHour 2.
- `push_subscriptions.timezone` default `UTC`.

---

## Data model touched

### Dexie tables (18 synced + 3 local-only) — schema strings from `db.ts`
**Synced data tables (carry id/createdAt/updatedAt/deletedAt/deviceId; most carry timezone):**
1. **intakeRecords** — `type, amount, timestamp, source?, note?, groupId?, originalInputText?, groupSource?` + tz. Index: `id, [type+timestamp], timestamp, source, groupId, updatedAt`.
2. **weightRecords** — `weight` (kg, decimal), `timestamp, note?` + tz.
3. **bloodPressureRecords** — `systolic, diastolic, heartRate?, irregularHeartbeat?, position, arm, timestamp, note?` + tz.
4. **eatingRecords** — `timestamp, grams?, note?, groupId?, originalInputText?, groupSource?` + tz.
5. **urinationRecords** — `timestamp, amountEstimate?, note?` + tz.
6. **defecationRecords** — `timestamp, amountEstimate?, note?` + tz.
7. **substanceRecords** — `type, amountMg?, amountStandardDrinks?, abvPercent?, volumeMl?, description, source, sourceRecordId?, aiEnriched?, timestamp, groupId?, originalInputText?, groupSource?` + tz.
8. **prescriptions** — `genericName, indication, notes?, contraindications?[], warnings?[], compounds?[], isActive` (no tz).
9. **medicationPhases** — `prescriptionId, type, unit, startDate, endDate?, foodInstruction, foodNote?, notes?, status, titrationPlanId?` (no tz).
10. **phaseSchedules** — `phaseId, time(deprecated), scheduleTimeUTC, anchorTimezone, dosage, daysOfWeek[], enabled, unit?` (no plain tz). Index: `id, phaseId, time, enabled, updatedAt` — the deprecated `time` field is still an index key.
11. **inventoryItems** — `prescriptionId, brandName, currentStock?(deprecated), strength, compounds?[], unit, pillShape, pillColor, visualIdentification?, refillAlertDays?, refillAlertPills?, isActive, isArchived?` + tz.
12. **inventoryTransactions** — `inventoryItemId, timestamp, amount, note?, type, doseLogId?` + tz.
13. **doseLogs** — `prescriptionId, phaseId, scheduleId, inventoryItemId?, scheduledDate (YYYY-MM-DD), scheduledTime, status, actionTimestamp?, rescheduledTo?, skipReason?, note?` + tz.
14. **dailyNotes** — `date (YYYY-MM-DD), prescriptionId?, doseLogId?, note` + tz.
15. **auditLogs** — `timestamp, action, details?` + tz.
16. **titrationPlans** — `title, conditionLabel, recommendedStartDate?, status, notes?, warnings?[]` (no tz).
17. **userProfile** (singleton) — `conditions[], shareConditionsWithAI, shareMedicationsWithAI, aiInsightsConsentAt(null=never)` (no tz).
18. **insightReports** — `generatedAt, rangeStart, rangeEnd, narrative, observations[], sources?[], personalised, mode?` (no tz).

**Local-only system tables (not synced, not backed up):**
- **_syncQueue** — `++id (auto), tableName, recordId, op, enqueuedAt, attempts`.
- **_syncMeta** — `tableName (pk), lastPulledUpdatedAt, lastPulledId?` (keyset cursor).
- **_errorLogs** — `id, timestamp, source, message, stack?, componentStack?, route?, userAgent?, appVersion?`.

### Supporting interfaces
- **CompoundStrength** — `{ name, strength }` (per-pill active ingredient).
- **SubstanceConfig** — caffeine/alcohol enabled flag + type arrays (settings-store).
- **LiquidPreset / FoodPreset / SodiumPreset / AmountOption / BPCategory** (constants.ts).
- **QuickNavItem** — `{ id: CardThemeKey, enabled }`.

### Postgres-only tables (no Dexie counterpart, schema.ts)
`users_sync` (auth mirror), `insight_jobs`, push (`push_subscriptions`, `push_schedules`, `push_sent_log`, `push_settings`), AI (`user_api_keys`, `user_key_shares`, `ai_usage`), MCP (`mcp_oauth_clients`, `mcp_auth_codes`, `mcp_access_tokens`, `mcp_audit_log`).

---

## Validation, edge cases & business rules

- **Soft-delete is the norm.** `deletedAt` set, row retained so sync can propagate the tombstone. Hard-delete path (`op: 'delete'`) exists but is unused in the sync pilot.
- **Timezone & day-start.** Every timestamped record stores an IANA `timezone`. "Today" for budgets begins at `dayStartHour` (default 2am) — records after that count toward the new day. Migration v11 backfilled tz date-based: before 2026-02-12 → `Africa/Johannesburg`, from 2026-02-12 → `Europe/Berlin`.
- **Schedule time is UTC-anchored.** `scheduleTimeUTC` = minutes from UTC midnight; `time` "HH:MM" is deprecated. v11 converted strings via `localHHMMStringToUTCMinutes`.
- **Inventory stock = Σ transactions** (initial+refill+adjusted − consumed). `currentStock` deprecated. v10 converted legacy `currentStock` into one `initial` transaction.
- **Combination drugs:** `compounds` length ≥ 2; `inventoryItems.strength` stays the authoritative dose-math denominator (sum of compound strengths); `compounds` is descriptive.
- **Composable group atomicity:** records share `groupId`; `originalInputText` + `groupSource` only on the primary record (for AI re-run). Undefined `groupId` is excluded from the IndexedDB index (zero-backfill).
- **Optional trackers gate persistence** — when sugar/potassium disabled, no new records of that type are written and the tracker is hidden everywhere.
- **BP classification** evaluates highest band first; systolic OR diastolic — a normal systolic does not cancel a high diastolic.
- **abvPercent range:** Postgres CHECK enforces `NULL OR 0–100`.
- **alcohol amountStandardDrinks / dosage / weight / abv are decimals** (`real` in Postgres; e.g. 1.5 drinks, 0.5 mg half-pill, 72.5 kg, 4.2% ABV). `amount`, `grams`, `volumeMl`, `heartRate` are integers.
- **insight_jobs:** one pending job per user (partial unique index); `batchId` null until submitted to Anthropic to avoid leaking a paid batch.
- **Schema parity** is build-enforced; **Dexie requires the full store list every version** (omission drops a table). Migration `when`-timestamp footgun documented in CLAUDE.md.
- **Settings persistence** is versioned (`SETTINGS_PERSIST_VERSION = 16`) with a forward `migrateSettings`; all numeric setters clamp via `sanitizeNumericInput(value, min, max[, decimals])`.

---

## Sub-components / variants

- **`db.ts`** — Dexie schema v10→v21, all 18+3 table definitions, migration upgrade functions, preview-database swap (`createPreviewDatabase` / `setActiveDatabase` / `resetActiveDatabase`), `DB_SCHEMA_VERSION`.
- **`schema.ts`** — Drizzle Postgres mirror (31 tables), CHECK constraints (the canonical enum guards), indexes, FK graph, `users_sync` auth mirror.
- **`constants.ts`** — FOOD_PRESETS, DEFAULT_SODIUM_PRESETS, DEFAULT_LIQUID_PRESETS, URINATION/DEFECATION_AMOUNT_OPTIONS, `getBPCategory`, type interfaces.
- **`card-themes.ts`** — `CARD_THEMES` (11 domains) + `CardThemeKey` type; per-domain colors/icons/labels/progress styles.
- **`quick-nav-defaults.ts`** — `DEFAULT_QUICK_NAV_ITEMS`, `QUICK_NAV_LABEL_OVERRIDES`, `QuickNavItem`.
- **`sync-topology.ts`** — `TABLE_PUSH_ORDER` (18-table FK-ordered list), `TableName` union; FK parent→child graph.
- **`settings-store.ts`** — Zustand persisted `Settings` + `SettingsActions`, `defaultSettings`, `SubstanceConfig`, `migrateSettings`, all clamp ranges.
- **`sync-status-store.ts`** (referenced) — sync state: ephemeral `isSyncing`, `isOnline`, `queueDepth`, `lastError` (reset on reload) + persisted `lastPushedAt`, `lastPulledAt`, `initialSyncComplete`.
