# 24 — Analytics: Titration Timeline

**Files covered:**
- `src/components/analytics/titration-tab.tsx` (the tab and all its sub-components)
- `src/app/analytics/page.tsx` (mount point, tab shell, time-range plumbing)
- `src/lib/analytics-service.ts` (`adherenceRate`, `bpTrend`, `weightTrend`, `fluidBalance`, `getRecordsByDomain`)
- `src/lib/analytics-stats.ts` (`trend`/`computeTrend`, `detectAnomalies`)
- `src/lib/analytics-types.ts` (result/trend types, constants)
- `src/lib/medication-service.ts` — barrel the component actually imports `getPrescriptions` / `getPhasesForPrescription` from; it re-exports them from `prescription-service.ts` (`getPrescriptions`) and `phase-service.ts` (`getPhasesForPrescription`) respectively (where the implementations live)
- `src/lib/db.ts` (`Prescription`, `MedicationPhase`, `PhaseType`, `DoseStatus`, `FoodInstruction`)
- Reference test: `src/components/analytics/titration-tab.dom.test.tsx`

**Purpose:** The Titration tab of the Analytics screen presents a per-prescription, per-phase report that overlays each medication phase's date window with the health outcomes recorded during that window (adherence, blood pressure, weight, fluid balance, anomaly count). It exists to let a single user see "what happened to my body while I was on this dose/phase" — a dose-change-vs-outcome timeline.

---

## Features

- **Dose-change-vs-outcome report.** For every prescription, lists its medication phases newest-first and, per phase, computes the health outcomes recorded *inside that phase's own date window* (not the globally selected analytics time range). Each phase row is effectively one segment of a titration timeline annotated with outcomes.
- **Phase window derivation.** Each phase defines its own analysis range: `start = phase.startDate`, `end = phase.endDate ?? Date.now()`. An ongoing phase (no `endDate`) runs up to "now".
- **Per-phase metrics computed (all scoped to that phase window):**
  - **Adherence rate** — ratio of doses taken vs scheduled slots during the phase window, for *this* prescription only (passes `rx.id` to `adherenceRate`). Rendered as a whole-number percentage.
  - **Average blood pressure** — mean systolic / diastolic over the phase window, plus a trend direction (rising/falling/stable) for **systolic only**, shown as an arrow. (`bpTrend` computes both `trend.systolic` and `trend.diastolic`, but the snapshot stores only `trend.systolic`; the diastolic trend is computed and discarded.) NOTE: BP/weight/fluid functions are queried by date range only (not by prescription), so they reflect *all* readings in that window regardless of which drug they belong to.
  - **Average weight** — mean weight (kg, 1 decimal) over the window, with a trend-direction arrow.
  - **Average fluid balance** — mean daily (intake ml − estimated urination output ml) over the window, in ml (rounded integer).
  - **Anomaly count** — number of weight data points whose z-score exceeds 2.0 (statistical outliers) within the phase window.
- **Conditional metric rendering.** Each of the four metric cells only renders when it has meaningful data: adherence shows only if `adherenceTotal > 0`; Avg BP only if `bpAvg.systolic > 0`; Avg Weight only if `weightAvg > 0`; Avg Fluid Balance only if `fluidAvgBalance !== 0`. Anomaly line shows only if `anomalyCount > 0`. Note the adherence cell renders whenever `adherenceTotal > 0` *even when the computed rate is 0* (e.g. every slot skipped/missed) — that case shows a rose "0%" badge, not a blank.
- **"Has data" gate.** A phase is considered to have data if adherence total > 0, OR any BP readings exist, OR any weight readings exist. The adherence side of the gate reads `adhResult.value.total` — the count of *scheduled* dose slots, independent of whether any were taken; a phase that had doses scheduled but none taken still counts as "has data" and renders the adherence cell at 0%. If none of the three conditions hold, the phase card collapses to a single "No health data recorded during this phase" message instead of the metrics grid.
- **Collapsible prescription sections.** Each prescription is a Card with a clickable header that expands/collapses its list of phase cards. Active prescriptions default to expanded; inactive prescriptions default to collapsed.
- **Phase type tagging.** Each phase card carries a pill badge for its `type` — `maintenance` (blue) or `titration` (amber).
- **Active-phase emphasis.** A phase whose `status === "active"` gets a green-tinted card border/background and an animated pulsing green dot in its header.
- **Active-prescription / inactive labeling.** Inactive prescriptions get a muted "(inactive)" label next to their name in the header.
- **Date-range label.** Each phase card shows a human range, e.g. `"May 1 - May 20"` or `"May 1 - present"` when the phase is ongoing (no end date).
- **Color-coded adherence badge.** Adherence percentage is colored by threshold: ≥90% green, ≥70% amber, <70% rose.
- **Color-coded trend arrows.** Rising = rose up-arrow, falling = emerald down-arrow, stable = muted minus. (Note: "rising" is styled as a negative/warning color and "falling" as positive — consistent with BP/weight where lower is generally better.)
- **Live reactivity.** Uses `useLiveQuery` (Dexie React hooks) — the report recomputes automatically whenever underlying prescriptions, phases, dose logs, BP, weight, water, or urination records change in IndexedDB. No manual refresh.
- **Receives the global time range prop** (`range: TimeRange`) but deliberately ignores it for computation — phase windows drive the analysis. (The prop is part of the shared tab interface.)

---

## User actions & interactions

- **Switch to the Titration tab** — selecting the "Titration" tab trigger in the Analytics `Tabs` bar (one of: Summary, Correlations, Records, Titration) mounts this view. Tab is also deep-linkable via `?tab=titration` URL param.
- **Expand / collapse a prescription** — tapping the prescription header row (ghost button spanning full width) toggles its phase list. Chevron icon flips between `ChevronRight` (collapsed) and `ChevronDown` (expanded).
- **Change the global time range** — via the `TimeRangeSelector` above the tabs (scopes `24h`/`7d`/`30d`/`90d`/`all` or a custom range). This affects other tabs but does NOT change titration phase computations (phases use their own dates). Default scope is `7d`.
- **Export** — `ExportControls` sits beside the time-range selector at the page level (not inside this tab, but available while it's shown).
- **No in-tab mutation.** This tab is read-only/analytical: there is no add, edit, delete, undo, drag, long-press, quick-add, or confirm/cancel inside the Titration tab. Phases and prescriptions are created/edited elsewhere (Medications screen); this tab only reflects them.
- **Navigation hint in empty state** — when there are no prescriptions, copy directs the user to "Add prescriptions in the Medications tab".

---

## States & presentations

- **Loading** — `useTitrationData()` returns `undefined` while the live query resolves; renders a centered muted text: "Loading titration data..." (no skeleton, just text).
- **Empty (no prescriptions)** — `reports.length === 0`: centered column with a `Pill` icon, "No prescriptions to analyze", and sub-text "Add prescriptions in the Medications tab to see titration reports".
- **Prescription with no phases** — inside an expanded section: "No phases configured" muted text.
- **Phase with no health data** — that phase card shows only its type badge, optional active dot, the date label, and "No health data recorded during this phase". Muted `bg-muted/30` styling.
- **Phase with data (default)** — full metrics grid (2-column) rendering only the metrics that have data, with trend arrows, plus optional anomaly line.
- **Active phase** — emerald border (`border-emerald-200 dark:border-emerald-800`) + emerald-tinted background (`bg-emerald-50/50 dark:bg-emerald-900/10`) + pulsing emerald dot. The emerald border/background apply **only to the full-data card**; if an active phase has no health data, its card stays `bg-muted/30` (the no-data branch never gets emerald styling) and only the pulsing emerald dot signals that it is active.
- **Inactive prescription** — collapsed by default, "(inactive)" label in header.
- **Active prescription** — expanded by default.
- **Per-metric absent state** — individual metric cells silently omit themselves when their value is zero/empty (no placeholder dashes).
- **Anomaly present** — amber row with `Activity` icon: "{n} anomaly detected" / "{n} anomalies detected" (singular vs plural pluralization).
- **Error / per-phase compute failure** — if any of the parallel analytics calls throw for a phase, that phase falls back to `emptySnapshot()` (renders as the "no health data" card). Failures are swallowed per-phase; the rest of the report still renders.
- **Zero-length phase guard** — a phase whose `endDate <= startDate` is short-circuited to an empty snapshot before any analytics run.
- **Offline / syncing** — no dedicated UI; all data is local IndexedDB so the tab behaves identically offline. No offline/syncing badge in this component.
- **Disabled / validation-error / success** — none; this is a non-interactive report with no forms.

---

## Enums, options & configurable values

- **Analytics tabs** (`AnalyticsTab`): `"summary" | "correlations" | "records" | "titration"`. This unit is the `"titration"` tab; label text "Titration".
- **Time scopes** (`TimeScope`, page-level): `"24h" | "7d" | "30d" | "90d" | "all"`. Default `"7d"`. (Not used by this tab's math.)
- **Phase type** (`PhaseType`): `"maintenance"` | `"titration"`. Badge colors: maintenance = blue, titration = amber.
- **Phase status** (`MedicationPhase.status`): `"active" | "completed" | "cancelled" | "pending"`. Only `"active"` drives the green emphasis + pulsing dot.
- **Trend direction** (`TrendDirection.direction`): `"rising" | "falling" | "stable"`. Arrow icons: rising → `TrendingUp` (rose-500), falling → `TrendingDown` (emerald-500), stable → `Minus` (muted).
- **Dose-log status** (`DoseStatus`, the persisted enum): `"taken" | "skipped" | "rescheduled" | "pending"`. Adherence does **not** filter on this enum directly — `adherenceRate` filters over **`DoseSlot.status`** (`DoseSlotStatus = "taken" | "skipped" | "pending" | "missed"`), the per-slot status derived at read time by `getDoseScheduleForDateRange`. A `rescheduled` dose-log maps to slot status `"skipped"`, and a missing log on a past date becomes `"missed"`. Adherence counts a slot as adherent only when slot `status === "taken"`.
- **Adherence color thresholds:** ≥90% emerald, ≥70% amber, otherwise rose. Displayed as `Math.round(rate * 100)%`.
- **Trend confidence threshold** (`MIN_TREND_CONFIDENCE`): `0.3` — R² below this forces direction to `"stable"`.
- **Trend slope deadband:** slope `> 0.01` → rising, `< -0.01` → falling, else stable.
- **Anomaly z-score threshold:** `2.0` (default of `detectAnomalies`). Requires ≥2 points and nonzero standard deviation.
- **Fluid-balance target rule:** `target = urinationEstimatedMl + 500` (500 ml above estimated output). (Computed in `fluidBalance`; the function also returns `daysAboveTarget`, `daysTotal`, the full `daily[]` array, and an `intraday[]` running-cumulative series — but the tab surfaces only `avgBalance` and discards the rest.)
- **Urination volume estimates** (`URINATION_ESTIMATE_ML`, feeds fluid balance): `small: 150`, `medium: 300`, `large: 500` ml. A record with a null/missing `amountEstimate` defaults to `"medium"`, and if the map lookup still misses the value falls back to a literal `300` ml.
- **Date label format:** `toLocaleDateString("en-US", { month: "short", day: "numeric" })` → e.g. "May 20". Ongoing end → literal `"present"`.
- **Units shown:** BP in `mmHg` (rendered as `systolic/diastolic`, both rounded to integers), weight in `kg` (1 decimal), fluid balance in `ml` (rounded integer), adherence as `%`.
- **Food instruction** (`FoodInstruction` on phases, not displayed here but part of the model): `"before" | "after" | "none"`.
- **Default analytics tab** when no URL param: `"summary"`.

---

## Data model touched

Reads only (no writes). Source: Dexie/IndexedDB via service layer.

- **`prescriptions`** (`Prescription` in `db.ts`): reads `id`, `genericName`, `isActive`. Fetched via `getPrescriptions()` (newest-first by `createdAt`, soft-deleted rows excluded).
- **`medicationPhases`** (`MedicationPhase`): reads `id`, `type`, `status`, `startDate`, `endDate`. Fetched via `getPhasesForPrescription(rx.id)` (newest-first by `createdAt`). Other fields exist but are unused here (`unit`, `foodInstruction`, `titrationPlanId`, etc.).
- **`doseLogs`** (`DoseLog`) and **`phaseSchedules`** — read indirectly by `adherenceRate()` via `getDoseScheduleForDateRange()`; adherence uses `DoseStatus`, `prescriptionId`, `scheduledDate`.
- **`bloodPressureRecords`** — read by `bpTrend()` (`systolic`, `diastolic`, `heartRate?`, `position`, `timestamp`).
- **`weightRecords`** — read by `weightTrend()` and (as the anomaly source via `getRecordsByDomain("weight", …)`): `weight`, `timestamp`.
- **`intakeRecords`** (water) and **`urinationRecords`** — read by `fluidBalance()` via `getRecordsByDomain` for water/urination; only `avgBalance` is surfaced.

Internal shapes (not persisted): `PhaseSnapshot`, `PrescriptionReport` (defined in `titration-tab.tsx`); `AdherenceResult`, `BPTrendResult`, `WeightTrendResult`, `FluidBalanceResult`, `TrendDirection`, `DataPoint`, `TimeRange` (in `analytics-types.ts`).

---

## Validation, edge cases & business rules

- **Phase window = its own dates**, independent of the page-level time range. `end` defaults to `Date.now()` for ongoing phases.
- **Zero-/negative-length phases** (`end <= start`) short-circuit to an empty snapshot — no analytics calls made.
- **Per-phase error isolation:** all five analytics calls run in `Promise.all`; any throw drops the whole phase to `emptySnapshot()` (rendered as no-data). One bad phase never breaks the report.
- **Has-data definition:** adherence total > 0 OR BP readings > 0 OR weight readings > 0. Fluid balance and anomalies alone do not count as "has data".
- **Adherence is prescription-scoped; BP/weight/fluid are window-scoped only.** BP, weight, and fluid metrics include *all* records in the phase window regardless of drug — a deliberate (or noted) limitation: outcomes are correlated to time, not provably to this specific drug.
- **Rounding:** adherence `Math.round(rate*100)`; BP systolic/diastolic `Math.round`; weight `toFixed(1)`; fluid balance `Math.round`.
- **Trend significance:** linear regression over index-normalized points; needs ≥2 points; R² < 0.3 → "stable"; slope deadband ±0.01. Empty/single-point series → stable, 0 confidence.
- **Anomalies:** z-score > 2.0 over weight points; needs ≥2 points and nonzero SD, else no anomalies.
- **Default expand state** is driven by `prescription.isActive` (active → open).
- **Timezone/day handling:** adherence groups by `yyyy-MM-dd` date strings derived from the range; fluid balance groups by local day key. Slot status `"taken"` is the only adherent state; the slot universe that counts against the rate is `"skipped"`/`"pending"`/`"missed"` (a `rescheduled` dose-log surfaces as a `"skipped"` slot — `"rescheduled"` never appears as a slot status).
- **Ordering:** prescriptions newest-created first; phases newest-created first (so the most recent phase appears at the top of each section, not chronological start order).
- **Pluralization:** "anomaly" (1) vs "anomalies" (n≠1).
- **No required user input / no forms** — nothing to validate from the user side.

---

## Sub-components / variants

- **`TitrationTab`** — top-level exported tab; handles loading / empty / list states; maps reports to `PrescriptionSection`s. Receives `{ range: TimeRange }` (currently unused for compute).
- **`useTitrationData()`** — Dexie `useLiveQuery` hook building `PrescriptionReport[]`: loops prescriptions → phases → per-phase parallel analytics → snapshots. Returns `undefined` while loading.
- **`emptySnapshot(phase)`** — factory for a zeroed `PhaseSnapshot` (used for zero-length phases and compute failures).
- **`PrescriptionSection`** — collapsible Card per prescription; header with `Pill` icon, generic name, "(inactive)" label, chevron; body lists phase cards or "No phases configured".
- **`PhaseSnapshotCard`** — per-phase card; two variants: (a) no-data minimal card, (b) full metrics-grid card with active-phase emphasis. Renders date label, type badge, active dot, metric cells, anomaly line.
- **`PhaseTypeBadge`** — pill badge for `maintenance` (blue) / `titration` (amber) phase type.
- **`AdherenceBadge`** — mono percentage with threshold coloring (green/amber/rose).
- **`TrendArrow`** — direction icon for rising (rose up) / falling (emerald down) / stable (muted minus).
- **`formatDate(ts)`** — short "Mon D" date formatter.
- **Service deps (not children but load-bearing):** `adherenceRate`, `bpTrend`, `weightTrend`, `fluidBalance`, `getRecordsByDomain` (analytics-service); `detectAnomalies`, `trend`/`computeTrend` (analytics-stats); `getPrescriptions`, `getPhasesForPrescription` (imported from the `medication-service` barrel, which re-exports from prescription-service / phase-service).
- **Not used here:** `correlateTimeSeries` (with its `strong >0.7` / `moderate >0.4` / `weak >0.2` / `none` strength buckets and `pairedDays < 3` guard in `analytics-stats`) is **not** called by this tab — correlation analysis belongs to the Correlations tab, not Titration.
