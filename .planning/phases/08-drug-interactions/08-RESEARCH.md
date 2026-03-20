# Phase 08: Drug Interactions - Research

**Researched:** 2026-03-20
**Domain:** AI-powered drug interaction checking, offline-first medication safety UI
**Confidence:** HIGH

## Summary

This phase adds drug interaction checking to the existing medication management system. The core technical work is: (1) a new API route that sends all active prescriptions to Perplexity's sonar-reasoning-pro model and gets back structured interaction data, (2) UI sections in the prescription detail drawer and add-medication wizard, and (3) an ad-hoc substance lookup search bar. The existing codebase already has all the patterns needed -- the medicine-search and titration-warnings API routes are direct templates for the new interaction-check endpoint.

No schema changes are required. The `Prescription.contraindications` and `Prescription.warnings` fields already exist and are already populated during the add-medication flow. The ad-hoc lookup cache goes in localStorage (not IndexedDB), keeping it separate from prescription-level persisted data.

**Primary recommendation:** Build one new API route (`/api/ai/interaction-check`) that handles both the new-prescription conflict check and the ad-hoc substance lookup, differentiated by request body shape. Reuse the exact same Perplexity calling pattern from titration-warnings (Zod validation, retry-once, JSON extraction with regex fallback).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Always-visible "Interactions & Warnings" section in prescription detail drawer -- safety-critical, never hidden behind a tap
- Amber/red color coding by severity -- red for "AVOID", amber for "CAUTION"
- Drug class label shown (e.g., "Drug class: SNRI")
- Non-blocking advisory before save step in add-medication wizard -- user can acknowledge and save anyway
- Ad-hoc substance lookup at top of Medications tab with results grouped per prescription
- Severity levels: AVOID (red), CAUTION (amber), OK (green/no warning)
- Uses Perplexity sonar-reasoning-pro model
- Use existing Prescription.contraindications[] and Prescription.warnings[] fields -- no schema change
- Ad-hoc lookup results cached in localStorage with TTL
- No automatic background refresh -- user triggers manually
- "Refresh interactions" button for prescriptions added before this feature
- Interaction check sends ALL active prescription generic names to AI

### Claude's Discretion
- Exact layout of the interaction display section within the drawer
- Loading state while AI checks interactions
- How to handle AI unavailability (show cached data, or "interactions unavailable" message)
- Whether to show an interaction badge/count on the prescription card in the Rx grid
- Cache TTL for ad-hoc lookups

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTR-01 | AI-powered compound interaction/contraindication data stored per prescription | Existing contraindications[] and warnings[] fields on Prescription; medicine-search already populates these; new "Refresh interactions" button re-queries AI for older prescriptions |
| INTR-02 | Interaction check on add -- warn when new prescription conflicts with existing ones | New conflict-check step in add-medication wizard before save; calls /api/ai/interaction-check with new med + all active prescriptions |
| INTR-03 | Persistent interaction section on prescription detail view | New InteractionsSection component in prescription-detail-drawer.tsx; reads from prescription.contraindications and prescription.warnings; always expanded |
| INTR-04 | Ad-hoc "can I take X?" lookup | Search input at top of compound-list.tsx; calls same /api/ai/interaction-check endpoint; results cached in localStorage with TTL |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Perplexity API (sonar-reasoning-pro) | current | Drug interaction AI queries | Already used for medicine-search and titration-warnings |
| Zod | (already installed) | Request/response validation | Co-located schemas per project convention |
| Next.js API routes | 14 | Server-side AI proxy | Existing pattern, key never exposed to client |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (already installed) | Icons (AlertTriangle, ShieldAlert, Search) | Severity indicators in UI |
| motion/react | (already installed) | Expand/collapse animations | Ad-hoc results panel, loading states |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Perplexity sonar-reasoning-pro | OpenAI/Anthropic | User decision locked: use Perplexity (already integrated) |
| localStorage for ad-hoc cache | IndexedDB table | User decision: localStorage with TTL for transient queries |
| Licensed drug DB (e.g., RxNorm, DrugBank) | Out of scope per REQUIREMENTS.md | AI-powered sufficient for personal use |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### New Files
```
src/
├── app/api/ai/
│   └── interaction-check/
│       └── route.ts          # New API route for interaction checking
├── components/medications/
│   ├── interactions-section.tsx    # Drawer section showing contraindications/warnings
│   └── interaction-search.tsx     # Ad-hoc "can I take X?" search bar + results
├── hooks/
│   └── use-interaction-check.ts   # Client-side hook for calling the API
└── lib/
    └── interaction-cache.ts       # localStorage TTL cache for ad-hoc lookups
```

### Pattern 1: API Route (interaction-check)
**What:** Single endpoint handling two request shapes: (a) new-prescription conflict check (sends new generic name + all active prescriptions), (b) ad-hoc substance lookup (sends substance name + all active prescriptions).
**When to use:** Both the wizard conflict check and the ad-hoc search call this.
**Example:**
```typescript
// Request schema -- discriminated by `mode` field
const InteractionCheckRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("conflict"),
    newMedication: z.string().min(1).max(200),
    activePrescriptions: z.array(z.object({
      genericName: z.string(),
      drugClass: z.string().optional(),
    })).min(1),
  }),
  z.object({
    mode: z.literal("lookup"),
    substance: z.string().min(1).max(200),
    activePrescriptions: z.array(z.object({
      genericName: z.string(),
      drugClass: z.string().optional(),
    })).min(1),
  }),
]);

// Response schema
const InteractionResultSchema = z.object({
  interactions: z.array(z.object({
    substance: z.string(),
    medication: z.string(),
    severity: z.enum(["AVOID", "CAUTION", "OK"]),
    description: z.string(),
  })),
  drugClass: z.string().optional(),
  summary: z.string().optional(),
});
```

### Pattern 2: Reuse Perplexity Calling Pattern
**What:** Exact same structure as titration-warnings: withAuth wrapper, rate limiting, sanitizeForAI, JSON extraction via regex, retry-once on validation failure.
**When to use:** For all Perplexity API calls.
**Example:**
```typescript
// Follow titration-warnings pattern exactly:
// 1. withAuth wrapper
// 2. Zod request validation
// 3. Rate limit check (separate map from other routes)
// 4. sanitizeForAI on all user inputs
// 5. Perplexity call with sonar-reasoning-pro
// 6. JSON extraction: content.match(/\{[\s\S]*\}/)
// 7. Zod response validation
// 8. Retry once on failure
// 9. Return 502 on double failure
```

### Pattern 3: localStorage TTL Cache
**What:** Simple cache for ad-hoc lookup results keyed by substance name.
**When to use:** Ad-hoc lookups only (not prescription-level data).
**Example:**
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_KEY_PREFIX = "interaction-cache:";
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached<T>(key: string): T | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
  if (!raw) return null;
  const entry: CacheEntry<T> = JSON.parse(raw);
  if (Date.now() - entry.timestamp > DEFAULT_TTL) {
    localStorage.removeItem(CACHE_KEY_PREFIX + key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T): void {
  localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({
    data,
    timestamp: Date.now(),
  }));
}
```

### Pattern 4: Wizard Conflict Check (Non-Blocking Advisory)
**What:** Before the save step, check the new medication against active prescriptions. Show a warning banner if conflicts found. User can acknowledge or go back.
**When to use:** In the add-medication wizard, between the last input step and save.
**Implementation approach:** Add a conflict-check state to the wizard. When user reaches the last step and taps "Save", first trigger the AI check. While loading, show a spinner. If conflicts found, show advisory with "I'm aware, save anyway" and "Go back" buttons. If no conflicts (or AI unavailable), proceed to save.

### Anti-Patterns to Avoid
- **Blocking save on AI failure:** If the AI is unavailable, the user MUST still be able to save. The check is advisory only.
- **Separate endpoints for conflict vs lookup:** One endpoint with discriminated union is cleaner and shares the same Perplexity prompt logic.
- **Storing ad-hoc results in IndexedDB:** User decision: localStorage with TTL. These are transient queries.
- **Auto-refreshing interaction data:** User decision: manual refresh only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drug interaction database | Custom drug interaction DB | Perplexity sonar-reasoning-pro AI | Licensing cost-prohibitive; AI sufficient for personal use (per REQUIREMENTS.md Out of Scope) |
| Rate limiting | Custom middleware | In-memory Map pattern (same as medicine-search) | Already proven in codebase, sufficient for single-user app |
| JSON extraction from AI | Custom parser | Regex + Zod validation (existing pattern) | Handles thinking tokens, markdown wrapping, etc. |
| Cache invalidation | Complex TTL system | Simple timestamp comparison in localStorage | Transient data, not mission-critical |

## Common Pitfalls

### Pitfall 1: Perplexity Reasoning Tokens in Response
**What goes wrong:** sonar-reasoning-pro includes `<think>` sections before the JSON output. Naive JSON.parse fails.
**Why it happens:** Reasoning models emit chain-of-thought before structured output.
**How to avoid:** Use the existing `content.match(/\{[\s\S]*\}/)` regex pattern from medicine-search and titration-warnings. This extracts the last JSON object from the response, skipping thinking tokens.
**Warning signs:** Parse errors on AI responses that look valid.

### Pitfall 2: AI Unavailability Blocking Wizard Save
**What goes wrong:** User can't save a new prescription because the interaction check API is down or slow.
**Why it happens:** Treating the check as a required step rather than advisory.
**How to avoid:** Always allow save. If AI times out (e.g., 15s), show "Interaction check unavailable" and let user proceed. Use AbortController with timeout.
**Warning signs:** User complaints about being unable to add medications.

### Pitfall 3: Stale Interaction Data on Old Prescriptions
**What goes wrong:** Prescriptions added before this phase have empty contraindications/warnings arrays.
**Why it happens:** Medicine-search already populates these, but only at add time.
**How to avoid:** The "Refresh interactions" button re-queries the AI for a specific prescription and updates contraindications[] and warnings[]. Show an "Interactions not yet loaded" state for prescriptions with empty arrays.
**Warning signs:** Empty interaction sections on existing prescriptions.

### Pitfall 4: Ad-hoc Cache Key Normalization
**What goes wrong:** "ibuprofen", "Ibuprofen", and "IBUPROFEN" create separate cache entries.
**Why it happens:** Case-sensitive localStorage keys.
**How to avoid:** Normalize cache keys: `substance.trim().toLowerCase()`.
**Warning signs:** Duplicate API calls for the same substance.

### Pitfall 5: Large Prescription List in AI Prompt
**What goes wrong:** With many active prescriptions, the prompt becomes very long and costs more tokens.
**Why it happens:** Sending full prescription details when only generic names and drug classes are needed.
**How to avoid:** Send only `genericName` and `drugClass` (if available) per prescription. Keep the prompt focused.
**Warning signs:** Slow responses, high API costs.

### Pitfall 6: exactOptionalPropertyTypes Compliance
**What goes wrong:** TypeScript errors when using optional properties with conditional spread.
**Why it happens:** Project uses strict `exactOptionalPropertyTypes`.
**How to avoid:** Use conditional spread pattern: `...(val !== undefined && { prop: val })`. This is the established project pattern (see decisions [02-02], [06-05], etc.).
**Warning signs:** Type errors on optional fields in Prescription updates.

## Code Examples

### Interaction Check API Route Structure
```typescript
// src/app/api/ai/interaction-check/route.ts
// Follows exact pattern from titration-warnings/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a list of medications a patient is currently taking and a new substance to check, identify drug interactions.

Return ONLY valid JSON with this format:
{
  "interactions": [
    {
      "substance": "the checked substance",
      "medication": "the interacting medication",
      "severity": "AVOID" | "CAUTION" | "OK",
      "description": "brief explanation of the interaction"
    }
  ],
  "drugClass": "pharmacological class of the checked substance if applicable",
  "summary": "one-sentence overall assessment"
}

Severity levels:
- AVOID: Dangerous combination, should not be taken together
- CAUTION: May interact, monitor closely or adjust timing
- OK: No significant interaction expected

Be precise and evidence-based. If uncertain, err on the side of CAUTION.`;

// Rate limiting (separate from medicine-search)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export const POST = withAuth(async ({ request, auth }) => {
  // ... standard pattern: validate, rate limit, call Perplexity, parse, retry
});
```

### Interactions Section in Prescription Drawer
```typescript
// src/components/medications/interactions-section.tsx
// Always-visible section, no collapse toggle

function InteractionsSection({ prescription }: { prescription: Prescription }) {
  const hasData = (prescription.contraindications?.length ?? 0) > 0
    || (prescription.warnings?.length ?? 0) > 0;

  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold mb-2">Interactions & Warnings</h3>
      {hasData ? (
        <InteractionsList prescription={prescription} />
      ) : (
        <NoInteractionsState prescriptionId={prescription.id} />
      )}
    </section>
  );
}

// NoInteractionsState shows "Refresh interactions" button for old prescriptions
// InteractionsList renders contraindications with red badges and warnings with amber badges
```

### Ad-hoc Search Component
```typescript
// src/components/medications/interaction-search.tsx
// Search input + results panel at top of medications tab

function InteractionSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InteractionResult | null>(null);
  const prescriptions = usePrescriptions();

  // Check localStorage cache first, then call API
  const handleSearch = async () => {
    const cached = getCached(query);
    if (cached) { setResults(cached); return; }

    const activePrescriptions = prescriptions
      .filter(p => p.isActive)
      .map(p => ({ genericName: p.genericName }));

    // Call /api/ai/interaction-check with mode: "lookup"
    // On success, cache in localStorage and display
  };

  // Results grouped per prescription with severity color coding
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No interaction checking | AI-powered interaction lookup | This phase | Users see drug interaction warnings for all prescriptions |
| Contraindications only at add time | Refresh button for existing prescriptions | This phase | All prescriptions can have up-to-date interaction data |

**Existing code already handles:**
- Contraindications/warnings storage (Prescription model)
- Medicine search populating these fields at add time
- sonar-reasoning-pro API calling pattern
- withAuth, sanitizeForAI, rate limiting patterns

## Open Questions

1. **Exact placement of conflict check in wizard flow**
   - What we know: It goes before the save step, is non-blocking
   - What's unclear: Should it be a separate wizard step, or an interstitial shown after tapping "Save"?
   - Recommendation: Interstitial after tapping "Save" (not a new step) -- keeps the wizard step count stable, and the check only matters if the user actually wants to save

2. **Drug class storage on Prescription**
   - What we know: medicine-search returns `drugClass` but Prescription model doesn't have a `drugClass` field
   - What's unclear: Should we add drugClass to Prescription, or display it only from the interaction check response?
   - Recommendation: Display drugClass from the AI response in the interactions section; don't add a schema field (user decided no schema change). The medicine-search result `drugClass` could be stored in `warnings[]` as "Drug class: SNRI" format.

3. **Interaction badge on prescription card**
   - What we know: User left this to Claude's discretion
   - Recommendation: Show a small warning icon (amber/red) on prescription cards that have contraindications. This is low-effort and provides at-a-glance safety info without requiring drawer open.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/app/api/ai/medicine-search/route.ts` -- complete Perplexity calling pattern with Zod validation, retry, JSON extraction
- Existing codebase: `src/app/api/ai/titration-warnings/route.ts` -- cross-prescription AI check pattern (sends all meds to AI)
- Existing codebase: `src/lib/db.ts` lines 137-138 -- Prescription.contraindications and Prescription.warnings fields
- Existing codebase: `src/components/medications/prescription-detail-drawer.tsx` -- section-based drawer layout pattern
- Existing codebase: `src/components/medications/add-medication-wizard.tsx` -- wizard step flow, handleSave pattern

### Secondary (MEDIUM confidence)
- [Perplexity sonar-reasoning-pro docs](https://docs.perplexity.ai/getting-started/models/models/sonar-reasoning-pro) -- model capabilities, reasoning token behavior
- [Perplexity structured output forum](https://community.perplexity.ai/t/structured-output-stopped-working-for-sonar-reasoning-pro/902) -- structured output reliability issues (Aug 2025); regex extraction approach is more robust than response_format parameter

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows exact patterns from existing AI routes and medication UI
- Pitfalls: HIGH -- based on actual codebase patterns and known Perplexity behavior

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain, existing patterns)
