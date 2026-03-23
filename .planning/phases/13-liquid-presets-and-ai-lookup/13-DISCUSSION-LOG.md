# Phase 13: Liquid Presets and AI Lookup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 13-liquid-presets-and-ai-lookup
**Areas discussed:** Preset data model, AI migration scope, AI lookup UX flow

---

## Preset Data Model

### Primary unit for presets

| Option | Description | Selected |
|--------|-------------|----------|
| Per-100ml primary | Store caffeinePer100ml or alcoholPer100ml. Calculate absolute from volume at log time. | ✓ |
| Both stored | Store per-100ml AND default volume + default absolute amount. | |
| You decide | Claude picks best approach for volume-based calculation | |

**User's choice:** Per-100ml primary

### Preset storage location

| Option | Description | Selected |
|--------|-------------|----------|
| Separate liquidPresets array | New top-level array in Zustand alongside substanceConfig. Clean separation. | ✓ |
| Extend substanceConfig.types | Add per-100ml and isDefault fields to existing type entries. | |
| You decide | Claude picks based on existing Zustand patterns | |

**User's choice:** Separate liquidPresets array

### Built-in preset editability

| Option | Description | Selected |
|--------|-------------|----------|
| Editable, not deletable | User can customize built-in values but can't remove them. Reset restores defaults. | |
| Fully editable + deletable | Built-ins are just presets with isDefault flag. User has full control. | ✓ |
| Read-only built-ins | Built-in presets locked. User can only add new custom presets. | |

**User's choice:** Fully editable + deletable

### Default volume per preset

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, default volume | Each preset stores defaultVolumeMl for one-tap logging. User can override. | ✓ |
| No default volume | User always enters volume manually. | |
| You decide | | |

**User's choice:** Yes, default volume per preset

---

## AI Migration Scope

### Migration scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 routes to Claude | Migrate parse, substance-enrich, and medicine-search to Anthropic Claude. Full swap. | ✓ |
| New route + substance-enrich | Build new route on Claude, migrate substance-enrich. Leave parse and medicine-search on Perplexity. | |
| New route only | Build new substance-lookup on Claude. Keep all existing Perplexity routes. | |

**User's choice:** All 3 routes to Claude

### API pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Tool use (Recommended) | Define Zod schema as Claude tool. Structured, typed responses. | ✓ |
| Text + JSON parse | System prompt instructs JSON output, parse response. | |
| You decide | | |

**User's choice:** Tool use

---

## AI Lookup UX Flow

### Result display location

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in the card | Result appears directly in coffee/alcohol tab. Fields populate with values. | ✓ |
| Bottom sheet drawer | Result slides up in drawer with editable fields. | |
| You decide | | |

**User's choice:** Inline in the card

### Save behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Always confirm first | AI result shown as editable draft. User taps 'Save as Preset' to persist. | ✓ |
| Auto-save, edit later | AI result saved immediately. User edits/deletes from preset list. | |
| You decide | | |

**User's choice:** Always confirm first

---

## Folded Todos

- **Migrate AI endpoints from Perplexity to Anthropic Claude** — folded into Phase 13 scope

## Claude's Discretion

- Claude model selection per route (cost/quality tradeoff)
- Tool schema definitions
- Rate limiting for Claude API
- Retry pattern choice
- Preset ID generation
- Zustand persist migration version bump

## Deferred Ideas

None
