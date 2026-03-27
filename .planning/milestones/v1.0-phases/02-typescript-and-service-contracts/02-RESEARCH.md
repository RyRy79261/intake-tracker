# Phase 2: TypeScript and Service Contracts - Research

**Researched:** 2026-03-03
**Domain:** TypeScript strict mode, service layer architecture, Zod validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Enable both `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` at once — only 2 trivial errors exist across the entire codebase
- Fix errors properly with real null checks and type fixes, no suppressions
- Strict layering enforced: components → hooks → services → db (no shortcuts, no exceptions)
- All 27 components importing `db.ts` and 12 importing `*-service.ts` must be refactored to go through hooks
- Missing hooks should be created as needed during refactoring
- Validate at three boundaries: API routes, AI response parsing (Perplexity), and user form inputs
- Separate schemas for forms (UI concerns — error messages, field labels) vs services (data integrity — types, ranges)
- Schemas co-located with their respective files, not a central `src/schemas/` directory
- AI response failures: retry once, then graceful fallback to manual entry
- Review existing Zod usage in `intake-service.ts` first — establish ideal pattern before rolling out
- Component-scoped errors (form field validation) → inline field errors under the specific field
- System-scoped errors (hook/service/API failures) → toast notifications
- Services return result types (`{ success, error }`) instead of throwing — refactor ALL existing services to match
- Validation failures logged to audit table (`auditLogs` in Dexie) with full Zod error details (path, expected, received)
- Viewable through the existing debug panel

### Claude's Discretion
- Enforcement mechanism for service boundaries (ESLint rules, barrel exports, or combination)
- Whether debug-panel.tsx gets an exception for direct DB access
- Service-to-service import rules (dependency direction, circular import prevention)
- Where data transformation logic lives (hooks vs services vs components)
- Hook creation strategy (consolidated shared hooks vs one-per-component)
- Whether to validate on Dexie reads, writes, or both
- Result type design (`ServiceResult<T>` standardization)
- Toast message specificity level

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVC-03 | Strict TypeScript across all services — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Zod validation at boundaries, no `any` | TSConfig flags research, error inventory (146 errors across 40 files), Zod patterns for API/AI/form boundaries, `any` audit (12 instances) |
| SRVC-04 | Clean service layer boundaries — services don't import each other's internals, UI never touches `db.ts` directly | Import analysis (2 value imports + 23 type-only imports from db.ts in components, 14 service imports in components/pages), ESLint `no-restricted-imports` pattern, barrel export strategy |
</phase_requirements>

## Summary

This phase involves three interconnected workstreams: (1) enabling two additional TypeScript strict flags and fixing all surfaced errors, (2) enforcing architectural boundaries so UI code never directly touches `db.ts` or service files, and (3) adding Zod validation at all external data entry points.

The TypeScript error count is significantly higher than the initial "only 2 trivial errors" estimate from the discuss phase. Actual measurement shows **146 errors across 40 files** when both flags are enabled. The breakdown is: ~68 errors from `noUncheckedIndexedAccess` (array/object indexed access now possibly undefined) and ~78 errors from `exactOptionalPropertyTypes` (optional properties cannot receive `undefined` explicitly). The heaviest files are `history/page.tsx` (24 errors), `history-drawer.tsx` (24 errors), `medication-service.ts` (14 errors), and `intake-service.ts` (13 errors). However, these are mostly mechanical fixes (add null checks, use `for...of` instead of indexed access, fix optional property assignments) and should not require architectural changes.

The service boundary enforcement is well-scoped. Only 2 components (`debug-panel.tsx` and `daily-notes-drawer.tsx`) import the `db` value itself; the other 23 component imports from `db.ts` are type-only imports that can be re-exported from services or a types file. The 14 service imports from components/pages are the main refactoring target and need new or enhanced hooks. The project has no ESLint config file at all -- one must be created.

**Primary recommendation:** Tackle strict flags first (mechanical fixes, high confidence), then establish the service boundary enforcement (ESLint rules + barrel exports), then tackle the Zod validation + result type refactoring (most complex, benefits from clean types).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.6.3 | Static type checking with strict flags | Already installed; `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are mature features since TS 4.1 and 4.4 |
| Zod | 3.25.76 | Runtime schema validation | Already installed and used in `intake-service.ts`; Zod v3 is the stable production version |
| ESLint | ^8.57.1 | Linting and import restriction enforcement | Already installed; `no-restricted-imports` is a built-in ESLint rule (no plugin needed) |
| eslint-config-next | 14.2.15 | Next.js-specific ESLint rules | Already installed; provides base configuration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.90.20 | Async state management for hooks wrapping services | Already used throughout; new hooks should follow existing pattern |
| zustand | ^5.0.0 | Client state for settings | Already used; no changes needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESLint `no-restricted-imports` | eslint-plugin-boundaries | More powerful layer enforcement but adds a dependency; built-in rule is sufficient for this project's scale |
| Zod v3 | Zod v4 | v4 just released with performance improvements but is very new; v3 is already installed and stable |
| Manual type guards | Zod schemas for runtime validation | Zod provides both validation and TypeScript type inference; manual guards are error-prone |

**Installation:**
No new packages needed. ESLint, TypeScript, and Zod are all already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── db.ts              # Dexie database (ONLY imported by services and audit.ts)
│   ├── types.ts            # Re-exported types from db.ts for UI consumption (NEW)
│   ├── *-service.ts        # Service layer (imports db.ts, exports result types)
│   ├── audit.ts            # Audit logging (imports db.ts — allowed)
│   └── perplexity.ts       # AI client (calls API routes)
├── hooks/
│   ├── use-*-queries.ts    # React Query hooks (import from services, NOT db)
│   └── use-toast.ts        # Toast notifications for system errors
├── components/
│   └── **/*.tsx            # UI (imports from hooks and types only)
└── app/
    ├── api/                # API routes (Zod validation on request bodies)
    └── **/page.tsx         # Pages (imports from hooks and types only)
```

### Pattern 1: ServiceResult Type
**What:** Standardized result type for all service functions replacing throw-based error handling.
**When to use:** Every service function that can fail.
**Example:**
```typescript
// src/lib/service-result.ts (NEW)
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function err<T>(error: string, details?: unknown): ServiceResult<T> {
  return { success: false, error, details };
}
```

### Pattern 2: Zod Schema Co-location
**What:** Zod schemas defined next to the code that uses them, not in a central schemas directory.
**When to use:** At every external data boundary.
**Example:**
```typescript
// In src/app/api/ai/parse/route.ts
const ParseRequestSchema = z.object({
  input: z.string().min(1).max(500),
  clientApiKey: z.string().startsWith("pplx-").optional(),
});

// In src/lib/intake-service.ts (already partially exists)
const IntakeRecordSchema = z.object({
  type: z.enum(["water", "salt"]),
  amount: z.number().positive().max(100000),
  timestamp: z.number().positive(),
  source: z.string().optional(),
  note: z.string().max(200).optional(),
});
```

### Pattern 3: ESLint Import Boundary Enforcement
**What:** ESLint `no-restricted-imports` rule preventing components and pages from importing `db.ts` or service files directly.
**When to use:** `.eslintrc.json` at project root.
**Example:**
```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["@/lib/db"],
          "importNames": ["db"],
          "message": "Components must not import 'db' directly. Use hooks instead. Type imports are allowed via 'import type'."
        },
        {
          "group": ["@/lib/*-service", "@/lib/*-service.ts"],
          "message": "Components/pages must not import services directly. Use hooks in src/hooks/ instead."
        }
      ]
    }]
  },
  "overrides": [
    {
      "files": ["src/hooks/**/*", "src/lib/**/*"],
      "rules": {
        "no-restricted-imports": "off"
      }
    }
  ]
}
```

**Important discovery:** ESLint's `no-restricted-imports` has an `allowTypeImports: true` option in pattern groups. This lets components import types from `@/lib/db` while blocking value imports. However, re-exporting types through a `types.ts` barrel is cleaner and makes the boundary explicit.

### Pattern 4: Hook Wrapper for Service Boundary
**What:** React Query hooks that wrap service calls, providing the only path from UI to data.
**When to use:** For every service function that components currently call directly.
**Example:**
```typescript
// src/hooks/use-backup-queries.ts (NEW — needed for settings page)
export function useDownloadBackup() {
  return useMutation({
    mutationFn: () => downloadBackup(),
    onError: (error) => {
      toast({ variant: "destructive", description: "Backup failed" });
    },
  });
}
```

### Pattern 5: exactOptionalPropertyTypes Fix Pattern
**What:** When optional properties cannot receive explicit `undefined`, use conditional spread or omit undefined values.
**When to use:** Every place where `exactOptionalPropertyTypes` surfaces an error about `undefined` not being assignable.
**Example:**
```typescript
// BEFORE (errors with exactOptionalPropertyTypes):
const updates = { note: record.note }; // note is string | undefined

// AFTER — Option A: conditional spread
const updates = {
  ...(record.note !== undefined && { note: record.note }),
};

// AFTER — Option B: explicitly mark the target type
interface UpdateInput {
  note?: string | undefined;  // Add | undefined to allow it
}
```
The preferred fix depends on context. For Dexie update objects where the interface already defines `note?: string`, Option A (conditional spread) is correct because the interface intentionally distinguishes "not provided" from "set to undefined". For internal types where undefined is a valid value, Option B is correct.

### Anti-Patterns to Avoid
- **Barrel re-export sprawl:** Don't create index.ts files in every directory. A single `src/lib/types.ts` re-exporting DB types is sufficient.
- **Over-validating Dexie reads:** Don't validate every database read with Zod. Dexie data was validated on write; re-validating on read adds runtime cost with no benefit for a single-user local-only app. Validate on writes only.
- **Catch-all error toasts:** Don't show generic "Something went wrong" toasts. Include enough context for the user to know what failed (e.g., "Failed to save weight record").
- **Circular service imports:** `dose-log-service.ts` already imports from `medication-service.ts` and `medication-schedule-service.ts`. Don't create reverse dependencies. Dependency direction: `dose-log-service` → `medication-service` → `db`, never the reverse.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime type validation | Manual `typeof` checks and type guards | Zod `.safeParse()` | Zod provides type inference, detailed error paths, and composable schemas; manual guards miss edge cases |
| Import boundary enforcement | Code review / documentation | ESLint `no-restricted-imports` | Automated, fails CI, catches violations immediately |
| Result type pattern | Custom discriminated union per service | Shared `ServiceResult<T>` type with `ok()`/`err()` helpers | Consistency across all services, reduces boilerplate |
| API request validation | Manual field-by-field checks | Zod schema + `.safeParse()` | Already done manually in medicine-search route (60+ lines of typeof checks); Zod replaces this with ~15 lines |

**Key insight:** The medicine-search API route already does manual type validation of the Perplexity response (lines 158-174 of medicine-search/route.ts — checking `typeof parsed.brandNames === "string"` etc.). This is exactly what Zod schemas replace, with better error messages and type inference.

## Common Pitfalls

### Pitfall 1: exactOptionalPropertyTypes Cascade
**What goes wrong:** Enabling `exactOptionalPropertyTypes` causes errors in places where `value | undefined` is passed to an optional property. These cascade through function parameters, object spreads, and React component props.
**Why it happens:** TypeScript distinguishes between "property is absent" and "property is explicitly undefined" with this flag. Most code treats them as equivalent.
**How to avoid:** Fix at the source: either filter out undefined values before assignment, or add `| undefined` to the target type if undefined is a valid value. Do NOT suppress with `as any`.
**Warning signs:** Errors mentioning "Consider adding 'undefined' to the types of the target's properties" — there are 54 such messages in the current codebase.

### Pitfall 2: noUncheckedIndexedAccess in For Loops
**What goes wrong:** `for (let i = 0; i < arr.length; i++) { arr[i].doSomething() }` now errors because `arr[i]` is `T | undefined`.
**Why it happens:** TypeScript cannot prove that the index is in bounds even with the length check in a traditional for loop.
**How to avoid:** Use `for...of` loops (TypeScript narrows the element type), or add a null check inside the loop. The codebase has multiple indexed-access patterns in service files.
**Warning signs:** Error TS2532 "Object is possibly 'undefined'" on array element access.

### Pitfall 3: Service Result Migration Ordering
**What goes wrong:** Changing services to return `ServiceResult<T>` instead of throwing breaks all callers simultaneously. If hooks, components, and services are all changed at once, the entire app breaks until everything is updated.
**Why it happens:** The throw-based error pattern is deeply embedded. Hooks use `onError` callbacks that expect thrown errors. Components use try/catch.
**How to avoid:** Migrate one service at a time. Update the service function, then its hook(s), then verify. Don't batch all services together.
**Warning signs:** Runtime errors where `.data` is accessed on an `undefined` result.

### Pitfall 4: Type Imports Still Violating Boundaries
**What goes wrong:** Components import types from `@/lib/db` using `import type { IntakeRecord }`. ESLint's `no-restricted-imports` blocks these unless `allowTypeImports: true` is set.
**Why it happens:** 23 component files import types from db.ts. These are compile-time only and don't create runtime coupling, but they do create a knowledge dependency.
**How to avoid:** Two options: (1) use `allowTypeImports: true` in the ESLint pattern — pragmatic, types are erased at runtime; (2) re-export types from `src/lib/types.ts` and import from there — cleaner boundary. Recommendation: Option 1 for pragmatism, with a `src/lib/types.ts` as a nice-to-have for future clarity.
**Warning signs:** Dozens of lint errors on `import type` statements if not handled.

### Pitfall 5: debug-panel.tsx Direct DB Access
**What goes wrong:** The debug panel reads directly from `db` for diagnostics (table counts, raw records). Forcing it through hooks would add complexity for no user-facing benefit.
**Why it happens:** Debug panels need raw database access for diagnostics — that's their purpose.
**How to avoid:** Give `debug-panel.tsx` an explicit ESLint override exception. Document that this is intentional and limited to one file.
**Warning signs:** Trying to wrap every `db.*` call in the debug panel with hooks, creating 10+ single-use hooks.

### Pitfall 6: Audit Logging in Service Result Pattern
**What goes wrong:** Current audit logging calls `logAudit()` which imports from `audit.ts` which imports `db`. If audit logging is called from hooks (which shouldn't import db), the chain is broken.
**Why it happens:** Audit logging lives in the service layer and should stay there.
**How to avoid:** Keep `logAudit()` calls in service functions, not in hooks or components. The service result pattern doesn't change this — services still call `logAudit()` internally, and hooks just consume the result.
**Warning signs:** Moving `logAudit()` calls into hooks or components.

## Code Examples

### noUncheckedIndexedAccess Fix — Array Element Access
```typescript
// BEFORE — errors with noUncheckedIndexedAccess
const records = await getWeightRecords(1);
return records[0]; // Type is WeightRecord | undefined

// AFTER — explicit check
const records = await getWeightRecords(1);
const first = records[0];
if (!first) return undefined;
return first;

// Or with at() for clarity:
return records.at(0); // Already typed as T | undefined
```

### Service Result Pattern
```typescript
// src/lib/service-result.ts
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// In a service file:
export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string
): Promise<ServiceResult<WeightRecord>> {
  try {
    const record: WeightRecord = {
      id: generateId(),
      weight,
      timestamp: timestamp ?? Date.now(),
      ...(note !== undefined && { note }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      deviceId: getDeviceId(),
    };
    await db.weightRecords.add(record);
    return { success: true, data: record };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logAudit("validation_error", message);
    return { success: false, error: message };
  }
}

// In a hook:
export function useAddWeight() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: { weight: number; timestamp?: number; note?: string }) => {
      const result = await addWeightRecord(args.weight, args.timestamp, args.note);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight"] });
    },
    onError: (error) => {
      toast({ variant: "destructive", description: `Failed to save weight: ${error.message}` });
    },
  });
}
```

### Zod Validation at API Boundary
```typescript
// src/app/api/ai/parse/route.ts
import { z } from "zod";

const ParseRequestSchema = z.object({
  input: z.string().min(1, "Input is required").max(500, "Input too long"),
  clientApiKey: z.string().startsWith("pplx-").optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = ParseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { input, clientApiKey } = parsed.data;
  // ... rest of handler
}
```

### Zod for AI Response Validation
```typescript
// In the API route processing function
const AIParseResponseSchema = z.object({
  water: z.number().min(0).max(10000).nullable(),
  salt: z.number().min(0).max(50000).nullable(),
  reasoning: z.string().max(200).optional(),
});

// After parsing AI response JSON:
const validated = AIParseResponseSchema.safeParse(parsed);
if (!validated.success) {
  // Retry once
  // On second failure, return graceful fallback
  return NextResponse.json(
    { error: "AI response format invalid", fallbackToManual: true },
    { status: 422 }
  );
}
```

### ESLint Configuration for Import Boundaries
```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["@/lib/db"],
        "importNames": ["db"],
        "message": "UI code must not import 'db' directly. Import types via 'import type' or use hooks."
      }, {
        "group": ["@/lib/*-service"],
        "message": "UI code must not import services directly. Use hooks in src/hooks/."
      }]
    }]
  },
  "overrides": [
    {
      "files": ["src/hooks/**/*", "src/lib/**/*"],
      "rules": {
        "no-restricted-imports": "off"
      }
    },
    {
      "files": ["src/components/debug-panel.tsx"],
      "rules": {
        "no-restricted-imports": "off"
      }
    }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `strict: true` only | Adding `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | TS 4.1 (2020) / TS 4.4 (2021) | Catches null access bugs and optional property misuse at compile time |
| Manual type guards for API responses | Zod `.safeParse()` with inferred types | Zod v3 (2022-present) | Type-safe validation with automatic TypeScript type inference |
| Throw-based error handling in services | Result types (`{ success, data } | { success, error }`) | Ongoing community pattern | Explicit error handling, no uncaught exceptions, better composition |

**Deprecated/outdated:**
- `@ts-ignore` for type suppression: Use `@ts-expect-error` if absolutely necessary (none needed in this phase)
- Central `src/schemas/` directory: Co-located schemas are preferred per the Zod community and this project's decision

## Discretionary Recommendations

These are recommendations for the areas marked as "Claude's Discretion" in CONTEXT.md.

### Enforcement Mechanism: ESLint `no-restricted-imports` + `allowTypeImports`
**Recommendation:** Use ESLint's built-in `no-restricted-imports` rule (no new package needed). Allow type imports from `db.ts` via `allowTypeImports: true` on the db pattern. Block value imports from `db.ts` and all imports from `*-service.ts` in components/pages. Override for `src/hooks/**/*`, `src/lib/**/*`, and `src/components/debug-panel.tsx`. No barrel exports needed — type imports work fine and the pattern group approach is simpler. An `.eslintrc.json` file must be created (none exists).

### debug-panel.tsx Exception: Yes
**Recommendation:** Grant `debug-panel.tsx` an explicit ESLint override for direct DB access. It is a diagnostic tool that introspects database state — forcing it through hooks would create ~10 single-purpose hooks with no user benefit. Keep it as the single exception and document why.

### Service-to-Service Rules: Unidirectional Dependencies
**Recommendation:** Allow service-to-service imports but enforce unidirectional flow. Current dependency graph is already clean:
- `dose-log-service` → `medication-service`, `medication-schedule-service`
- `medication-notification-service` → `push-notification-service`, `medication-schedule-service`
- No reverse dependencies exist. No circular imports exist.
Don't add an ESLint rule for this — the existing pattern is good and a rule would be complex to configure. If cycles appear later, address then.

### Data Transformation Logic: Services
**Recommendation:** Data transformation (e.g., computing derived values, formatting for storage) lives in services. Hooks should be thin wrappers: call service, invalidate cache, show toast on error. Components handle only display formatting (date formatting, number rounding for display).

### Hook Creation Strategy: Consolidated Per Domain
**Recommendation:** Follow the existing pattern — one hook file per domain (`use-intake-queries.ts`, `use-health-queries.ts`, etc.). Add new exported hooks to existing files when possible. Create new hook files only for domains that don't have one yet (e.g., `use-backup-queries.ts` for backup/export operations). Avoid one-hook-per-component files.

### Dexie Validation: Writes Only
**Recommendation:** Validate on writes only (service functions that call `db.*.add()` or `db.*.put()`). Don't validate reads — the data was validated on write, and re-validating on every read adds runtime cost to a local-only single-user app with no external data mutation path.

### ServiceResult Design
**Recommendation:** Single generic type with `ok()` and `err()` factory functions:
```typescript
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };
```
The `details` field carries Zod error info for audit logging. Hooks check `result.success`, throw on failure (so React Query's `onError` catches it), and return `result.data` on success.

### Toast Specificity: Action + Entity
**Recommendation:** Toast messages should include what action failed and what entity was affected. Pattern: `"Failed to {verb} {entity}: {reason}"`. Examples: "Failed to save weight record: invalid value", "Failed to delete intake: record not found". Don't expose internal error details (stack traces, Dexie error codes) — just the human-readable reason.

## Open Questions

1. **Exact error count may shift**
   - What we know: 146 errors measured with both flags today
   - What's unclear: Some errors are cascading (fixing one file may resolve errors in others). Actual unique fixes may be fewer.
   - Recommendation: Plan for 146 but expect ~80-100 actual code changes.

2. **use-intake-queries.ts imports db directly**
   - What we know: `use-intake-queries.ts` imports `{ db }` from `@/lib/db` (line 5) and uses it directly for `fetchTotal()`, `fetchDailyTotal()`, `fetchRecords()`, `fetchRecentRecords()`. This violates the hooks-should-not-import-db rule.
   - What's unclear: Whether to move these fetch functions into `intake-service.ts` or keep them as "internal hook implementation" (since they're private functions inside the hook file).
   - Recommendation: Move the `db.*` calls into `intake-service.ts` as new service functions. The hook file should only import from services, matching the enforced boundary. The ESLint override for `src/hooks/**/*` would technically allow this, but the boundary is cleaner if hooks never touch db directly.

3. **use-graph-data.ts imports from services**
   - What we know: The graph data hook imports directly from 5 service files. This is currently within the ESLint override since it's in `src/hooks/`.
   - What's unclear: Whether this is fine (hooks are allowed to import services) or whether it should be refactored to use other hooks.
   - Recommendation: This is fine. Hooks importing from services is the intended pattern. No change needed.

4. **History page direct service imports**
   - What we know: `src/app/history/page.tsx` imports from 5 service files directly (intake-service, health-service, eating-service, urination-service, defecation-service). This is the largest page-level boundary violation.
   - What's unclear: Whether existing hooks already cover these functions or new hooks are needed.
   - Recommendation: Create the necessary hooks. The history page's `getRecordsByCursor`, `getWeightRecords`, `deleteWeightRecord`, etc. need hook wrappers.

## Codebase Inventory

### TypeScript Error Breakdown (both flags enabled)
| File | Errors | Primary Cause |
|------|--------|---------------|
| `src/app/history/page.tsx` | 24 | `exactOptionalPropertyTypes` — optional property assignments |
| `src/components/history-drawer.tsx` | 24 | `exactOptionalPropertyTypes` — optional property assignments |
| `src/lib/medication-service.ts` | 14 | `noUncheckedIndexedAccess` — array element access |
| `src/lib/intake-service.ts` | 13 | `noUncheckedIndexedAccess` — array element access |
| `src/components/medications/add-medication-wizard.tsx` | 12 | Mixed — indexed access + optional properties |
| `src/lib/medication-notification-service.ts` | 9 | `noUncheckedIndexedAccess` — array element access |
| Other 34 files | 1-5 each | Various |

### Import Boundary Violations (components/pages → db or services)
| Import Target | Files Importing | Type |
|---------------|----------------|------|
| `db` value from `@/lib/db` | 2 (debug-panel, daily-notes-drawer) | Value import — must refactor |
| Type imports from `@/lib/db` | 23 components, 2 pages | Type-only — allow via ESLint config |
| `*-service.ts` functions from components | 8 component files | Value import — must create hooks |
| `*-service.ts` functions from pages | 2 page files | Value import — must create hooks |
| `*-service.ts` types from components | 4 component files (DoseLogWithDetails) | Type-only — allow or re-export |

### Existing `any` Usage (must eliminate)
| File | Count | Context |
|------|-------|---------|
| `src/app/medications/page.tsx` | 1 | `handleEditInventory` callback parameter |
| `src/components/medications/inventory-item-view-drawer.tsx` | 1 | mutation `updates` parameter |
| `src/components/medications/status-view.tsx` | 1 | `RefillAlertCard` item prop |
| `src/components/medications/edit-medication-drawer.tsx` | 2 | `setType` cast + `PhaseCard` prop |
| `src/components/medications/add-medication-wizard.tsx` | 2 | catch clause + `existingPrescriptions` prop |
| `src/lib/db.ts` | 1 | Migration `record: any` (acceptable in migration) |
| `src/__tests__/` | 2 | Test files (acceptable) |

### API Routes Needing Zod Validation
| Route | Current Validation | Zod Needed For |
|-------|-------------------|----------------|
| `POST /api/ai/parse` | Manual `sanitizeInput` + `sanitizeNumber` | Request body, AI response JSON |
| `POST /api/ai/medicine-search` | Manual typeof checks on parsed response | Request body, AI response JSON |
| `GET /api/ai/status` | None (no input) | Not needed — no external input |
| `GET /api/version` | None (no input) | Not needed — no external input |

### Service-to-Service Dependencies (current, no cycles)
```
dose-log-service → medication-service, medication-schedule-service
medication-notification-service → push-notification-service, medication-schedule-service
All other services → db only (no cross-service imports)
```

## Sources

### Primary (HIGH confidence)
- TypeScript official docs (typescriptlang.org) — `noUncheckedIndexedAccess` (TS 4.1 release notes), `exactOptionalPropertyTypes` (TS 4.4 release notes)
- ESLint official docs (eslint.org) — `no-restricted-imports` rule with patterns, importNames, allowTypeImports
- Zod v3 official docs (v3.zod.dev) — safeParse, discriminated unions, type inference
- Direct codebase analysis — error counts, import graphs, file inventory

### Secondary (MEDIUM confidence)
- Context7 `/websites/typescriptlang` — confirmed compiler option behaviors
- Context7 `/websites/v3_zod_dev` — confirmed safeParse patterns and error handling
- Context7 `/websites/eslint` — confirmed no-restricted-imports pattern configuration

### Tertiary (LOW confidence)
- None — all findings verified against primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, no new dependencies
- Architecture: HIGH — patterns verified against codebase analysis, existing patterns followed
- Pitfalls: HIGH — error counts measured directly, import graphs traced from actual code
- Discretionary recommendations: MEDIUM — based on judgment and project conventions, not externally verified

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain — TypeScript strict flags and Zod v3 are mature)
