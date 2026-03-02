# Feature Research

**Domain:** Medication management + health tracking PWA (offline-first, single-user)
**Researched:** 2026-03-02
**Confidence:** MEDIUM — competitor features well-documented; multi-region and fractional dose handling are niche enough that sources are thin (training data + WebSearch, not official docs). Confidence noted per section.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that every medication tracker provides. Missing one = the app feels broken before users even get to differentiating functionality. Confidence: MEDIUM-HIGH (multiple independent sources agree on all of these).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Prescription / medication list | Foundation. Without a list there is nothing to schedule or track. | LOW | Must show compound name, dosage, frequency at a glance. This app models it as Prescription (compound) + InventoryItem (physical pill). Both layers must be surfaced. |
| Dose reminders / schedule view | Standard expectation since Medisafe launched (2013). Users assume the app will tell them when to take what. | MEDIUM | For this app: display scheduled doses as a timeline, not just push notifications (PWA has limited push reliability). |
| Dose confirmation (take / skip) | Without confirmation, the schedule is useless. Users expect a one-tap "taken" action. | LOW | Must be a single tap — no modal, no confirmation dialog. Undo is better than confirmation. |
| Dose history / adherence log | Users expect to see what they took and when, historically. | LOW | Table or list view; must show taken, skipped, and missed states. |
| Stock / refill tracking | Users expect the app to know how many pills remain and warn before running out. | MEDIUM | Refill alert threshold is configurable. Depletion must be tied to dose logging (not manual-only). |
| Refill alert | Users expect a notification or warning when stock is low. | LOW | Threshold-based: warn when N days of supply remain. |
| Multiple medications / prescriptions | Virtually all users are on more than one medication. Supporting only one = nonstarter. | LOW | Must support ≥10 concurrent active prescriptions without performance issues. |
| Medication details view | Users expect to see dosage, instructions, prescribing doctor, start date, notes. | LOW | This app stores this in the Prescription record. |
| Schedule types: daily, specific days, as-needed | Users have medications with very different cadences. These three cover ~95% of real schedules. | LOW-MEDIUM | As-needed / PRN doses should be loggable without a pre-existing schedule entry. |
| Offline operation | For a PWA installed on a phone, users expect the app to work without internet. | HIGH | Already architecturally solved (IndexedDB + Dexie). Must not regress. |

---

### Differentiators (Competitive Advantage)

Features this app can own that competitors don't handle well. These are directly driven by the user's documented pain points with Medisafe and the multi-region travel context. Confidence: MEDIUM (grounded in PROJECT.md user context + competitor gap analysis from WebSearch).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Prescription-first view | Most apps show a medication list organized by pill name / brand. This app organizes by compound (the medical identity), showing all regional brand variants under one prescription. Medisafe's weakness: same compound appearing twice with no linking. | HIGH | This is the core UX innovation. UI must clearly communicate "this is the same drug, different packaging." The Prescription → InventoryItem model already encodes this; the UI must expose it. |
| Multi-brand / multi-region inventory under one compound | User buys Concor (South Africa) and Bisoprolol Sandoz (Germany) — both are bisoprolol 5mg. Both deplete the same schedule. Stock views must differentiate them (different pill sizes, different pack quantities) while aggregating toward a single treatment identity. | HIGH | Inventory display must answer: "Which pack am I currently pulling from?", "What do I have in stock per region?", "What do I need to buy in SA vs Germany?" No known app does this well. |
| Retroactive dose logging | Medisafe's documented pain point: if you miss a notification, you cannot retroactively log a dose taken at a specific past time. You can only mark "taken now" or "missed." This app must support "I took this at 8:15am, logging at 11am." | MEDIUM | Time picker on dose log dialog; stock depletion must use the recorded time, not the logging time. |
| Phase / titration schedule support | Many medications start at low dose and ramp up (titration), or taper down (cessation). Apps typically support only fixed schedules. Supporting named phases (maintenance vs titration) with automatic transitions is rare. | HIGH | Already in data model (MedicationPhase). UI must make phases navigable: current phase clearly labeled, phase history viewable. |
| Fractional pill dose tracking | User cuts pills (halves, quarters). The dose logged must be fractional (0.5 tablet, 0.25 tablet). Stock depletion must be fractional (taking 0.5 of a 10mg tablet from a 20-pill inventory). | MEDIUM | dosageAmount field must support fractional values (use decimal number, not integer). Stock depletion must handle partial pills correctly. No major competitor explicitly documents this. |
| Physical pill vs prescribed dose distinction | A prescription says "take 5mg bisoprolol." The user has 10mg tablets and cuts them in half. The app must track: prescribed dose (5mg), physical pill form (10mg tablet), quantity consumed per dose (0.5 tablet), stock remaining in physical pills. | HIGH | This is the core inventory math challenge. InventoryItem must store: strength per physical tablet, dosage consumed per dose event, stock count in physical tablets. Depletion math: `stockRemaining -= dosageAmount / pillStrength`. |
| Active inventory selection | If user has both SA and German stock on hand simultaneously, which pack is currently being pulled from? App must support designating one InventoryItem as "active" per prescription and allow switching. | MEDIUM | UI must make the active inventory obvious and switching easy (one tap from inventory view). |
| Cross-domain health correlation | This app already tracks water, BP, weight, urination. Medication adherence correlation (e.g., "did missing my BP medication correlate with higher readings?") is a differentiator that Medisafe does not offer for locally-stored data. | HIGH | Depends on analytics-service.ts being built correctly. Not a Phase 1 UI feature but the data model must support it from day 1. |
| Audit log for data integrity | Every dose taken, stock adjustment, prescription change is logged immutably. Useful for reviewing discrepancies ("did I actually take that dose?") and future doctor-report generation. | LOW | Already in data model (auditLogs table). Must be actually written on all medication mutations. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem reasonable but would undermine the app's goals or user's trust in a single-user, personal, medical context. Confidence: HIGH (these are pattern-matched from competitor failure modes and single-user app constraints).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Push notification reminders | Every medication app has them. Users ask for them. | PWA push notifications are unreliable on iOS (limited background delivery). Building reliance on push creates false confidence: user thinks they'll be reminded, notification doesn't arrive, dose missed. The app then shows an inaccurate "missed" when the dose was taken without logging. | In-app schedule view as the primary interface. User opens app and sees what's due. Optionally add push as a supplementary fallback — but document that it is best-effort, not guaranteed. |
| Drug interaction checking | Medisafe and every major app provides this. Users want it. | This requires maintaining or licensing a drug database (DrugBank, RxNorm, NLM). For a single-user personal app, this is infrastructure and liability way out of scope. Single user can manage this with their doctor. | Display a "known interactions" free-text field on each prescription that the user fills in manually from their doctor/pharmacist. No automated checking. |
| Gamification / streaks / badges | Common in apps like Mango Health. Increases engagement metrics. | This is a serious medical app. Gamification creates emotional pressure that can backfire: user feels shame about missed doses instead of clinically neutral data. It also creates perverse incentives (logging a missed dose as "taken" to preserve a streak). | Simple adherence percentage in history view. Neutral data, no emotional framing. |
| Caregiver / family sharing | Medisafe's Medfriend feature. Common ask. | This is a single-user app by explicit design constraint. Multi-user access introduces auth complexity, conflict resolution, and privacy concerns that are out of scope. | N/A — out of scope. If caregiver access is ever needed, it's a separate milestone requiring NanoDB cloud sync first. |
| Pill identification by image / barcode | Common feature request. Attractive for multi-regional use. | Requires a comprehensive drug database that spans SA and German brands. No single database covers both well. OCR/barcode accuracy is poor for foreign-market packaging. Implementation complexity is very high for unclear benefit. | AI-assisted medicine search (already implemented via `/api/ai/medicine-search`). User can describe a pill and get AI to look it up. Frugal and accurate enough. |
| Cloud sync | Users eventually ask for this when they get a new phone. | Explicitly out of scope for this milestone. NanoDB/Dexie Cloud sync is a future milestone. Building it now would double the engineering complexity. | Schema must be sync-ready (UUIDs, createdAt/updatedAt, soft deletes) — but actual sync deferred. Document the export/import pattern as a manual interim solution. |
| Doctor report / PDF export | Users want to share adherence data with doctors. | Good feature long-term but premature now. Requires stable data model + defined report format. Building now before data model is solid risks generating unreliable reports. | Defer to a future milestone. The audit log and dose history data will support it once the data model is proven. |
| Social features / adherence comparison | Mango Health had social adherence comparison. | Completely incompatible with a single-user, private, offline-first app. Privacy concern for sensitive medical data. | N/A. |
| "Smart" adaptive scheduling | Some apps learn from user behavior and suggest schedule changes. | Single user, personal medical app. Prescription schedules come from a doctor, not from an algorithm's suggestion. An algorithm suggesting "take your BP med 30 minutes later" is medically inappropriate without physician sign-off. | Allow user to freely edit schedule manually. No algorithmic suggestions. |

---

## Feature Dependencies

```
Prescription record (compound, medical identity)
    └──required by──> InventoryItem (physical pill; brand, region, strength)
                          └──required by──> Dose logging with stock depletion
                                                └──required by──> Stock/refill alerts

Prescription record
    └──required by──> MedicationPhase (treatment plan; maintenance vs titration)
                          └──required by──> PhaseSchedule (time + days-of-week + dosage)
                                                └──required by──> Dose confirmation UI
                                                └──required by──> Retroactive dose entry
                                                └──required by──> Dose history view

Dose logging with stock depletion
    └──enhances──> Refill alert (alert accuracy depends on actual depletion, not estimates)

Prescription-first view
    └──requires──> Multi-brand inventory model (UI can only show compound-grouped view if data model supports it)

Fractional dose tracking
    └──requires──> Physical pill vs prescribed dose distinction
                   (you can't track 0.5 tablet without knowing what "1 tablet" means in mg)

Phase / titration support
    └──requires──> MedicationPhase being a stable, queryable entity
    └──enhances──> Dose history (history must show what phase each dose was taken under)

Cross-domain health correlation
    └──requires──> analytics-service.ts (cross-domain query layer)
    └──requires──> All domain tables having consistent timestamp indexing

Audit logging
    └──enhances──> Dose history (provides the immutable evidence layer behind displayed history)
    └──required by (future)──> Doctor report generation
```

### Dependency Notes

- **Prescription-first view requires Multi-brand inventory model:** The compound-as-identity UX is meaningless if the data model doesn't link multiple InventoryItems to one Prescription. Data model must be correct before UI is built.
- **Fractional dose tracking requires Physical pill vs prescribed dose distinction:** `dosageAmount` must be stored as "fraction of physical pill" (e.g., 0.5), not just "mg prescribed." Stock depletion arithmetic: `stockRemaining -= dosageAmount` where `dosageAmount = 0.5` means half a tablet.
- **Active inventory selection gates dose logging with stock depletion:** If no inventory item is marked "active" for a prescription, stock depletion cannot occur. The UI must enforce or gracefully handle this state.
- **Phase/titration support and retroactive logging are independent differentiators** that share the PhaseSchedule data model but do not depend on each other.

---

## MVP Definition

This is a milestone, not a greenfield product. The existing app already tracks intake and health. The MVP for this milestone is the medication management rebuild — not the entire app.

### Launch With (Milestone v1)

The minimum needed to replace the broken current medication implementation and provide the core differentiating value:

- [ ] Prescription list with compound-first display — why essential: the fundamental unit of identity
- [ ] InventoryItem management (add SA brand, add German brand, link to prescription) — why essential: multi-region support is the primary differentiator
- [ ] PhaseSchedule display (daily timeline of what's due) — why essential: users need to see their schedule
- [ ] Dose confirmation (take / skip / retroactive) with stock depletion — why essential: the core action of the app
- [ ] Active inventory selection (which pack am I pulling from?) — why essential: gates accurate stock depletion
- [ ] Fractional dose support (0.5 tablet, 0.25 tablet) — why essential: user cuts pills; this is a documented daily need
- [ ] Stock view per prescription showing remaining pills and projected days of supply — why essential: replaces manual tracking
- [ ] Refill alert threshold (warn at N days of supply remaining) — why essential: prevents running out mid-travel
- [ ] Dose history view (taken, skipped, missed per day) — why essential: adherence visibility

### Add After Validation (v1.x)

Features that add value but are not blockers for replacing the broken implementation:

- [ ] Phase / titration visualization (show current phase name, phase history) — trigger: user starts a titration schedule
- [ ] Phase transitions (start new phase, complete current phase) — trigger: doctor changes dose
- [ ] Adherence percentage in history (weekly/monthly) — trigger: once dose history is stable and accurate
- [ ] Audit log viewer (internal; not a doctor report) — trigger: data integrity questions arise in use

### Future Consideration (v2+)

Features that require this milestone's stable data foundation:

- [ ] Cross-domain health correlation (medication adherence vs BP readings) — why defer: requires analytics-service + history UI work; data model must prove stable first
- [ ] Doctor report / PDF export — why defer: depends on proven, complete dose history; premature now
- [ ] Cloud sync — why defer: explicitly out of scope; NanoDB milestone
- [ ] AI natural language querying — why defer: explicitly out of scope; AI milestone

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Prescription record (compound identity) | HIGH | LOW | P1 |
| InventoryItem (brand, region, strength) | HIGH | MEDIUM | P1 |
| PhaseSchedule daily timeline view | HIGH | MEDIUM | P1 |
| Dose confirmation (take / skip) | HIGH | LOW | P1 |
| Retroactive dose logging | HIGH | LOW | P1 |
| Stock depletion on dose | HIGH | MEDIUM | P1 |
| Active inventory selection | HIGH | LOW | P1 |
| Fractional dose tracking | HIGH | MEDIUM | P1 |
| Stock view + days-of-supply | HIGH | LOW | P1 |
| Refill alert | MEDIUM | LOW | P1 |
| Dose history view | HIGH | LOW | P1 |
| Prescription-first compound view (multi-brand grouping) | HIGH | MEDIUM | P1 |
| Phase / titration visualization | MEDIUM | MEDIUM | P2 |
| Phase transitions UI | MEDIUM | MEDIUM | P2 |
| Adherence percentage | MEDIUM | LOW | P2 |
| Audit log viewer | LOW | LOW | P2 |
| Cross-domain health correlation | HIGH | HIGH | P3 |
| Doctor report / PDF export | MEDIUM | HIGH | P3 |
| Cloud sync | HIGH | HIGH | P3 (future milestone) |

**Priority key:**
- P1: Must have for this milestone to be complete
- P2: Should have; add after P1 is stable
- P3: Nice to have or future milestone

---

## Competitor Feature Analysis

| Feature | Medisafe | MyTherapy | CareClinic | Our Approach |
|---------|----------|-----------|------------|--------------|
| Prescription-first / compound view | No — brand list only | No — brand list only | No — brand list only | YES — Prescription (compound) is the primary entity; InventoryItems are brand instances under it |
| Multi-region brand tracking | No — separate med entries with no linking | No | No | YES — multiple InventoryItems per Prescription with region/brand fields |
| Retroactive dose entry | No — can only log as current time | Limited | Unknown | YES — time picker on dose log; stock depletion uses recorded time |
| Fractional pill doses | Not documented — workaround only | Not documented | Not documented | YES — dosageAmount stored as decimal; depletion math handles 0.5 and 0.25 tablet |
| Phase / titration schedules | No — single fixed schedule | No — single fixed schedule | No | YES — MedicationPhase with named phases; one active at a time |
| Stock depletion tied to dose log | Yes (basic) | Refill reminders only | Refill reminders only | YES — dose confirmation triggers inventory transaction |
| Drug interaction checking | Yes (US drug DB) | No | Limited | NO — out of scope; free-text "known interactions" field on prescription |
| Caregiver sharing | Yes (Medfriend) | No | Yes | NO — single-user app |
| Offline-first | Yes | Yes | Unknown | YES — IndexedDB architecture |
| Push notifications | Yes | Yes | Yes | Best-effort — PWA limitations documented to user |
| Health metric correlation | Basic (sync to HealthKit) | Basic | Yes | YES — analytics-service architecture pre-built; UI deferred to v2 |
| Gamification | No | No | No | NO — deliberately excluded |

---

## Sources

- [Medisafe feature page](https://medisafeapp.com/features/) — competitor analysis (MEDIUM confidence, official source)
- [MyTherapy homepage](https://www.mytherapyapp.com/) — competitor analysis (MEDIUM confidence, official source)
- [CareClinic medicine tracker](https://careclinic.io/medicine-tracker/) — competitor analysis (MEDIUM confidence, official source)
- [OrangeSoft: Medication Management App Development](https://orangesoft.co/blog/guide-to-medication-management-app-development) — industry feature survey (LOW-MEDIUM confidence, developer blog)
- [Stormotion: Medication Management App Development](https://stormotion.io/blog/medication-management-app-development/) — industry feature survey (LOW-MEDIUM confidence, developer blog)
- [Medisafe no longer free Jan 2026 — MoneySavingExpert forum](https://forums.moneysavingexpert.com/discussion/6645234/medisafe-app-no-longer-free-from-january-1st-2026) — competitor pain points (MEDIUM confidence, user community)
- [GoodRx: Medication Reminder Apps review](https://www.goodrx.com/healthcare-access/digital-health/medication-reminder-apps) — competitor comparison (MEDIUM confidence, independent review)
- [PMC: Mobile Apps for Medication Management Review](https://pmc.ncbi.nlm.nih.gov/articles/PMC6786858/) — academic literature review of medication app features (HIGH confidence)
- PROJECT.md: `/home/ryan/repos/Personal/intake-tracker/.planning/PROJECT.md` — primary user requirements (HIGH confidence, authoritative)
- ARCHITECTURE.md: `/home/ryan/repos/Personal/intake-tracker/.planning/research/ARCHITECTURE.md` — data model constraints that scope feature decisions (HIGH confidence)

---

## Research Gaps

- **Fractional dose tracking in competitors:** No source confirmed any major competitor explicitly supports sub-tablet dose tracking. This is likely a genuine gap in the market, but the claim is based on absence of evidence rather than confirmed absence. LOW confidence that no competitor does this.
- **Multi-region medication equivalency:** "Convert Drugs Premium" app (mentioned in search results) does cross-country drug equivalency lookup but not integrated tracking. No competitor was found that handles the compound-as-identity across regional brand names within a personal tracker. MEDIUM confidence this is genuinely unaddressed.
- **Push notification reliability on iOS PWA:** Architecture note says PWA push is unreliable on iOS. This is accurate as of iOS 16.4 (which added limited web push support), but iOS reliability has reportedly improved. The anti-feature stance is conservative and correct — building core UX on unreliable infrastructure is wrong — but the exact current state of iOS PWA push should be verified before messaging this to user.

---

*Feature research for: Medication management + health tracking PWA (offline-first, single-user, multi-region)*
*Researched: 2026-03-02*
