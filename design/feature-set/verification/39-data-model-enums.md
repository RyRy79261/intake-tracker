# Verification — 39-data-model-enums

**Verdict:** accurate · checked 121 claims, verified 117.

This is a data-model reference doc. I read all 7 covered source files in full
(`src/lib/db.ts`, `src/db/schema.ts`, `src/lib/constants.ts`,
`src/lib/card-themes.ts`, `src/lib/quick-nav-defaults.ts`,
`src/lib/sync-topology.ts`, `src/stores/settings-store.ts`) plus the referenced
`src/stores/sync-status-store.ts` and `src/__tests__/schema-parity.test.ts`.
Every enum, default, range, preset, and field list was checked digit-for-digit.
The doc is exceptionally accurate. The only inaccuracy is an inherited
table-count framing ("29 tables") that does not match the actual 31 `pgTable`
definitions — and even that mirrors a wart in the source file's own header.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Neon Postgres schema (`schema.ts`, **29 tables**)" / "29 tables" (lines 5, 18) | There are **31** table-defining calls: 18 app + `usersSync` + `insightJobs` + 4 push + 3 AI + 4 MCP. The "29" is inherited from schema.ts's own (inaccurate) header comment, which counts only 18 app + 4 push + 3 AI + 4 MCP and omits `users_sync` and `insight_jobs`. The doc's own detailed list (line 211) correctly enumerates all 13 Postgres-only tables (= 31 total with the 18 app tables), so the doc is internally inconsistent. | schema.ts:1-8 (header says 29); `grep -cE "= (pgTable\|neonAuth.table)\(" → 31` |
| low | "**Audit log** of 30 distinct actions" — correct, BUT note schema.ts's CHECK-constraint comment says "All **29** AuditAction values copied verbatim" | The `AuditAction` union has exactly **30** members (db.ts:24-54) and the CHECK constraint lists all 30. The doc's "30" is right; flagging only that the schema.ts comment (line 618) miscounts as "29" — not a doc error, a source wart the verifier confirmed against. | schema.ts:618; db.ts:24-54 |
| low | PREVIEW_STORES docstring "the current (**v19**) schema" | Comment is stale — `createPreviewDatabase` uses `DB_SCHEMA_VERSION` (=21). Source-comment wart, faithfully not repeated by the doc; noted for completeness. | db.ts:910, 934 |

No medium- or high-severity inaccuracies found. Every enum member, preset
value, default, sanitize range, threshold, label, and schema string in the doc
matches the code exactly.

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `Settings.aiAuthSecret` (obfuscated server-AI auth secret) and its getter `getDeobfuscatedAuthSecret` are not in the settings table. Not a tracked default/range, so reasonable to omit. | settings-store.ts:56, 196, 370-374 |
| low | `Settings.liquidPresets` (the persisted, user-editable copy of `DEFAULT_LIQUID_PRESETS` with `addLiquidPreset`/`updateLiquidPreset`/`deleteLiquidPreset` CRUD) is a persisted setting field not listed in the settings-defaults table. The doc covers the constant but not that it lives in the store as editable state. | settings-store.ts:93, 214, 437-456 |
| low | `Settings.quickNavItems` (persisted footer item list, separate from `quickNavOrder`/`showQuickNav`) is omitted from the settings table though `DEFAULT_QUICK_NAV_ITEMS` is covered. | settings-store.ts:72, 202 |
| low | `substanceConfig` "Other" type defaults: caffeine Other = 80mg/250ml, alcohol Other = 1 drink/250ml. Doc lists Coffee/Espresso/Tea + Beer/Wine/Spirits but the "Other" defaults (which the doc DOES mention for caffeine "Other 80mg/250ml" and alcohol "Other 1/250ml") — actually present in doc lines 123-124. Confirmed, not an omission. | settings-store.ts:234, 243 |
| low | `sync-status-store` has `lastPushedAt`, `lastPulledAt`, `initialSyncComplete` (persisted) in addition to the four runtime fields the doc lists (`isSyncing`, `isOnline`, `queueDepth`, `lastError`). The doc names only the four ephemeral ones. | sync-status-store.ts:19-30 |
| low | `progressExtended` is empty/absent on more themes than the doc implies. Doc says "weight & BP themes have no progress gradients"; in fact only `water`, `salt`, `sugar` have a non-empty `progressExtended`. `potassium` omits the key entirely; `caffeine`, `alcohol`, `eating`, `urination`, `defecation`, `weight`, `bp` all have `progressExtended: ""`. (`progressGradient` is non-empty for water/salt/sugar/potassium/caffeine/alcohol.) The doc's literal claim is true but understates the scope. | card-themes.ts:113 (potassium, no key), 133, 154, 175, 196, 217, 238, 259 |
| low | `CardTheme` carries many style fields (`iconBg`, `buttonBg`, `outlineBorder`, `hoverBg`, `inputBg`, `loadingBg`, `latestValueColor`, `activeToggle`, `sectionId`) beyond "gradient/border/icon/progress". Doc summarizes as "Each defines gradient/border/icon/progress colors" — accurate-but-abbreviated. | card-themes.ts:16-36 |
| low | `phaseSchedules` Dexie index includes `time` (the deprecated field is still indexed: `id, phaseId, time, enabled, updatedAt`); doc's data-model entry mentions the field but not that the legacy `time` is still an index key. | db.ts:476, 734 |

## Spot-confirmed

- Dexie schema **v21**, `DB_SCHEMA_VERSION = 21` exported. Confirmed. (db.ts:846, 906)
- `userId` is the only Postgres-only column; parity test enforces 18 Dexie tables. Confirmed. (schema-parity.test.ts:21-22, 51-52)
- Sync scaffolding `id/createdAt/updatedAt/deletedAt/deviceId` on every data table; most carry `timezone`. Confirmed (prescriptions, medicationPhases, phaseSchedules, titrationPlans, userProfile, insightReports omit `timezone`; doseLogs *has* it). (db.ts:271-302, 152-207, 209-224)
- Composable `groupId` + `originalInputText` + `groupSource` on intake/eating/substance only. Confirmed. (db.ts:19-21, 107-109, 321-323)
- Inventory event-sourcing; `currentStock` deprecated; v10 converts legacy stock to one `initial` transaction. Confirmed. (db.ts:230-231, 556-577)
- `CompoundStrength { name, strength }`; combination example Sacubitril 49 + Valsartan 51 = "Vymada 100". Confirmed verbatim. (db.ts:141-150)
- `scheduleTimeUTC` (minutes from UTC midnight) + `anchorTimezone`; legacy `time` deprecated; v11 used `localHHMMStringToUTCMinutes`. Confirmed. (db.ts:209-224, 621-637)
- **Enum table** — every row verified verbatim: `IntakeRecord.type` (water/salt/sugar/potassium, CHECK schema.ts:88); `groupSource` values; `SubstanceRecord.type` (caffeine/alcohol, schema.ts:262); `SubstanceRecord.source` (water_intake/eating/standalone, schema.ts:266); `position` (standing/sitting); `arm` (left/right); `PillShape` (round/oval/capsule/diamond/tablet, schema.ts:475); `FoodInstruction` (before/after/none); `DoseStatus` (taken/skipped/rescheduled/pending); `PhaseType` (maintenance/titration); `MedicationPhase.status` (active/completed/cancelled/pending); `TitrationPlanStatus` (draft/active/completed/cancelled); `InventoryTransaction.type` (refill/consumed/adjusted/initial); `InsightReport.mode` (fast/deep, undefined⇒fast); `SyncQueueRow.op` (upsert/delete); `ErrorLogSource` (6 sources); `daysOfWeek` 0=Sun…6=Sat. All confirmed. (db.ts:9,136-138,173,185,193,262,306,312,329,354-360,417; schema.ts:88,144,148,262,266,346,387,391,395,475,522,560,708)
- **AuditAction — 30 values**, doc list matches db.ts:24-54 verbatim (digit-for-digit order checked). Confirmed.
- **Server-only enums** all confirmed: `insight_jobs.status` (pending/completed/failed/expired, one-pending partial unique index, schema.ts:763,767); `user_key_shares.provider`/`ai_usage.provider` (anthropic/groq, schema.ts:907,951); `ai_usage.keySource` (own_stored/shared_from/env_var, schema.ts:947); `ai_usage.status`/`mcp_audit_log.status` (success/error, schema.ts:955,1067); `mcp_oauth_clients.tokenEndpointAuthMethod` (none/client_secret_basic/client_secret_post, schema.ts:990); `mcp_auth_codes.codeChallengeMethod` (S256/plain, schema.ts:1016).
- **Card themes — 11 domains**, all keys + labels verbatim (water→Water, salt→Sodium, sugar→Sugar, potassium→Potassium, weight→Weight, bp→Blood Pressure, eating→Eating, urination→Urination, defecation→Defecation, caffeine→Caffeine, alcohol→Alcohol). Footer overrides water→"Liquids", eating→"Food & Salt". Confirmed. (card-themes.ts:38-269; quick-nav-defaults.ts:27-30)
- **BP categories** — all 6 thresholds + tailwind colors verbatim (Grade 3 ≥180/≥110 red-700; Grade 2 ≥160/≥100 red-600; Grade 1 ≥140/≥90 orange-600; High normal ≥130/≥85 yellow-600; Normal ≥120/≥80 lime-600; Optimal green-600), OR-based highest-first. Confirmed. (constants.ts:57-71)
- **FOOD_PRESETS (21)** — every name + waterPercent digit-checked: Apple 86, Banana 75, Orange 87, Watermelon 92, Grapes 81, Strawberries 91, Cucumber 96, Tomato 94, Lettuce 96, Celery 95, Carrot 88, Broccoli 89, Spinach 91, Peach 89, Pineapple 86, Milk 87, Yogurt 85, Soup (broth) 92, Rice (cooked) 70, Pasta (cooked) 62, Custom 80. All confirmed. (constants.ts:19-41)
- **DEFAULT_SODIUM_PRESETS (3)** — Sodium 100, Table Salt 39, MSG 12. Confirmed. (constants.ts:103-107)
- **DEFAULT_LIQUID_PRESETS (8)** — Espresso (coffee,30ml,98%,210/100ml), Double Espresso (60ml,210), Moka (50ml,130), Coffee (250ml,38,99%), Tea (250ml,19,99%), Beer (alcohol,330ml,93%,ABV5), Wine (150ml,87%,ABV12), Spirit (45ml,60%,ABV40). `tab` coffee/alcohol/beverage; `source` manual/ai. All confirmed. (constants.ts:125-136, 111-123) Note: doc says Coffee "99%" implicitly via "water%"; code Coffee=99, Tea=99, Espresso/DoubleEsp/Moka=98 — doc only spells out Espresso 98% and Beer 93%/Wine 87%/Spirit 60%; all match.
- **Migration default-amount maps (v12)** — CAFFEINE_KEYWORDS (coffee, espresso, tea, caffeine, matcha, latte, cappuccino); DEFAULT_CAFFEINE_MG (coffee 95, espresso 63, tea 47, latte 95, cappuccino 95, matcha 70); DEFAULT_CAFFEINE_VOLUME_ML (coffee 250, espresso 30, tea 250, latte 350, cappuccino 250, matcha 250); ALCOHOL_KEYWORDS (beer, wine, whiskey, whisky, vodka, gin, rum, cocktail, spirit, alcohol, brandy); DEFAULT_ALCOHOL_DRINKS (beer 1, wine 1, cocktail 1.5). All verbatim. (db.ts:645-656)
- **Substance config defaults** — Coffee 95/250, Espresso 63/30, Tea 47/250, Other 80/250; Beer 1/330, Wine 1/150, Spirits 1/45, Other 1/250. Confirmed. (settings-store.ts:230-244)
- **Settings defaults/ranges table** — every row digit-checked against defaults (settings-store.ts:182-247) and sanitize calls (346-432): waterIncrement 250 [10-1000], saltIncrement 250 [10-1000], waterLimit 1000 [100-10000], saltLimit 1500 [100-10000], sugarLimit 30 [5-500], potassiumLimit 3500 [100-20000], waterExtendedBuffer 500 [0-10000], saltExtendedBuffer 500 [0-10000], sugarExtendedBuffer 10 [0-500], optionalTrackers {sugar:true,potassium:false}, theme system, dataRetentionDays 90 [0-365], dayStartHour 2 [0-23], showQuickNav true, quickNavOrder rtl, scrollDurationMs 300 [100-1000], autoHideDelayMs 500 [0-2000], barTransitionDurationMs 200 [50-500], swipeNavDistanceThresholdPct 28 [10-60], swipeNavVelocityThreshold 500 [100-2000], urinationDefaultAmount small, defecationDefaultAmount medium, weightGraphShow* all true, weightIncrement 0.05 [0.05-1, 2dp], timeFormat 24h, storageMode local, primary/secondaryRegion "", doseRemindersEnabled false, reminderFollowUpCount 2, reminderFollowUpInterval 10, shakeToReportEnabled true, shakeThreshold 10 [4-20], shakeRequiredJolts 5 [2-8], analyticsIntroSeen false. **All match.**
- `SETTINGS_PERSIST_VERSION = 16`. Confirmed. (settings-store.ts:255)
- **Quick-nav default order** water, eating, bp, weight, urination, defecation (all enabled). Confirmed. (quick-nav-defaults.ts:17-24)
- **Push defaults** — push_settings enabled true / followUpCount 2 / followUpIntervalMinutes 10 / dayStartHour 2; push_subscriptions.timezone default 'UTC'. Confirmed. (schema.ts:851-857, 800)
- **abvPercent CHECK** NULL OR 0-100. Confirmed. (schema.ts:268-271)
- **Decimal vs integer fields** — `weight`, `amountStandardDrinks`, `abvPercent`, `dosage`, `strength` are `real`; `amount`, `grams`, `volumeMl`, `heartRate`, `amountMg` are `integer`. Confirmed. (schema.ts:106, 238, 240, 422, 455, 73, 163, 241, 129, 236)
- **TABLE_PUSH_ORDER** 18 tables, FK parent-before-child, matches sync-topology.ts:28-55. Confirmed.
- **`_syncQueue` / `_syncMeta` / `_errorLogs`** local-only definitions + fields confirmed. (db.ts:329-373, 752-754, 780)
- **3 local-only Dexie system tables + 18 synced** = 21 Dexie stores total. Confirmed via store registration. (db.ts:425-446)

## Low-confidence / could-not-verify

- **"v11 backfilled tz: before 2026-02-12 → Africa/Johannesburg, from 2026-02-12 → Europe/Berlin."** The db.ts v11 migration delegates to `getTimezoneForTimestamp` (db.ts:598, 622-623); I did not open `src/lib/timezone.ts` to confirm the exact 2026-02-12 cutover boundary and the two IANA zones. The doc's claim is consistent with the migration comment block (db.ts:582-585) which states exactly those rules, so confidence is high but the dated boundary itself was not read from `timezone.ts`.
- **"Optional trackers gate persistence — no new records of that type are written when disabled."** This is a service-layer behavior; the settings-store only stores the flag (settings-store.ts:42-45, 364-367) and db.ts has no such gate. The enforcement lives in intake-service / form components (not in the 7 covered files). Plausible and matches the in-code comment (settings-store.ts:37-39), but the actual write-gating code was outside the covered file set and not independently verified.
- **"Hard-delete path (`op: 'delete'`) exists but is unused in the sync pilot."** Confirmed the type exists and the comment says it's unused (db.ts:326-336); did not trace the sync engine to prove no caller emits `op: 'delete'`.
