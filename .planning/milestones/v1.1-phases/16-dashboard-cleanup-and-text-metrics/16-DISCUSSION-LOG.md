# Phase 16: Dashboard Cleanup and Text Metrics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 16-dashboard-cleanup-and-text-metrics
**Areas discussed:** Text metrics display, Dead code cleanup scope, Coffee settings migration, Multi-substance presets

---

## Text Metrics Display

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top of page (above cards) | Summary visible immediately, dashboard header | ✓ |
| Between cards | Contextually near the data | |
| You decide | | |

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| Value / Limit with progress bar | "Water: 1,200 / 2,000 ml" + thin bar | ✓ |
| Plain text rows | Numbers and percentages only | |
| You decide | | |

---

## Dead Code Cleanup

### Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full removal | Delete all replaced components and references | ✓ |
| Remove UI only, keep services | Keep service files even if unused | |
| You decide | | |

---

## Coffee Settings Migration

### Coffee Tab fate

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with Liquid Presets manager | Show all presets with add/edit/delete | ✓ |
| Remove entirely | Presets managed inline from Liquids card | |
| You decide | | |

---

## Multi-Substance Presets (emerged during discussion)

**User raised edge case:** Don Pedro milkshake (espresso + coffee liqueur + cream) has caffeine, alcohol, and reduced water content. Led to:

- All substance fields made optional and composable on LiquidPreset
- Added `saltPer100ml` (margarita rim salt, salty beverages)
- Added `waterContentPercent` (Don Pedro ~40% water vs espresso ~98%)
- `tab` field determines which Liquids card tab the preset appears in

**User principle:** "Lean towards flexible, composable more than explicit" — codebase is pre-refinement. Saved to memory.

---

## Claude's Discretion

- Text metrics component structure
- Progress bar styling
- Weekly summary format
- InsightBadge placement
- Zustand migration version

## Deferred Ideas

- Move HistoricalGraph to insights page — separate milestone
- Smart preset suggestions by usage frequency
