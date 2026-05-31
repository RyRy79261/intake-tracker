# Verification — 14-compound-library

**Verdict:** accurate · checked 78 claims, verified 74.

The document is an unusually faithful description of the implementation. Every component, hook, route, enum, default, threshold, formatter, and edge-case rule it lists was confirmed against source. The handful of issues found are low-severity wording imprecisions and small omissions, not behavioral inaccuracies.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|----------|-----------|--------------|-----------|
| low | Region: "values `none`/`None` treated as unset" (applied uniformly). | Asymmetric: `primaryRegion` only excludes `"none"` (lowercase) — `primary !== "none"`. `secondaryRegion` excludes both `"None"` and `"none"`. A capitalized `"None"` set as the primary region is **not** treated as unset. | `src/hooks/use-medicine-search.ts:49-51` |
| low | Schedule line "`<dose> <freq> at <times>` … `<dose> at <time>`" (Expanded card → Schedule). Data-model section correctly tags `PhaseSchedule.time` as deprecated. | The rendered time comes from the **deprecated** `s.time` field (`schedules.map(s => s.time)` / `at {s.time}`), not `scheduleTimeUTC`/`localTime`. Doc never states which field, but presents schedule times as authoritative while the Today section uses `localTime`; the inconsistency is unflagged. | `src/components/medications/compound-card-expanded.tsx:170,186` |
| low | `useMedicineSearch` — "used by the add-medication wizard." | Also consumed by `edit-medication-drawer.tsx` (`useMedicineSearch()` at line 479), not only the add wizard. | `src/components/medications/edit-medication-drawer.tsx:479` |
| low | Pill-icon "Default size 32 (collapsed card uses 36 …)". Implies 32 is used somewhere as a live default. | 32 is the function default only; no compound-library caller relies on it (collapsed 36, expanded 24, picker 28 all pass explicit sizes). Cosmetic — the default value is correct (`size = 32`). | `src/components/medications/pill-icon.tsx:13,63` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|----------|------------------------------|-----------|
| low | Brand-picker strength/stock line uses a middot separator (`{strength}{unit} · {stockText}`); doc says "strength/compound line + stock" without the `·` separator detail. | `src/components/medications/brand-switch-picker.tsx:99-104` |
| low | `InteractionSearch` result card header literally renders `"{query.trim()} vs {medicationName}"` per medication group; doc says "grouped by medication" but omits the "<query> vs <med>" heading text. | `src/components/medications/interaction-search.tsx:133-135` |
| low | `deriveStatus` maps a `rescheduled` DoseLog to slot status `skipped` ("rescheduled slots show as handled"); so the Today section never shows a distinct rescheduled state even though `DoseStatus` has `rescheduled`. Doc lists Today statuses (taken/skipped/pending/missed) correctly but doesn't note rescheduled collapses into skipped. | `src/lib/dose-schedule-service.ts:69` |
| low | `useRefreshInteractions` persists contraindications/warnings formatted as `"{medication}: {description}"` (medication name prepended to each entry). Doc says it "maps AVOID→contraindications, CAUTION→warnings" but omits the `medication:` prefix on stored strings. | `src/hooks/use-interaction-check.ts:169,173` |
| low | `useInteractionCheck.check` aborts any in-flight request before starting a new one (abortRef abort). Doc mentions abort/timeout but not the in-flight-supersede behavior. | `src/hooks/use-interaction-check.ts:69-71` |
| low | Interaction-search results panel animates in via `AnimatePresence` (opacity+height); not called out. Cosmetic. | `src/components/medications/interaction-search.tsx:93-100` |
| low | `InteractionsSection` renders a "No interaction data yet" refresh button **even when signed-out is false but data is absent** (AI on path); the disabled-state relabeling logic is duplicated in both the has-data and no-data branches. Doc covers states but not the duplicate button placement. | `src/components/medications/interactions-section.tsx:114-135` |

## Spot-confirmed

- Three-way categorization: `stock <= 0 → outOfStock` first, else `isActive → active`, else `inactive`; archived filtered up front via `!i.isArchived`. (`compound-list.tsx:27,48-57`)
- Active sorted by `brandName.localeCompare`; inactive grouped by `genericName` (fallback `"Unknown"`), groups + items alphabetical. (`compound-list.tsx:60,156-181`)
- Group header pluralization `N medication`/`N medications`; "Out of stock (N)" count; uppercase micro-labels "Active"/"Other". (`compound-list.tsx:118,204,75,93`)
- Empty state: `Cat` icon, "No medications yet", outline "Add your first medication". (`compound-list.tsx:31-39`)
- Interaction search shown only when `useAuthGate()` truthy (`showAi && <InteractionSearch/>`). (`compound-list.tsx:20,70`)
- Collapsed card: pill icon size 36, default shape `"round"`, default color `#94a3b8`; combo → `formatCompoundShort`, single → `${strength}${unit ?? "mg"}`; fractional → `formatPillCount`, whole → `${stock} pills`; updated date `toLocaleDateString({month:"short",day:"numeric"})`; whileTap scale 0.98. (`compound-card.tsx:33-34,44,51-53,22-25,66,38`)
- Negative badge (`currentStock < 0`, destructive); Low badge (`!negative && refillAlertPills !== undefined && stock <= refillAlertPills`, amber). (`compound-card.tsx:27-31,69-78`)
- Expanded card: inventory filtered non-archived, active-first then alpha; row pill icon size 24; "Active" emerald outline badge; Low (`stock <= refillAlertPills && stock >= 0`); negative stock → red text + `font-medium`. (`compound-card-expanded.tsx:49-55,105-109,115-122,88-96,131-139`)
- `getEffectivePhase` = active titration (with titrationPlanId) ?? active maintenance ?? any active; "On titration" amber badge when `effectivePhase.type === "titration"`; Schedule section omitted when no effective phase. (`medication-ui-utils.ts:23-55`; `compound-card-expanded.tsx:155,159-163`)
- Frequency labels: 1 → `daily`, 2 → `twice daily`, N → `Nx daily`; collapse only when every `s.dosage === schedules[0].dosage`; "No schedules configured" fallback. (`compound-card-expanded.tsx:168-188,191-193`)
- Food footnote when `foodInstruction !== "none"` → "Take before eating"/"Take after eating". (`compound-card-expanded.tsx:195-202`)
- Today slot statuses: taken=emerald CheckCircle2, skipped=gray-400 XCircle, pending=muted MinusCircle, missed=amber Clock; status label colored to match. (`compound-card-expanded.tsx:220-248`)
- Actions: "Switch Brand" only when `sortedInventory.length > 1`; "Prescription Details" always; inner `onClick` stops propagation; container `onClick` stopPropagation. (`compound-card-expanded.tsx:57,257,268,73,262,272`)
- Brand picker: non-archived rows, size-28 icon, active item shows emerald check "Active"; select deactivates active then activates chosen via two `mutateAsync`; toast title "Brand switched", desc `Switched to ${brandName}`; re-selecting active is no-op close; rows `disabled={updateInventory.isPending}`. (`brand-switch-picker.tsx:35-65,86,106-114`)
- Pill icon: 5 shapes with exact geometry — round r=0.8·half, oval rx 0.9·half / ry 0.6·half, capsule rect 0.8w×0.5h rx 0.25, diamond polygon, tablet rect 0.7×0.7 rx 0.12; badge for taken(emerald)/skipped(gray-400)/rescheduled(amber), none for pending; badge size 0.45·size. (`pill-icon.tsx:23-54,67-91`)
- Interaction-check route: rate limiter 5; modes lookup/conflict both `.min(1)` active prescriptions; severity enum `["AVOID","CAUTION","OK"]`; `tool_choice` forced; 502 on missing/invalid tool output; model `CLAUDE_MODELS.premium`, `max_tokens 2048`, `temperature 0`; `sanitizeForAI` on names/substance; only `genericName` (+ optional drugClass) sent. (`interaction-check/route.ts:93,21-46,150,166-180,144-152,132-139`)
- Medicine-search route: rate limiter 15; query 1–200 chars, country ≤100; 422 + `fallbackToManual:true` on bad tool output; `foodInstruction` enum defaults `"none"`; full response schema (brandNames, localAlternatives, genericName, dosageStrengths, activeIngredients, strengthOptions[{label,compounds}], commonIndications, foodNote?, pillColor, pillShape, pillDescription, drugClass, visualIdentification?, contraindications, warnings, isGenericFallback). (`medicine-search/route.ts:13-46,126,194,204`)
- `useInteractionCheck`: lookup-mode cache check; timeout `setTimeout(..., 15000)` armed only after `apiFetch` resolves; `null` Response → silent sign-in dismiss; `AbortError` → "Interaction check timed out"; lookup results cached, conflict not. (`use-interaction-check.ts:57-66,98,92-96,119-120,112-114`)
- `interaction-cache`: prefix `interaction-cache:`, TTL `24*60*60*1000`, key trimmed+lowercased, all access try/catch. (`interaction-cache.ts:12-17,25`)
- `useRefreshInteractions`: conflict mode, AVOID→contraindications, CAUTION→warnings, `drugClass` prepended as `"Drug class: …"` via `unshift`, persisted via `useUpdatePrescription`. (`use-interaction-check.ts:168-188`)
- `InteractionsSection`: header `ShieldAlert`, contraindications=AVOID red, warnings=CAUTION amber or INFO/muted when `startsWith("Drug class:")`; refresh disabled when `isRefreshing || otherActiveCount === 0`; relabel "Add more prescriptions to check interactions"; hidden when `!showAi && !hasData`. (`interactions-section.tsx:51-52,58-93,101,108-110,47`)
- `compound-utils`: `isCombo` = `compounds.length >= 2`; `splitDose` rounds `Math.round(x*100)/100`; `formatCompoundShort` `49/51mg` default unit "mg"; `formatCompoundFull` `Name Xmg + …`; `formatCompoundNames` `A / B`. (`compound-utils.ts:23-25,40,57-82`)
- `formatPillCount`: ¼/½/¾ Unicode, whole+frac combos, tablet/tablets pluralization. (`medication-ui-utils.ts:61-83`)
- Type defs: `PillShape` = round|oval|capsule|diamond|tablet; `DoseStatus` = taken|skipped|rescheduled|pending; `FoodInstruction` = before|after|none; `PhaseType` = maintenance|titration; `MedicationPhase.status` = active|completed|cancelled|pending; `DoseSlotStatus` = taken|skipped|pending|missed. (`db.ts:136-138,173,185`; `dose-schedule-service.ts:17`)
- Region defaults: `primaryRegion: ""`, `secondaryRegion: ""`. (`settings-store.ts:221-222`)
- `CompoundCardExpanded` mounted inside `prescription-card.tsx:211`.

## Low-confidence / could-not-verify

- None. All "actual values from code" claims (sizes 24/28/36/32, color `#94a3b8`, timeout 15000, TTL 24h, rate limits 5/15, max_tokens 2048, temperature 0, geometry constants) were checked digit-for-digit and matched. The only residual judgment calls are the wording-level low-severity items above.
