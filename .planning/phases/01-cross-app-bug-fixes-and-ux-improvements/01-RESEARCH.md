# Phase 1: Cross-app Bug Fixes and UX Improvements - Research

**Researched:** 2026-04-07
**Domain:** Next.js 14 App Router, Dexie.js IndexedDB, shadcn/ui, Zustand, React Query
**Confidence:** HIGH

## Summary

This phase addresses 23 discrete decisions spanning Dashboard, Medications (Schedule + Rx), Analytics, and Settings. The changes range from simple UI text fixes (D-01, D-17) to data model extensions requiring a Dexie version bump (D-13). The codebase is mature (131 plans completed across 5 milestones) with well-established patterns: Dexie service layer -> React Query/useLiveQuery hooks -> shadcn/ui components -> Zustand for preferences.

The most technically significant items are: (1) inventory deduction fix (D-05), which requires careful transaction logic in `dose-log-service.ts`; (2) Dexie schema extension (D-13) adding compound fields to Prescription; (3) Settings restructure (D-19/D-20) migrating CustomizationPanel from modal to accordion; and (4) Compound Details drawer (D-12) which converts the existing Edit button to a read-only view with AI refresh diff.

**Primary recommendation:** Group work into 6-8 plans organized by area: Dashboard quick fix, Schedule bugs, Dose formatting, Rx view changes, Data model + AI, Analytics fixes, Settings restructure. The Dexie version bump (D-13) should be in a standalone early plan since it unblocks D-14/D-15.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Remove Alcohol and Caffeine from the quick-nav footer shortcuts
- **D-02:** Make the top navigation tabs wrap so Titrations and Settings flow to a second row
- **D-03:** When creating a new Rx item, do NOT create dose alerts for times earlier than the current time on the creation day
- **D-04:** "Mark All" dialog should auto-populate the time field with the time slot's time, not default to 8 AM
- **D-05:** Fix inventory deduction -- marking a dose as taken must create a `consumed` inventory transaction. Undoing must reverse it.
- **D-06:** Fix progress bar -- currently always says "0x0 Taken". Should show actual doses taken / total scheduled.
- **D-07:** Fix dose formatting: "1/2 tablet (6.25mg)" where parenthetical shows computed dose (pill strength x fraction)
- **D-08:** Show the active brand name next to the compound name in schedule items
- **D-09:** Collapsed Rx card: "{pillAmount} {numberOfTimes} per day" instead of "{dose} Next: {time}"
- **D-10:** Same dose formatting fix as D-07 throughout Rx sub-cards
- **D-11:** Expandable indication/purpose text in expanded Rx view (truncated by default)
- **D-12:** Rename "Edit" to "Compound Details" -- read-only drawer with AI refresh + diff accept/reject
- **D-13:** Add compound-level fields to Prescription table (Dexie version bump)
- **D-14:** Extend AI medicine-search prompt/tool schema for mechanismOfAction
- **D-15:** Add-medication wizard must persist all AI-returned compound data to Prescription
- **D-16:** Medication adherence calculation must ignore future scheduled doses
- **D-17:** Export PDF/CSV buttons stacked vertically (full-width each)
- **D-18:** Insights should have editable thresholds via gear icon, stored in Zustand
- **D-19:** Remove dead settings sections for Sodium, Caffeine, Alcohol
- **D-20:** Move CustomizationPanel content from modal into Settings page as accordion sections
- **D-21:** Presets in accordion sections support delete only (no edit)
- **D-22:** Color coding using theme tokens: --caffeine for coffee, --alcohol for alcohol, orange for mixed
- **D-23:** Users must be able to delete any default preset, not just custom ones

### Claude's Discretion
- Accordion implementation details (single-open vs multi-open, animation)
- Exact layout of the Compound Details drawer sections
- How the AI refresh diff UI presents changes for accept/reject
- Branch naming convention for the fix branch

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js | 14 (App Router) | Framework | [VERIFIED: CLAUDE.md] |
| Dexie.js | ~4.x | IndexedDB ORM, client-side DB | [VERIFIED: codebase db.ts] |
| dexie-react-hooks | - | useLiveQuery for reactive queries | [VERIFIED: codebase hooks] |
| shadcn/ui | - | UI component library | [VERIFIED: src/components/ui/] |
| Tailwind CSS | - | Styling with custom tokens | [VERIFIED: tailwind.config.ts] |
| Zustand | - | Settings store with localStorage persistence | [VERIFIED: settings-store.ts] |
| @tanstack/react-query | - | Server state management (wrapping Dexie) | [VERIFIED: hooks] |
| motion/react | - | Animations (framer-motion successor) | [VERIFIED: prescription-card.tsx] |
| Recharts | - | Analytics charts | [VERIFIED: insights-tab.tsx] |
| Anthropic Claude SDK | - | AI medicine-search API | [VERIFIED: route.ts] |

### New Component Needed
| Component | Source | Purpose | Decision |
|-----------|--------|---------|----------|
| Accordion | shadcn/ui | Settings restructure (D-20) | Must install via `npx shadcn@latest add accordion` |

**Installation:**
```bash
npx shadcn@latest add accordion
```

Note: No accordion component exists yet in `src/components/ui/`. The Collapsible component does exist but Accordion is the proper choice for the multi-section Settings restructure. [VERIFIED: ls of src/components/ui/ shows no accordion.tsx]

## Architecture Patterns

### Existing Patterns to Follow

**Dexie version bump (D-13):**
The codebase is at version 15 (`db.version(15).stores({...})`). A new version 16 must repeat ALL existing store definitions exactly, then add new fields. No upgrade function is needed for adding optional fields to an existing table -- Dexie handles undefined fields gracefully. [VERIFIED: db.ts versions 10-15]

```typescript
// Pattern from existing codebase: repeat full schema, no .upgrade() for new optional fields
db.version(16).stores({
  // ... all existing store definitions from v15 ...
  prescriptions: "id, isActive, updatedAt, createdAt", // indexes unchanged
  // ... rest unchanged ...
});
```

**Service layer mutations:**
All mutations follow: `db.transaction("rw", [tables], async () => { ... })` with audit logging. [VERIFIED: medication-service.ts, dose-log-service.ts]

**Component data flow:**
`useLiveQuery(serviceFn)` in hooks -> components consume directly. No invalidation needed -- Dexie's live queries auto-update. [VERIFIED: use-medication-queries.ts]

**Zustand persistence:**
Settings store uses `persist` middleware with `createJSONStorage(() => localStorage)`. Version number incremented on schema changes with migration function. Currently at version 4. [VERIFIED: settings-store.ts]

**Drawer pattern:**
Medications drawers use shadcn/ui `Drawer` component with `DrawerContent`, `DrawerHeader`, `DrawerTitle`. Max height 90dvh with flex layout. [VERIFIED: edit-medication-drawer.tsx]

### Recommended Plan Structure
```
Plan 01: Dashboard + Quick Fixes (D-01, D-02, D-17)
Plan 02: Dexie Schema Extension (D-13)
Plan 03: AI Medicine Search Extension (D-14)
Plan 04: Schedule Bug Fixes (D-03, D-04, D-05, D-06)
Plan 05: Dose Formatting + Brand Display (D-07, D-08, D-10)
Plan 06: Rx View Changes (D-09, D-11, D-12, D-15)
Plan 07: Analytics Fixes (D-16, D-18)
Plan 08: Settings Restructure (D-19, D-20, D-21, D-22, D-23)
```

### Anti-Patterns to Avoid
- **Don't create a new accordion component from scratch** -- install the shadcn/ui accordion and customize with theme tokens
- **Don't add new indexes to Dexie for optional compound fields** -- they are query-by-id lookups, not range queries. Adding unnecessary indexes bloats IndexedDB.
- **Don't break the CustomizationPanel modal** before the accordion replacement is ready -- the migration should be atomic within a single plan
- **Don't use `isActive: 1` for Dexie boolean queries** -- the codebase filters with `.filter(p => p.isActive === true)` because IndexedDB stores booleans as true/false, not 0/1. The `takeDose` function at line 257 uses `{ prescriptionId, isActive: 1 }` which is the inventory deduction bug (D-05). [VERIFIED: dose-log-service.ts line 257]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion UI | Custom collapsible sections | `npx shadcn@latest add accordion` | Accessibility, keyboard nav, animation all handled |
| Diff view for AI refresh | Custom diff algorithm | Simple before/after comparison with highlight | Only comparing flat fields, not text diffs |
| Fractional pill formatting | New formatter | Extend existing `formatPillCount()` in medication-ui-utils.ts | Already handles Unicode fractions correctly |

## Common Pitfalls

### Pitfall 1: Dexie Boolean Index Bug (D-05 Root Cause)
**What goes wrong:** `takeDose()` at line 257 queries `db.inventoryItems.where({ prescriptionId, isActive: 1 })` but Dexie stores booleans as `true`/`false`, not integers. The `.where()` with `1` never matches, so no inventory is found, so no transaction is created.
**Why it happens:** IndexedDB does not index booleans the same as integers. Using `isActive: 1` returns no results.
**How to avoid:** Use `.where("prescriptionId").equals(prescriptionId).filter(i => i.isActive === true)` pattern, consistent with rest of codebase.
**Warning signs:** PillsConsumed always shows 0 in debug panel.

### Pitfall 2: Progress Bar Shows "0x0" (D-06)
**What goes wrong:** The `computeProgress()` function in `medication-ui-utils.ts` appears correct -- it counts slots up to current time. The bug is likely that `DoseProgressSummary` receives slots from `useDailyDoseSchedule` which may return `undefined` during loading, and the component renders with an empty array.
**Why it happens:** Need to verify whether the slots array is actually populated when the component renders.
**How to avoid:** Verify the data flow from `useDailyDoseSchedule` -> `ScheduleView` -> `DoseProgressSummary`. The slots variable is guarded by `if (!slots || slots.length === 0) return <EmptySchedule />` so empty/undefined returns the empty state, not "0x0".
**Warning signs:** Component shows stale/default values.

### Pitfall 3: Mark All Default Time (D-04)
**What goes wrong:** The `RetroactiveTimePicker` for Mark All receives `defaultTime={markAllTarget?.time ?? "08:00"}`. The "08:00" fallback should never trigger if `markAllTarget` is properly set, but the issue is that the defaultTime prop may not be re-read when the target changes if the picker was previously open.
**Why it happens:** The RetroactiveTimePicker may initialize its internal state from `defaultTime` only on first open, not on subsequent opens with different targets.
**How to avoid:** Ensure the picker resets its internal time state when `markAllTarget` changes, or pass the time slot's time directly.

### Pitfall 4: Dose Formatting Semantics (D-07)
**What goes wrong:** Current formatting says "1/2 of 6.25mg" which reads as "take half of 6.25mg = 3.125mg". The correct display is "1/2 tablet (6.25mg)" where 6.25mg IS the dose amount.
**Why it happens:** `doseLabel` in dose-row.tsx line 43-44 constructs: `${formatPillCount(pillsPerDose)} of ${slot.dosageMg}${slot.unit}`. Here `slot.dosageMg` is the SCHEDULED dose (already computed as strength x fraction). So "1/2 of 6.25mg" is misleading -- 6.25mg is correct, but "of" implies it's the pill strength.
**How to avoid:** Change format to `${formatPillCount(pillsPerDose)} (${slot.dosageMg}${slot.unit})` -- "1/2 tablet (6.25mg)".

### Pitfall 5: Adherence Counts Future Doses as Missed (D-16)
**What goes wrong:** `adherenceRate()` in analytics-service.ts calls `getDoseScheduleForDateRange()` which uses `deriveStatus()`. For today's date, `deriveStatus()` returns "pending" for no-log future slots. The adherence calculation then counts ALL slots (including future pending) toward the denominator.
**Why it happens:** `adherenceRate()` at line 270 does `const dayTotal = filteredSlots.length` without filtering out future pending slots for today.
**How to avoid:** For today's date, filter slots to only include those before current time (or already actioned). The `computeProgress()` function in medication-ui-utils.ts already does this correctly -- reuse that logic.

### Pitfall 6: Settings Store Version Bump (D-18)
**What goes wrong:** Adding `insightThresholds` to the Zustand store requires a version bump (currently at version 4) with a migration function.
**Why it happens:** The persist middleware will reject state from a newer version if the version number doesn't match.
**How to avoid:** Bump to version 5, add migration that initializes `insightThresholds` to default values. Follow existing pattern from version 3->4 migration.

### Pitfall 7: Notification Timing on Rx Creation (D-03)
**What goes wrong:** When creating a new Rx with schedules, dose reminders may fire immediately for past time slots on the creation day.
**Why it happens:** `checkDoseReminders()` in medication-notification-service.ts checks all active schedules without considering when the prescription was created. The `getDailyDoseSchedule()` already filters by `createdDate` (line 185) but compares dates, not times.
**How to avoid:** The fix should be in `getDailyDoseSchedule()` -- when `dateStr === createdDate`, filter out schedule times that were before the prescription's creation time (from `prescription.createdAt` timestamp).

## Code Examples

### D-05: Fix Inventory Deduction (Boolean Query Bug)

```typescript
// BEFORE (broken) - dose-log-service.ts ~line 257
const inventory = await db.inventoryItems
  .where({ prescriptionId, isActive: 1 })
  .first();

// AFTER (fixed) - use filter pattern consistent with rest of codebase
const allInventory = await db.inventoryItems
  .where("prescriptionId")
  .equals(prescriptionId)
  .toArray();
const inventory = allInventory.find(i => i.isActive === true && !i.isArchived);
```
[VERIFIED: dose-log-service.ts line 257, compared with dose-schedule-service.ts line 163-169]

### D-07: Fix Dose Formatting

```typescript
// BEFORE - dose-row.tsx line 43-44
const doseLabel = pillsPerDose != null
  ? `${formatPillCount(pillsPerDose)} of ${slot.dosageMg}${slot.unit}`
  : `${slot.dosageMg}${slot.unit}`;

// AFTER - "1/2 tablet (6.25mg)" format
const doseLabel = pillsPerDose != null
  ? `${formatPillCount(pillsPerDose)} (${slot.dosageMg}${slot.unit})`
  : `${slot.dosageMg}${slot.unit}`;
```
[VERIFIED: dose-row.tsx lines 43-44, prescription-card.tsx line 168]

### D-13: Dexie Schema Extension

```typescript
// Add to Prescription interface in db.ts
export interface Prescription {
  // ... existing fields ...
  drugClass?: string;
  mechanismOfAction?: string;
  commonIndications?: string[];
  dosageStrengths?: string[];
  foodInstruction?: "before" | "after" | "none";
  foodNote?: string;
}

// Version 16: Add compound-level fields to Prescription
// No index changes needed -- these fields are accessed via prescription.id lookup
db.version(16).stores({
  // ... repeat all v15 store definitions exactly ...
});
// No .upgrade() needed -- new optional fields default to undefined
```
[VERIFIED: db.ts Prescription interface at line 139-151, version pattern from v13/v14]

### D-14: AI Medicine Search Extension

```typescript
// Add to tool schema in medicine-search/route.ts
mechanismOfAction: { 
  type: "string", 
  description: "Plain-English explanation of how the drug works biologically" 
},

// Add to response schema
mechanismOfAction: z.string().default(""),

// Add to required fields
required: [
  ...existing,
  "mechanismOfAction",
],
```
[VERIFIED: medicine-search/route.ts tool definition]

### D-20: Settings Accordion (Claude's Discretion: multi-open with animation)

```typescript
// Install: npx shadcn@latest add accordion
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Multi-open accordion with color-coded headers
<Accordion type="multiple" className="w-full">
  <AccordionItem value="coffee">
    <AccordionTrigger className="text-caffeine">
      <Coffee className="w-4 h-4 mr-2" /> Coffee Presets
    </AccordionTrigger>
    <AccordionContent>
      {/* Preset list with delete-only buttons */}
    </AccordionContent>
  </AccordionItem>
  {/* ... more sections */}
</Accordion>
```
[ASSUMED: shadcn/ui accordion API based on standard implementation]

### D-04: Mark All Time Auto-Populate Fix

```typescript
// BEFORE - schedule-view.tsx line 323
<RetroactiveTimePicker
  open={markAllPickerOpen}
  onOpenChange={setMarkAllPickerOpen}
  defaultTime={markAllTarget?.time ?? "08:00"}
  compoundName="all doses"
  onConfirm={handleMarkAllTimeConfirm}
/>

// The markAllTarget is set correctly with the time slot's time.
// The issue is the "08:00" fallback when markAllTarget is null (before user clicks).
// Fix: ensure the picker re-initializes its internal state from defaultTime on each open.
// Check RetroactiveTimePicker's internal useState for the time value.
```
[VERIFIED: schedule-view.tsx line 320-326]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `isActive: 1` in Dexie where() | `.filter(i => i.isActive === true)` | Current codebase standard | Boolean queries must use filter, not indexed where |
| Modal for customization | Accordion sections in page | This phase (D-20) | Better discoverability, no modal overlay |
| "Edit" button on Rx | "Compound Details" read-only | This phase (D-12) | Clearer purpose, AI refresh capability |
| `formatPillCount(n) of Xmg` | `formatPillCount(n) (Xmg)` | This phase (D-07) | Correct dose communication |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn/ui accordion follows standard Radix UI Accordion API with `type="multiple"` support | Code Examples D-20 | LOW -- well-established pattern, easy to verify at install time |
| A2 | The "0x0 Taken" bug (D-06) is caused by the same boolean indexing issue as D-05, where slots don't populate correctly | Pitfall 2 | MEDIUM -- may have a different root cause; needs debugging |
| A3 | `RetroactiveTimePicker` uses `useState(defaultTime)` internally and doesn't reset on prop change | Pitfall 3 | LOW -- standard React pitfall, quick to verify |

## Open Questions

1. **D-06 Root Cause Verification**
   - What we know: The progress bar shows "0x0 Taken". `computeProgress()` logic looks correct. `DoseProgressSummary` receives `slots` from `ScheduleView`.
   - What's unclear: Whether the "0x0" is caused by D-05's boolean bug (slots get empty inventory data) or a separate issue where slots themselves are empty.
   - Recommendation: D-05 fix may resolve D-06 automatically. If not, debug the slots array at render time.

2. **D-03 Scope: Notifications vs Schedule Display**
   - What we know: `getDailyDoseSchedule()` already filters by prescription createdDate at the day level. Notification checking also runs on schedules.
   - What's unclear: Whether D-03 means (a) don't create notification alerts, or (b) don't even show the dose slots for past times on creation day.
   - Recommendation: Implement at the schedule generation level in `getDailyDoseSchedule()` -- filter out time slots earlier than creation time on the creation day. This fixes both display and notifications.

3. **D-12 Compound Details Scope**
   - What we know: The existing InfoTab in edit-medication-drawer.tsx already has AI refresh with accept/reject for contraindications and warnings.
   - What's unclear: Whether the new Compound Details drawer should completely replace the existing PrescriptionViewDrawer or be a separate drawer accessible from the same button.
   - Recommendation: Rename the "Edit" button to "Compound Details" and restructure the existing drawer's InfoTab to be the primary view (read-only), with the DetailsTab relegated to a secondary "Edit Prescription" action within.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all changes are code/config within the existing Next.js project)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | `playwright.config.ts` (assumed standard location) |
| Quick run command | `npx playwright test e2e/medications.spec.ts` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements to Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01 | Caffeine/Alcohol removed from quick-nav | e2e | `npx playwright test e2e/dashboard.spec.ts` | Yes |
| D-05 | Inventory deduction on dose taken | e2e | `npx playwright test e2e/medications.spec.ts` | Yes |
| D-06 | Progress bar shows correct counts | e2e | `npx playwright test e2e/medications.spec.ts` | Yes |
| D-07 | Dose formatting shows "1/2 tablet (6.25mg)" | e2e | `npx playwright test e2e/medications.spec.ts` | Yes |
| D-13 | Dexie schema version bump doesn't break | manual | N/A (production data on phone) | - |
| D-16 | Adherence ignores future doses | e2e | `npx playwright test e2e/history.spec.ts` | Yes |
| D-17 | Export buttons stacked vertically | e2e | `npx playwright test e2e/history.spec.ts` | Yes |
| D-19-23 | Settings restructure | e2e | `npx playwright test e2e/settings.spec.ts` | Yes |

### Sampling Rate
- **Per task commit:** `pnpm lint` (fast, catches type errors)
- **Per wave merge:** `pnpm test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase areas with e2e specs for dashboard, medications, history, and settings.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A (no auth changes) |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes | Zod validation on AI response schema (D-14 extension) |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AI response injection (D-14) | Tampering | Zod schema validation on tool response (already in place) |
| XSS via AI-returned text (D-12/D-15) | Information Disclosure | React's default escaping handles this; no `dangerouslySetInnerHTML` used |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/lib/db.ts`, `src/lib/dose-log-service.ts`, `src/lib/medication-service.ts` -- schema, service patterns, bug identification
- Codebase analysis: `src/components/medications/*.tsx` -- all component implementations verified
- Codebase analysis: `src/stores/settings-store.ts` -- Zustand persistence pattern verified
- Codebase analysis: `src/app/api/ai/medicine-search/route.ts` -- AI tool schema verified
- `CLAUDE.md` -- project architecture and conventions

### Secondary (MEDIUM confidence)
- Component inventory: `src/components/ui/` directory listing -- confirmed no accordion component exists

### Tertiary (LOW confidence)
- None

## Project Constraints (from CLAUDE.md)

- **Package manager:** pnpm (enforced via preinstall hook)
- **Path alias:** `@/*` -> `src/*`
- **Dev server:** Never start dev server; user runs `pnpm dev` themselves
- **Dexie versioning:** When adding a new Dexie version, must repeat all existing store definitions
- **Data layer:** All user data in IndexedDB via Dexie.js -- no server-side database for user data
- **Schema:** Currently at Dexie version 15 (IndexedDB version 150)
- **Zustand store:** Version 4 with migration logic
- **UI:** shadcn/ui components, Tailwind CSS with custom theme tokens
- **AI routes:** Server-side Claude API calls, PII stripped before sending
- **Testing:** Playwright E2E tests, `pnpm test:e2e`
- **No fork packages:** Never install third-party fork packages without explicit user approval
- **Composable data models:** Prefer flexible composable data models over rigid explicit ones

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified in codebase, no new dependencies except shadcn/ui accordion
- Architecture: HIGH -- all patterns verified against 15+ source files
- Pitfalls: HIGH for D-05 (verified boolean bug), MEDIUM for D-06 (root cause needs confirmation)

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no fast-moving dependencies)
