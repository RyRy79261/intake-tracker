---
created: 2026-03-16T22:05:09.546Z
title: Migrate AI endpoints from Perplexity to Anthropic Claude
area: api
files:
  - src/app/api/ai/parse/route.ts
  - src/app/api/ai/medicine-search/route.ts
  - src/app/api/ai/titration-warnings/route.ts
  - src/app/api/ai/substance-enrich/route.ts
  - src/app/api/ai/status/route.ts
  - src/lib/perplexity.ts
  - src/components/voice-input.tsx
  - src/components/parsed-intake-display.tsx
  - src/stores/settings-store.ts
---

## Problem

Perplexity API works but user wants to migrate to Anthropic Claude API for better medical query handling. Currently blocked on console.anthropic.com account access (account won't connect).

4 API routes use Perplexity (`sonar-pro` model) for:
- `/api/ai/parse` — nutritional intake parsing (water/salt estimation)
- `/api/ai/medicine-search` — pharmaceutical info lookup (brand names, pill appearance, contraindications)
- `/api/ai/titration-warnings` — clinical warning generation for dosage changes
- `/api/ai/substance-enrich` — caffeine/alcohol content estimation

Plus status endpoint, client-side lib (`perplexity.ts`), and references in voice-input and parsed-intake-display.

## Solution

Once console.anthropic.com access is resolved:
1. Install `@anthropic-ai/sdk`
2. Swap `PERPLEXITY_API_KEY` env var for `ANTHROPIC_API_KEY`
3. Use Opus (`claude-opus-4-6`) for medical queries (medicine-search, titration-warnings) — needs strong medical knowledge
4. Use Sonnet (`claude-sonnet-4-6`) for lighter tasks (parse, substance-enrich) — cheaper, fast enough
5. Replace `fetch("https://api.perplexity.ai/...")` with Anthropic SDK calls in all 4 routes
6. Update status endpoint to check `ANTHROPIC_API_KEY`
7. Rename `perplexity.ts` to `ai-client.ts` or similar
8. Remove `pplx-` key format validation
9. Update `.env.local` template
