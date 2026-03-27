# Phase 8: Drug Interactions - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface known drug interactions and contraindications per prescription, check new prescriptions against existing meds before saving, and provide an ad-hoc substance lookup ("can I take X with my meds?"). Interaction data persists offline. This is a read + AI-query feature — no new data entry flows or prescription management changes.

</domain>

<decisions>
## Implementation Decisions

### Interaction display
- Always-visible "Interactions & Warnings" section in the prescription detail drawer
- Shows contraindications (e.g., "Avoid NSAIDs — bleeding risk") and drug class warnings
- Amber/red color coding by severity — red for "AVOID", amber for "CAUTION"
- Drug class label shown (e.g., "Drug class: SNRI")
- Always expanded — this is safety-critical info, not something to hide behind a tap
- Data sourced from the prescription's existing `contraindications[]` and `warnings[]` fields

### New-prescription conflict check
- Non-blocking advisory before the save step in the add-medication wizard
- When a new prescription is being added, AI checks it against all active prescriptions
- If conflicts found: warning banner shows specific interactions (substance + substance: risk)
- User can acknowledge ("I'm aware, save anyway") or go back — does NOT block saving
- Rationale: the user's doctor prescribed it, we inform but don't gatekeep

### Ad-hoc substance lookup
- Search input at the top of the Medications tab: "Check interaction..."
- User types a substance name, results check against ALL active prescriptions
- Results grouped per prescription: substance vs [med]: severity + description
- Severity levels: AVOID (red), CAUTION (amber), OK (green/no warning)
- Uses the Perplexity `sonar-reasoning-pro` model (same as titration warnings)

### Offline persistence model
- Use existing `Prescription.contraindications[]` and `Prescription.warnings[]` fields — no schema change needed
- These are already populated by the medicine-search AI during add-medication flow
- For prescriptions added before this feature: offer a "Refresh interactions" button that re-queries the AI
- Ad-hoc lookup results cached in localStorage (not IndexedDB) with a TTL — these are transient queries, not prescription-level data
- No automatic background refresh — user triggers refresh manually or it happens on new prescription add

### Claude's Discretion
- Exact layout of the interaction display section within the drawer
- Loading state while AI checks interactions
- How to handle AI unavailability (show cached data, or "interactions unavailable" message)
- Whether to show an interaction badge/count on the prescription card in the Rx grid
- Cache TTL for ad-hoc lookups

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Existing interaction data
- `src/lib/db.ts` lines 137-138 — `Prescription.contraindications?: string[]` and `Prescription.warnings?: string[]` already in schema
- `src/app/api/ai/medicine-search/route.ts` — AI returns contraindications, warnings, drugClass during medicine search
- `src/app/api/ai/titration-warnings/route.ts` — Existing pattern for sending all active meds to AI for cross-checking

### UI integration points
- `src/components/medications/prescription-detail-drawer.tsx` — Where the interactions section goes
- `src/components/medications/add-medication-wizard.tsx` — Where the conflict check step goes (before save)
- `src/components/medications/compound-list.tsx` — Medications tab where the search bar goes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Prescription.contraindications` and `Prescription.warnings` fields already in db schema — populated by medicine-search AI
- `sonar-reasoning-pro` Perplexity model already used for titration-warnings — same pattern for interaction checks
- `sanitizeForAI()` utility for safe AI prompting
- `withAuth` middleware for API routes
- Existing rate limiting pattern from other AI routes

### Established Patterns
- AI API routes: Zod schema validation → rate limiting → Perplexity call → JSON extraction with retry → response
- Medicine search already returns contraindications, warnings, drugClass — can reuse the same endpoint or create a dedicated interaction-check endpoint
- Settings store for user preferences (Zustand)
- `usePrescriptions()` hook for getting all active prescriptions

### Integration Points
- Prescription detail drawer — new "Interactions" section (after schedule, before inventory)
- Add-medication wizard — new conflict check step before final save
- Medications tab (compound-list.tsx) — search bar at top for ad-hoc lookup
- New API route: `POST /api/ai/interaction-check` for cross-prescription and ad-hoc checks

</code_context>

<specifics>
## Specific Ideas

- The interaction check should send ALL active prescription generic names to the AI, not just the new one — context matters for multi-drug interactions
- Severity should be clear at a glance: red = avoid, amber = caution. No ambiguity.
- Ad-hoc lookup should feel like a quick search — type, get results, done. Not a multi-step flow.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-drug-interactions*
*Context gathered: 2026-03-20*
