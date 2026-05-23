/**
 * Two-client conflict resolution: property-based verification of the
 * server's Last-Write-Wins rules.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.5): instead of asking "does this
 * one conflict scenario work?", we ask "what invariant must hold for
 * *every* pair of conflicting writes from two clients?"
 *
 * The invariants under test, drawn from the route's D-12 LWW rules:
 *
 *   I1 (deletion precedence):
 *     If either side has deletedAt != null AND its updatedAt is the
 *     latest (>=) of the two, the final row carries that tombstone.
 *     Existing-tombstone always wins via rule 1; incoming-tombstone
 *     wins on >= via the rule 2b tie-break.  Net effect: a stale
 *     edit can NEVER resurrect a deleted record, and a deletion
 *     request with timestamp >= the existing edit gets applied.
 *
 *   I2 (latest-wins on upsert):
 *     For two upserts with updatedAt = u_a, u_b where neither carries
 *     deletedAt, the final server row carries
 *       max(u_a, u_b)  if u_a != u_b
 *       the earlier-submitted row's data on a tie (strict `>`)
 *
 *   I3 (clock-skew clamp):
 *     A client claiming updatedAt > serverNow + 60s is clamped to
 *     serverNow + 60s.  No write can poison future writes for an hour.
 *
 *   I4 (order independence):
 *     The final server state after submitting {A then B} equals the
 *     final state after {B then A}, for any pair (A, B) that doesn't
 *     hit a strict tie.  Sync must be order-insensitive under the
 *     stronger ordering.
 *
 * Why this isn't a literal "two-client harness":
 *   The sync engine is a module-level singleton tied to a single Dexie
 *   instance, so running two engines in the same process would require
 *   refactoring src/lib/sync-engine.ts away from its `db` import.  But
 *   the *conflict-resolution decision* lives entirely in the server
 *   push route — so verifying the route's behaviour under arbitrary
 *   conflicting payloads catches the same class of bug at the same
 *   layer.  A literal two-client harness would re-test the same logic
 *   from a more expensive surface.
 *
 * Why fast-check instead of more examples:
 *   The existing sync-push-route.test.ts has hand-picked examples for
 *   each branch of the LWW logic.  This file generalises: any
 *   updatedAt, any order, any combination of deletedAt — does the
 *   invariant always hold?  fast-check shrinks on failure to the
 *   smallest violating case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────
// Mocked Drizzle — same shape as sync-push-route.test.ts, plus we record
// the final state per row so the property assertions can inspect it.
// ────────────────────────────────────────────────────────────────────────

interface ServerRow {
  id: string;
  userId: string;
  updatedAt: number;
  deletedAt: number | null;
  amount?: number;
  deviceId?: string;
  // any other intake fields the push may set
  [k: string]: unknown;
}

let existingRows: Record<string, ServerRow> = {};

function resetDbState() {
  existingRows = {};
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test" },
      });
  },
}));

vi.mock("@/lib/drizzle", () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(Object.values(existingRows)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: ServerRow) => ({
        onConflictDoUpdate: async ({ set }: { target: unknown; set: Partial<ServerRow> }) => {
          // Mirror Postgres' ON CONFLICT DO UPDATE: prefer `set` values
          // for fields the route explicitly listed, else the original
          // INSERT row.  In practice the route puts everything into
          // both — so merging is safe.
          existingRows[v.id] = { ...v, ...set };
          return undefined;
        },
        onConflictDoNothing: async () => undefined,
      }),
      // some routes use simple .values() without onConflict — no-op
    }),
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function makePushRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/sync/push", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface ClientOp {
  client: "A" | "B";
  amount: number;
  updatedAt: number;
  deletedAt: number | null;
}

function intakeRow(op: ClientOp): Record<string, unknown> {
  const base = 1_000_000_000;
  return {
    id: "shared-row",
    type: "water",
    amount: op.amount,
    timestamp: base,
    source: "manual",
    createdAt: base,
    updatedAt: op.updatedAt,
    deletedAt: op.deletedAt,
    deviceId: `dev-${op.client}`,
    timezone: "UTC",
  };
}

async function submit(POST: (req: NextRequest) => Promise<Response>, op: ClientOp, queueId: number): Promise<Response> {
  return POST(
    makePushRequest({
      ops: [
        {
          queueId,
          tableName: "intakeRecords",
          op: "upsert",
          row: intakeRow(op),
        },
      ],
    }),
  );
}

// ────────────────────────────────────────────────────────────────────────
// Arbitraries
// ────────────────────────────────────────────────────────────────────────

const BASE_TS = 2_000_000_000;

const clientOp = (label: "A" | "B") =>
  fc.record({
    client: fc.constant(label),
    amount: fc.integer({ min: 1, max: 5000 }),
    updatedAt: fc.integer({ min: BASE_TS, max: BASE_TS + 100_000 }),
    deletedAt: fc.option(fc.integer({ min: BASE_TS, max: BASE_TS + 100_000 }), {
      nil: null,
      freq: 4, // ~25% deletions, 75% upserts
    }),
  });

// ────────────────────────────────────────────────────────────────────────
// Properties
// ────────────────────────────────────────────────────────────────────────

describe("sync push route — two-client conflict invariants (property)", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("I1: a tombstone with updatedAt >= existing wins (deletion precedence)", async () => {
    const { POST } = await import("@/app/api/sync/push/route");

    // The first iteration of this invariant was narrower (strictly
    // higher). fast-check found a counter-example on a tie: an
    // arriving tombstone with the same updatedAt as the existing live
    // row was silently dropped (rule 3's strict `>` left no room for
    // tombstones at the boundary). That gap is now fixed in route.ts
    // by rule 2b (tombstone tie-break); this property widens back to
    // `>=` to lock in the corrected behaviour.
    await fc.assert(
      fc.asyncProperty(clientOp("A"), clientOp("B"), async (a, b) => {
        // Force one side to be the deletion, the other a plain upsert.
        // The tombstone's updatedAt must be >= the upsert's for the
        // invariant to apply (a stale tombstone still loses).
        const tombstone = { ...a, deletedAt: a.updatedAt };
        const upsert = { ...b, deletedAt: null };
        fc.pre(tombstone.updatedAt >= upsert.updatedAt);

        // Try both orders — invariant must hold regardless of arrival.
        // Order 1: upsert first, tombstone second
        resetDbState();
        await submit(POST, upsert, 1);
        await submit(POST, tombstone, 2);
        expect(existingRows["shared-row"]!.deletedAt).not.toBeNull();

        // Order 2: tombstone first, upsert second
        resetDbState();
        await submit(POST, tombstone, 1);
        await submit(POST, upsert, 2);
        expect(existingRows["shared-row"]!.deletedAt).not.toBeNull();
      }),
      { numRuns: 40 },
    );
  }, 30_000);

  it("I1-tie: an incoming tombstone wins against a live server row at the same updatedAt", async () => {
    // Regression guard for the route's rule 2b. The earlier version of
    // this test ("I1-asymmetry") locked in the *broken* behaviour
    // (tombstone silently dropped). After the route fix, the
    // assertion flips: tombstone now wins.
    const { POST } = await import("@/app/api/sync/push/route");

    resetDbState();
    // Step 1: client A writes an upsert at updatedAt = 5000
    await submit(
      POST,
      { client: "A", amount: 250, updatedAt: 5000, deletedAt: null },
      1,
    );
    expect(existingRows["shared-row"]).toBeDefined();
    expect(existingRows["shared-row"]!.deletedAt).toBeNull();

    // Step 2: client B deletes the same row at the same updatedAt.
    // Rule 2b fires: tombstone wins on tie.
    await submit(
      POST,
      { client: "B", amount: 250, updatedAt: 5000, deletedAt: 5000 },
      2,
    );

    expect(existingRows["shared-row"]!.deletedAt).toBe(5000);
  });

  it("I1-stale-tombstone: a tombstone with strictly older updatedAt still loses", async () => {
    // Make sure the rule 2b fix didn't accidentally let stale
    // tombstones overwrite newer edits.
    const { POST } = await import("@/app/api/sync/push/route");

    resetDbState();
    // Step 1: client A writes an upsert at updatedAt = 5000 (newer)
    await submit(
      POST,
      { client: "A", amount: 250, updatedAt: 5000, deletedAt: null },
      1,
    );

    // Step 2: client B submits a stale tombstone at updatedAt = 4000
    await submit(
      POST,
      { client: "B", amount: 250, updatedAt: 4000, deletedAt: 4000 },
      2,
    );

    // Stale tombstone does NOT overwrite — existing live row stays.
    expect(existingRows["shared-row"]!.deletedAt).toBeNull();
    expect(existingRows["shared-row"]!.updatedAt).toBe(5000);
  });

  it("I2: for non-tombstone pairs, the higher updatedAt wins (last-write-wins)", async () => {
    const { POST } = await import("@/app/api/sync/push/route");

    await fc.assert(
      fc.asyncProperty(clientOp("A"), clientOp("B"), async (rawA, rawB) => {
        resetDbState();

        // Restrict to the pure-upsert case: neither side carries a
        // tombstone (those are I1's territory).
        const a = { ...rawA, deletedAt: null };
        const b = { ...rawB, deletedAt: null };
        fc.pre(a.updatedAt !== b.updatedAt); // strict ordering only

        await submit(POST, a, 1);
        await submit(POST, b, 2);

        const final = existingRows["shared-row"];
        expect(final).toBeDefined();
        // Whichever op had the larger updatedAt determines the winner.
        const winner = a.updatedAt > b.updatedAt ? a : b;
        expect(final!.updatedAt).toBe(winner.updatedAt);
        expect(final!.amount).toBe(winner.amount);
        expect(final!.deviceId).toBe(`dev-${winner.client}`);
      }),
      { numRuns: 60 },
    );
  }, 30_000);

  it("I3: clock-skew clamp — a client claiming an updatedAt far in the future is clamped", async () => {
    const { POST } = await import("@/app/api/sync/push/route");

    // serverNow is observed from Date.now(); we fix it so the clamp
    // boundary is deterministic.
    const FIXED_NOW = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    try {
      // 24 hours in the future — well past the 60s MAX_FUTURE_MS clamp.
      const farFuture: ClientOp = {
        client: "A",
        amount: 250,
        updatedAt: FIXED_NOW + 24 * 60 * 60 * 1000,
        deletedAt: null,
      };

      await submit(POST, farFuture, 1);

      const final = existingRows["shared-row"];
      expect(final).toBeDefined();
      // The route MUST NOT have stored the raw far-future timestamp.
      // Anything ≤ FIXED_NOW + 60s is acceptable; the precise clamp
      // value lives in the route as MAX_FUTURE_MS = 60_000.
      expect(final!.updatedAt).toBeLessThanOrEqual(FIXED_NOW + 60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("I4: order-independence — {A then B} converges to the same row as {B then A}", async () => {
    const { POST } = await import("@/app/api/sync/push/route");

    await fc.assert(
      fc.asyncProperty(clientOp("A"), clientOp("B"), async (rawA, rawB) => {
        // Skip strict ties: with `updatedAt` equal, server keeps the
        // first-submitted row and order matters by design.
        const a = { ...rawA, deletedAt: null };
        const b = { ...rawB, deletedAt: null };
        fc.pre(a.updatedAt !== b.updatedAt);

        // Run A then B
        resetDbState();
        await submit(POST, a, 1);
        await submit(POST, b, 2);
        const finalAB = { ...existingRows["shared-row"] };

        // Run B then A
        resetDbState();
        await submit(POST, b, 1);
        await submit(POST, a, 2);
        const finalBA = { ...existingRows["shared-row"] };

        // Both orders must converge to the same final row state.
        // Compare the fields that the LWW logic touches.
        expect(finalAB.updatedAt).toBe(finalBA.updatedAt);
        expect(finalAB.amount).toBe(finalBA.amount);
        expect(finalAB.deviceId).toBe(finalBA.deviceId);
      }),
      { numRuns: 40 },
    );
  }, 30_000);
});
