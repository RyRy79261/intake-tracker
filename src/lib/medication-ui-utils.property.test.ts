/**
 * Property-based tests for computeProgress() in medication-ui-utils.ts.
 *
 * Existing tests in medication-ui-utils.test.ts cover specific
 * scenarios (no slots, all taken, mixed). This file generalises: for
 * any DoseSlot array, what must always hold?
 *
 * Invariants under test:
 *
 *   P1  total === slots.length
 *
 *   P2  taken + skipped + pending === total
 *       (every slot is counted exactly once — no slot is dropped,
 *       no slot is double-counted)
 *
 *   P3  pct ∈ [0, 100]
 *
 *   P4  empty slots → pct === 0 and allDone === false
 *
 *   P5  allDone is true iff (total > 0 AND every slot has status
 *       "taken" or "skipped")
 *       — corollary: a single "pending" or "missed" slot forces
 *       allDone to be false
 *
 *   P6  pct is a rounded ratio: pct === round((taken + skipped) / total * 100)
 *       under the route's documented behaviour
 *
 * Why this matters: computeProgress drives the daily-progress UI on
 * the medications page. A regression that off-by-ones the count
 * silently misrepresents how many doses the user has taken — a real
 * health-safety bug class.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeProgress } from "@/lib/medication-ui-utils";
import type { DoseSlot, DoseSlotStatus } from "@/lib/dose-schedule-service";

// computeProgress only reads slot.status, so we build a minimal
// DoseSlot stub. Casting via `as unknown as DoseSlot` keeps the test
// focused on the function-under-test rather than wide fixture
// construction.
function makeSlot(status: DoseSlotStatus): DoseSlot {
  return { status } as unknown as DoseSlot;
}

const statusArb = fc.constantFrom<DoseSlotStatus>(
  "taken",
  "skipped",
  "pending",
  "missed",
);

const slotsArb = fc.array(statusArb, { minLength: 0, maxLength: 50 }).map(
  (statuses) => statuses.map(makeSlot),
);

describe("computeProgress — property invariants", () => {
  it("P1: total always equals the input array length", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        expect(computeProgress(slots).total).toBe(slots.length);
      }),
      { numRuns: 100 },
    );
  });

  it("P2: taken + skipped + pending always equals total (every slot counted once)", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        const p = computeProgress(slots);
        expect(p.taken + p.skipped + p.pending).toBe(p.total);
      }),
      { numRuns: 100 },
    );
  });

  it("P3: pct is always in [0, 100]", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        const { pct } = computeProgress(slots);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("P4: empty slot array yields pct=0 and allDone=false", () => {
    const result = computeProgress([]);
    expect(result.total).toBe(0);
    expect(result.taken).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.allDone).toBe(false);
  });

  it("P5: allDone iff (total > 0 AND no slot is pending or missed)", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        const result = computeProgress(slots);
        const isHandled = (s: DoseSlot) =>
          s.status === "taken" || s.status === "skipped";
        const expectedAllDone =
          slots.length > 0 && slots.every(isHandled);
        expect(result.allDone).toBe(expectedAllDone);
      }),
      { numRuns: 100 },
    );
  });

  it("P6: pct equals round((taken + skipped) / total * 100) when total > 0", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        fc.pre(slots.length > 0);
        const p = computeProgress(slots);
        const expected = Math.round(((p.taken + p.skipped) / p.total) * 100);
        expect(p.pct).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("idempotence-under-permutation: order of slots doesn't change the result", () => {
    // computeProgress sums status counts, so it must be invariant
    // under permutation. A regression that uses index-sensitive logic
    // (e.g., looking at adjacent slots) would fail this.
    fc.assert(
      fc.property(slotsArb, (slots) => {
        const original = computeProgress(slots);
        // Reverse and assert equality
        const reversed = computeProgress([...slots].reverse());
        expect(reversed).toEqual(original);
      }),
      { numRuns: 60 },
    );
  });
});
