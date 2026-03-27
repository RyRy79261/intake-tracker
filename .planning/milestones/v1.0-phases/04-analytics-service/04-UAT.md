---
status: diagnosed
phase: 04-analytics-service
source: 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md
started: 2026-03-10T00:30:00Z
updated: 2026-03-10T00:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Navigation Updated to Analytics
expected: Header navigation shows "Analytics" (not "History") with a bar chart icon. Tapping it navigates to /analytics.
result: pass

### 2. History Redirect
expected: Navigating to /history redirects to /analytics automatically.
result: pass

### 3. Analytics Page Tabs
expected: /analytics page shows 4 tabs: Records, Insights, Correlations, Titration. Tabs switch content when tapped.
result: issue
reported: "all except titration work"
severity: major

### 4. Time Range Selector
expected: Analytics page has a time range selector with presets (24h, 7d, 30d, 90d, All) and a custom date range option. Selecting a preset changes the data shown in the active tab.
result: pass
note: Buttons overflow off screen on mobile. No data to test filtering logic.

### 5. Records Tab
expected: Records tab shows a filterable list of all health records. Domain filter buttons let you narrow by type.
result: pass
note: UI verified, no data to test business logic.

### 6. Caffeine Tracking on Dashboard
expected: Main dashboard shows a caffeine card (yellow theme) with daily total and "+" button opening type picker drawer.
result: issue
reported: "Why must there be a popup for entering in this data when it could just be in the card?"
severity: cosmetic

### 7. Alcohol Tracking on Dashboard
expected: Main dashboard shows an alcohol card (fuchsia/pink theme) with daily total and type picker.
result: issue
reported: "This 1.4 drinks value is meaningless to me, use whatever is standard units"
severity: minor

### 8. Substance Settings
expected: Settings page has a substance section where caffeine and alcohol tracking can be enabled/disabled.
result: pass

### 9. Insights Tab
expected: Insights tab shows auto-generated health insight banners with severity coloring.
result: skipped
reason: No data to generate insights

### 10. Dashboard Insight Badge
expected: Main dashboard shows a compact insight badge with severity-aware coloring.
result: skipped
reason: No data to generate insights, badge not visible

### 11. Correlations Tab
expected: Correlations tab shows pre-configured correlation charts and custom comparison picker.
result: skipped
reason: No data to test. Lag days UI unclear.

### 12. Titration Tab
expected: Titration tab shows prescription-grouped sections with per-phase health snapshots.
result: issue
reported: "KeyPath createdAt on object store prescriptions is not indexed"
severity: blocker

### 13. PDF Export
expected: Export button generates and downloads a health report PDF.
result: skipped
reason: No data to export

### 14. CSV Export
expected: Export button generates and downloads a CSV file with all domain records.
result: skipped
reason: No data to export

## Summary

total: 14
passed: 4
issues: 4
pending: 0
skipped: 6

## Gaps

- truth: "All 4 analytics tabs switch content when tapped"
  status: failed
  reason: "User reported: all except titration work"
  severity: major
  test: 3
  root_cause: "prescriptions table missing createdAt index — titration-tab.tsx queries prescriptions via getPrescriptions() which calls .orderBy('createdAt'), but Dexie index only has 'id, isActive, updatedAt'"
  artifacts:
    - path: "src/lib/db.ts"
      issue: "prescriptions store definition missing createdAt index"
    - path: "src/lib/medication-service.ts"
      issue: "line 210 calls .orderBy('createdAt') on unindexed field"
  missing:
    - "Add createdAt to prescriptions index via Dexie v13 migration"
  debug_session: ""

- truth: "Caffeine tracking uses inline entry like water/salt cards"
  status: failed
  reason: "User reported: Why must there be a popup for entering in this data when it could just be in the card?"
  severity: cosmetic
  test: 6
  root_cause: "SubstanceRow uses a Drawer picker for all entries, unlike IntakeCard which has inline +/- buttons. Known types (Coffee, Espresso, Tea) should be inline quick-add buttons; only 'Other' needs the drawer for AI enrichment."
  artifacts:
    - path: "src/components/substance/substance-row.tsx"
      issue: "Single 'Add' button opens drawer instead of inline type buttons"
  missing:
    - "Add inline quick-add buttons for known types in SubstanceRow"
    - "Keep drawer only for 'Other' / custom entries"
  debug_session: ".planning/debug/substance-ux-issues.md"

- truth: "Alcohol tracking uses standard drink units"
  status: failed
  reason: "User reported: This 1.4 drinks value is meaningless to me, use whatever is standard units"
  severity: minor
  test: 7
  root_cause: "Display label says 'drinks' (line 86) and 'dr' (line 142) in substance-row.tsx. The underlying data model uses amountStandardDrinks correctly but the UI label is ambiguous."
  artifacts:
    - path: "src/components/substance/substance-row.tsx"
      issue: "Display label 'drinks' / 'dr' is vague — should say 'std drinks' or 'standard drinks'"
  missing:
    - "Change display from 'drinks' to 'std drinks'"
    - "Show entry description (Beer, Wine, etc.) in recent entries list"
  debug_session: ".planning/debug/substance-ux-issues.md"

- truth: "Titration tab loads and shows prescription-grouped sections"
  status: failed
  reason: "User reported: KeyPath createdAt on object store prescriptions is not indexed"
  severity: blocker
  test: 12
  root_cause: "Same as test 3 — prescriptions table missing createdAt Dexie index. getPrescriptions() in medication-service.ts calls .orderBy('createdAt') which requires the field to be indexed."
  artifacts:
    - path: "src/lib/db.ts"
      issue: "prescriptions store definition missing createdAt index"
    - path: "src/lib/medication-service.ts"
      issue: "line 210 calls .orderBy('createdAt') on unindexed field"
  missing:
    - "Add createdAt to prescriptions index via Dexie v13 migration"
  debug_session: ""

- truth: "Time range selector buttons fit on mobile screen"
  status: failed
  reason: "User reported during Test 4: buttons overflow off screen"
  severity: minor
  test: 4
  root_cause: "time-range-selector.tsx line 81 uses flex with overflow-x-auto and shrink-0 buttons. 6 buttons exceed mobile width with no visual scroll indicator."
  artifacts:
    - path: "src/components/analytics/time-range-selector.tsx"
      issue: "flex layout with shrink-0 buttons overflows on mobile"
  missing:
    - "Use flex-wrap or grid-cols-3 layout instead of horizontal scroll"
  debug_session: ".planning/debug/substance-ux-issues.md"

## Notes

- Time range selector buttons overflow off screen on mobile viewport (noted during Test 4)
- prescriptions createdAt index error also affects /medications page (pre-existing or phase 4 regression)
- 6 tests skipped due to no user data in dev environment — production data is on user's phone
