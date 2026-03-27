# Phase 19: AI Substance Lookup Enhancement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 19-ai-substance-lookup-enhancement
**Areas discussed:** API response shape, Prompt guidance depth

---

## API Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Required | Add to Zod schema as z.number().min(0).max(100). Claude must always return it. Keeps the API contract simple and explicit. | ✓ |
| Optional with default | Add as z.number().min(0).max(100).optional(). API returns it when Claude estimates, client falls back to 100. More forgiving for exotic items. | |

**User's choice:** Required
**Notes:** tool_use with tool_choice forces structured output, so Claude will always populate the field reliably.

---

## Prompt Guidance Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | One sentence: 'Also estimate the percentage of the beverage that is water (0-100).' | |
| With examples | Reference points: coffee ~99, beer ~93, wine ~87, spirits ~60. Anchors estimates to existing defaults. | ✓ |
| You decide | Claude picks the right level of detail. | |

**User's choice:** With examples (revised from initial "Minimal" selection)
**Notes:** User initially selected Minimal, then revised to With Examples to anchor Claude's estimates against existing default presets.

---

## Claude's Discretion

- Exact system prompt wording
- Whether caffeine and alcohol prompts share the water content guidance or have separate additions
- Tool definition description text for waterContentPercent property

## Deferred Ideas

- Stale todo "Migrate AI endpoints from Perplexity to Anthropic Claude" should be cleaned up (completed in Phase 13)
