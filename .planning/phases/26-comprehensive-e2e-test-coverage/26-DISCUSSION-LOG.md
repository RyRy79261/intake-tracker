# Phase 26: Comprehensive E2E Test Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 26-comprehensive-e2e-test-coverage
**Areas discussed:** Test organization, Scenario depth & priority, Auth flow coverage, History & charts testing

---

## Test Organization

| Option | Description | Selected |
|--------|-------------|----------|
| One spec per page | dashboard.spec.ts, medications.spec.ts, history.spec.ts, settings.spec.ts, auth.spec.ts — mirrors app routes | ✓ |
| One spec per feature domain | intake.spec.ts, health-metrics.spec.ts, medications.spec.ts, liquids.spec.ts — more granular | |
| Keep current + add missing | Keep existing 4 files, add new files for uncovered areas | |

**User's choice:** One spec per page (Recommended)
**Notes:** None

### Follow-up: File migration

| Option | Description | Selected |
|--------|-------------|----------|
| Rename and consolidate | Rename auth-bypass→auth, intake-logs→dashboard, medication-wizard→medications | ✓ |
| Add new files, leave existing | Keep old filenames, add new alongside | |

**User's choice:** Rename and consolidate (Recommended)
**Notes:** None

---

## Scenario Depth & Priority

### Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Happy paths + key edge cases | Every section gets happy path + critical edge cases. ~2-4 tests per section | |
| Happy paths only | One golden-path test per section. ~1-2 tests per section | |
| Comprehensive | Happy paths, error states, edge cases. ~4-6 tests per section | ✓ |

**User's choice:** Comprehensive (happy + error + edge)
**Notes:** None

### Priority

| Option | Description | Selected |
|--------|-------------|----------|
| All dashboard cards equally | BP, weight, urination, defecation, liquids, daily notes | ✓ |
| Medication dose logging | Log dose, verify history, check inventory | ✓ |
| History page | Chart rendering, date filtering, data presence | ✓ |
| Backup/restore flow | Export data, import back, verify integrity | ✓ |

**User's choice:** All options selected — full coverage, no priority tiers
**Notes:** None

---

## Auth Flow Coverage

### Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Login + logout + re-login cycle | Full lifecycle: verify auth, logout, redirect, re-login, dashboard returns. Whitelist rejection test | ✓ |
| Keep smoke test only | Current auth-bypass sufficient, focus on app features | |
| Login + PIN gate | Test auth + PIN gate interaction | |

**User's choice:** Login + logout + re-login cycle (Recommended)
**Notes:** None

### CI Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, verify end-to-end | Run E2E suite in CI to confirm Privy test creds work | ✓ |
| No, trust existing setup | Assume quick task 260330-131 wired it up correctly | |

**User's choice:** Yes, verify end-to-end (Recommended)
**Notes:** User specifically mentioned being unsure if Privy test account was added to workflows

---

## History & Charts Testing

### Verification level

| Option | Description | Selected |
|--------|-------------|----------|
| Verify render + data presence | Chart containers render, data labels show, summary metrics display. No SVG path assertions | ✓ |
| Full interaction testing | Date range filtering, chart switching, tooltip hover, data point verification | |
| Render-only smoke test | Page loads, chart containers exist | |

**User's choice:** Verify render + data presence (Recommended)
**Notes:** None

### Data seeding

| Option | Description | Selected |
|--------|-------------|----------|
| Seed via page.evaluate | Inject records into IndexedDB before navigating to history | |
| Test empty state only | Verify page handles no data gracefully | |
| Create data via UI first | Use dashboard to create entries, then navigate to history | ✓ |

**User's choice:** Create data via UI first
**Notes:** Tests the full pipeline end-to-end

---

## Claude's Discretion

- Exact test case breakdown per section
- Test data values
- Timeout values for chart rendering
- Playwright test tags/annotations

## Deferred Ideas

None — discussion stayed within phase scope
