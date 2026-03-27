# Phase 13: Liquid Presets and AI Lookup - Research

**Researched:** 2026-03-23
**Domain:** Zustand preset management, Anthropic Claude API migration (tool_use structured output), Next.js API routes
**Confidence:** HIGH

## Summary

This phase has two major workstreams: (1) building a liquid preset system in Zustand with CRUD operations and seed data from existing constants, and (2) migrating ALL existing Perplexity AI routes to the Anthropic Claude API using tool_use for structured output. The preset system is straightforward Zustand state management following established patterns. The AI migration is the more complex workstream -- it touches 5 API routes (not the 3 stated in CONTEXT.md -- there are also interaction-check and titration-warnings routes using Perplexity), a client-side library, a status endpoint, references in UI components, and a bundle security test.

The Anthropic SDK v0.80.0 provides excellent TypeScript-first Zod integration via `zodOutputFormat` + `messages.parse()` for structured output, which is cleaner than the tool_use approach originally discussed. However, the CONTEXT.md decision D-07 explicitly specifies tool_use. Both approaches work; tool_use with `strict: true` + `tool_choice: { type: "tool", name: "..." }` guarantees schema conformance and eliminates the JSON text parsing currently done via regex in all routes.

**Primary recommendation:** Use `@anthropic-ai/sdk` v0.80.0 with `tool_choice: { type: "tool" }` + `strict: true` per D-07. Define each route's response schema as a Zod object, convert to JSON Schema for the tool `input_schema`, and validate the `tool_use` block's `input` field with Zod on the server. This eliminates the fragile `content.match(/\{[\s\S]*\}/)` JSON extraction pattern used in all 5 current routes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Per-100ml is the primary unit for presets. Store `caffeinePer100ml` or `alcoholPer100ml` as the core value. Absolute amounts are calculated at log time from volume * per-100ml / 100.
- **D-02:** Presets live in a new top-level `liquidPresets` array in Zustand settings store, separate from the existing `substanceConfig` array. Clean separation between preset system and legacy config.
- **D-03:** Built-in presets (seeded from `COFFEE_PRESETS` + `substanceConfig.caffeine.types` + `substanceConfig.alcohol.types`) are fully editable and deletable by the user. They have an `isDefault: true` flag but no special protection.
- **D-04:** Each preset includes a `defaultVolumeMl` for one-tap quick logging (e.g., espresso=30ml, beer=330ml). User can override volume before confirming a log entry.
- **D-05:** Preset fields: `id`, `name`, `type` (caffeine | alcohol), `substancePer100ml` (mg for caffeine, standard drinks equivalent for alcohol), `defaultVolumeMl`, `isDefault`, `source` (manual | ai), `aiConfidence?` (optional, from AI lookup).
- **D-06:** Migrate ALL existing Perplexity routes to Anthropic Claude API: `/api/ai/parse`, `/api/ai/substance-enrich`, `/api/ai/medicine-search`. Plus build new `/api/ai/substance-lookup` route. One AI provider after this phase.
- **D-07:** Use Claude's `tool_use` (structured output) for all AI responses. Define Zod schemas as Claude tool input schemas. No JSON text parsing -- tool_use returns typed, validated responses.
- **D-08:** Remove Perplexity dependency entirely after migration. `PERPLEXITY_API_KEY` env var replaced with `ANTHROPIC_API_KEY`.
- **D-09:** AI lookup result appears inline in the coffee/alcohol tab -- fields populate with per-100ml value, volume, and name. User edits inline before saving.
- **D-10:** AI result requires explicit confirmation before saving as a preset. User must tap "Save as Preset" to persist. Can edit per-100ml value and default volume before saving.
- **D-11:** AI FAB button in coffee/alcohol tabs triggers a text input for beverage name, calls `/api/ai/substance-lookup`, and populates the inline fields with the result.

### Claude's Discretion
- Exact Claude model selection per route (claude-sonnet-4-6 vs claude-haiku-4-5 -- cost/quality tradeoff per route)
- Tool schema definitions for each route
- Rate limiting configuration for Claude API
- Whether to keep the retry-once pattern or use Claude's native retry
- Preset ID generation strategy
- How to handle the transition period (env var detection, fallback behavior)
- Zustand persist migration version bump

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIQD-02 | User can save beverage presets (name, type, volume, substance-per-100ml) and log them with one tap | Zustand `liquidPresets` array with CRUD actions, seed data from `COFFEE_PRESETS` + `substanceConfig`, persist migration v1->v2 |
| LIQD-03 | User can trigger an AI lookup (FAB) to get caffeine-per-100ml or alcohol-per-100ml for a beverage, with the result editable before saving as a preset | New `/api/ai/substance-lookup` route using Anthropic Claude tool_use, Zod schema for response validation, inline result display pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.80.0 | Anthropic Claude API client | Official SDK, Zod helpers, tool_use support, strict mode |
| zustand | 5.0.12 (installed: ^5.0.0) | Preset state management | Already used for settings, persist middleware with version migration |
| zod | 3.25.76 (installed) | Response schema validation | Already used in all API routes, satisfies SDK peer dep (^3.25.0) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @anthropic-ai/sdk/helpers/zod | (bundled) | zodTool / betaZodTool helpers | If using zodTool pattern for tool schema definition |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tool_use + tool_choice | zodOutputFormat + messages.parse | Cleaner API but D-07 locks us to tool_use; zodOutputFormat uses output_config not tools |
| @anthropic-ai/sdk | Raw fetch to api.anthropic.com | SDK handles retries, types, auth header; raw fetch is error-prone |

**Installation:**
```bash
pnpm add @anthropic-ai/sdk
```

**Version verification:** `@anthropic-ai/sdk` latest is 0.80.0 (published 2026-03-18). Zod 3.25.76 already installed and compatible.

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/api/ai/
    _shared/              # NEW: shared Claude client + helpers
      claude-client.ts    # Anthropic client singleton, model constants
      tool-helpers.ts     # createToolSchema(), extractToolResult() helpers
    parse/route.ts        # MIGRATED: Perplexity -> Claude
    substance-enrich/route.ts  # MIGRATED: Perplexity -> Claude
    medicine-search/route.ts   # MIGRATED: Perplexity -> Claude
    interaction-check/route.ts # MIGRATED: Perplexity -> Claude
    titration-warnings/route.ts # MIGRATED: Perplexity -> Claude
    substance-lookup/route.ts  # NEW: beverage substance per-100ml lookup
    status/route.ts            # UPDATED: check ANTHROPIC_API_KEY
  stores/
    settings-store.ts     # UPDATED: add liquidPresets + CRUD actions, bump version
  lib/
    constants.ts          # UPDATED: add DEFAULT_LIQUID_PRESETS seed constant
    perplexity.ts         # RENAMED -> ai-client.ts, update imports
    substance-enrich.ts   # UNCHANGED (calls /api/ai/substance-enrich, route handles migration)
```

### Pattern 1: Claude Tool-Use for Structured Output (No Agentic Loop)
**What:** Define a "response" tool whose input_schema matches the desired output shape. Force Claude to call it via `tool_choice: { type: "tool", name: "tool_name" }`. Extract the structured data from `tool_use` content block. No tool execution needed -- we just want the structured input.
**When to use:** All 6 API routes (5 migrated + 1 new) where we want guaranteed JSON output.
**Example:**
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SUBSTANCE_LOOKUP_TOOL = {
  name: "substance_lookup_result",
  description: "Return the caffeine or alcohol content per 100ml for a beverage",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description: "mg caffeine or standard drinks per 100ml"
      },
      defaultVolumeMl: {
        type: "number",
        description: "Typical serving volume in ml"
      },
      beverageName: {
        type: "string",
        description: "Normalized beverage name"
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of the estimate"
      }
    },
    required: ["substancePer100ml", "defaultVolumeMl", "beverageName", "reasoning"],
    additionalProperties: false
  }
};

const response = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 512,
  system: SYSTEM_PROMPT,
  tools: [SUBSTANCE_LOOKUP_TOOL],
  tool_choice: { type: "tool", name: "substance_lookup_result" },
  messages: [{ role: "user", content: `Estimate caffeine per 100ml for: "${sanitizedInput}"` }]
});

// Extract tool result -- no JSON parsing needed
const toolBlock = response.content.find(b => b.type === "tool_use");
if (toolBlock && toolBlock.type === "tool_use") {
  const result = toolBlock.input; // Already typed/validated by strict mode
  // Validate with Zod for defense-in-depth
  const validated = SubstanceLookupSchema.safeParse(result);
}
```

### Pattern 2: Zustand Preset CRUD with Persist Migration
**What:** Add `liquidPresets` array to settings store, bump persist version, provide CRUD actions.
**When to use:** Preset management system.
**Example:**
```typescript
// In settings-store.ts
export interface LiquidPreset {
  id: string;
  name: string;
  type: "caffeine" | "alcohol";
  substancePer100ml: number;
  defaultVolumeMl: number;
  isDefault: boolean;
  source: "manual" | "ai";
  aiConfidence?: number;
}

// In store definition:
liquidPresets: LiquidPreset[];
addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => void;
updateLiquidPreset: (id: string, updates: Partial<LiquidPreset>) => void;
deleteLiquidPreset: (id: string) => void;

// Persist config:
{
  name: "intake-tracker-settings",
  storage: createJSONStorage(() => localStorage),
  version: 2, // Bumped from 1
  migrate: (persisted, version) => {
    const state = persisted as Record<string, unknown>;
    if (version === 0) {
      delete state.perplexityApiKey;
      delete state.aiAuthSecret;
    }
    if (version < 2) {
      // Seed liquidPresets from existing substanceConfig + COFFEE_PRESETS
      state.liquidPresets = DEFAULT_LIQUID_PRESETS;
    }
    return state as unknown as Settings & SettingsActions;
  },
}
```

### Pattern 3: Shared Claude Client Singleton
**What:** Single Anthropic client instance shared across routes, with model constants.
**When to use:** All AI routes.
**Example:**
```typescript
// src/app/api/ai/_shared/claude-client.ts
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Model selection per route type
export const CLAUDE_MODELS = {
  // Lightweight tasks: parse, substance-enrich, substance-lookup
  fast: "claude-haiku-4-5" as const,
  // Complex tasks: medicine-search, interaction-check, titration-warnings
  quality: "claude-sonnet-4-6" as const,
} as const;
```

### Anti-Patterns to Avoid
- **Regex JSON extraction from Claude responses:** The current `content.match(/\{[\s\S]*\}/)` pattern is fragile. With tool_use + strict mode, structured data comes directly from `toolBlock.input` -- never parse response text.
- **Per-route client instantiation:** Don't create `new Anthropic()` in every route. Use a shared singleton to benefit from connection pooling and consistent configuration.
- **Storing absolute substance amounts in presets:** Per D-01, store per-100ml values. Calculate absolutes at log time only.
- **API key format validation for Anthropic:** Remove the `apiKey.startsWith("pplx-")` checks. Anthropic keys have different formats -- let the SDK handle authentication errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema from Zod | Manual JSON Schema objects | `zod-to-json-schema` (or inline JSON Schema with Zod validation on response) | SDK's strict mode handles schema conformance; Zod validates defense-in-depth |
| Claude API HTTP calls | Raw `fetch()` to api.anthropic.com | `@anthropic-ai/sdk` | Handles auth headers, retries, error types, streaming, rate limit headers |
| Preset ID generation | Custom UUID implementation | `crypto.randomUUID()` | Available in all modern browsers and Node 19+; this app requires Node 18+ but Next.js server routes run in Node where it's available |
| Zod-to-tool-schema conversion | Manual property-by-property mapping | Define JSON Schema directly in tool definition, validate response with Zod | Simpler than maintaining two schema definitions; strict mode guarantees conformance |

**Key insight:** The Anthropic SDK with `strict: true` + `tool_choice` eliminates the entire "parse AI text response" problem class. The current codebase has ~150 lines of regex-based JSON extraction + retry logic across 5 routes that all go away.

## Common Pitfalls

### Pitfall 1: Missing Perplexity Routes in Migration
**What goes wrong:** CONTEXT.md D-06 says "ALL 3 existing Perplexity routes" but there are actually 5: parse, substance-enrich, medicine-search, interaction-check, titration-warnings. Missing interaction-check and titration-warnings breaks medication features.
**Why it happens:** The CONTEXT.md was written referencing the 3 routes from the original discussion, but 2 more were added in Phase 8 (drug interactions).
**How to avoid:** Migrate ALL files that reference Perplexity: `src/app/api/ai/parse/route.ts`, `src/app/api/ai/substance-enrich/route.ts`, `src/app/api/ai/medicine-search/route.ts`, `src/app/api/ai/interaction-check/route.ts`, `src/app/api/ai/titration-warnings/route.ts`, `src/app/api/ai/status/route.ts`, `src/lib/perplexity.ts`, `src/components/voice-input.tsx` (import), `src/components/parsed-intake-display.tsx` (import), `src/__tests__/bundle-security.test.ts` (env var check).
**Warning signs:** Grep for "perplexity" or "PERPLEXITY" across all files. Should yield 0 results after migration.

### Pitfall 2: Zustand Persist Migration Not Seeding Presets
**What goes wrong:** Bumping version without proper migration means existing users get an empty `liquidPresets` array instead of seeded defaults.
**Why it happens:** Zustand persist only runs migration when it detects a version mismatch. If the migration function doesn't seed defaults, existing localStorage state won't have them.
**How to avoid:** In the `version < 2` migration branch, explicitly set `state.liquidPresets = DEFAULT_LIQUID_PRESETS`. Test by: save state at v1, load at v2, verify presets are seeded.
**Warning signs:** After updating, `useSettingsStore.getState().liquidPresets` returns `undefined` or empty.

### Pitfall 3: strict Mode JSON Schema Restrictions
**What goes wrong:** Zod schemas use constraints like `min()`, `max()`, `minLength()` that have no direct JSON Schema support in strict mode. The SDK silently strips them.
**Why it happens:** Strict mode supports a subset of JSON Schema. Constraints like `minimum`, `maximum`, `minLength`, `maxLength` are removed and added to descriptions instead.
**How to avoid:** Define tool `input_schema` as plain JSON Schema objects (no unsupported constraints). Use Zod only for server-side response validation (defense-in-depth). Keep bounds checking in Zod schema, not in tool schema.
**Warning signs:** Claude returns values outside expected ranges (e.g., caffeinePer100ml: 50000). Catch with Zod validation after tool result extraction.

### Pitfall 4: AI Caffeine/Alcohol Estimates Error Rate
**What goes wrong:** AI estimates for substance content are ~35% inaccurate per project research (PITFALLS.md #5).
**Why it happens:** LLMs don't have precise nutritional databases -- they approximate from training data.
**How to avoid:** D-10 requires explicit user confirmation. Always show the AI estimate as editable. Display a confidence indicator. Never auto-save AI results.
**Warning signs:** User saves an AI preset without reviewing the value.

### Pitfall 5: Rate Limit Configuration Differences
**What goes wrong:** Anthropic rate limits are different from Perplexity. Current routes have 15-30 req/min limits. Anthropic has tier-based rate limits.
**Why it happens:** Different provider, different rate limit structure.
**How to avoid:** Keep the existing per-IP in-memory rate limiter on the server side (defense in depth). The Anthropic SDK handles 429 responses from their API with automatic retries. Consider if the retry-once pattern in current routes is still needed (strict mode + tool_choice reduces validation failures to near-zero).
**Warning signs:** 429 errors from Anthropic API in production.

### Pitfall 6: perplexity.ts Rename Breaking Imports
**What goes wrong:** Renaming `src/lib/perplexity.ts` to `src/lib/ai-client.ts` breaks imports in `voice-input.tsx` and `parsed-intake-display.tsx`.
**Why it happens:** Two components import `parseIntakeWithPerplexity` and `ParsedIntake` type from that file.
**How to avoid:** Rename file AND update all imports. The function name should also change (e.g., `parseIntakeWithAI`). Grep for all import references.
**Warning signs:** Build fails with "Cannot find module '@/lib/perplexity'".

## Code Examples

### Claude Tool-Use for Substance Lookup (New Route)
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// src/app/api/ai/substance-lookup/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";

const RequestSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["caffeine", "alcohol"]),
});

// Zod schema for server-side validation (defense-in-depth)
const SubstanceLookupResponseSchema = z.object({
  substancePer100ml: z.number().min(0).max(500),
  defaultVolumeMl: z.number().min(1).max(5000),
  beverageName: z.string(),
  reasoning: z.string(),
});

// Tool definition for Claude (JSON Schema, no unsupported constraints)
const SUBSTANCE_LOOKUP_TOOL = {
  name: "substance_lookup_result",
  description: "Return the substance content per 100ml and typical serving size for a beverage",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      substancePer100ml: {
        type: "number",
        description: "For caffeine: mg per 100ml. For alcohol: standard drinks per 100ml."
      },
      defaultVolumeMl: {
        type: "number",
        description: "Typical single serving volume in ml"
      },
      beverageName: {
        type: "string",
        description: "Normalized name of the beverage"
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of the estimate and source"
      }
    },
    required: ["substancePer100ml", "defaultVolumeMl", "beverageName", "reasoning"],
    additionalProperties: false
  }
};

export const POST = withAuth(async ({ request, auth }) => {
  // ... rate limit, validate request, sanitize ...

  const client = getClaudeClient();
  const { query, type } = parsed.data;
  const sanitized = sanitizeForAI(query);

  const systemPrompt = type === "caffeine"
    ? "You are a beverage nutrition expert. Given a beverage name, estimate its caffeine content per 100ml and typical serving size."
    : "You are a beverage nutrition expert. Given a beverage name, estimate its alcohol content in standard drinks per 100ml and typical serving size.";

  const response = await client.messages.create({
    model: CLAUDE_MODELS.fast,
    max_tokens: 512,
    system: systemPrompt,
    tools: [SUBSTANCE_LOOKUP_TOOL],
    tool_choice: { type: "tool", name: "substance_lookup_result" },
    messages: [{
      role: "user",
      content: `Estimate ${type} content for: "${sanitized}"`
    }]
  });

  const toolBlock = response.content.find(b => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return NextResponse.json({ error: "AI response format invalid" }, { status: 422 });
  }

  const validated = SubstanceLookupResponseSchema.safeParse(toolBlock.input);
  if (!validated.success) {
    return NextResponse.json({ error: "AI response validation failed" }, { status: 422 });
  }

  return NextResponse.json(validated.data);
});
```

### Migrated Route Pattern (Parse Route)
```typescript
// Migrated from Perplexity fetch to Claude SDK
// Key changes: no regex JSON extraction, no retry-on-validation, strict tool_use

import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";

const PARSE_RESULT_TOOL = {
  name: "parse_result",
  description: "Return parsed water and salt content from a food/drink description",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      water: { type: ["number", "null"], description: "Water content in ml" },
      salt: { type: ["number", "null"], description: "Sodium content in mg" },
      reasoning: { type: "string", description: "Brief explanation" }
    },
    required: ["water", "salt", "reasoning"],
    additionalProperties: false
  }
};

// In handler:
const client = getClaudeClient();
const response = await client.messages.create({
  model: CLAUDE_MODELS.fast,
  max_tokens: 512,
  system: SYSTEM_PROMPT,
  tools: [PARSE_RESULT_TOOL],
  tool_choice: { type: "tool", name: "parse_result" },
  messages: [{ role: "user", content: `Parse: "${sanitizedInput}"` }]
});

// Direct structured extraction -- no regex, no retry loop
const toolBlock = response.content.find(b => b.type === "tool_use");
const validated = AIParseResponseSchema.safeParse(toolBlock?.input);
```

### Default Liquid Presets Seed Data
```typescript
// src/lib/constants.ts (or inline in settings-store.ts)
import { type LiquidPreset } from "@/stores/settings-store";

export const DEFAULT_LIQUID_PRESETS: LiquidPreset[] = [
  // Seeded from COFFEE_PRESETS + substanceConfig.caffeine.types
  { id: "default-espresso", name: "Espresso", type: "caffeine", substancePer100ml: 210, defaultVolumeMl: 30, isDefault: true, source: "manual" },
  { id: "default-double-espresso", name: "Double Espresso", type: "caffeine", substancePer100ml: 210, defaultVolumeMl: 60, isDefault: true, source: "manual" },
  { id: "default-moka", name: "Moka", type: "caffeine", substancePer100ml: 130, defaultVolumeMl: 50, isDefault: true, source: "manual" },
  { id: "default-coffee", name: "Coffee", type: "caffeine", substancePer100ml: 38, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-tea", name: "Tea", type: "caffeine", substancePer100ml: 19, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  // Seeded from substanceConfig.alcohol.types
  { id: "default-beer", name: "Beer", type: "alcohol", substancePer100ml: 0.30, defaultVolumeMl: 330, isDefault: true, source: "manual" },
  { id: "default-wine", name: "Wine", type: "alcohol", substancePer100ml: 0.67, defaultVolumeMl: 150, isDefault: true, source: "manual" },
  { id: "default-spirit", name: "Spirit", type: "alcohol", substancePer100ml: 2.22, defaultVolumeMl: 45, isDefault: true, source: "manual" },
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Perplexity sonar-pro for AI parsing | Anthropic Claude API with tool_use | This phase | Eliminates regex JSON extraction, adds strict schema conformance |
| JSON text parsing with regex (`content.match()`) | `tool_use` + `strict: true` + `tool_choice` | This phase | Guaranteed structured output, no retry-on-validation needed |
| Per-route Perplexity SDK calls via fetch | Shared Anthropic SDK client singleton | This phase | Connection pooling, consistent error handling, typed responses |
| COFFEE_PRESETS constant + substanceConfig | `liquidPresets` Zustand array with CRUD | This phase | User can add/edit/delete presets, AI-discovered presets persist |
| `zodOutputFormat` + `messages.parse()` for structured output | Also available but D-07 specifies tool_use | SDK v0.80.0 | Alternative to tool_use -- cleaner but not what user decided |

**Deprecated/outdated:**
- `sonar-pro` and `sonar-reasoning-pro` Perplexity models -- being replaced entirely
- `pplx-` API key format validation -- Anthropic keys use different format
- `src/lib/perplexity.ts` module name -- rename to `ai-client.ts`

## Model Selection Recommendation

| Route | Current Model | Recommended Claude Model | Rationale |
|-------|--------------|--------------------------|-----------|
| `/api/ai/parse` (water/salt) | sonar-pro | claude-haiku-4-5 ($1/$5 per MTok) | Simple estimation, fast response needed |
| `/api/ai/substance-enrich` | sonar-pro | claude-haiku-4-5 | Simple estimation, batch processing |
| `/api/ai/substance-lookup` (NEW) | N/A | claude-haiku-4-5 | Simple estimation, user-facing latency |
| `/api/ai/medicine-search` | sonar-reasoning-pro | claude-sonnet-4-6 ($3/$15 per MTok) | Complex 15-field medical response, accuracy critical |
| `/api/ai/interaction-check` | sonar-reasoning-pro | claude-sonnet-4-6 | Medical safety, must be accurate |
| `/api/ai/titration-warnings` | sonar-reasoning-pro | claude-sonnet-4-6 | Clinical warnings, accuracy critical |

**Cost comparison:** Haiku at $1/$5 is cheaper than Perplexity sonar-pro. Sonnet 4.6 at $3/$15 is cheaper than Perplexity sonar-reasoning-pro. Net cost reduction.

## Retry Strategy Recommendation

With `strict: true` + `tool_choice`, the primary failure mode changes from "AI returned unparseable JSON" to "API call failed (network/rate limit)." The current retry-on-validation pattern can be simplified:

- **Keep:** One retry on API call failure (network error, 5xx, 429 not handled by SDK)
- **Remove:** Retry on validation failure (strict mode eliminates this)
- **Add:** Zod validation as defense-in-depth (catch edge cases), but don't retry on Zod failure -- return error to client

## Files Requiring Changes (Complete Inventory)

| File | Change Type | Details |
|------|-------------|---------|
| `src/app/api/ai/parse/route.ts` | MIGRATE | Perplexity -> Claude SDK, tool_use |
| `src/app/api/ai/substance-enrich/route.ts` | MIGRATE | Perplexity -> Claude SDK, tool_use |
| `src/app/api/ai/medicine-search/route.ts` | MIGRATE | Perplexity -> Claude SDK, tool_use |
| `src/app/api/ai/interaction-check/route.ts` | MIGRATE | Perplexity -> Claude SDK, tool_use |
| `src/app/api/ai/titration-warnings/route.ts` | MIGRATE | Perplexity -> Claude SDK, tool_use |
| `src/app/api/ai/status/route.ts` | UPDATE | Check `ANTHROPIC_API_KEY` instead of `PERPLEXITY_API_KEY` |
| `src/app/api/ai/substance-lookup/route.ts` | NEW | Beverage per-100ml AI lookup |
| `src/app/api/ai/_shared/claude-client.ts` | NEW | Shared Claude client + model constants |
| `src/lib/perplexity.ts` | RENAME | -> `src/lib/ai-client.ts`, rename function |
| `src/components/voice-input.tsx` | UPDATE | Import from `ai-client.ts` |
| `src/components/parsed-intake-display.tsx` | UPDATE | Import from `ai-client.ts` |
| `src/stores/settings-store.ts` | UPDATE | Add `liquidPresets` + CRUD, bump version |
| `src/lib/constants.ts` | UPDATE | Add `DEFAULT_LIQUID_PRESETS` |
| `src/__tests__/bundle-security.test.ts` | UPDATE | Check `ANTHROPIC_API_KEY` not in bundle |
| `.env.template` | UPDATE | Replace `PERPLEXITY_API_KEY` with `ANTHROPIC_API_KEY` |
| `CLAUDE.md` | UPDATE | Update API route descriptions |
| `SECURITY.md` | UPDATE | Update AI provider references |
| `README.md` | UPDATE | Update AI provider references |
| `package.json` | UPDATE | Add `@anthropic-ai/sdk` dependency |

## Open Questions

1. **Should the retry-once pattern be completely removed?**
   - What we know: `strict: true` eliminates schema validation failures. SDK handles 429 retries internally.
   - What's unclear: Whether the SDK's built-in retry logic is sufficient for all failure modes, or if we need one explicit retry for 5xx/network errors.
   - Recommendation: Keep one retry for API call failure only (not validation failure). The SDK may handle this; verify during implementation.

2. **Per-100ml alcohol values -- standard drinks or percentage?**
   - What we know: D-05 says "standard drinks equivalent for alcohol." Existing `substanceConfig.alcohol.types` uses `defaultDrinks` per serving.
   - What's unclear: Standard drinks per 100ml is an unusual metric (beer would be ~0.30 standard drinks per 100ml). ABV percentage might be more intuitive for AI lookup.
   - Recommendation: Use standard drinks per 100ml for consistency with D-05. AI prompt should be explicit about the unit. Document the conversion: `totalDrinks = volume * substancePer100ml / 100`.

3. **Preset ID generation: crypto.randomUUID() vs prefixed IDs?**
   - What we know: Other entities in the codebase use various ID strategies.
   - What's unclear: Whether a prefix like `lp-` would help with debugging.
   - Recommendation: Use `crypto.randomUUID()` for user-created presets, deterministic `default-{name}` IDs for seed presets (allows stable references and avoids duplicates on migration re-run).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm lint && pnpm build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIQD-02 | Preset CRUD (add/edit/delete) persists in Zustand | unit | `pnpm test -- src/stores/settings-store.test.ts -x` | No - Wave 0 |
| LIQD-02 | Zustand v1->v2 migration seeds default presets | unit | `pnpm test -- src/stores/settings-store.test.ts -x` | No - Wave 0 |
| LIQD-02 | Default presets match expected seed data | unit | `pnpm test -- src/lib/constants.test.ts -x` | No - Wave 0 |
| LIQD-03 | Substance lookup route returns validated response | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No - Wave 0 |
| LIQD-03 | Zod schema validates AI response bounds | unit | `pnpm test -- src/app/api/ai/substance-lookup/route.test.ts -x` | No - Wave 0 |
| MIGRATE | Bundle security test updated for ANTHROPIC_API_KEY | unit | `pnpm test -- src/__tests__/bundle-security.test.ts -x` | Yes (needs update) |
| MIGRATE | All routes build without errors after migration | build | `pnpm build` | N/A (build check) |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm lint && pnpm build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/stores/settings-store.test.ts` -- covers LIQD-02 (preset CRUD, migration v1->v2)
- [ ] Update `src/__tests__/bundle-security.test.ts` -- check `ANTHROPIC_API_KEY` not in bundle

## Project Constraints (from CLAUDE.md)

- **Package manager:** pnpm only (enforced via preinstall hook)
- **Framework:** Next.js 14 App Router
- **Data layer:** IndexedDB via Dexie.js (client-side); presets in Zustand/localStorage
- **State management:** Zustand for settings, React Query for async data
- **API routes:** Server-side only for AI calls, key never exposed to client
- **Auth:** `withAuth()` middleware on all AI routes
- **Security:** `sanitizeForAI()` for PII stripping before AI calls
- **UI:** shadcn/ui + Tailwind CSS, mobile-focused (max-w-lg)
- **Path alias:** `@/*` -> `src/*`
- **Testing:** `pnpm test` for Vitest, `pnpm test:e2e` for Playwright
- **Dexie version note:** Not relevant for this phase (presets in Zustand, not IndexedDB)

## Sources

### Primary (HIGH confidence)
- [Anthropic Tool Use Docs](https://platform.claude.com/docs/en/docs/build-with-claude/tool-use) -- tool_use API format, strict mode, tool_choice
- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- strict: true, guaranteed schema conformance
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) -- current model IDs, pricing, capabilities
- [anthropic-sdk-typescript helpers.md](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md) -- zodOutputFormat, messages.parse, zodTool patterns
- npm registry -- `@anthropic-ai/sdk@0.80.0` published 2026-03-18, peer dep `zod ^3.25.0`

### Secondary (MEDIUM confidence)
- [DEV Community: Consistent Structured Output from Claude](https://dev.to/heuperman/how-to-get-consistent-structured-output-from-claude-20o5) -- tool_choice forcing pattern
- [Anthropic SDK TypeScript GitHub](https://github.com/anthropics/anthropic-sdk-typescript) -- SDK structure, installation, basic usage

### Tertiary (LOW confidence)
- Model cost comparison with Perplexity -- based on published pricing, not direct testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified SDK version, peer deps, official docs
- Architecture: HIGH -- patterns verified against official Anthropic docs and existing codebase
- Pitfalls: HIGH -- discovered actual route count (5 not 3) by auditing codebase, verified schema restrictions in docs

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (SDK stable, model IDs stable)
