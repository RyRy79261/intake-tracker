# Verification — 40-settings-store-enums

**Verdict:** minor-gaps  ·  checked 118 claims, verified 113.

Document scope is the persisted Zustand settings store plus every settings UI
surface. Almost every enumerated default, range, label, preset, and migration
step was confirmed digit-for-digit against source. The only substantive issue
is one wiring claim in the Data-model section (`dataRetentionDays` "governs
pruning") that the codebase contradicts — the field is dead. A handful of
small label/wording nuances are noted as low severity.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Indirectly governs Dexie/Neon data … `dataRetentionDays` governs pruning" (line 178) | `dataRetentionDays` / `setDataRetentionDays` have **zero consumers** anywhere in the repo. No selector, no `getState().dataRetentionDays`, no pass into any pruning routine. `runExpiryCheck(retentionDays)` in `push-notification-service.ts` is never called and is never fed the setting. The field is effectively dead; it governs nothing. | store def `src/stores/settings-store.ts:62`, setter `:378-379`; orphan param `src/lib/push-notification-service.ts:98,232`; no callers (grep) |
| low | Storage section: doc says offline-waiting copy is shown via `CloudOff` (states list, line 80) — true — but also implies a generic "downloading (spinner)" with no copy. Actual downloading state shows spinner **plus** the text "Downloading your full data to this device…", and offline shows "Waiting to download your data (offline)". | Wording present in code; doc's paraphrase is directionally right but omits the literal strings. | `src/components/settings/storage-info-section.tsx:65-79` |
| low | Dose-reminder helper text enumerated as: unsupported / signed-out. Code has a **third** branch — when supported and (signed-in OR already enabled): "Get push notifications when medications are due". Doc omits this default branch. | Three-way ternary. | `src/components/medications/medication-settings-view.tsx:333-338` |
| low | `aiAuthSecret` described as "legacy server-AI shared secret" with setter/getter. Accurate that it's legacy, but doc does not state that `getDeobfuscatedAuthSecret` (and the secret itself) has **zero callers** — it is fully dead, not merely legacy. | `getDeobfuscatedAuthSecret` / `aiAuthSecret` reads: none found in repo. | store `src/stores/settings-store.ts:370-374`; no consumers (grep) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `setReminderFollowUpCount` / `setReminderFollowUpInterval` are **raw `set()`** — they do NOT run `sanitizeNumericInput` (unlike every other numeric setter). The doc's table lists them as Select-bound (0,1,2,3 / 5..30) which constrains the UI, but the underlying setters are unvalidated. Worth noting as the lone unsanitized numeric pair. | `src/stores/settings-store.ts:417-418` |
| low | `setUrinationDefaultAmount` / `setDefecationDefaultAmount` / all `weightGraphShow*` / `setShowQuickNav` / `setQuickNavOrder` / `setQuickNavItems` / `setStorageMode` / `setTheme` / `setPrimaryRegion` / `setSecondaryRegion` / `setTimeFormat` / `setShakeToReportEnabled` / `setOptionalTracker` / `setSubstanceConfig` / `setAnalyticsIntroSeen` are plain `set()` (no sanitize). Doc's "every numeric setter runs sanitizeNumericInput" (line 22) is correct as scoped to numeric setters, but the non-numeric set is large and unlisted. | `src/stores/settings-store.ts:384-435` |
| low | `LiquidPreset` edit form: alcohol input is labelled "% ABV" and substance summary renders alcohol as "Nstd alc/100ml" (literal "std", a wording quirk vs the ABV stored). Doc calls `alcoholPer100ml` "ABV %" (correct for storage) but the on-screen summary text mislabels it "std". | `src/components/settings/liquid-presets-section.tsx:25,146` |
| low | `CardTheme` carries a `progressExtended` second-tone gradient token per theme (water/salt/sugar have it; weight/bp/eating/urination/defecation are empty strings; caffeine/alcohol empty). Doc's enum list of `CardThemeKey` is complete, but the per-theme extended-progress token (which is what the extended-buffer feature renders) is not mentioned. | `src/lib/card-themes.ts:50,71,92` etc. |
| low | `migrateSettings` `version === 0` branch deletes **both** `perplexityApiKey` and `aiAuthSecret`. Doc says "v0 deletes `perplexityApiKey`/`aiAuthSecret`" — correct — but note it's `version === 0` (strict equality), not `< 1`, so it only fires for exactly-v0 blobs. Minor precision point. | `src/stores/settings-store.ts:268-271` |
| low | AI-keys usage summary empty-state text is "No AI usage in the last N days" and loading is "Loading usage…" (not just "Loading…"). Doc's states list says usage "loading/empty/populated" generically — fine, but literal strings differ from the provider-card "Loading…". | `src/components/settings/ai-keys-section.tsx:359,367` |

## Spot-confirmed

Defaults / ranges (`defaultSettings` + setter `sanitizeNumericInput` calls), all verified digit-for-digit:
- `waterIncrement` 250 / 10–1000, `saltIncrement` 250 / 10–1000 — `settings-store.ts:183-184,347-349`; UI step 10 — `water-settings-section.tsx:39`, `salt-settings-section.tsx:39`.
- `waterLimit` 1000 / 100–10000, `saltLimit` 1500 / 100–10000 — `:185-186,350-353`; step 100 — `water-settings-section.tsx:55`.
- `sugarLimit` 30 / 5–500 (step 5) — `:187,354-355`, `sugar-settings-section.tsx:37`.
- `potassiumLimit` 3500 / 100–20000 (step 100) — `:191,362-363`, `potassium-settings-section.tsx:35`.
- `waterExtendedBuffer` 500 / 0–10000, `saltExtendedBuffer` 500 / 0–10000, `sugarExtendedBuffer` 10 / 0–500 — `:188-190,356-361`; "0 disables" copy — `water-settings-section.tsx:78`.
- `weightIncrement` 0.05 / 0.05–1 **precision 2** — `:215,421-422`, `weight-settings-section.tsx:77-82`.
- `dayStartHour` 2 / 0–23 — `:199,381-382`; Select renders 24 entries via `formatHour` — `day-settings-section.tsx:35-39`; `formatHour` 0→"12:00 AM (midnight)", 12→"12:00 PM (noon)" — `settings-helpers.ts:51-56`.
- `dataRetentionDays` 90 / 0–365 — `:198,378-379` (range correct; wiring dead, see Inaccuracies).
- `scrollDurationMs` 300 / 100–1000 (step 50), `autoHideDelayMs` 500 / 0–2000 (step 100), `barTransitionDurationMs` 200 / 50–500 (step 50) — `:203-205,387-392`, `animation-timing-section.tsx:36-75`.
- `swipeNavDistanceThresholdPct` 28 / 10–60 (step 1), `swipeNavVelocityThreshold` 500 / 100–2000 (step 50) — `:206-207,393-396`, `swipe-nav-section.tsx`.
- `shakeToReportEnabled` true, `shakeThreshold` 10 / 4–20, `shakeRequiredJolts` 5 / 2–8 — `:218-220,429-432`; "~0.8s" window confirmed (`windowMs = 800`) — `use-shake-gesture.ts:124`.
- `timeFormat` "24h" default; Select "24-hour (14:00)" / "12-hour (2:00 PM)" — `:223`, `medication-settings-view.tsx:404-411`.
- `doseRemindersEnabled` false, `reminderFollowUpCount` 2, `reminderFollowUpInterval` 10 — `:224-226`; Select options None/1/2/3 and 5/10/15/20/30 — `medication-settings-view.tsx:363-387`.
- `urinationDefaultAmount` "small", `defecationDefaultAmount` "medium" — `:208-209`, options Small/Medium/Large — `urination-defecation-defaults.tsx:37-39`.
- `weightGraphShow{Eating,Urination,Defecation,Drinking}` all true — `:210-213`; four `GraphToggle`s — `weight-settings-section.tsx:98-125`.
- `quickNavOrder` "rtl"; Select "Right to Left (recommended)" / "Left to Right" — `:201`, `quick-nav-section.tsx:115-116`.
- `storageMode` "local" default — `:216`; badge "Cloud Sync"(green)/"Local only"(secondary) — `storage-info-section.tsx:47-55`.
- `analyticsIntroSeen` false; sole consumer is the analytics intro dialog — `:217`, `analytics/analytics-intro-dialog.tsx:22-23`.

Presets / enums:
- `DEFAULT_LIQUID_PRESETS` = 8 (Espresso 210/98%/30, Double Espresso 210/98%/60, Moka 130/98%/50, Coffee 38/99%/250, Tea 19/99%/250 — all `tab:"coffee"`; Beer 5%/93%/330, Wine 12%/87%/150, Spirit 40%/60%/45 — `tab:"alcohol"`) — `constants.ts:125-136`. All values match doc exactly.
- `SubstanceConfig` default — caffeine.enabled true: Coffee 95/250, Espresso 63/30, Tea 47/250, Other 80/250; alcohol.enabled true: Beer 1/330, Wine 1/150, Spirits 1/45, Other 1/250 — `settings-store.ts:227-246`. Exact. **Confirmed zero consumers** of `substanceConfig`/`setSubstanceConfig` anywhere (doc's "no live UI setter consumer found" is correct, and in fact it is never even read).
- `FOOD_PRESETS` 21 entries with water% — all match (Apple 86 … Custom 80) — `constants.ts:19-41`.
- `DEFAULT_SODIUM_PRESETS` Sodium 100 / Table Salt 39 / MSG 12 (all default) — `constants.ts:103-107`.
- `URINATION_AMOUNT_OPTIONS` / `DEFECATION_AMOUNT_OPTIONS` small/medium/large — `constants.ts:80-92`. (Doc's enum-section header misspells the constant as `DEFACATION_AMOUNT_OPTIONS`; the real export is `DEFECATION_AMOUNT_OPTIONS` — typo in doc only.)
- `getBPCategory` ESH-2023 OR-based highest-first: Grade 3 (≥180/≥110), Grade 2 (≥160/≥100), Grade 1 (≥140/≥90), High normal (≥130/≥85), Normal (≥120/≥80), Optimal else — `constants.ts:57-71`. Exact, each with a color token.
- `DEFAULT_QUICK_NAV_ITEMS` water/eating/bp/weight/urination/defecation all enabled — `quick-nav-defaults.ts:17-24`; label overrides water→"Liquids", eating→"Food & Salt" — `:27-30`.
- `CardThemeKey` full set (water/salt/sugar/potassium/weight/bp/eating/urination/defecation/caffeine/alcohol) with icons matching doc — `card-themes.ts:38-271`.
- `OPTIONAL_TRACKERS`: sugar (ON, "g", Candy pink), potassium (OFF, "mg", Banana purple) with the described descriptions — `optional-trackers.ts:35-61`.
- `SETTINGS_PERSIST_VERSION = 16`; localStorage key `"intake-tracker-settings"`, JSON storage — `settings-store.ts:255,461-464`. `WELCOME_SEEN_KEY = "intake-tracker-welcome-seen"` — `constants.ts:10`. Crash key `"intake-tracker:crash-report"` (sessionStorage) — `app/settings/page.tsx:39,55`.

Migration chain — every step matched `settings-store.ts:268-337`: v0 deletes perplexityApiKey+aiAuthSecret; <2 seeds liquidPresets; <3 type→tab/per100ml + waterContentPercent 100, deletes coffeeDefaultType/utilityOrder; <5 seeds quickNavItems; <7 deletes experimentalFeatures; <8 storageMode "local"; <9 swipe 28/500; <10 deletes dismissedInsights + shakeToReportEnabled true; <11 shake 15/3; <12 shakeThreshold 8; <13 sugarLimit 30; <14 potassiumLimit 3500; <15 optionalTrackers {sugar:true,potassium:false}; <16 buffers 500/500/10. Doc's note that current defaults (10/5) diverge from migration-seeded historical values is correct.

UI behaviors confirmed: accordion `type="single" collapsible` — `app/settings/page.tsx:84`; sugar/potassium sections gated on tracker-enabled — `:99-100`; `validateAndSave` reverts to default (not clamp) on out-of-range/NaN — `settings-helpers.ts:14-21`; `incrementSetting`/`decrementSetting` clamp to max/min — `:25-48`; `addLiquidPreset` uses `crypto.randomUUID()` and returns id — `settings-store.ts:437-446`; import is merge-only (`mode:"merge"`) — `data-management-section.tsx:62`; clear is two-step (Cancel/Confirm Delete) — `:224-250`; export incomplete-cloud warning `storageMode==="cloud-sync" && !initialSyncComplete` — `:36-37`; theme via `next-themes` not the store — `appearance-section.tsx:14-15`; shake enable requests `requestMotionPermission`, destructive toast on denial — `report-bug-section.tsx:42-52`; `sanitizeNumericInput` NaN/Infinity→min, clamp, round (precision-aware) — `security.ts:56-65`; obfuscation = XOR `intake-tracker-v1` + base64 + `obf:` prefix, "not encryption" — `security.ts:16-33`.
Settings-page MedicationSettingsSection 7-country list (US/UK/CA/AU/DE/ZA/Other, secondary adds None) — `medication-settings-section.tsx:8-16`; medication-view CountryCombobox full ISO list with ""→"Not Specified (Global Search)" — `medication-settings-view.tsx:34-229`. AI providers Anthropic `sk-ant-` / Groq `gsk_`, 30-day usage window — `ai-keys-section.tsx:33-56,358`.

## Low-confidence / could-not-verify

- Doc claim that disabling an optional tracker "**stops persisting new entries** of that type (even AI-returned values)" — gating hooks (`useOptionalTrackerEnabled`) are wired into forms/voice/analytics across ~10 components (`food-salt-card.tsx`, `voice/*`, `analytics/*`, `liquids-card.tsx`, `text-metrics.tsx`), consistent with the claim, but I did not trace the exact persist call path in each writer to prove no `intakeRecords` of a disabled type can be written. Directionally confirmed, not exhaustively proven.
- The Drizzle/journal "migration timestamp footgun" from CLAUDE.md is **not relevant** to this unit — the settings store is localStorage Zustand `persist`, a separate versioning scheme; verified the doc does not conflate the two.
- "Granted by <email>" / "Using your key ending in <last4>" / share / revoke / usage flows in `ai-keys-section.tsx` are present as described, but their server round-trips (`use-ai-keys` hooks) were not executed — UI strings and branch logic confirmed by reading only.
