---
phase: 13-liquid-presets-and-ai-lookup
verified: 2026-03-24T07:37:50Z
status: gaps_found
score: 1/3 success criteria fully verified
re_verification: false
gaps:
  - truth: "User can create, edit, and delete beverage presets that persist across app restarts"
    status: partial
    reason: "CRUD store actions exist and are tested, but no UI component calls addLiquidPreset/updateLiquidPreset/deleteLiquidPreset. The user cannot perform these operations through the app."
    artifacts:
      - path: "src/stores/settings-store.ts"
        issue: "Actions implemented and wired correctly — but no UI consumes them"
    missing:
      - "A preset management UI component (or the Liquids card, which is Phase 14) that calls addLiquidPreset, updateLiquidPreset, deleteLiquidPreset from useSettingsStore"
  - truth: "Hitting the AI lookup for a beverage name returns caffeine/alcohol per-100ml, and user can edit before saving as a preset"
    status: partial
    reason: "Backend route /api/ai/substance-lookup exists with full tool_use implementation, but there is no UI component to call it, display results, or present an editable form before saving."
    artifacts:
      - path: "src/app/api/ai/substance-lookup/route.ts"
        issue: "Route is fully implemented — but no component calls it"
    missing:
      - "A UI component (FAB or form) that calls /api/ai/substance-lookup, displays the result, lets the user edit substancePer100ml and defaultVolumeMl, then calls addLiquidPreset to save"
human_verification:
  - test: "Verify the pre-existing titration-service test failure is unrelated to Phase 13"
    expected: "pnpm vitest run src/stores/__tests__/settings-store-presets.test.ts passes (7/7); titration-service failure pre-dates Phase 13"
    why_human: "The failing test in titration-service.test.ts needs a human to confirm it was already failing before Phase 13 changes"
---

# Phase 13: Liquid Presets and AI Lookup — Verification Report

**Phase Goal:** Users can save beverage presets with substance content and look up caffeine/alcohol concentrations via AI, ready for the Liquids card to consume
**Verified:** 2026-03-24T07:37:50Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create, edit, and delete beverage presets (name, type, default volume, substance-per-100ml) that persist across app restarts | ⚠️ PARTIAL | Store CRUD actions exist and 7 tests pass; no UI component calls them |
| 2 | Hitting the AI lookup for a beverage name returns caffeine/alcohol per-100ml with Zod-validated bounds, and the user can edit before saving as a preset | ⚠️ PARTIAL | `/api/ai/substance-lookup` route exists and is correct; no UI to call it or display editable results |
| 3 | Existing coffee presets are available as built-in defaults in the new preset system (seeded from COFFEE_PRESETS) | ✓ VERIFIED | `DEFAULT_LIQUID_PRESETS` in constants.ts has 8 presets (5 caffeine including espresso/double-espresso/moka/coffee/tea, 3 alcohol); seeded from existing COFFEE_PRESETS values |

**Score:** 1/3 success criteria fully verified (2 partial — backend layer present, UI layer absent)

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/constants.ts` | LiquidPreset interface + DEFAULT_LIQUID_PRESETS (8 presets) | ✓ VERIFIED | Interface has all 7 required fields (id, name, type, substancePer100ml, defaultVolumeMl, isDefault, source) + optional aiConfidence; 8 presets confirmed via grep |
| `src/stores/settings-store.ts` | liquidPresets CRUD + persist v2 migration | ✓ VERIFIED | liquidPresets: LiquidPreset[] in Settings; addLiquidPreset/updateLiquidPreset/deleteLiquidPreset implemented; version: 2; version < 2 migration branch seeds DEFAULT_LIQUID_PRESETS |
| `src/app/api/ai/_shared/claude-client.ts` | getClaudeClient() singleton + CLAUDE_MODELS | ✓ VERIFIED | Exports getClaudeClient() with ANTHROPIC_API_KEY guard; CLAUDE_MODELS.fast = claude-haiku-4-5-20251001, CLAUDE_MODELS.quality = claude-sonnet-4-5-20250514 |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/ai/parse/route.ts` | Claude-powered food parsing via getClaudeClient | ✓ VERIFIED | imports getClaudeClient; uses tool_choice; zero Perplexity references |
| `src/app/api/ai/substance-enrich/route.ts` | Claude-powered substance enrichment | ✓ VERIFIED | imports getClaudeClient; uses tool_choice; zero Perplexity references |
| `src/app/api/ai/medicine-search/route.ts` | Claude-powered medicine search | ✓ VERIFIED | imports getClaudeClient; uses tool_choice; zero Perplexity references |
| `src/app/api/ai/interaction-check/route.ts` | Claude-powered drug interaction check | ✓ VERIFIED | imports getClaudeClient; uses tool_choice; zero Perplexity references |
| `src/app/api/ai/titration-warnings/route.ts` | Claude-powered titration warnings | ✓ VERIFIED | imports getClaudeClient; uses tool_choice; zero Perplexity references |
| `src/app/api/ai/substance-lookup/route.ts` | New beverage substance per-100ml lookup | ✓ VERIFIED | POST export; substance_lookup_result tool; substancePer100ml field; withAuth; checkRateLimit; getClaudeClient |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/ai-client.ts` | Renamed from perplexity.ts; exports parseIntakeWithAI + ParsedIntake | ✓ VERIFIED | File exists; exports parseIntakeWithAI (line 18) and ParsedIntake (line 3); perplexity.ts deleted |
| `src/app/api/ai/status/route.ts` | Health check using ANTHROPIC_API_KEY | ✓ VERIFIED | `!!process.env.ANTHROPIC_API_KEY` at line 13; no PERPLEXITY references |
| `src/__tests__/bundle-security.test.ts` | Scans for Anthropic key patterns | ✓ VERIFIED | Contains `/sk-ant-[a-zA-Z0-9]{20,}/` pattern and `ANTHROPIC_API_KEY` check; no PERPLEXITY references |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/stores/settings-store.ts` | `src/lib/constants.ts` | `import DEFAULT_LIQUID_PRESETS` | ✓ WIRED | Line 8: `import { DEFAULT_LIQUID_PRESETS, type LiquidPreset } from "@/lib/constants"` |
| All 6 AI routes | `src/app/api/ai/_shared/claude-client.ts` | `import getClaudeClient, CLAUDE_MODELS` | ✓ WIRED | All 6 route files have `import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client"` |
| `src/components/voice-input.tsx` | `src/lib/ai-client.ts` | `import parseIntakeWithAI` | ✓ WIRED | Line 21: `import { parseIntakeWithAI, type ParsedIntake } from "@/lib/ai-client"` |
| `src/components/parsed-intake-display.tsx` | `src/lib/ai-client.ts` | `import ParsedIntake type` | ✓ WIRED | Line 5: `import { type ParsedIntake } from "@/lib/ai-client"` |
| `src/app/api/ai/substance-lookup/route.ts` | Anthropic Claude API | `tool_choice: substance_lookup_result` | ✓ WIRED | `tool_choice: { type: "tool", name: "substance_lookup_result" }` at line 109 |
| Any UI component | `src/app/api/ai/substance-lookup/route.ts` | fetch("/api/ai/substance-lookup") | ✗ NOT_WIRED | No component calls the substance-lookup route — this is the Phase 14 gap |
| Any UI component | `useSettingsStore` liquidPresets CRUD | addLiquidPreset / updateLiquidPreset / deleteLiquidPreset | ✗ NOT_WIRED | No component calls preset CRUD actions — this is the Phase 14 gap |

---

## Data-Flow Trace (Level 4)

Artifacts rendering dynamic data: `src/stores/settings-store.ts` (liquidPresets state). No React components consume `liquidPresets` yet — there is no rendering path to trace for the new preset system. The substance-lookup route's data flow is fully wired server-side (tool_use → Zod validation → NextResponse.json), but no client calls the route.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `settings-store.ts` | `liquidPresets` | `DEFAULT_LIQUID_PRESETS` constant (initial state) | Yes — 8 real presets | ✓ FLOWING (initial state) |
| `substance-lookup/route.ts` | `toolBlock.input` | Anthropic Claude API (tool_use) | Yes — validated via Zod | ✓ FLOWING (server only) |
| Any Liquids card component | `liquidPresets` | Zustand store | N/A — component not built | ✗ DISCONNECTED (Phase 14 gap) |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Preset CRUD tests pass (7 tests) | `pnpm vitest run src/stores/__tests__/settings-store-presets.test.ts` | 7 passed, 0 failed | ✓ PASS |
| DEFAULT_LIQUID_PRESETS has 8 presets | `grep -c '{ id: "default-"' src/lib/constants.ts` | 8 | ✓ PASS |
| claude-client.ts exports getClaudeClient | File content check | `export function getClaudeClient` present | ✓ PASS |
| No regex JSON extraction in AI routes | `grep -rn "content\.match" src/app/api/ai/` | 0 matches | ✓ PASS |
| No Perplexity in src/ (except v0 migration) | `grep -rn "perplexity\|PERPLEXITY" src/` | 1 match: `settings-store.ts:188 delete state.perplexityApiKey` (intentional) | ✓ PASS |
| CSP updated to Anthropic domain | `grep "api.anthropic.com" next.config.js` | Found at line 20 | ✓ PASS |
| perplexity.ts removed | `ls src/lib/perplexity.ts` | File not found | ✓ PASS |
| All 8 commits exist in git log | `git log --oneline` | All 8 commit hashes (636e8c5 through 9d4532d) verified | ✓ PASS |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| LIQD-02 | 13-01, 13-03 | User can save beverage presets (name, type, volume, substance-per-100ml) and log them with one tap | ⚠️ PARTIAL | Data layer complete (store CRUD, 8 defaults, persist migration); "log them with one tap" requires Liquids card UI (Phase 14) |
| LIQD-03 | 13-02, 13-03 | User can trigger an AI lookup (FAB) to get caffeine/alcohol per-100ml, with result editable before saving | ⚠️ PARTIAL | AI route complete and correct; FAB trigger, editable result display, and save confirmation require UI (Phase 14) |

**Note on REQUIREMENTS.md status:** Both LIQD-02 and LIQD-03 are marked `[x]` (complete) in REQUIREMENTS.md. This is premature — the data layer and API backend are complete, but the user-facing portion ("log them with one tap", "trigger an AI lookup (FAB)", "result editable before saving") requires Phase 14's Liquids card UI.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO/FIXME/placeholder comments or stub return values found in any Phase 13 files. All implementations are substantive.

---

## Human Verification Required

### 1. Pre-existing titration-service test failure

**Test:** Run `pnpm test` and observe that `src/lib/titration-service.test.ts` fails with "expected 2 to be 1"
**Expected:** This failure pre-dates Phase 13 and is not caused by any Phase 13 changes
**Why human:** Need to confirm this test was already failing on the branch before Phase 13 commits (can check `git stash` or `git bisect` but requires interactive session)

---

## Gaps Summary

Phase 13 successfully built the complete data infrastructure for beverage presets:
- Zustand store with full CRUD (add/update/delete), 7 passing unit tests, persist v2 migration
- 8 seeded default presets (5 caffeine, 3 alcohol) from existing constants
- Anthropic Claude client singleton replacing Perplexity across all 5 AI routes
- New `/api/ai/substance-lookup` API route for per-100ml beverage lookup
- Complete Perplexity removal (cleanup, rename, env, CSP, docs)

However, the ROADMAP Success Criteria describe user-facing interactions ("user CAN create/edit/delete", "user can edit the value before saving") that require UI components. No React component exists that:
1. Calls `addLiquidPreset`, `updateLiquidPreset`, or `deleteLiquidPreset` from `useSettingsStore`
2. Calls `POST /api/ai/substance-lookup` and presents editable results

These are legitimate Phase 14 deliverables (the Liquids card). The phase goal's phrasing "ready for the Liquids card to consume" is an accurate description of what was delivered — the infrastructure IS ready. But the Success Criteria wording describes the full user workflow which isn't complete until Phase 14.

**Root cause of gaps:** The success criteria in ROADMAP.md describe end-to-end user workflows (SC1, SC2) rather than infrastructure milestones, but the phase scope was intentionally limited to the data layer + backend. The same gap will appear resolved once Phase 14 builds the Liquids card.

**Recommendation:** The gaps identified (SC1 partial, SC2 partial) are expected Phase 14 work. If the intent was for Phase 13 to deliver only the data layer (which the goal phrasing "ready for the Liquids card" implies), the success criteria should be updated to reflect infrastructure-only scope. Alternatively, accept these as gaps that Phase 14 will close.

---

_Verified: 2026-03-24T07:37:50Z_
_Verifier: Claude (gsd-verifier)_
