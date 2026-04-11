# Phase 1: Cross-app bug fixes and UX improvements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 01-cross-app-bug-fixes-and-ux-improvements
**Areas discussed:** Settings restructure, Color coding system, Editable insights, Rx compound details

---

## Settings restructure

| Option | Description | Selected |
|--------|-------------|----------|
| Accordion per category | Each category (Water, Coffee, Alcohol, Food) is a collapsible section | ✓ |
| Tabs mirroring dashboard | Each dashboard tab gets its own settings tab | |
| All-in-one scrollable | Single long scrollable page with all categories visible | |

**User's choice:** Accordion per category
**Notes:** User confirmed with preview mockup

| Option | Description | Selected |
|--------|-------------|----------|
| Keep separate | Limits/increments stay at top, accordion below for presets only | ✓ |
| Fold into accordion | Water limits go inside Water accordion, etc. | |

**User's choice:** Keep separate
**Notes:** Cleaner separation of behavior settings vs data/presets

| Option | Description | Selected |
|--------|-------------|----------|
| Delete only | Presets can be deleted with ❌ button, re-add to change | ✓ |
| Inline edit | Tap a preset row to edit inline | |
| Edit dialog | Tap a preset to open edit dialog/drawer | |

**User's choice:** Delete only

---

## Color coding system

| Option | Description | Selected |
|--------|-------------|----------|
| Theme tokens + orange for mixed | Use --caffeine token for coffee, --alcohol for alcohol, orange for both | ✓ |
| Theme tokens + gradient for mixed | Caffeine→alcohol gradient strip for mixed items | |
| You decide | Claude picks best approach | |

**User's choice:** Theme tokens + orange for mixed
**Notes:** Existing theme tokens `--caffeine` and `--alcohol` already in tailwind.config.ts

---

## Editable insights

| Option | Description | Selected |
|--------|-------------|----------|
| Editable thresholds | Adjust threshold values that trigger each insight type | ✓ |
| Custom insight rules | Create own insight rules with custom conditions | |
| Toggle on/off per type | Simply enable/disable each insight type | |

**User's choice:** Editable thresholds
**Notes:** User confirmed with preview mockup showing per-insight threshold inputs

| Option | Description | Selected |
|--------|-------------|----------|
| In Settings page | New accordion section in Settings | |
| Inline on insights tab | Edit thresholds directly on Analytics > Insights tab via gear icon | ✓ |

**User's choice:** Inline on insights tab

---

## Rx compound details

**User clarification (free text):** Brand names belong on InventoryItem (inventory section), NOT on Prescription. Prescription is compound-level scientific data: what it does, what it's for, biological mechanism, warnings, contraindications, interactions, food instructions, drug class. User wants a "Refresh from AI" button to accept updates.

| Option | Description | Selected |
|--------|-------------|----------|
| Add fields to Prescription | Add drugClass, mechanismOfAction, commonIndications, dosageStrengths to Prescription table | ✓ |
| JSON blob field | Single aiMetadata field | |
| Store on InventoryItem | Move compound data to InventoryItem | |

**User's choice:** Add fields to Prescription
**Notes:** Brand-related fields (brandNames, localAlternatives) explicitly excluded — those belong on InventoryItem

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only + Refresh button | Drawer shows data read-only, refresh re-runs AI with accept/reject diff | ✓ |
| Editable + Refresh | All fields editable, refresh merges with manual edits | |
| Read-only, no manual edits | Purely AI-sourced, refresh replaces everything | |

**User's choice:** Read-only + Refresh button

| Option | Description | Selected |
|--------|-------------|----------|
| Extend AI prompt | Add mechanismOfAction field to medicine-search tool | ✓ |
| Drug class is enough | Drug class + indications gives enough context | |

**User's choice:** Extend AI prompt

---

## Claude's Discretion

- Accordion implementation details (single-open vs multi-open, animation)
- Exact layout of the Compound Details drawer sections
- How the AI refresh diff UI presents changes for accept/reject
- Branch naming convention

## Deferred Ideas

None
