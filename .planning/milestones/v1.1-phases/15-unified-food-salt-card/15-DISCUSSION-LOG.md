# Phase 15: Unified Food+Salt Card - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 15-unified-food-salt-card
**Areas discussed:** Card layout, Composable entry preview, AI food parse flow

---

## Card Layout

### Food + salt coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs: Food / Salt | Two tabs like Liquids card | |
| Stacked sections | Food section at top, salt section below. Both visible, no switching. | ✓ |
| You decide | | |

**User's choice:** Stacked sections

### Salt UX preservation

| Option | Description | Selected |
|--------|-------------|----------|
| Same as current | Exact lift of salt IntakeCard UX | ✓ |
| Simplified inline | Just number input + increment buttons | |
| You decide | | |

**User's choice:** Same as current (full lift)

---

## Composable Entry Preview

### Preview design

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable card per record | Mini-card per linked record (eating, water, salt) with editable fields and remove button | ✓ |
| Summary row with edit | Compact summary, tap to expand | |
| Extend ParsedIntakeDisplay | Reuse existing water/salt display, add eating | |
| You decide | | |

**User's choice:** Expandable card per record

---

## AI Food Parse Flow

### Input pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Liquids: text + AI icon | Inline text input with sparkle button, consistent with Phase 14 | ✓ |
| Reuse VoiceInput | Embed VoiceInput component as primary input | |
| You decide | | |

**User's choice:** Same as Liquids — text input + AI sparkle button

### Water integration

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-adds to water total | Food-derived water creates real intake record, shows in Liquids daily total | ✓ |
| Separate tracking | Food water tracked separately | |

**User's choice:** Yes, auto-adds to water total

---

## Claude's Discretion

- Component decomposition (FoodSection + SaltSection vs inline)
- Whether to reuse ParsedIntakeDisplay or build new preview
- Preview card expand/collapse pattern
- Quick "I ate" button retention
- Grams field placement
- AI loading state design

## Deferred Ideas

None
