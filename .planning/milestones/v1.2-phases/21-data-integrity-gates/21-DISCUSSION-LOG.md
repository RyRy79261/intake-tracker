# Phase 21: Data Integrity Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 21-data-integrity-gates
**Areas discussed:** Schema check approach, CI integration, Verification depth, Failure messages

---

## Schema Check Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Static analysis | Parse db.ts at test time, extract table names per version block, verify each version includes all prior tables. Fast, no Dexie runtime needed. | ✓ |
| Runtime verification | Open fake-indexeddb at each version, inspect actual object stores. Slower, depends on fake-indexeddb fidelity. | |
| Both layers | Static analysis + runtime smoke test of latest version. Belt and suspenders. | |

**User's choice:** Static analysis
**Notes:** Recommended approach — fast, no runtime dependencies, catches structural drift at parse time.

---

## CI Integration

### Job placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated job | New 'data-integrity' job in ci.yml alongside existing jobs. Clear failure isolation. Added to ci-pass gate. | ✓ |
| Extend test jobs | Add to existing test-tz-sa/test-tz-de jobs. Fewer CI minutes but muddies failure attribution. | |
| Conditional dedicated job | Dedicated job gated by paths-filter. Saves CI time but conflicts with DATA-05 requirement. | |

**User's choice:** Dedicated job
**Notes:** None.

### Trigger scope (DATA-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Always run | Integrity job runs every PR unconditionally. Simple, fast (~10-15s), DATA-05 satisfied by default. | ✓ |
| Path-filtered with override | Gated by paths-filter, db.ts changes force it. More complex config. | |
| You decide | Claude picks based on CI runtime trade-offs. | |

**User's choice:** Always run integrity job
**Notes:** Minimal cost (~15s) for maximum simplicity. No conditional logic needed.

---

## Verification Depth

### Backup round-trip depth (DATA-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Deep field equality | Export all 16 tables, import into fresh DB, compare every record field-by-field via JSON deep equal. | ✓ |
| Count + spot check | Verify record counts + deep-equal one sample record per table. | |
| Count only | Just verify record counts match. Simplest but weakest. | |

**User's choice:** Deep field equality
**Notes:** Catches nullified fields, type coercion, and missing optional properties. Existing round-trip.test.ts already has typed fixtures to extend.

### Table list source (DATA-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Parse from db.ts | Reuse schema consistency parser to extract table names. Compare against backup service and fixtures. Single source of truth. | ✓ |
| Hardcoded list | Maintain canonical TABLE_LIST constant. Requires manual updates — defeats the purpose. | |
| You decide | Claude picks the detection mechanism. | |

**User's choice:** Parse from db.ts
**Notes:** Reuses the DATA-04 parser. Three-way sync check: db.ts tables vs BackupData vs fixtures.

---

## Failure Messages

| Option | Description | Selected |
|--------|-------------|----------|
| Actionable remediation | Custom error messages naming the problem and exact fix steps. File, interface, and function to update. | ✓ |
| Standard assertions | Vitest built-in assertion diffs. Less hand-holding but standard. | |
| You decide | Claude picks per test type. | |

**User's choice:** Actionable remediation
**Notes:** Format: "✗ [Category]: [what's wrong] / Missing: [item] / Fix: [exact step]"

---

## Claude's Discretion

- Parser implementation details (regex vs AST vs line-based)
- Test file organization within `src/__tests__/integrity/`
- Whether to enhance existing round-trip.test.ts or create integrity-focused copy
- Exact Vitest assertion patterns for actionable messages

## Deferred Ideas

None — discussion stayed within phase scope.
