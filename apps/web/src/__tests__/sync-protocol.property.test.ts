/**
 * The sync protocol (lib/sync-protocol.ts), property-tested as pure
 * functions. Replaces the route-level property test that drove the push
 * route through hand-rolled drizzle mocks: the rules now live here, and the
 * route only carries out their decisions.
 *
 * Server invariants (D-12):
 *   I1 a tombstone at least as new as the server row wins; a live write never
 *      resurrects a tombstone it does not beat;
 *   I2 between two live writes, the strictly newer one wins;
 *   I3 a client clock far ahead is clamped to serverNow + MAX_FUTURE_MS;
 *   I4 two writes with different updatedAt end the same in either order.
 * Agreement:
 *   P1 after a push and a pull, the device holds what the server holds.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MAX_FUTURE_MS,
  resolvePull,
  resolvePush,
  resolveTombstone,
  type SyncRow,
} from "@/lib/sync-protocol";

type Row = SyncRow & { updatedAt: number; amount: number };

const SERVER_NOW = 2_000_000_000_000;

const rowArb: fc.Arbitrary<Row> = fc.record({
  id: fc.constant("r1"),
  amount: fc.integer({ min: 1, max: 5000 }),
  updatedAt: fc.integer({ min: SERVER_NOW - 10_000, max: SERVER_NOW + 10_000 }),
  deletedAt: fc.option(fc.integer({ min: 1, max: SERVER_NOW }), { nil: null }),
});

/** The server's row after one push (what the route would store). */
function push(server: Row | undefined, incoming: Row, tableName = "intakeRecords"): Row {
  const d = resolvePush({ tableName, incoming, server, serverNow: SERVER_NOW });
  return d.kind === "keep" ? server! : ({ ...d.row, updatedAt: d.updatedAt } as Row);
}

const same = (a: Row, b: Row) =>
  a.amount === b.amount && (a.deletedAt != null) === (b.deletedAt != null);

describe("resolvePush: server invariants", () => {
  it("I1: a tombstone at least as new as the server row wins", () => {
    fc.assert(
      fc.property(rowArb, rowArb, (server, incoming) => {
        fc.pre(incoming.deletedAt != null && incoming.updatedAt >= server.updatedAt);
        fc.pre(incoming.updatedAt <= SERVER_NOW + MAX_FUTURE_MS);
        expect(push(server, incoming).deletedAt).not.toBeNull();
      }),
    );
  });

  it("I1: a live write that is not strictly newer never resurrects a tombstone", () => {
    fc.assert(
      fc.property(rowArb, rowArb, (server, incoming) => {
        fc.pre(server.deletedAt != null && incoming.deletedAt == null);
        fc.pre(incoming.updatedAt <= server.updatedAt);
        expect(push(server, incoming)).toBe(server);
      }),
    );
  });

  it("I2: between two live writes the strictly newer wins, and a tie keeps the server's", () => {
    fc.assert(
      fc.property(rowArb, rowArb, (s, i) => {
        const server = { ...s, deletedAt: null };
        const incoming = { ...i, deletedAt: null, updatedAt: Math.min(i.updatedAt, SERVER_NOW) };
        const result = push(server, incoming);
        expect(result.amount).toBe(incoming.updatedAt > server.updatedAt ? incoming.amount : server.amount);
      }),
    );
  });

  it("I3: a client clock far ahead is clamped", () => {
    fc.assert(
      fc.property(rowArb, fc.integer({ min: 1, max: 10 ** 9 }), (row, ahead) => {
        const incoming = { ...row, updatedAt: SERVER_NOW + MAX_FUTURE_MS + ahead };
        expect(push(undefined, incoming).updatedAt).toBe(SERVER_NOW + MAX_FUTURE_MS);
      }),
    );
  });

  it("I4: two writes with different updatedAt end the same in either order", () => {
    fc.assert(
      fc.property(rowArb, rowArb, (a, b) => {
        fc.pre(a.updatedAt !== b.updatedAt);
        const ab = push(push(undefined, a), b);
        const ba = push(push(undefined, b), a);
        expect(same(ab, ba)).toBe(true);
      }),
    );
  });

  it("a tombstone stub deletes like a full tombstone, and never creates a row", () => {
    fc.assert(
      fc.property(fc.option(rowArb, { nil: undefined }), rowArb, (server, stubRow) => {
        const stub = { updatedAt: stubRow.updatedAt, deletedAt: stubRow.deletedAt ?? 1 };
        const d = resolveTombstone({ stub, server, serverNow: SERVER_NOW });
        if (!server || server.deletedAt != null) {
          expect(d.kind).toBe("keep");
          return;
        }
        const full = push(server, { ...server, ...stub });
        expect(d.kind === "delete").toBe(full.deletedAt != null);
      }),
    );
  });
});

describe("resolvePull agrees with resolvePush", () => {
  it("P1: after pushing its row and pulling the result, a device holds what the server holds", () => {
    fc.assert(
      fc.property(fc.option(rowArb, { nil: undefined }), rowArb, (server, local) => {
        const decision = resolvePush({
          tableName: "intakeRecords",
          incoming: local,
          server,
          serverNow: SERVER_NOW,
        });
        const stored = decision.kind === "keep" ? server! : ({ ...decision.row, updatedAt: decision.updatedAt } as Row);
        // The engine copies a lower acked updatedAt onto its unchanged row.
        const ack = decision.kind === "keep" ? decision.ackUpdatedAt : decision.updatedAt;
        const acked = ack < local.updatedAt ? { ...local, updatedAt: ack } : local;

        const pull = resolvePull({
          tableName: "intakeRecords",
          pulled: stored,
          local: acked,
          hasPendingOp: false,
        });
        const device = (pull.write as Row | null) ?? acked;
        expect(same(device, stored)).toBe(true);
      }),
    );
  });

  it("a pulled server tombstone beats a live local row that is not newer", () => {
    fc.assert(
      fc.property(rowArb, rowArb, fc.boolean(), (pulled, local, pending) => {
        fc.pre(pulled.deletedAt != null && local.deletedAt == null);
        fc.pre((local.updatedAt ?? 0) <= (pulled.updatedAt ?? 0));
        const d = resolvePull({ tableName: "intakeRecords", pulled, local, hasPendingOp: pending });
        expect(d.write).toBe(pulled);
      }),
    );
  });

  it("a pulled server tombstone does not undo a newer local restore", () => {
    // Delete at 1000 synced; the user undid it at 2000; a pull ran before the
    // push. The server accepts the restore on push (rule 1), so the pull must
    // keep it, or the queued upsert later sends the tombstone back.
    const pulled = { id: "r1", updatedAt: 1000, deletedAt: 1000 };
    const local = { id: "r1", updatedAt: 2000, deletedAt: null };
    const d = resolvePull({ tableName: "intakeRecords", pulled, local, hasPendingOp: true });
    expect(d.write).toBeNull();
    const push = resolvePush({
      tableName: "intakeRecords",
      incoming: local,
      server: pulled,
      serverNow: 3000,
    });
    expect(push.kind).toBe("write");
  });
});
