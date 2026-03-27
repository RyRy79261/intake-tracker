# Phase 2: TypeScript and Service Contracts - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in tsconfig, fix all surfaced type errors, enforce strict service layer boundaries so UI never imports `db.ts` or services directly, and add Zod validation at all external data entry points. No new features — this is a code quality and architecture phase.

</domain>

<decisions>
## Implementation Decisions

### Strict Flag Rollout
- Enable both `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` at once — only 2 trivial errors exist across the entire codebase
- Fix errors properly with real null checks and type fixes, no suppressions

### Service Boundary Enforcement
- Strict layering enforced: components → hooks → services → db (no shortcuts, no exceptions)
- All 27 components importing `db.ts` and 12 importing `*-service.ts` must be refactored to go through hooks
- Missing hooks should be created as needed during refactoring

### Zod Validation Scope
- Validate at three boundaries: API routes, AI response parsing (Perplexity), and user form inputs
- Separate schemas for forms (UI concerns — error messages, field labels) vs services (data integrity — types, ranges)
- Schemas co-located with their respective files, not a central `src/schemas/` directory
- AI response failures: retry once, then graceful fallback to manual entry
- Review existing Zod usage in `intake-service.ts` first — establish ideal pattern before rolling out

### Error Handling Style
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

</decisions>

<specifics>
## Specific Ideas

- Error scoping principle: "errors bubble up to the UI layer that matches their origin" — component-level problems show inline, system-level problems show as toasts
- The user trusts Claude with high implementation authority on all discretionary items — make pragmatic choices, don't over-engineer

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/use-toast.ts`: Existing toast system for system-scoped error display
- `src/hooks/use-*-queries.ts`: ~15 hook files already wrapping many service calls with React Query
- `src/lib/audit.ts`: Existing audit logging infrastructure for validation failure tracking
- `src/components/debug-panel.tsx`: Debug panel for viewing audit logs
- `src/lib/intake-service.ts`: Only file currently using Zod — reference pattern to audit and improve

### Established Patterns
- `strict: true` already enabled in tsconfig — the two new flags are additive, minimal breakage
- React Query `onError` used in hooks for error handling — will need migration to result type pattern
- Service files follow `{domain}-service.ts` naming in `src/lib/`
- Hook files follow `use-{domain}-queries.ts` naming in `src/hooks/`

### Integration Points
- `tsconfig.json`: Two flags to add
- `playwright.config.ts`: 1 error to fix (workers type)
- `src/components/medications/add-medication-wizard.tsx`: 1 error to fix (array index access)
- 27 component files importing `db.ts` → need hook wrappers
- 12 component files importing `*-service.ts` → need hook wrappers
- 4 API routes with no input validation → need Zod schemas
- `src/lib/perplexity.ts`: AI response parsing needs Zod validation

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-typescript-and-service-contracts*
*Context gathered: 2026-03-03*
