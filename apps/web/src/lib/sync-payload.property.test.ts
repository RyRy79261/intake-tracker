/**
 * Property-based tests for the push + pull body schemas.
 *
 * These schemas are the SECURITY BOUNDARY between client requests and
 * the sync routes. Every push and every pull is validated against them
 * before the route runs a single SQL statement. A regression that
 * accidentally widens the schema (e.g. allows a missing tableName, or
 * a negative cursor, or an oversized id) means the server hits the DB
 * with attacker-controlled values.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.3): pure schema validation is
 * a textbook property-test target — generate arbitrary garbage, assert
 * `.safeParse(...).success` matches the documented contract.
 *
 * Invariants under test:
 *
 *   PUSH-1  Any well-formed op array of size ≤500 with a known table
 *           name and valid row parses successfully.
 *   PUSH-2  Batch size > 500 always rejects (DoS guard).
 *   PUSH-3  Unknown tableName always rejects.
 *   PUSH-4  Invalid op type (not "upsert" / "delete") always rejects.
 *   PUSH-5  Non-integer queueId always rejects.
 *
 *   PULL-1  Any well-formed cursors record (subset of known table
 *           names, valid cursors) parses successfully.
 *   PULL-2  Unknown tableName keys reject (T-43-04-05 cursor
 *           injection guard).
 *   PULL-3  Negative cursor.updatedAt always rejects.
 *   PULL-4  Cursor.id longer than 200 chars always rejects (query
 *           bloat DoS guard).
 *   PULL-5  Both legacy bare-number and new keyset cursor forms
 *           parse successfully.
 *
 * Mocks: this file only validates the schemas — no route, no DB. Pure
 * unit tests over the Zod schemas exported from sync-payload.ts.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { pushBodySchema, pullBodySchema } from "@intake/db/sync-payload";

// ─────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────

const KNOWN_TABLES = [
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "inventoryItems",
  "inventoryTransactions",
  "doseLogs",
  "dailyNotes",
  "auditLogs",
  "substanceRecords",
  "titrationPlans",
  "userProfile",
] as const;

// Minimal valid row shape for the intakeRecords table — used as the
// "happy path" payload across PUSH-1 etc. The discriminated union in
// opSchema branches on tableName, so we exercise the broadest table
// and trust the others share the createInsertSchema shape.
function validIntakeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "row-fc-1",
    type: "water",
    amount: 250,
    timestamp: 1_000_000_000,
    createdAt: 1_000_000_000,
    updatedAt: 1_000_000_000,
    deletedAt: null,
    deviceId: "dev-fc",
    timezone: "UTC",
    ...overrides,
  };
}

// Build a single valid op with the given queueId. Returns a literal
// payload (not an arbitrary) for shape-level assertions.
function validOp(queueId: number, table: typeof KNOWN_TABLES[number] = "intakeRecords"): unknown {
  return {
    queueId,
    op: "upsert",
    tableName: table,
    row: validIntakeRow(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PUSH schema
// ─────────────────────────────────────────────────────────────────────────

describe("pushBodySchema — property invariants", () => {
  it("PUSH-1: well-formed batches of size [0, 500] always parse", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (n) => {
        const ops = Array.from({ length: n }, (_, i) => validOp(i + 1));
        const result = pushBodySchema.safeParse({ ops });
        expect(result.success).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("PUSH-2: any batch size > 500 always rejects", () => {
    fc.assert(
      fc.property(fc.integer({ min: 501, max: 2000 }), (n) => {
        const ops = Array.from({ length: n }, (_, i) => validOp(i + 1));
        const result = pushBodySchema.safeParse({ ops });
        expect(result.success).toBe(false);
      }),
      { numRuns: 15 },
    );
  });

  it("PUSH-3: any unknown tableName always rejects", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 40 })
          // Filter out any string that happens to match a real table
          .filter((s) => !KNOWN_TABLES.includes(s as never)),
        (badTable) => {
          const op = {
            queueId: 1,
            op: "upsert",
            tableName: badTable,
            row: validIntakeRow(),
          };
          const result = pushBodySchema.safeParse({ ops: [op] });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("PUSH-4: any op type other than 'upsert'/'delete' always rejects", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s !== "upsert" && s !== "delete"),
        (badOp) => {
          const op = {
            queueId: 1,
            op: badOp,
            tableName: "intakeRecords",
            row: validIntakeRow(),
          };
          const result = pushBodySchema.safeParse({ ops: [op] });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("PUSH-5: non-integer queueId always rejects (floats, strings, NaN)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.float({ noNaN: false }).filter((f) => !Number.isInteger(f)),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.constantFrom(null, undefined, true, false, {}, []),
        ),
        (badQueueId) => {
          const op = {
            queueId: badQueueId,
            op: "upsert",
            tableName: "intakeRecords",
            row: validIntakeRow(),
          };
          const result = pushBodySchema.safeParse({ ops: [op] });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("PUSH-1b: delete ops with a tombstone row also parse", () => {
    // Round-out of PUSH-1 — verifies the discriminated union accepts
    // both op types for a known table.
    const result = pushBodySchema.safeParse({
      ops: [
        {
          queueId: 1,
          op: "delete",
          tableName: "intakeRecords",
          row: validIntakeRow({ deletedAt: 1_000_000_000 }),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("PUSH-6: userId in the incoming row is always stripped from the parsed result (security boundary)", () => {
    // Defence-in-depth: every per-table row schema is built with
    // `.omit({ userId: true })` so a malicious client can't claim to
    // be another user via the request body. The push route itself
    // also strips + restamps userId server-side, but the schema is
    // the FIRST layer of that defence.
    //
    // Stryker round 1 found that mutating `.omit({ userId: true })` to
    // `.omit({})` (or `.omit({ userId: false })`) survived every
    // existing test — none asserted on the absence of userId in the
    // parsed output. This property closes that gap.
    fc.assert(
      fc.property(
        // Try a few tables — intakeRecords is the most commonly
        // written; weightRecords + bloodPressureRecords exercise the
        // discriminated union's other arms.
        fc.constantFrom(
          "intakeRecords",
          "weightRecords",
          "bloodPressureRecords",
        ),
        fc.string({ minLength: 1, maxLength: 40 }),
        (tableName, evilUserId) => {
          const validRow = (() => {
            const base = validIntakeRow();
            switch (tableName) {
              case "intakeRecords":
                return base;
              case "weightRecords":
                return {
                  id: "w-1",
                  weight: 75,
                  timestamp: base.timestamp,
                  createdAt: base.createdAt,
                  updatedAt: base.updatedAt,
                  deletedAt: null,
                  deviceId: "dev-fc",
                };
              case "bloodPressureRecords":
                return {
                  id: "bp-1",
                  systolic: 120,
                  diastolic: 80,
                  heartRate: 70,
                  irregularHeartbeat: false,
                  position: "sitting",
                  arm: "left",
                  timestamp: base.timestamp,
                  createdAt: base.createdAt,
                  updatedAt: base.updatedAt,
                  deletedAt: null,
                  deviceId: "dev-fc",
                };
            }
          })();
          const op = {
            queueId: 1,
            op: "upsert",
            tableName,
            // Client sneaks in a userId — the schema must drop it.
            row: { ...validRow, userId: evilUserId },
          };

          const result = pushBodySchema.safeParse({ ops: [op] });
          // Either the parse succeeds (with userId stripped) or it
          // rejects entirely. Both are acceptable security outcomes.
          // The unacceptable case is: success AND parsed.data.ops[0]
          // .row.userId === evilUserId.
          if (result.success) {
            const parsed = result.data.ops[0]!.row as Record<string, unknown>;
            expect(parsed.userId).toBeUndefined();
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PULL schema
// ─────────────────────────────────────────────────────────────────────────

describe("pullBodySchema — property invariants", () => {
  // Arbitraries for cursors — both legacy number form and new keyset form.
  const cursorArb = fc.oneof(
    // Legacy: bare integer ≥ 0
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    // Keyset: { updatedAt, id }
    fc.record({
      updatedAt: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      id: fc.string({ minLength: 0, maxLength: 200 }),
    }),
  );

  it("PULL-1: any subset of known tables with valid cursors parses", () => {
    fc.assert(
      fc.property(
        // Use a single arbitrary that emits a fully-formed valid cursors
        // map — letting fast-check shrink the whole map, not just the
        // table list. Earlier iteration used an async predicate with
        // fc.property which is a misuse pattern (silent assertion drop);
        // this synchronous version is correct.
        fc.dictionary(
          fc.constantFrom(...KNOWN_TABLES),
          cursorArb,
          { minKeys: 0, maxKeys: KNOWN_TABLES.length },
        ),
        (cursors) => {
          const result = pullBodySchema.safeParse({ cursors });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("PULL-2: unknown tableName keys always reject (cursor injection guard)", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter((s) => !KNOWN_TABLES.includes(s as never)),
        (badTable) => {
          const cursors = { [badTable]: 0 };
          const result = pullBodySchema.safeParse({ cursors });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("PULL-2 (regression): prototype-shaped keys (__proto__, constructor) always reject", () => {
    // Deterministic guard for the two keys most likely to slip past
    // Zod's `partialRecord` enum check. fast-check's random-string
    // generator may not pick exactly these in 40 runs, so we pin
    // them explicitly. Either form (own-property via computed key,
    // or JSON-decoded body) must reject.
    for (const proto of ["__proto__", "constructor", "prototype"] as const) {
      expect(
        pullBodySchema.safeParse({ cursors: { [proto]: 0 } }).success,
        `expected ${proto} key to be rejected as an unknown table`,
      ).toBe(false);
    }
  });

  it("PULL-3: negative cursor.updatedAt always rejects", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
        fc.constantFrom(...KNOWN_TABLES),
        (negativeTs, table) => {
          // Both forms (bare number and keyset object) should reject.
          const bareResult = pullBodySchema.safeParse({
            cursors: { [table]: negativeTs },
          });
          expect(bareResult.success).toBe(false);

          const keysetResult = pullBodySchema.safeParse({
            cursors: { [table]: { updatedAt: negativeTs, id: "" } },
          });
          expect(keysetResult.success).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("PULL-4: cursor.id longer than 200 chars always rejects (query DoS guard)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 201, max: 5000 }),
        fc.constantFrom(...KNOWN_TABLES),
        (length, table) => {
          const tooLong = "x".repeat(length);
          const result = pullBodySchema.safeParse({
            cursors: { [table]: { updatedAt: 0, id: tooLong } },
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("PULL-5: legacy bare-number cursor and new keyset cursor both parse", () => {
    // The route's docstring guarantees both forms are accepted for
    // backwards-compatibility with cached service workers.
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_TABLES),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (table, ts) => {
          expect(pullBodySchema.safeParse({ cursors: { [table]: ts } }).success).toBe(true);
          expect(
            pullBodySchema.safeParse({
              cursors: { [table]: { updatedAt: ts, id: "anchor" } },
            }).success,
          ).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("PULL-6: empty cursors object parses (full pull for every table)", () => {
    // The docstring promises a missing tableName key means cursor=0
    // for that table. The empty case is the limit of that promise.
    const result = pullBodySchema.safeParse({ cursors: {} });
    expect(result.success).toBe(true);
  });
});
