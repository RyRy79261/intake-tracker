# Phase 15: Unified Food+Salt Card - Research

**Researched:** 2026-03-24
**Domain:** React component composition, AI-driven food parsing, composable data entry, card UI patterns
**Confidence:** HIGH

## Summary

Phase 15 replaces the separate EatingCard and IntakeCard(salt) on the dashboard with a single FoodSaltCard component. The card has two stacked sections: a food section (quick log, expandable details, AI text input with composable entry preview) and a salt section (exact lift of current IntakeCard salt UX). The key new capability is AI food parsing that creates composable linked entries (eating + water + salt records) atomically via the existing `addComposableEntry()` service.

All data layer infrastructure is complete from Phase 12 (composable entry service, groupId linking, hooks). The AI parse route from Phase 13 returns `{ water, salt, reasoning }` and is ready for use. The UI pattern for AI text input with sparkle icon is established from Phase 14's PresetTab. This phase is primarily a component composition exercise -- building new UI components that wire together existing services and patterns.

The main complexity is the ComposablePreview component -- a new UI pattern that shows expandable/editable/removable record cards before atomic confirmation. This has no direct precedent in the codebase but can be built from existing shadcn primitives (Collapsible, Button, Input) following established card styling patterns.

**Primary recommendation:** Build FoodSaltCard as a thin shell with two child components (FoodSection, SaltSection) plus a standalone ComposablePreview. Lift IntakeCard(salt) logic directly into SaltSection. Wire FoodSection's AI parse flow through `parseIntakeWithAI()` -> local preview state -> `useAddComposableEntry()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Stacked sections, not tabs. Food input section at top, salt section below. Both visible without tab switching.
- **D-02:** Salt section is an exact lift of current IntakeCard(salt) UX: +/- buttons, daily total, limit warning, manual input dialog, recent entries list.
- **D-03:** Text input with AI sparkle icon button -- same pattern as Phase 14 Liquids card coffee/alcohol tabs. Type food description, tap AI icon, shows spinner, result populates preview.
- **D-04:** AI parse uses existing `/api/ai/parse` route which returns `{ water: number|null, salt: number|null, reasoning?: string }`.
- **D-05:** On AI parse result, create a composable entry preview showing all linked records. User confirms or edits before saving.
- **D-06:** Expandable card per linked record. Each record (eating, water, salt) shown as a mini-card with editable fields and a remove (X) button.
- **D-07:** Preview shows: eating record (food description, grams), water record (ml), salt record (mg). Each with edit capability.
- **D-08:** Confirm creates all records atomically via `addComposableEntry()` with `groupSource: "ai_food_parse"` and `originalInputText` stored for AI re-run capability.
- **D-09:** "Try Again" button clears the preview and returns to text input (reuse existing ParsedIntakeDisplay pattern).
- **D-10:** Water from food creates a real intake record via composable entry. It adds to the Liquids card water daily total automatically.

### Claude's Discretion
- Exact component decomposition (FoodSaltCard -> FoodSection + SaltSection, or inline)
- Whether to reuse `ParsedIntakeDisplay` directly or build a new composable preview component
- How the expandable preview cards look (accordion, collapsible, inline expand)
- Whether the food input also supports a quick "I ate" button (no AI, just timestamp) like current EatingCard
- Optional grams field placement (before or after AI parse, or in the preview)
- Loading state for AI parse (skeleton, spinner, shimmer)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOOD-01 | User can log food and salt from a single unified Food+Salt card, with manual salt input retained | FoodSaltCard shell component with stacked FoodSection + SaltSection; SaltSection is exact lift of IntakeCard(salt); FoodSection includes "I ate" quick log + expandable details from EatingCard |
| FOOD-02 | AI food parsing creates composable linked entries (eating + water + salt records) atomically via composable entry service | `parseIntakeWithAI()` returns `{ water, salt, reasoning }`; preview state maps to `ComposableEntryInput` with eating + intakes array; `useAddComposableEntry()` writes atomically with groupId |
| FOOD-03 | User sees a preview of all linked records before confirming an AI food parse, with ability to edit or remove individual entries | New ComposablePreview component with per-record Collapsible cards, inline edit fields, X remove buttons, "Try Again" + "Confirm All" actions |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager: **pnpm** (npm/yarn will fail)
- Path alias: `@/*` -> `src/*`
- Data layer: IndexedDB via Dexie.js, Dexie schema currently at version 15
- State: Zustand for settings, React Query for async data, useLiveQuery for all reads
- UI: shadcn/ui + Tailwind CSS + Lucide React icons
- Service layer boundary: components never import from services directly (ESLint enforced), use hooks layer
- Soft-delete pattern: `deletedAt` with null (not undefined)
- Conditional spread for exactOptionalPropertyTypes compliance
- Never start the dev server (user runs `pnpm dev` themselves)

## Standard Stack

### Core (already installed -- no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component framework | Already in project |
| Next.js | 14.x | App Router, API routes | Already in project |
| Dexie.js | 4.x | IndexedDB abstraction | Already in project |
| dexie-react-hooks | 1.x | useLiveQuery for reactive reads | Already in project |
| @tanstack/react-query | 5.x | Mutation hooks | Already in project |
| shadcn/ui | latest | UI primitives (Card, Button, Input, Collapsible, etc.) | Already in project |
| @radix-ui/react-collapsible | latest | Collapsible primitive for expandable preview cards | Already installed via shadcn |
| Zustand | 4.x | Settings store (salt increment/limit) | Already in project |
| Lucide React | latest | Icons (Utensils, Sparkles, Droplets, X, Check, etc.) | Already in project |
| Zod | 3.x | Form validation schemas | Already in project |

### Supporting (no new dependencies)

This phase requires **zero new npm packages**. Everything is built from existing project infrastructure.

## Architecture Patterns

### Recommended Component Structure

```
src/
├── components/
│   ├── food-salt-card.tsx              # Outer card shell (header, gradient, stacked layout)
│   └── food-salt/
│       ├── food-section.tsx            # "I ate" quick-log, details expand, AI input, preview
│       ├── salt-section.tsx            # Exact lift of IntakeCard(salt) UX
│       └── composable-preview.tsx      # AI parse result preview with edit/remove per record
```

### Pattern 1: Card Shell with Section Components

**What:** FoodSaltCard is a thin shell that renders the card header (eating theme) and stacks FoodSection + SaltSection with a divider between them. Each section manages its own state independently.

**When to use:** When two logically distinct UX flows share a card container. Matches the LiquidsCard pattern (shell + tab content components).

**Example:**
```typescript
// food-salt-card.tsx
export function FoodSaltCard() {
  const recentEatings = useEatingRecords(5);
  const latestEating = recentEatings?.[0];

  return (
    <Card className={cn("relative overflow-hidden transition-all duration-300 bg-gradient-to-br",
      CARD_THEMES.eating.gradient, CARD_THEMES.eating.border)}>
      <CardContent className="p-6">
        {/* Card header: eating theme icon + "FOOD + SALT" + last ate time */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", CARD_THEMES.eating.iconBg)}>
              <Utensils className={cn("w-5 h-5", CARD_THEMES.eating.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              Food + Salt
            </span>
          </div>
          {latestEating && (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(latestEating.timestamp)}
            </p>
          )}
        </div>

        <FoodSection />

        {/* Section divider */}
        <div className="border-t border-border/50 my-4" />

        <SaltSection />
      </CardContent>
    </Card>
  );
}
```

### Pattern 2: AI Input with Sparkle Icon (from Phase 14 PresetTab)

**What:** Text input with an absolute-positioned button inside (sparkle icon or spinner). Enter key or tap triggers the action.

**When to use:** Any AI-powered text input. Established in Phase 14's PresetTab for substance lookup.

**Example:**
```typescript
// Exact pattern from preset-tab.tsx, adapted for food parsing
<div className="relative mb-3">
  <Input
    value={foodText}
    onChange={(e) => setFoodText(e.target.value)}
    placeholder="Describe food for AI parsing..."
    aria-label="Describe food for AI nutritional parsing"
    disabled={isParsing}
    className="h-10 pr-10"
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAiParse();
      }
    }}
  />
  <button
    type="button"
    onClick={handleAiParse}
    disabled={!foodText.trim() || isParsing}
    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
    aria-label="Parse food with AI"
  >
    {isParsing ? (
      <Loader2 className="w-4 h-4 animate-spin" />
    ) : (
      <Sparkles className="w-4 h-4" />
    )}
  </button>
</div>
```

### Pattern 3: Composable Entry Preview (NEW -- local state before commit)

**What:** After AI parse returns water/salt/reasoning, build a local preview state array of records. User can expand to edit fields, remove records via X, then confirm all or try again. This is the first time this pattern appears in the codebase.

**When to use:** When multiple linked records need user review before atomic commit.

**Key design:**
```typescript
// Preview state shape (local, not persisted)
interface PreviewRecord {
  type: "eating" | "water" | "salt";
  label: string;
  icon: LucideIcon;
  // Mutable fields the user can edit
  description?: string;   // eating record note
  grams?: number;         // eating record grams
  amountMl?: number;      // water record
  amountMg?: number;      // salt record
  // Display
  summary: string;        // e.g. "85 ml" or "890 mg"
  expanded: boolean;      // collapsible state
}

// Built from AI parse result:
function buildPreviewRecords(input: string, result: ParsedIntake): PreviewRecord[] {
  const records: PreviewRecord[] = [];
  // Always create an eating record with the food description
  records.push({
    type: "eating",
    label: "Eating",
    icon: Utensils,
    description: input,
    summary: input, // truncated in UI
    expanded: false,
  });
  if (result.water != null && result.water > 0) {
    records.push({
      type: "water",
      label: "Water",
      icon: Droplets,
      amountMl: result.water,
      summary: `${result.water} ml`,
      expanded: false,
    });
  }
  if (result.salt != null && result.salt > 0) {
    records.push({
      type: "salt",
      label: "Salt",
      icon: Sparkles,
      amountMg: result.salt,
      summary: `${result.salt} mg`,
      expanded: false,
    });
  }
  return records;
}
```

### Pattern 4: SaltSection as Exact Lift

**What:** SaltSection is a direct extraction of IntakeCard when `type="salt"`. The IntakeCard component is 539 lines with water-specific features (liquid type selector, coffee presets, juice fields, food fields). SaltSection needs only the salt-specific subset.

**What to lift:**
- Salt daily total / limit display (right side header)
- Progress bar with over-limit coloring
- +/- buttons with pendingAmount state
- Center value display (tappable for ManualInputDialog)
- Confirm Entry button
- RecentEntriesList with EditIntakeDialog
- All salt theme tokens from CARD_THEMES.salt

**What to NOT lift (water-only):**
- Liquid type selector (water/juice/coffee/food)
- Coffee preset inline fields
- Juice name field
- Food note field
- `buildSource()` logic
- `effectiveAmount()` for coffee other

**Integration:** SaltSection calls `useIntake("salt")` directly (like WaterTab calls hooks directly per Phase 14 decision D-14). It also needs `useSettings()` for saltLimit and saltIncrement.

### Anti-Patterns to Avoid

- **Do NOT create a new API route:** The existing `/api/ai/parse` route returns exactly what we need. No server changes required.
- **Do NOT modify composable-entry-service.ts:** The `addComposableEntry()` function already supports the exact `ComposableEntryInput` shape needed (eating + intakes array).
- **Do NOT modify IntakeCard:** It stays in the codebase. SaltSection is a NEW component that replicates IntakeCard(salt) behavior. IntakeCard may be used elsewhere or removed in Phase 16 cleanup.
- **Do NOT use tabs/accordion for food vs salt:** D-01 explicitly locks stacked layout with both sections visible.
- **Do NOT reuse ParsedIntakeDisplay:** It shows water/salt as two static values side-by-side. The new ComposablePreview needs expandable/editable/removable cards per record type -- fundamentally different UX. Build new.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible expand/collapse | Manual height animation | `@radix-ui/react-collapsible` via shadcn | Handles animation, accessibility (aria-expanded), keyboard support |
| Atomic multi-table writes | Manual Dexie transactions | `addComposableEntry()` from composable-entry-service | Already handles groupId, transaction scope, error wrapping |
| Reactive data reads | Manual state + polling | `useLiveQuery` (Dexie) | Automatic re-render on IndexedDB changes, cross-component reactivity |
| Toast notifications | Custom notification system | `useToast()` + `showUndoToast()` | Established patterns with 5-second undo windows |
| Form validation | Manual if/else | Zod schemas | Already used in EatingCard (EatingDetailFormSchema) |
| AI client call | Direct fetch to API | `parseIntakeWithAI()` from ai-client.ts | Handles headers, auth token, audit logging, error parsing |

## Common Pitfalls

### Pitfall 1: AI Parse Timeout / Error Without Graceful Recovery
**What goes wrong:** AI parse fails (network, rate limit, timeout) and the user is stuck with no way to proceed.
**Why it happens:** The `/api/ai/parse` route has a 20-request-per-minute rate limit and depends on external Anthropic API.
**How to avoid:** On error, show a destructive toast ("AI parsing failed. Try again or add details manually.") and return to input-ready state. The "Add details" expandable provides a manual fallback for logging food without AI.
**Warning signs:** Loader spinner that never resolves.

### Pitfall 2: Preview State Desync After Edit
**What goes wrong:** User edits a value in the preview (e.g., changes water from 85ml to 100ml) but the summary text still shows "85 ml".
**Why it happens:** Preview records are local state -- if the summary string is computed once from the AI result and not derived from the editable fields, it will be stale.
**How to avoid:** Summary text must be computed from the current editable field values, not stored as a static string. Use `useMemo` or inline computation:
```typescript
// Good: derived from state
summary: `${record.amountMl} ml`
// Bad: stored once from AI result
summary: storedSummaryString
```
**Warning signs:** Displayed values not matching what you typed.

### Pitfall 3: Empty Composable Entry Submission
**What goes wrong:** User removes all preview records, then somehow submits.
**Why it happens:** Confirm All button not properly gated on `previewRecords.length > 0`.
**How to avoid:** Disable Confirm All when `previewRecords.length === 0`. Show the "No records to save" empty state text.
**Warning signs:** Attempting to call `addComposableEntry()` with empty eating/intakes arrays.

### Pitfall 4: Salt Section Regression
**What goes wrong:** The new SaltSection doesn't behave identically to the current IntakeCard(salt).
**Why it happens:** Missing state logic, edge cases (over-limit styling, would-exceed warning, center-tap manual input), or missing hooks (useDeleteWithToast, useEditRecord).
**How to avoid:** The SaltSection must include ALL of: pendingAmount state with increment/decrement, daily/rolling total display, progress bar with over-limit coloring, ManualInputDialog for center tap, Confirm Entry button, RecentEntriesList with delete and edit, EditIntakeDialog.
**Warning signs:** Any behavioral difference from the current salt card.

### Pitfall 5: Mutual Exclusivity of "Add Details" and AI Preview
**What goes wrong:** Both the expandable detail form and the AI preview are visible simultaneously, creating confusing UX.
**Why it happens:** Independent boolean states (`showDetails` and `previewRecords`) not coordinated.
**How to avoid:** When AI preview is visible, hide "Add details" section. When "Add details" is expanded, the AI input can remain visible but triggering a parse should collapse details. This is explicitly called out in UI-SPEC interaction states: "AI preview visible: 'Add details' section is hidden (mutually exclusive with AI preview)".
**Warning signs:** Both sections visible at once.

### Pitfall 6: Water From Food Not Appearing in Liquids Card Total
**What goes wrong:** AI food parse creates a water intake record but the Liquids card doesn't reflect the new total.
**Why it happens:** This is actually a non-issue IF records are created correctly. Since `addComposableEntry` writes real `IntakeRecord` entries with `type: "water"`, and the Liquids card reads via `useIntake("water")` which uses `useLiveQuery`, the Dexie observation system will automatically re-fire and update the water total. No explicit coordination needed.
**How to avoid:** Just ensure the water intake record is created with `type: "water"` in the intakes array (which `addComposableEntry` already does). Don't overthink this -- Dexie reactivity handles it.
**Warning signs:** None expected if using the standard pattern.

### Pitfall 7: Missing source Tag on Water/Salt Intake Records
**What goes wrong:** Water and salt records created by AI food parse lack proper `source` tags, making them indistinguishable from manual entries in history/analytics.
**Why it happens:** Forgetting to pass `source` in the intakes array of `ComposableEntryInput`.
**How to avoid:** Set `source: "food:ai_parse"` (or similar descriptive tag) on both water and salt intake records in the composable entry input. The `groupSource: "ai_food_parse"` goes on the top-level entry, while `source` goes on individual intake records.
**Warning signs:** Records showing as "manual" in recent entries list.

## Code Examples

### Example 1: Building ComposableEntryInput from Preview State

```typescript
// Source: composable-entry-service.ts interface + existing patterns
function buildComposableInput(
  records: PreviewRecord[],
  originalText: string
): ComposableEntryInput {
  const eating = records.find(r => r.type === "eating");
  const water = records.find(r => r.type === "water");
  const salt = records.find(r => r.type === "salt");

  const intakes: ComposableEntryInput["intakes"] = [];

  if (water && water.amountMl && water.amountMl > 0) {
    intakes.push({
      type: "water",
      amount: water.amountMl,
      source: "food:ai_parse",
    });
  }

  if (salt && salt.amountMg && salt.amountMg > 0) {
    intakes.push({
      type: "salt",
      amount: salt.amountMg,
      source: "food:ai_parse",
    });
  }

  return {
    ...(eating && {
      eating: {
        ...(eating.description !== undefined && { note: eating.description }),
        ...(eating.grams !== undefined && eating.grams > 0 && { grams: eating.grams }),
      },
    }),
    ...(intakes.length > 0 && { intakes }),
    originalInputText: originalText,
    groupSource: "ai_food_parse",
  };
}
```

### Example 2: SaltSection Hooks Setup

```typescript
// Source: current IntakeCard(salt) usage pattern in page.tsx + use-intake-queries.ts
function SaltSection() {
  const saltIntake = useIntake("salt");
  const settings = useSettings();
  const [pendingAmount, setPendingAmount] = useState(settings.saltIncrement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const recentRecords = useRecentIntakeRecords("salt");
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Salt entry removed");
  const { toast } = useToast();
  const addMutation = useAddIntake();

  // ... exact same logic as IntakeCard when type="salt"
  // No liquid type selector, coffee fields, etc.
}
```

### Example 3: Quick "I Ate" Handler (from EatingCard)

```typescript
// Source: eating-card.tsx handleLogNow
const addEatingMutation = useAddEating();

const handleLogNow = async () => {
  try {
    await addEatingMutation.mutateAsync({});
    toast({
      title: "Logged",
      description: "Eating event recorded",
      variant: "success",
    });
  } catch {
    toast({
      title: "Error",
      description: "Failed to record",
      variant: "destructive",
    });
  }
};
```

### Example 4: AI Parse Handler

```typescript
// Source: ai-client.ts + preset-tab.tsx pattern
const handleAiParse = async () => {
  if (!foodText.trim() || isParsing) return;
  setIsParsing(true);
  setShowDetails(false); // mutual exclusivity

  try {
    const result = await parseIntakeWithAI(foodText.trim());
    const records = buildPreviewRecords(foodText.trim(), result);
    setPreviewRecords(records);
    setAiReasoning(result.reasoning ?? null);
  } catch {
    toast({
      title: "AI parsing failed",
      description: "Try again or add details manually.",
      variant: "destructive",
    });
  } finally {
    setIsParsing(false);
  }
};
```

### Example 5: Confirm All Handler

```typescript
// Source: use-composable-entry.ts + composable-entry-service.ts
const addEntry = useAddComposableEntry();

const handleConfirmAll = async () => {
  if (isConfirming || previewRecords.length === 0) return;
  setIsConfirming(true);

  try {
    const input = buildComposableInput(previewRecords, originalInputText);
    await addEntry(input);
    toast({
      title: "Food logged",
      description: `${previewRecords.length} linked records created`,
      variant: "success",
    });
    // Reset state
    setPreviewRecords([]);
    setFoodText("");
    setAiReasoning(null);
  } catch {
    toast({
      title: "Error",
      description: "Failed to save food entry",
      variant: "destructive",
    });
  } finally {
    setIsConfirming(false);
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate EatingCard + IntakeCard(salt) | Unified FoodSaltCard with AI integration | Phase 15 (this phase) | Single card for all food+salt logging |
| FoodCalculator dialog (preset-based water calc) | AI food parsing with composable entry preview | Phase 15 (this phase) | More accurate, less manual, creates linked records |
| ParsedIntakeDisplay (static water/salt display) | ComposablePreview (editable, removable record cards) | Phase 15 (this phase) | User control over individual linked records |
| Water from food via IntakeCard "food" liquid type | Water from food via composable entry (automatic) | Phase 15 (this phase) | Seamless cross-domain record linking |

**Deprecated/outdated:**
- `FoodCalculator`: Being functionally replaced by AI food parsing in FoodSaltCard. File retained until Phase 16 cleanup (per UI-SPEC).
- `VoiceInput`: Not being replaced in this phase. Removal deferred to Phase 16 cleanup (per UI-SPEC).
- `ParsedIntakeDisplay`: Will no longer be used on the dashboard once FoodSaltCard's ComposablePreview replaces it. May be removed in Phase 16 cleanup.
- IntakeCard `liquidType` selector on water card: The "food" liquid type option in IntakeCard's water variant becomes redundant once FoodSaltCard handles food-based water tracking.

## Open Questions

1. **Quick "I ate" button in unified card**
   - What we know: Current EatingCard has this. UI-SPEC includes it. CONTEXT.md lists it under Claude's discretion.
   - Recommendation: Include it. The "I ate" quick-log button is the primary way to record eating events (timestamp-only, no details). Users who don't use AI still need a one-tap way to log meals.

2. **Whether to use Collapsible or simple show/hide for preview cards**
   - What we know: Collapsible primitive is already installed. UI-SPEC mentions expandable cards with tap-to-expand.
   - Recommendation: Use Collapsible for accessibility (aria-expanded) and animation. Each preview record card wraps in a Collapsible with the card header as trigger and edit fields as content.

3. **Focus management after AI parse**
   - What we know: UI-SPEC accessibility section says "After AI parse returns, focus moves to the first preview card. After Confirm All, focus returns to the AI input."
   - Recommendation: Use `useRef` on the first preview card container and call `.focus()` in a `useEffect` when previewRecords transitions from empty to populated. Same for returning focus to the input after confirm.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test e2e/intake-logs.spec.ts` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOOD-01 | FoodSaltCard renders with food + salt sections | e2e | `npx playwright test e2e/food-salt-card.spec.ts -x` | No -- Wave 0 |
| FOOD-01 | "I ate" quick log creates eating record | e2e | `npx playwright test e2e/food-salt-card.spec.ts -x` | No -- Wave 0 |
| FOOD-01 | Salt section +/- and confirm creates salt intake record | e2e | `npx playwright test e2e/food-salt-card.spec.ts -x` | No -- Wave 0 |
| FOOD-02 | AI food parse creates linked eating+water+salt records atomically | e2e + manual | `npx playwright test e2e/food-salt-card.spec.ts -x` | No -- Wave 0 |
| FOOD-03 | Composable preview shows editable records, can remove individual entries | e2e | `npx playwright test e2e/food-salt-card.spec.ts -x` | No -- Wave 0 |

**Note:** FOOD-02's AI integration requires a running API with ANTHROPIC_API_KEY. E2E tests can be written with mocked API responses via Playwright route interception (`page.route('/api/ai/parse', ...)`).

### Sampling Rate
- **Per task commit:** Manual visual check (dev server)
- **Per wave merge:** `pnpm lint && pnpm build`
- **Phase gate:** `pnpm build` clean + manual E2E walkthrough

### Wave 0 Gaps
- [ ] `e2e/food-salt-card.spec.ts` -- covers FOOD-01, FOOD-02, FOOD-03
- [ ] Playwright route interception for `/api/ai/parse` mock responses in E2E tests

*(E2E test file should be created as part of the final plan. Mocking the AI API response enables automated testing without live API keys.)*

## Sources

### Primary (HIGH confidence)
- Source code analysis of existing components: `eating-card.tsx`, `intake-card.tsx`, `composable-entry-service.ts`, `use-composable-entry.ts`, `parsed-intake-display.tsx`, `ai-client.ts`, `preset-tab.tsx`, `liquids-card.tsx`
- API route implementation: `src/app/api/ai/parse/route.ts`
- Data model interfaces: `src/lib/db.ts` (IntakeRecord, EatingRecord, SubstanceRecord)
- Hooks layer: `use-intake-queries.ts`, `use-eating-queries.ts`, `use-delete-with-toast.ts`, `use-edit-record.ts`
- UI-SPEC: `.planning/phases/15-unified-food-salt-card/15-UI-SPEC.md`
- CONTEXT.md: `.planning/phases/15-unified-food-salt-card/15-CONTEXT.md`

### Secondary (MEDIUM confidence)
- Radix Collapsible API (installed, verified via `src/components/ui/collapsible.tsx`)
- shadcn/ui component inventory (verified via `src/components/ui/` directory)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed, no new dependencies
- Architecture: HIGH -- patterns directly derived from existing codebase (LiquidsCard shell, PresetTab AI input, composable-entry-service)
- Pitfalls: HIGH -- identified from direct code analysis of existing components and their state management patterns

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no external dependencies changing)
