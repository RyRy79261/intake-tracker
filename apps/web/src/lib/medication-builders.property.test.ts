/**
 * Property-based tests for the medication-builders pure functions.
 *
 * Each `build*` function maps a flat input record + `now` to a fully-
 * formed Dexie row. The functions are pure modulo
 * `crypto.randomUUID()` and `syncFields()` (which reads deviceId from
 * settings) — both of which are well-mocked / globally available in
 * the test environment.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.3): these builders are textbook
 * fast-check targets — for ANY input matching the documented contract,
 * does the output meet its invariants? The existing test suite covers
 * scenarios in medication-service.test.ts and the route layer, but
 * doesn't pin the builder-level invariants in isolation.
 *
 * Invariants:
 *
 *   B-1  ids are always defined non-empty strings (uniqueness across
 *        calls is implicit in crypto.randomUUID; we don't re-test that).
 *   B-2  createdAt === updatedAt === now for any freshly-built row.
 *   B-3  deletedAt === null on every fresh build.
 *   B-4  Optional input fields appear in the output iff they were
 *        supplied (defensive against the spread-with-undefined pattern
 *        the builders use).
 *   B-5  buildPhase defaults: type="maintenance", status="active",
 *        startDate=now — applied iff input field is undefined.
 *   B-6  buildSchedules preserves array length and per-element fields
 *        (daysOfWeek, dosage, time).
 *   B-7  buildSchedules.scheduleTimeUTC === localHHMMStringToUTCMinutes(
 *        time, deviceTimezone) — pins the cross-module wiring.
 *
 * Why this matters: the medication wizard composes these builders to
 * write a coherent record graph. A regression that drops the
 * createdAt/updatedAt parity, or that loses a compounds array on a
 * combo drug, propagates silently into a broken prescription on the
 * medications page.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildPrescription,
  buildPhase,
  buildInventory,
  buildSchedules,
  buildTransaction,
} from "@/lib/medication-builders";
import {
  localHHMMStringToUTCMinutes,
  getDeviceTimezone,
} from "@/lib/timezone";

// ─────────────────────────────────────────────────────────────────────────
// Common arbitraries
// ─────────────────────────────────────────────────────────────────────────

const nonEmptyString = fc.string({ minLength: 1, maxLength: 80 });
const timestamp = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
const stringArray = fc.array(nonEmptyString, { maxLength: 5 });
const compounds = fc.array(
  fc.record({ name: nonEmptyString, strength: fc.integer({ min: 0, max: 5000 }) }),
  { maxLength: 4 },
);

/**
 * Strip undefined-valued keys so the input shape exactly matches the
 * builder's optional-property signature under
 * `exactOptionalPropertyTypes: true`. fast-check's `fc.option(...,
 * { nil: undefined })` produces `{ key: undefined }` rather than
 * omitting the key, so we filter here.
 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// HH:MM strings only — the contract documented in timezone.ts.
const hhmm = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) =>
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );

// ─────────────────────────────────────────────────────────────────────────
// buildPrescription
// ─────────────────────────────────────────────────────────────────────────

describe("buildPrescription — property invariants", () => {
  it("B-1, B-2, B-3: id is a non-empty string, timestamps equal now, deletedAt is null", () => {
    fc.assert(
      fc.property(
        fc.record({ genericName: nonEmptyString, indication: nonEmptyString }),
        timestamp,
        (input, now) => {
          const p = buildPrescription(input, now);
          expect(typeof p.id).toBe("string");
          expect(p.id.length).toBeGreaterThan(0);
          expect(p.createdAt).toBe(now);
          expect(p.updatedAt).toBe(now);
          expect(p.deletedAt).toBeNull();
          expect(p.isActive).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("B-4: optional fields appear iff supplied (notes / contraindications / warnings)", () => {
    fc.assert(
      fc.property(
        fc.record({
          genericName: nonEmptyString,
          indication: nonEmptyString,
          notes: fc.option(nonEmptyString, { nil: undefined }),
          contraindications: fc.option(stringArray, { nil: undefined }),
          warnings: fc.option(stringArray, { nil: undefined }),
        }),
        timestamp,
        (input, now) => {
          const p = buildPrescription(
            omitUndefined(input) as Parameters<typeof buildPrescription>[0],
            now,
          );
          // Notes
          if (input.notes === undefined) {
            expect("notes" in p).toBe(false);
          } else {
            expect(p.notes).toBe(input.notes);
          }
          // Contraindications
          if (input.contraindications === undefined) {
            expect("contraindications" in p).toBe(false);
          } else {
            expect(p.contraindications).toEqual(input.contraindications);
          }
          // Warnings
          if (input.warnings === undefined) {
            expect("warnings" in p).toBe(false);
          } else {
            expect(p.warnings).toEqual(input.warnings);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it("compounds appears iff supplied AND non-empty (combo drug shape)", () => {
    fc.assert(
      fc.property(
        fc.record({
          genericName: nonEmptyString,
          indication: nonEmptyString,
          compounds: fc.option(compounds, { nil: undefined }),
        }),
        timestamp,
        (input, now) => {
          const p = buildPrescription(
            omitUndefined(input) as Parameters<typeof buildPrescription>[0],
            now,
          );
          if (input.compounds === undefined || input.compounds.length === 0) {
            expect("compounds" in p).toBe(false);
          } else {
            expect(p.compounds).toEqual(input.compounds);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildPhase
// ─────────────────────────────────────────────────────────────────────────

describe("buildPhase — property invariants", () => {
  const minimalInput = fc.record({
    unit: nonEmptyString,
    foodInstruction: fc.constantFrom("before" as const, "after" as const, "none" as const),
  });

  it("B-5: type defaults to 'maintenance' and status defaults to 'active' when omitted", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInput,
        timestamp,
        (prescriptionId, input, now) => {
          const ph = buildPhase(prescriptionId, input, now);
          expect(ph.type).toBe("maintenance");
          expect(ph.status).toBe("active");
        },
      ),
      { numRuns: 30 },
    );
  });

  it("B-5: explicit type / status override the defaults", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInput,
        fc.constantFrom("maintenance" as const, "titration" as const),
        fc.constantFrom("active" as const, "pending" as const),
        timestamp,
        (prescriptionId, input, type, status, now) => {
          const ph = buildPhase(prescriptionId, { ...input, type, status }, now);
          expect(ph.type).toBe(type);
          expect(ph.status).toBe(status);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("B-5: startDate defaults to now when omitted, equals explicit value when supplied", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInput,
        timestamp,
        fc.option(timestamp, { nil: undefined }),
        (prescriptionId, input, now, explicitStart) => {
          const ph = buildPhase(
            prescriptionId,
            omitUndefined({ ...input, startDate: explicitStart }) as Parameters<typeof buildPhase>[1],
            now,
          );
          expect(ph.startDate).toBe(explicitStart ?? now);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("prescriptionId is preserved verbatim onto the phase", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInput,
        timestamp,
        (prescriptionId, input, now) => {
          const ph = buildPhase(prescriptionId, input, now);
          expect(ph.prescriptionId).toBe(prescriptionId);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildSchedules
// ─────────────────────────────────────────────────────────────────────────

describe("buildSchedules — property invariants", () => {
  const scheduleEntry = fc.record({
    time: hhmm,
    daysOfWeek: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), {
      minLength: 1,
      maxLength: 7,
    }),
    dosage: fc.integer({ min: 1, max: 5000 }),
  });
  const scheduleList = fc.array(scheduleEntry, { minLength: 0, maxLength: 7 });

  it("B-6: output length matches input length; per-element fields preserved", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        scheduleList,
        timestamp,
        (phaseId, schedules, now) => {
          const out = buildSchedules(phaseId, schedules, now);
          expect(out).toHaveLength(schedules.length);
          for (let i = 0; i < schedules.length; i++) {
            const src = schedules[i]!;
            const dst = out[i]!;
            expect(dst.phaseId).toBe(phaseId);
            expect(dst.time).toBe(src.time);
            expect(dst.daysOfWeek).toEqual(src.daysOfWeek);
            expect(dst.dosage).toBe(src.dosage);
            expect(dst.enabled).toBe(true);
            expect(dst.createdAt).toBe(now);
            expect(dst.updatedAt).toBe(now);
            expect(dst.deletedAt).toBeNull();
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("B-7: scheduleTimeUTC matches localHHMMStringToUTCMinutes(time, deviceTimezone)", () => {
    // Pins the cross-module wiring — a regression that uses the wrong
    // timezone source (e.g. a stale cached zone, or UTC where local
    // was meant) would shift dose times by hours.
    fc.assert(
      fc.property(nonEmptyString, scheduleEntry, timestamp, (phaseId, s, now) => {
        const [out] = buildSchedules(phaseId, [s], now);
        const expectedUTC = localHHMMStringToUTCMinutes(s.time, getDeviceTimezone());
        expect(out!.scheduleTimeUTC).toBe(expectedUTC);
        expect(out!.anchorTimezone).toBe(getDeviceTimezone());
      }),
      { numRuns: 30 },
    );
  });

  it("each output row gets a unique id (basic UUID uniqueness check)", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        fc.array(scheduleEntry, { minLength: 2, maxLength: 7 }),
        timestamp,
        (phaseId, schedules, now) => {
          const out = buildSchedules(phaseId, schedules, now);
          const ids = new Set(out.map((s) => s.id));
          expect(ids.size).toBe(out.length);
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildInventory
// ─────────────────────────────────────────────────────────────────────────

describe("buildInventory — property invariants", () => {
  const minimalInventory = fc.record({
    brandName: nonEmptyString,
    currentStock: fc.integer({ min: 0, max: 10_000 }),
    strength: fc.integer({ min: 1, max: 5000 }),
    unit: nonEmptyString,
    pillShape: fc.constantFrom(
      "round" as const,
      "oval" as const,
      "capsule" as const,
      "diamond" as const,
      "tablet" as const,
    ),
    pillColor: nonEmptyString,
  });

  it("B-1, B-2, B-3: id, timestamps, deletedAt, isActive", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInventory,
        timestamp,
        (prescriptionId, input, now) => {
          const inv = buildInventory(prescriptionId, input, now);
          expect(typeof inv.id).toBe("string");
          expect(inv.id.length).toBeGreaterThan(0);
          expect(inv.createdAt).toBe(now);
          expect(inv.updatedAt).toBe(now);
          expect(inv.deletedAt).toBeNull();
          expect(inv.isActive).toBe(true);
          expect(inv.prescriptionId).toBe(prescriptionId);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("required fields are copied verbatim onto the inventory row", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        minimalInventory,
        timestamp,
        (prescriptionId, input, now) => {
          const inv = buildInventory(prescriptionId, input, now);
          expect(inv.brandName).toBe(input.brandName);
          expect(inv.currentStock).toBe(input.currentStock);
          expect(inv.strength).toBe(input.strength);
          expect(inv.unit).toBe(input.unit);
          expect(inv.pillShape).toBe(input.pillShape);
          expect(inv.pillColor).toBe(input.pillColor);
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildTransaction
// ─────────────────────────────────────────────────────────────────────────

describe("buildTransaction — property invariants", () => {
  const txType = fc.constantFrom(
    "refill" as const,
    "consumed" as const,
    "adjusted" as const,
    "initial" as const,
  );

  it("amount + type + timestamp are preserved; createdAt/updatedAt/timestamp all equal now", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        fc.integer({ min: -1000, max: 1000 }),
        txType,
        timestamp,
        fc.option(nonEmptyString, { nil: undefined }),
        (inventoryItemId, amount, type, now, note) => {
          const tx = buildTransaction(inventoryItemId, amount, type, now, note);
          expect(tx.inventoryItemId).toBe(inventoryItemId);
          expect(tx.amount).toBe(amount);
          expect(tx.type).toBe(type);
          expect(tx.timestamp).toBe(now);
          expect(tx.createdAt).toBe(now);
          expect(tx.updatedAt).toBe(now);
          expect(tx.deletedAt).toBeNull();
          if (note === undefined) {
            expect("note" in tx).toBe(false);
          } else {
            expect(tx.note).toBe(note);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
