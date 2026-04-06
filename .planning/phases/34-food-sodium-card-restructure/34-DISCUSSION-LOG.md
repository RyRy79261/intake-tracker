# Phase 34: Food/Sodium Card Restructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 34-Food/Sodium Card Restructure
**Areas discussed:** Sodium positioning, Entry display format, Merged history routing, Unified input model, Quick nav fix

---

## Sodium Positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Top-right like other cards | Move daily total / limit + 24h rolling to card header top-right, matching liquids/weight/BP cards | ✓ |
| Top-right, daily total only | Just the daily sodium total, no limit or 24h rolling | |
| You decide | Claude picks based on consistency | |

**User's choice:** Top-right like other cards (full display with limit and 24h rolling)
**Notes:** None

---

## Entry Display Format

| Option | Description | Selected |
|--------|-------------|----------|
| Description as title, metadata below | Food description as headline, amount + date secondary | |
| Date first, then description + amount | Time-first layout matching current food-section format | ✓ |
| You decide | Claude picks based on readability | |

**User's choice:** Date first, then sodium, then description
**Notes:** User specified explicit ordering: "Date first - Sodium - Description". Format: `2:30 PM · 500mg Na · Chicken sandwich`

---

## Merged History Routing (became Unified Input Model)

**User clarification:** The question was framed incorrectly. Food and salt are NOT separate entry types requiring routing — salt is a derivative of food, like caffeine is to coffee. The user corrected the mental model:

> "Food is a root type of salt, like Water is a root type of Coffee"

This led to a broader restructuring decision:

- Remove `SaltSection` entirely (separate stepper, confirm button, manual salt-only input)
- All entry goes through unified food input (AI parse or manual details)
- Sodium presets stay available in the manual "Add details" flow for when user manually specifies sodium source (e.g., "cooked with MSG")
- AI auto-populates sodium when parsing food descriptions (e.g., "2 minute noodles")
- Single merged history with one `RecentEntriesList` — edit/delete routes to correct mutation under the hood

**User's choice:** Unified input model, sodium presets in manual flow, AI handles automatic extraction
**Notes:** "The presets should still be available when entering in the food and its contents manually, which AI would populate. I might say I cooked something and added MSG for example, but if I put in 2 minute noodles and the AI fetches the info then we're good"

---

## Quick Nav Fix

Identified during codebase analysis — not a user-proposed area.

**Bug:** Dashboard uses `id="section-food-salt"` but CARD_THEMES has `sectionId: "section-eating"` and `sectionId: "section-salt"` — neither matches, so quick nav buttons for Eating and Sodium don't scroll to the card.

**Decision:** Fix the sectionId mismatch. Since the card is now unified, it should have a single sectionId.

---

## Claude's Discretion

- CARD_THEMES sectionId update approach
- Sodium preset integration UX in manual details
- Sodium progress bar retention
- History entry truncation length

## Deferred Ideas

None — discussion stayed within phase scope.
